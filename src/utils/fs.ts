import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';

export class FileSystem {
  private baseDir: string;

  constructor(baseDir: string = 'output') {
    this.baseDir = baseDir;
  }

  async ensureDir(path: string) {
    await mkdir(join(this.baseDir, path), { recursive: true });
  }

  async writeArtifact(runId: string, filePath: string, content: string) {
    const fullPath = join(this.baseDir, runId, filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
    return fullPath;
  }

  async writeLog(runId: string, event: any) {
    const logPath = join(this.baseDir, runId, 'pipeline.log');
    await mkdir(dirname(logPath), { recursive: true });
    const entry = typeof event === 'string' ? event : JSON.stringify(event);
    await writeFile(logPath, entry + '\n', { flag: 'a' });
  }

  async appendLog(runId: string, content: string) {
    const logPath = join(this.baseDir, runId, 'pipeline.log');
    await mkdir(dirname(logPath), { recursive: true });
    await writeFile(logPath, content + '\n', { flag: 'a' });
  }
}
