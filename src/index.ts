import { AgentPipeline } from './agents/pipeline.js';
import { Repository } from './db/repository.js';
import { FileSystem } from './utils/fs.js';
import { startServer } from './api/server.js';
import { render } from 'ink';
import React from 'react';
import { PipelineUI } from './cli/ui.js';

process.on('unhandledRejection', (reason, promise) => {
  // Log to a file instead of console to avoid corrupting Ink UI
  const fs = new FileSystem();
  fs.appendLog('system', `Unhandled Rejection at: ${promise} reason: ${reason}`).catch(() => {});
});

async function main() {
  const repo = new Repository();
  const fs = new FileSystem();
  const pipeline = new AgentPipeline(repo, fs);

  // Start API Server
  startServer(pipeline, repo);

  // Start CLI if not in background
  if (process.stdout.isTTY) {
    const { waitUntilExit } = render(React.createElement(PipelineUI, { pipeline }));
    await waitUntilExit();
  } else {
    console.log('Spec-to-Ship is active in non-TTY mode.');
    // Keep process alive if needed, but usually server handles this
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
