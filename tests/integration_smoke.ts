import { Repository } from '../src/db/repository.js';
import { FileSystem } from '../src/utils/fs.js';
import { AgentPipeline } from '../src/agents/pipeline.js';
import { join } from 'path';
import { existsSync } from 'fs';

async function smokeTest() {
  console.log('Starting Integration Smoke Test...');
  const repo = new Repository('test-smoke.db');
  const fs = new FileSystem('test-output');
  const pipeline = new AgentPipeline(repo, fs);

  const idea = 'Build a simple express middleware that logs request time';
  
  console.log(`Running pipeline for idea: "${idea}"`);
  
  try {
    const result = await pipeline.run('test-run-id', idea);
    console.log('Pipeline finished successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));

    // Verify artifacts
    const runDir = join('test-output', result.runId);
    const expectedFiles = ['spec.md', 'tasks.json', 'review.md'];
    
    for (const file of expectedFiles) {
      const path = join(runDir, file);
      if (existsSync(path)) {
        console.log(`✅ Found artifact: ${file}`);
      } else {
        console.error(`❌ Missing artifact: ${file}`);
      }
    }
  } catch (error) {
    console.error('Pipeline failed:', error);
    process.exit(1);
  }
}

smokeTest();
