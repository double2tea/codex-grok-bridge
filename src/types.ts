export type GrokMode = 'delegate' | 'execute' | 'review' | 'search' | 'image' | 'video';
export type GrokEngine = 'auto' | 'acp' | 'cli';
export type RunStatus = 'queued' | 'running' | 'cancelling' | 'success' | 'error' | 'cancelled';

export interface GrokOptions {
  readonly grokBin: string;
  readonly engine: GrokEngine;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly maxTurns?: number;
  readonly disableWebSearch: boolean;
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  readonly permissionMode?: string;
  readonly timeoutMs: number;
}

export interface RunRequest {
  readonly task: string;
  readonly workspaceRoot: string;
  readonly cwd: string;
  readonly mode: GrokMode;
  readonly allowWrites: boolean;
  readonly options: GrokOptions;
  readonly promptOverride?: string;
}

export interface TerminalCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
}

export interface GrokRunResult {
  readonly engine: Exclude<GrokEngine, 'auto'>;
  readonly output: string;
  readonly exitCode: number;
  readonly nativeSessionId?: string;
  readonly sessionResolution?: string;
  readonly fallbackReason?: string;
  readonly terminalCommands: readonly TerminalCommand[];
}

export interface ObservedTestCommand {
  readonly command: string;
  readonly status: string;
}

export interface StructuredRunResult {
  readonly type: 'grok_delegate_run';
  readonly version: 1;
  readonly runId: string;
  readonly mode: GrokMode;
  readonly status: RunStatus;
  readonly engine?: Exclude<GrokEngine, 'auto'>;
  readonly workspaceRoot: string;
  readonly cwd: string;
  readonly allowWrites: boolean;
  readonly nativeSessionId?: string;
  readonly sessionResolution?: string;
  readonly fallbackReason?: string;
  readonly exitCode?: number;
  readonly changedFiles: readonly string[];
  readonly diffStat: string | null;
  readonly gitAuditAvailable: boolean;
  readonly workspaceWasDirty: boolean;
  readonly testsObserved: readonly ObservedTestCommand[];
  readonly safety: string;
  readonly logPath?: string;
  readonly grokOutput: string;
  readonly error?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}

export interface StoredSession {
  readonly key: string;
  readonly workspaceRoot: string;
  readonly mode: GrokMode;
  readonly nativeSessionId: string;
  readonly updatedAt: number;
}

export interface RecentRun {
  readonly runId: string;
  readonly mode: GrokMode;
  readonly workspaceRoot: string;
  readonly status: Extract<RunStatus, 'success' | 'error' | 'cancelled'>;
  readonly engine?: Exclude<GrokEngine, 'auto'>;
  readonly summary: string;
  readonly createdAt: number;
  readonly completedAt: number;
}

export interface ToolResponse {
  readonly text: string;
  readonly isError?: boolean;
}
