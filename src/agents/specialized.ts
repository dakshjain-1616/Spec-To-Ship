import { BaseAgent } from './base.js';
import { Task, Artifact, AgentResponse } from '../types/index.js';

export class ArchitectAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Architect',
      role: 'Senior Software Architect',
      systemPrompt: 'Generate comprehensive technical specification in Markdown. Sections: Overview, Goals, Non-Goals, Technical Design, API Contract, Data Model, Error Handling, Performance & Scale, Security, Open Questions. Never write code; only specs.',
      temperature: 0.7,
      maxTokens: 16000,
    });
  }

  async run(idea: string, onToken?: (token: string) => void): Promise<AgentResponse> {
    return this.ask(`Feature Idea: ${idea}`, onToken);
  }
}

export class PlannerAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Planner',
      role: 'Staff Engineering Manager',
      systemPrompt: 'Break spec into actionable development tasks. Output ONLY a JSON array of Task objects. Task structure: {id, title, description, type, priority, dependencies: string[], estimatedComplexity, acceptanceCriteria: string[]}. 4-15 tasks max.',
      temperature: 0.3,
      maxTokens: 4000,
    });
  }

  async run(spec: string, onToken?: (token: string) => void): Promise<AgentResponse> {
    return this.ask(`Architectural Specification:\n${spec}`, onToken);
  }
}

export class EngineerAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Engineer',
      role: 'Principal Software Engineer',
      systemPrompt: 'Implement production-grade code for the task. Output ONLY JSON: {files: [{filePath, language, content, explanation}]}. Use TypeScript, strict mode, proper types, error handling, JSDoc.',
      temperature: 0.3,
      maxTokens: 12000,
    });
  }

  async run(spec: string, tasks: Task[], currentTask: Task, previousArtifacts: Artifact[], onToken?: (token: string) => void): Promise<AgentResponse> {
    const context = previousArtifacts.slice(-3).map(a => `File: ${a.filePath}\nContent:\n${a.content}`).join('\n\n');
    const prompt = `Spec: ${spec}\n\nTask: ${currentTask.title}\nDescription: ${currentTask.description}\n\nPrevious Context:\n${context}`;
    return this.ask(prompt, onToken);
  }
}

export class QAAgent extends BaseAgent {
  constructor() {
    super({
      name: 'QA',
      role: 'Senior QA Engineer',
      systemPrompt: 'Write exhaustive test suites for the task using Vitest. Output ONLY JSON: {testFiles: [{filePath, content, testCount, frameworks}]}. >=5 tests per task, cover edge cases, mock external services.',
      temperature: 0.3,
      maxTokens: 10000,
    });
  }

  async run(spec: string, currentTask: Task, codeArtifacts: Artifact[], onToken?: (token: string) => void): Promise<AgentResponse> {
    const code = codeArtifacts.map(a => `File: ${a.filePath}\nContent:\n${a.content}`).join('\n\n');
    const prompt = `Spec: ${spec}\n\nTask: ${currentTask.title}\nCode to Test:\n${code}`;
    return this.ask(prompt, onToken);
  }
}

export class ReviewerAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Reviewer',
      role: 'Principal Engineer Code Reviewer',
      systemPrompt: 'Conduct critical code review. Output ONLY JSON: {approved: boolean, score: number (0-100), comments: string[], blockers: string[], recommendations: string[]}. approved=true if score>=75 and no blockers.',
      temperature: 0.3,
      maxTokens: 10000,
    });
  }

  async run(spec: string, allArtifacts: Artifact[], onToken?: (token: string) => void): Promise<AgentResponse> {
    const artifacts = allArtifacts.map(a => `File: ${a.filePath}\nContent:\n${a.content}`).join('\n\n');
    const prompt = `Spec: ${spec}\n\nAll Artifacts:\n${artifacts}`;
    return this.ask(prompt, onToken);
  }
}
