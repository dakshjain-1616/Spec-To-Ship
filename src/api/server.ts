import express from 'express';
import { AgentPipeline } from '../agents/pipeline.js';
import { Repository } from '../db/repository.js';

export function startServer(pipeline: AgentPipeline, repo: Repository) {
  const app = express();
  app.use(express.json());
  app.use(express.static('dashboard'));

  app.post('/v1/runs', async (req, res) => {
    const { idea } = req.body;
    if (!idea) return res.status(400).json({ error: 'Idea is required' });
    const runId = await pipeline.enqueue(idea);
    res.json({ runId, status: 'pending' });
  });

  app.get('/v1/runs/:id', (req, res) => {
    const run = repo.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  });

  app.get('/v1/runs/:id/stream', (req, res) => {
    const runId = req.params.id;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const onStream = (data: any) => {
      if (data.runId === runId) {
        res.write(`event: agent_stream\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    const onDone = (data: any) => {
      if (data.runId === runId) {
        res.write(`event: pipeline_done\ndata: ${JSON.stringify(data)}\n\n`);
        res.end();
      }
    };

    pipeline.on('agent_stream', onStream);
    pipeline.on('pipeline_done', onDone);

    req.on('close', () => {
      pipeline.off('agent_stream', onStream);
      pipeline.off('pipeline_done', onDone);
    });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
