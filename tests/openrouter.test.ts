import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArchitectAgent } from '../src/agents/specialized.js';
import { env } from '../src/utils/config.js';

// Mock the global fetch
global.fetch = vi.fn();

describe('OpenRouter Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set dummy key for testing
    process.env.OPENROUTER_API_KEY = 'sk-or-dummy-key-for-testing';
  });

  it('should correctly parse OpenRouter streaming response and usage', async () => {
    const agent = new ArchitectAgent();
    
    // Mock a streaming response
    const mockStream = new ReadableStream({
      start(controller) {
        const chunks = [
          'data: {"choices": [{"delta": {"content": "Hello"}}]}\n\n',
          'data: {"choices": [{"delta": {"content": " world"}}]}\n\n',
          'data: {"usage": {"prompt_tokens": 10, "completion_tokens": 5}}\n\n',
          'data: [DONE]\n\n'
        ];
        chunks.forEach(chunk => controller.enqueue(new TextEncoder().encode(chunk)));
        controller.close();
      }
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    let streamedContent = '';
    const response = await agent.run('Test idea', (token) => {
      streamedContent += token;
    });

    expect(streamedContent).toBe('Hello world');
    expect(response.content).toBe('Hello world');
    expect(response.inputTokens).toBe(10);
    expect(response.outputTokens).toBe(5);
    
    // Verify fetch call
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Bearer '),
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"model":"google/gemini-2.0-flash-001"'),
      })
    );
  });

  it('should handle fetch errors and retry', async () => {
    const agent = new ArchitectAgent();
    
    // Mock a 429 error followed by success
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices": [{"delta": {"content": "Success"}}]}\n\n'));
            controller.close();
          }
        }),
      });

    // Speed up retries for testing
    vi.useFakeTimers();
    
    const promise = agent.run('Test idea');
    
    // Fast-forward through the first retry delay (1000ms)
    await vi.runAllTimersAsync();
    
    const response = await promise;
    expect(response.content).toBe('Success');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    
    vi.useRealTimers();
  });
});
