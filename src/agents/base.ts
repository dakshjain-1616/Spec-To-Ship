import { AgentResponse } from '../types/index.js';
import { env } from '../utils/config.js';

export interface AgentConfig {
  name: string;
  role: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export abstract class BaseAgent {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = {
      model: env.DEFAULT_MODEL,
      temperature: 0.3,
      maxTokens: 4000,
      ...config,
    };
  }

  getModel(): string {
    return this.config.model || 'unknown';
  }

  async ask(prompt: string, onToken?: (token: string) => void): Promise<AgentResponse> {
    const backoff = [1000, 2000, 4000, 8000, 16000];
    let lastError: any;

    for (let attempt = 0; attempt <= backoff.length; attempt++) {
      const start = Date.now();
      let content = '';
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/spec-to-ship', // Optional, for OpenRouter rankings
            'X-Title': 'Spec-to-Ship', // Optional
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              { role: 'system', content: this.config.systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
            stream: true,
            stream_options: { include_usage: true },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error?.message || response.statusText || 'Unknown error';
          const error: any = new Error(`OpenRouter API error: ${response.status} ${errorMessage}`);
          error.status = response.status;
          error.data = errorData;
          throw error;
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Response body is null');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

            if (trimmedLine.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmedLine.slice(6));
                const delta = data.choices?.[0]?.delta?.content;
                if (delta) {
                  content += delta;
                  if (onToken) onToken(delta);
                }
                
                // OpenRouter usage info if available in the stream
                if (data.usage) {
                  inputTokens = data.usage.prompt_tokens;
                  outputTokens = data.usage.completion_tokens;
                }
              } catch (e) {
                // Ignore parse errors for partial chunks
              }
            }
          }
        }

        // Fallback token estimation if usage not provided in stream
        // (OpenRouter usually provides it in the last chunk or we can estimate)
        if (inputTokens === 0) {
          // Rough estimation: 1 token ~= 4 chars
          inputTokens = Math.ceil((this.config.systemPrompt.length + prompt.length) / 4);
          outputTokens = Math.ceil(content.length / 4);
        }

        return {
          content,
          inputTokens,
          outputTokens,
          durationMs: Date.now() - start,
        };
      } catch (error: any) {
        lastError = error;
        // Retry on 429 (Rate Limit) or 5xx (Server Error)
        const isRetryable = error.status === 429 || (error.status >= 500 && error.status < 600);
        
        if (isRetryable && attempt < backoff.length) {
          const delay = backoff[attempt];
          console.warn(`Agent ${this.config.name} attempt ${attempt + 1} failed with status ${error.status}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        console.error(`Agent ${this.config.name} failed permanently:`, JSON.stringify(error, null, 2));
        if (!(error instanceof Error)) {
          const wrappedError = new Error(`Agent failure: ${JSON.stringify(error)}`);
          (wrappedError as any).originalError = error;
          throw wrappedError;
        }
        throw error;
      }
    }
    throw lastError;
  }
}
