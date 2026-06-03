import fs from 'node:fs';
import path from 'node:path';
import type { GitAudit } from './git.js';
import type { GrokRunResult, RunRequest, RunStatus, StructuredRunResult } from './types.js';

export interface RunLogRecord {
  readonly request: {
    readonly mode: string;
    readonly workspaceRoot: string;
    readonly cwd: string;
    readonly allowWrites: boolean;
    readonly task: string;
  };
  readonly status: RunStatus;
  readonly result?: GrokRunResult;
  readonly beforeGit: GitAudit;
  readonly afterGit?: GitAudit;
  readonly structured?: StructuredRunResult;
  readonly error?: string;
}

export class RunLogger {
  private readonly runsDir: string;

  constructor(dataDir: string) {
    this.runsDir = path.join(dataDir, 'runs');
    fs.mkdirSync(this.runsDir, { recursive: true });
  }

  write(runId: string, record: RunLogRecord): string {
    const filePath = path.join(this.runsDir, `${safeRunId(runId)}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    return filePath;
  }
}

export function runRequestLogView(request: RunRequest): RunLogRecord['request'] {
  return {
    mode: request.mode,
    workspaceRoot: request.workspaceRoot,
    cwd: request.cwd,
    allowWrites: request.allowWrites,
    task: request.task
  };
}

function safeRunId(runId: string): string {
  return runId.replace(/[^a-zA-Z0-9_-]/gu, '_');
}
