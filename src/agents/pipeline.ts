import { EventEmitter } from 'events';
import PQueue from 'p-queue';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from '../db/repository.js';
import { FileSystem } from '../utils/fs.js';
import { ArchitectAgent, PlannerAgent, EngineerAgent, QAAgent, ReviewerAgent } from './specialized.js';
import { Run, Artifact, Task } from '../types/index.js';

export class AgentPipeline extends EventEmitter {
  private queue = new PQueue({ concurrency: 1 });
  private repo: Repository;
  private fs: FileSystem;

  constructor(repo: Repository, fs: FileSystem) {
    super();
    this.repo = repo;
    this.fs = fs;
  }

  async enqueue(idea: string): Promise<string> {
    const runId = uuidv4();
    const run: Run = {
      id: runId,
      idea,
      status: 'pending',
      createdAt: new Date().toISOString(),
      totalTokens: 0,
      approved: false,
    };
    this.repo.createRun(run);

    this.queue.add(() => this.run(runId, idea));
    return runId;
  }

  async run(runId: string, idea: string) {
    const timeoutMs = 20 * 60 * 1000; // 20 minutes
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Pipeline timed out after 20 minutes')), timeoutMs)
    );

    try {
      return await Promise.race([this.executePipeline(runId, idea), timeoutPromise]);
    } catch (error: any) {
      this.repo.updateRun(runId, { status: 'failed' });
      this.emit('pipeline_error', { runId, error: error.message });
      this.logEvent(runId, 'pipeline_error', { error: error.message });
      throw error;
    }
  }

  private async executePipeline(runId: string, idea: string) {
    try {
      this.repo.updateRun(runId, { status: 'running' });
      this.emit('pipeline_start', { runId });
      this.logEvent(runId, 'pipeline_start', { idea });

      const architect = new ArchitectAgent();
      const planner = new PlannerAgent();
      const engineer = new EngineerAgent();
      const qa = new QAAgent();
      const reviewer = new ReviewerAgent();

      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      // 1. Architect
      this.emit('agent_start', { agent: 'architect', runId });
      const specRes = await architect.run(idea, (token: string) => this.emitStream('architect', runId, token));
      totalInputTokens += specRes.inputTokens;
      totalOutputTokens += specRes.outputTokens;
      await this.saveArtifact(runId, 'spec', 'spec.md', specRes.content);
      this.emit('agent_done', { agent: 'architect', runId });
      this.logEvent(runId, 'agent_done', { agent: 'architect', inputTokens: specRes.inputTokens, outputTokens: specRes.outputTokens });

      // 2. Planner
      this.emit('agent_start', { agent: 'planner', runId });
      let tasks: Task[] = [];
      const tasksRes = await planner.run(specRes.content, (token: string) => this.emitStream('planner', runId, token));
      totalInputTokens += tasksRes.inputTokens;
      totalOutputTokens += tasksRes.outputTokens;
      
      try {
        tasks = this.parseJson(tasksRes.content);
      } catch (e) {
        console.warn('Planner JSON parse failed, retrying once...');
        const retryRes = await planner.ask(`Your previous output was not valid JSON. Please output ONLY the JSON array of tasks.\n\nPrevious output:\n${tasksRes.content}`);
        totalInputTokens += retryRes.inputTokens;
        totalOutputTokens += retryRes.outputTokens;
        tasks = this.parseJson(retryRes.content);
      }
      
      await this.saveArtifact(runId, 'tasks', 'tasks.json', JSON.stringify(tasks, null, 2));
      this.emit('agent_done', { agent: 'planner', runId });
      this.logEvent(runId, 'agent_done', { agent: 'planner', inputTokens: tasksRes.inputTokens, outputTokens: tasksRes.outputTokens });

      const codeArtifacts: Artifact[] = [];
      const testArtifacts: Artifact[] = [];

      // 3. Engineer + QA Loop
      for (const task of tasks) {
        // Engineer
        this.emit('agent_start', { agent: 'engineer', runId, taskId: task.id });
        const engRes = await engineer.run(specRes.content, tasks, task, codeArtifacts, (token: string) => this.emitStream('engineer', runId, token, task.id));
        totalInputTokens += engRes.inputTokens;
        totalOutputTokens += engRes.outputTokens;
        
        let engData;
        try {
          engData = this.parseJson(engRes.content);
        } catch (e) {
          console.warn(`Engineer JSON parse failed for task ${task.id}, retrying once...`);
          const retryRes = await engineer.ask(`Your previous output was not valid JSON. Please output ONLY the JSON object with files.\n\nPrevious output:\n${engRes.content}`);
          totalInputTokens += retryRes.inputTokens;
          totalOutputTokens += retryRes.outputTokens;
          engData = this.parseJson(retryRes.content);
        }

        for (const file of engData.files) {
          const filePath = file.filePath.startsWith('src/') ? file.filePath : `src/${file.filePath}`;
          const art = await this.saveArtifact(runId, 'code', filePath, file.content, task.id);
          codeArtifacts.push(art);
        }
        this.emit('agent_done', { agent: 'engineer', runId, taskId: task.id });
        this.logEvent(runId, 'agent_done', { agent: 'engineer', taskId: task.id, inputTokens: engRes.inputTokens, outputTokens: engRes.outputTokens });

        // QA
        this.emit('agent_start', { agent: 'qa', runId, taskId: task.id });
        const qaRes = await qa.run(specRes.content, task, codeArtifacts, (token: string) => this.emitStream('qa', runId, token, task.id));
        totalInputTokens += qaRes.inputTokens;
        totalOutputTokens += qaRes.outputTokens;
        
        let qaData;
        try {
          qaData = this.parseJson(qaRes.content);
        } catch (e) {
          console.warn(`QA JSON parse failed for task ${task.id}, retrying once...`);
          const retryRes = await qa.ask(`Your previous output was not valid JSON. Please output ONLY the JSON object with testFiles.\n\nPrevious output:\n${qaRes.content}`);
          totalInputTokens += retryRes.inputTokens;
          totalOutputTokens += retryRes.outputTokens;
          qaData = this.parseJson(retryRes.content);
        }

        for (const file of qaData.testFiles) {
          const filePath = file.filePath.startsWith('tests/') ? file.filePath : `tests/${file.filePath}`;
          const art = await this.saveArtifact(runId, 'test', filePath, file.content, task.id);
          testArtifacts.push(art);
        }
        this.emit('agent_done', { agent: 'qa', runId, taskId: task.id });
        this.logEvent(runId, 'agent_done', { agent: 'qa', taskId: task.id, inputTokens: qaRes.inputTokens, outputTokens: qaRes.outputTokens });
      }

      // 4. Reviewer
      this.emit('agent_start', { agent: 'reviewer', runId });
      const allArtifacts = [...codeArtifacts, ...testArtifacts];
      const revRes = await reviewer.run(specRes.content, allArtifacts, (token: string) => this.emitStream('reviewer', runId, token));
      totalInputTokens += revRes.inputTokens;
      totalOutputTokens += revRes.outputTokens;
      
      let revData;
      try {
        revData = this.parseJson(revRes.content);
      } catch (e) {
        console.warn('Reviewer JSON parse failed, retrying once...');
        const retryRes = await reviewer.ask(`Your previous output was not valid JSON. Please output ONLY the JSON object for the review.\n\nPrevious output:\n${revRes.content}`);
        totalInputTokens += retryRes.inputTokens;
        totalOutputTokens += retryRes.outputTokens;
        revData = this.parseJson(retryRes.content);
      }

      await this.saveArtifact(runId, 'review', 'review.md', JSON.stringify(revData, null, 2));
      this.emit('agent_done', { agent: 'reviewer', runId });
      this.logEvent(runId, 'agent_done', { agent: 'reviewer', inputTokens: revRes.inputTokens, outputTokens: revRes.outputTokens });

      // Finalize Cost & Metadata
      const totalTokens = totalInputTokens + totalOutputTokens;
      const totalCost = (totalInputTokens * 0.003 + totalOutputTokens * 0.012) / 1000;
      
      const meta = {
        runId,
        totalTokens,
        totalCost,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        durationMs: Date.now() - new Date(this.repo.getRun(runId)!.createdAt).getTime(),
        score: revData.score,
        approved: revData.approved
      };
      await this.saveArtifact(runId, 'meta', 'meta.json', JSON.stringify(meta, null, 2));

      this.repo.updateRun(runId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        totalTokens,
        totalCost,
        reviewScore: revData.score,
        approved: revData.approved,
      });

      const finalResult = { 
        runId, 
        score: revData.score, 
        approved: revData.approved,
        totalTokens
      };
      this.emit('pipeline_done', finalResult);
      this.logEvent(runId, 'pipeline_done', finalResult);
      return finalResult;
    } catch (error: any) {
      throw error;
    }
  }

  private parseJson(content: string) {
    const cleaned = content.trim().replace(/```json|```/g, '');
    return JSON.parse(cleaned);
  }

  private async logEvent(runId: string, type: string, data: any) {
    const event = {
      runId,
      type,
      data: JSON.stringify(data),
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    this.repo.createEvent({
      runId: event.runId,
      type: event.type,
      data: event.data,
      createdAt: event.createdAt
    });
    await this.fs.appendLog(runId, JSON.stringify(event));
  }

  private emitStream(agent: string, runId: string, token: string, taskId?: string) {
    this.emit('agent_stream', { agent, runId, taskId, token, timestamp: new Date().toISOString() });
  }

  private async saveArtifact(runId: string, type: any, filePath: string, content: string, taskId?: string): Promise<Artifact> {
    const id = uuidv4();
    const artifact: Artifact = {
      id,
      runId,
      type,
      filePath,
      taskId,
      content,
      createdAt: new Date().toISOString(),
    };
    this.repo.createArtifact(artifact);
    await this.fs.writeArtifact(runId, filePath, content);
    return artifact;
  }

  getQueueSize() {
    return this.queue.size;
  }
}