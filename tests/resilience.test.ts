import { BaseAgent } from '../src/agents/base.js';
import { AgentPipeline } from '../src/agents/pipeline.js';
import { Repository } from '../src/db/repository.js';
import { FileSystem } from '../src/utils/fs.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

describe('Resilience and Observability', () => {
  let repo: Repository;
  let fileSystem: FileSystem;
  let pipeline: AgentPipeline;
  const testOutputDir = 'test-output-resilience';

  beforeEach(async () => {
    await fs.rm(testOutputDir, { recursive: true, force: true });
    repo = new Repository(':memory:');
    fileSystem = new FileSystem(testOutputDir);
    pipeline = new AgentPipeline(repo, fileSystem);
  });

  it('BaseAgent implements exponential backoff on 429', async () => {
    const agent = new (class extends BaseAgent {
      constructor() {
        super({ name: 'Test', role: 'Tester', systemPrompt: 'test' });
      }
    })();

    // Mock OpenRouter to fail twice with 429 then succeed
    let calls = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      calls++;
      if (calls <= 2) {
        const err = new Error('Rate limit');
        (err as any).status = 429;
        throw err;
      }
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices": [{"delta": {"content": "success"}}], "usage": {"prompt_tokens": 10, "completion_tokens": 5}}\n\n'));
            controller.close();
          }
        })
      } as any;
    });

    const start = Date.now();
    const res = await agent.ask('hello');
    const duration = Date.now() - start;

    expect(calls).toBe(3);
    expect(res.content).toBe('success');
    // 1s + 2s = 3s minimum delay
    expect(duration).toBeGreaterThan(3000);
  }, 10000);

  it('Pipeline generates valid NDJSON log and meta.json with cost', async () => {
    // Mock agents to return fixed responses
    vi.mock('../src/agents/specialized.js', async () => {
      const actual = await vi.importActual('../src/agents/specialized.js') as any;
      return {
        ...actual,
        ArchitectAgent: class extends actual.ArchitectAgent {
          async run() { return { content: 'Spec content', inputTokens: 100, outputTokens: 200, durationMs: 10 }; }
        },
        PlannerAgent: class extends actual.PlannerAgent {
          async run() { return { content: JSON.stringify([{ id: '1', title: 'Task 1', description: 'desc', type: 'feat', priority: 'high', dependencies: [], estimatedComplexity: '1', acceptanceCriteria: [] }]), inputTokens: 50, outputTokens: 50, durationMs: 10 }; }
        },
        EngineerAgent: class extends actual.EngineerAgent {
          async run() { return { content: JSON.stringify({ files: [{ filePath: 'a.ts', content: 'code' }] }), inputTokens: 50, outputTokens: 50, durationMs: 10 }; }
        },
        QAAgent: class extends actual.QAAgent {
          async run() { return { content: JSON.stringify({ testFiles: [{ filePath: 'a.test.ts', content: 'test' }] }), inputTokens: 50, outputTokens: 50, durationMs: 10 }; }
        },
        ReviewerAgent: class extends actual.ReviewerAgent {
          async run() { return { content: JSON.stringify({ approved: true, score: 90, comments: [], blockers: [], recommendations: [] }), inputTokens: 50, outputTokens: 50, durationMs: 10 }; }
        }
      };
    });

    const runId = await pipeline.enqueue('Build a simple app');
    
    // Wait for queue to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    const logPath = path.join(testOutputDir, runId, 'pipeline.log');
    const metaPath = path.join(testOutputDir, runId, 'meta.json');

    const logContent = await fs.readFile(logPath, 'utf-8');
    const lines = logContent.trim().split('\n');
    expect(lines.length).toBeGreaterThan(5);
    expect(JSON.parse(lines[0])).toHaveProperty('timestamp');

    const metaContent = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaContent);
    expect(meta).toHaveProperty('totalCost');
    expect(meta).toHaveProperty('totalTokens');
    // (100+50+50+50+50)*0.003/1000 + (200+50+50+50+50)*0.012/1000
    // 300 * 0.000003 + 400 * 0.000012 = 0.0009 + 0.0048 = 0.0057
    expect(meta.totalCost).toBeCloseTo(0.0057, 5);
    
    const run = repo.getRun(runId);
    expect(run?.totalCost).toBeCloseTo(0.0057, 5);
  });
});
