import { z } from 'zod';

export const RunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export interface Run {
  id: string;
  idea: string;
  status: RunStatus;
  createdAt: string;
  completedAt?: string;
  totalTokens: number;
  totalCost?: number;
  reviewScore?: number;
  approved: boolean;
}

export interface AgentRun {
  id: string;
  runId: string;
  agent: string;
  taskId?: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

export interface Artifact {
  id: string;
  runId: string;
  type: 'spec' | 'tasks' | 'code' | 'test' | 'review' | 'meta';
  filePath: string;
  taskId?: string;
  content: string;
  createdAt: string;
}

export interface Event {
  id: number;
  runId: string;
  type: string;
  agent?: string;
  data: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  dependencies: string[];
  estimatedComplexity: string;
  acceptanceCriteria: string[];
}

export interface AgentResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}
