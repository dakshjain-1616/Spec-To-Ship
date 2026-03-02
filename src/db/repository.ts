import Database from 'better-sqlite3';
import { Run, AgentRun, Artifact, Event } from '../types/index.js';

export class Repository {
  private db: Database.Database;

  constructor(dbPath: string = 'spec-to-ship.db') {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        idea TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        total_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        review_score REAL,
        approved INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        task_id TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        error TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        task_id TEXT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        type TEXT NOT NULL,
        agent TEXT,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );
    `);
  }

  // Run methods
  createRun(run: Run) {
    const stmt = this.db.prepare(`
      INSERT INTO runs (id, idea, status, created_at, total_tokens, approved, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(run.id, run.idea, run.status, run.createdAt, run.totalTokens, run.approved ? 1 : 0, run.totalCost || 0);
  }

  updateRun(id: string, updates: Partial<Run>) {
    const keys = Object.keys(updates).map(k => `${k.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`)} = ?`).join(', ');
    const values = Object.values(updates).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v);
    const stmt = this.db.prepare(`UPDATE runs SET ${keys} WHERE id = ?`);
    stmt.run(...values, id);
  }

  getRun(id: string): Run | undefined {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      idea: row.idea,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      totalTokens: row.total_tokens,
      totalCost: row.total_cost,
      reviewScore: row.review_score,
      approved: row.approved === 1
    };
  }

  // AgentRun methods
  createAgentRun(agentRun: AgentRun) {
    const stmt = this.db.prepare(`
      INSERT INTO agent_runs (id, run_id, agent, task_id, status, started_at, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(agentRun.id, agentRun.runId, agentRun.agent, agentRun.taskId, agentRun.status, agentRun.startedAt, agentRun.inputTokens, agentRun.outputTokens);
  }

  updateAgentRun(id: string, updates: Partial<AgentRun>) {
    const keys = Object.keys(updates).map(k => `${k.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`)} = ?`).join(', ');
    const values = Object.values(updates);
    const stmt = this.db.prepare(`UPDATE agent_runs SET ${keys} WHERE id = ?`);
    stmt.run(...values, id);
  }

  // Artifact methods
  createArtifact(artifact: Artifact) {
    const stmt = this.db.prepare(`
      INSERT INTO artifacts (id, run_id, type, file_path, task_id, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(artifact.id, artifact.runId, artifact.type, artifact.filePath, artifact.taskId, artifact.content, artifact.createdAt);
  }

  getArtifacts(runId: string): Artifact[] {
    const rows = this.db.prepare('SELECT * FROM artifacts WHERE run_id = ?').all(runId) as any[];
    return rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      type: row.type,
      filePath: row.file_path,
      taskId: row.task_id,
      content: row.content,
      createdAt: row.created_at
    }));
  }

  // Event methods
  createEvent(event: Omit<Event, 'id'>) {
    const stmt = this.db.prepare(`
      INSERT INTO events (run_id, type, agent, data, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(event.runId, event.type, event.agent, event.data, event.createdAt);
  }

  getEvents(runId: string): Event[] {
    const rows = this.db.prepare('SELECT * FROM events WHERE run_id = ? ORDER BY id ASC').all(runId) as any[];
    return rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      type: row.type,
      agent: row.agent,
      data: row.data,
      createdAt: row.createdAt
    }));
  }
}
