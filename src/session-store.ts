import fs from 'node:fs';
import path from 'node:path';
import type { GrokMode, RecentRun, StoredSession } from './types.js';
import { defaultDataDir, isRecord, readString, stableKey } from './utils.js';

interface StoreFile {
  readonly sessions: readonly StoredSession[];
  readonly recentRuns: readonly RecentRun[];
}

export class SessionStore {
  private readonly filePath: string;
  private data: StoreFile;

  constructor(readonly dataDir = defaultDataDir()) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.filePath = path.join(this.dataDir, 'state.json');
    this.data = this.read();
  }

  sessionKey(workspaceRoot: string, mode: GrokMode): string {
    return stableKey(`${workspaceRoot}\n${mode}`);
  }

  getSession(workspaceRoot: string, mode: GrokMode): StoredSession | undefined {
    const key = this.sessionKey(workspaceRoot, mode);
    return this.data.sessions.find((session) => session.key === key);
  }

  setSession(input: {
    readonly workspaceRoot: string;
    readonly mode: GrokMode;
    readonly nativeSessionId: string;
  }): void {
    const key = this.sessionKey(input.workspaceRoot, input.mode);
    const next: StoredSession = {
      key,
      workspaceRoot: input.workspaceRoot,
      mode: input.mode,
      nativeSessionId: input.nativeSessionId,
      updatedAt: Date.now()
    };
    this.data = {
      ...this.data,
      sessions: [next, ...this.data.sessions.filter((session) => session.key !== key)]
    };
    this.write();
  }

  addRecentRun(run: RecentRun): void {
    this.data = {
      ...this.data,
      recentRuns: [run, ...this.data.recentRuns].slice(0, 20)
    };
    this.write();
  }

  recentRuns(): readonly RecentRun[] {
    return this.data.recentRuns;
  }

  sessions(): readonly StoredSession[] {
    return this.data.sessions;
  }

  private read(): StoreFile {
    if (!fs.existsSync(this.filePath)) {
      return { sessions: [], recentRuns: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
    if (!isRecord(parsed)) {
      return { sessions: [], recentRuns: [] };
    }
    return {
      sessions: readSessions(parsed.sessions),
      recentRuns: readRecentRuns(parsed.recentRuns)
    };
  }

  private write(): void {
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, {
      mode: 0o600
    });
  }
}

function readSessions(value: unknown): readonly StoredSession[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const key = readString(item, 'key');
    const workspaceRoot = readString(item, 'workspaceRoot');
    const mode = readMode(readString(item, 'mode'));
    const nativeSessionId = readString(item, 'nativeSessionId');
    const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : Date.now();
    if (!key || !workspaceRoot || !mode || !nativeSessionId) {
      return [];
    }
    return [{ key, workspaceRoot, mode, nativeSessionId, updatedAt }];
  });
}

function readRecentRuns(value: unknown): readonly RecentRun[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const runId = readString(item, 'runId');
    const mode = readMode(readString(item, 'mode'));
    const workspaceRoot = readString(item, 'workspaceRoot');
    const status = readStatus(readString(item, 'status'));
    const summary = readString(item, 'summary');
    const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now();
    const completedAt = typeof item.completedAt === 'number' ? item.completedAt : createdAt;
    const engine = readEngine(readString(item, 'engine'));
    if (!runId || !mode || !workspaceRoot || !status || summary === undefined) {
      return [];
    }
    return [{ runId, mode, workspaceRoot, status, summary, createdAt, completedAt, engine }];
  });
}

function readMode(value: string | undefined): GrokMode | undefined {
  return value === 'delegate' || value === 'execute' || value === 'review' ? value : undefined;
}

function readStatus(value: string | undefined): RecentRun['status'] | undefined {
  return value === 'success' || value === 'error' || value === 'cancelled' ? value : undefined;
}

function readEngine(value: string | undefined): RecentRun['engine'] | undefined {
  return value === 'acp' || value === 'cli' ? value : undefined;
}
