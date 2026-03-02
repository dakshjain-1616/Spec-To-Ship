import { Repository } from '../src/db/repository.js';
import { FileSystem } from '../src/utils/fs.js';
import { AgentPipeline } from '../src/agents/pipeline.js';
import { BaseAgent } from '../src/agents/base.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { vi, it, expect, describe, beforeAll } from 'vitest';

// Mock BaseAgent.ask to avoid real API calls
vi.mock('../src/agents/base.js', () => {
  return {
    BaseAgent: class {
      config: any;
      constructor(config: any) { this.config = config; }
      async ask(prompt: string, onToken?: (token: string) => void) {
        if (onToken) onToken('mock token');
        
        if (this.config.name === 'Architect') {
          return { content: 'Mock Spec Content', inputTokens: 10, outputTokens: 20, durationMs: 100 };
        }
        if (this.config.name === 'Planner') {
          return { 
            content: JSON.stringify([{ id: 'TASK-1', title: 'Setup', description: 'Setup project', type: 'feat', priority: 'high', dependencies: [], estimatedComplexity: 'low', acceptanceCriteria: ['Criteria 1'] }]), 
            inputTokens: 10, outputTokens: 20, durationMs: 100 
          };
        }
        if (this.config.name === 'Engineer') {
          return { 
            content: JSON.stringify({ files: [{ filePath: 'index.ts', content: 'console.log("hello");', explanation: 'test' }] }), 
            inputTokens: 10, outputTokens: 20, durationMs: 100 
          };
        }
        if (this.config.name === 'QA') {
          return { 
            content: JSON.stringify({ testFiles: [{ filePath: 'index.test.ts', content: 'test("ok", () => {})', testCount: 1, frameworks: ['vitest'] }] }), 
            inputTokens: 10, outputTokens: 20, durationMs: 100 
          };
        }
        if (this.config.name === 'Reviewer') {
          return { 
            content: JSON.stringify({ approved: true, score: 90, comments: [], blockers: [], recommendations: [] }), 
            inputTokens: 10, outputTokens: 20, durationMs: 100 
          };
        }
        return { content: '', inputTokens: 0, outputTokens: 0, durationMs: 0 };
      }
    }
  };
});

describe('Pipeline End-to-End Mock Test', () => {
  it('should complete the full pipeline successfully', async () => {
    const repo = new Repository('test-e2e.db');
    const fs = new FileSystem('test-output-e2e');
    const pipeline = new AgentPipeline(repo, fs);

    const idea = 'Build a rate limiter';
    const runId = await pipeline.enqueue(idea);
    
    // Wait for queue to process (since it's async)
    // In a real scenario we'd listen for events, but here we can just wait a bit or call run directly
    const result = await pipeline.run(runId, idea);

    expect(result.approved).toBe(true);
    expect(result.score).toBe(90);

    const runDir = join('test-output-e2e', runId);
    expect(existsSync(join(runDir, 'spec.md'))).toBe(true);
    expect(existsSync(join(runDir, 'tasks.json'))).toBe(true);
    expect(existsSync(join(runDir, 'src/index.ts'))).toBe(true);
    expect(existsSync(join(runDir, 'tests/index.test.ts'))).toBe(true);
    expect(existsSync(join(runDir, 'review.md'))).toBe(true);
  });
});
