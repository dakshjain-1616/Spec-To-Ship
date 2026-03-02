import { describe, it, expect, vi } from 'vitest';
import { Repository } from '../src/db/repository';
import { FileSystem } from '../src/utils/fs';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';

describe('Infrastructure Tests', () => {
  const testDb = 'test.db';
  const testOutputDir = 'test_output';

  it('should initialize repository and create a run', () => {
    if (existsSync(testDb)) rmSync(testDb);
    const repo = new Repository(testDb);
    const runId = 'test-run-123';
    
    repo.createRun({
      id: runId,
      idea: 'Test Idea',
      status: 'pending',
      createdAt: new Date().toISOString(),
      totalTokens: 0,
      approved: false
    });

    const run = repo.getRun(runId);
    expect(run).toBeDefined();
    expect(run?.idea).toBe('Test Idea');
    rmSync(testDb);
  });

  it('should write artifacts to filesystem', async () => {
    const fs = new FileSystem(testOutputDir);
    const runId = 'test-run-fs';
    const content = 'test content';
    const filePath = 'spec.md';

    await fs.writeArtifact(runId, filePath, content);
    const fullPath = join(testOutputDir, runId, filePath);
    expect(existsSync(fullPath)).toBe(true);
    
    rmSync(testOutputDir, { recursive: true, force: true });
  });
});
