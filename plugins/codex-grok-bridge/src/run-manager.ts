import type { GitAudit } from './git.js';
import { getGitAudit, gitAuditChanged } from './git.js';
import { runGrokAcp } from './grok-acp.js';
import { runGrokCli } from './grok-cli.js';
import { buildGrokPrompt } from './prompt.js';
import { RunLogger, runRequestLogView } from './run-log.js';
import { SessionStore } from './session-store.js';
import type {
  GrokMode,
  GrokRunResult,
  ObservedTestCommand,
  RunRequest,
  RunStatus,
  StructuredRunResult
} from './types.js';
import { randomId, truncate } from './utils.js';

interface ActiveRun {
  readonly runId: string;
  readonly mode: GrokMode;
  readonly workspaceRoot: string;
  readonly startedAt: number;
  readonly controller: AbortController;
  phase: Extract<RunStatus, 'queued' | 'running' | 'cancelling'>;
}

interface QueueState {
  promise: Promise<unknown>;
}

export class RunManager {
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly queues = new Map<string, QueueState>();
  private readonly logger: RunLogger;

  constructor(
    private readonly store = new SessionStore(),
    logger?: RunLogger
  ) {
    this.logger = logger ?? new RunLogger(store.dataDir);
  }

  async run(request: RunRequest): Promise<string> {
    const runId = randomId('grok_run');
    const active: ActiveRun = {
      runId,
      mode: request.mode,
      workspaceRoot: request.workspaceRoot,
      startedAt: Date.now(),
      controller: new AbortController(),
      phase: 'queued'
    };
    this.activeRuns.set(runId, active);
    const timeout = setTimeout(() => {
      active.phase = 'cancelling';
      active.controller.abort();
    }, request.options.timeoutMs);
    const queueKey = this.store.sessionKey(request.workspaceRoot, request.mode);
    const work = () => {
      active.phase = active.controller.signal.aborted ? 'cancelling' : 'running';
      return this.runUnqueued(runId, request, active.controller.signal);
    };
    const previous = this.queues.get(queueKey)?.promise ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.queues.set(queueKey, { promise: next });
    try {
      return await next;
    } finally {
      clearTimeout(timeout);
      if (this.queues.get(queueKey)?.promise === next) {
        this.queues.delete(queueKey);
      }
      this.activeRuns.delete(runId);
    }
  }

  cancel(runId: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return false;
    }
    run.phase = 'cancelling';
    run.controller.abort();
    return true;
  }

  status(): string {
    const active = [...this.activeRuns.values()].map(
      (run) =>
        `- ${run.runId} ${run.mode} ${run.workspaceRoot} ${run.phase} ${String(
          Math.floor((Date.now() - run.startedAt) / 1000)
        )}s`
    );
    const recent = this.store
      .recentRuns()
      .map(
        (run) =>
          `- ${run.runId} ${run.mode} ${run.status}${run.engine ? ` via ${run.engine}` : ''}: ${
            run.summary
          }`
      );
    const sessions = this.store
      .sessions()
      .map((session) => `- ${session.mode} ${session.workspaceRoot}: ${session.nativeSessionId}`);
    return [
      'Active runs',
      active.length > 0 ? active.join('\n') : 'none',
      '',
      'Recent runs',
      recent.length > 0 ? recent.join('\n') : 'none',
      '',
      'Stored Grok sessions',
      sessions.length > 0 ? sessions.join('\n') : 'none'
    ].join('\n');
  }

  private async runUnqueued(
    runId: string,
    request: RunRequest,
    signal: AbortSignal
  ): Promise<string> {
    const createdAt = Date.now();
    const before = await getGitAudit(request.workspaceRoot);
    let terminalFailureLogged = false;
    if (signal.aborted) {
      const error = new Error('Grok run cancelled before start');
      this.logger.write(runId, {
        request: runRequestLogView(request),
        status: 'cancelled',
        beforeGit: before,
        error: error.message
      });
      throw error;
    }
    try {
      const result = await this.invokeGrok(request, signal);
      const after = await getGitAudit(request.workspaceRoot);
      const readOnlyViolation = !request.allowWrites && gitAuditChanged(before, after);
      const completedAt = Date.now();
      const status = readOnlyViolation || result.exitCode !== 0 ? 'error' : 'success';
      const structured = buildStructuredRunResult({
        runId,
        request,
        result,
        before,
        after,
        readOnlyViolation,
        status,
        logPath: undefined,
        createdAt,
        completedAt
      });
      const logPath = this.logger.write(runId, {
        request: runRequestLogView(request),
        status,
        result,
        beforeGit: before,
        afterGit: after,
        structured
      });
      const summary = formatRunSummary({
        ...structured,
        logPath
      });
      this.store.addRecentRun({
        runId,
        mode: request.mode,
        workspaceRoot: request.workspaceRoot,
        status,
        engine: result.engine,
        summary: firstLine(result.output),
        createdAt,
        completedAt
      });
      if (readOnlyViolation) {
        terminalFailureLogged = true;
        throw new Error(`Read-only Grok run changed the workspace.\n\n${summary}`);
      }
      return summary;
    } catch (error) {
      if (terminalFailureLogged) {
        throw error;
      }
      const completedAt = Date.now();
      const status = signal.aborted ? 'cancelled' : 'error';
      this.store.addRecentRun({
        runId,
        mode: request.mode,
        workspaceRoot: request.workspaceRoot,
        status,
        summary: error instanceof Error ? firstLine(error.message) : String(error),
        createdAt,
        completedAt
      });
      this.logger.write(runId, {
        request: runRequestLogView(request),
        status,
        beforeGit: before,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async invokeGrok(request: RunRequest, signal: AbortSignal): Promise<GrokRunResult> {
    const prompt = buildGrokPrompt(request);
    const storedSession = this.store.getSession(request.workspaceRoot, request.mode);
    let fallbackReason: string | undefined;
    if (request.options.engine !== 'cli') {
      try {
        return await runGrokAcp(request, prompt, storedSession, signal, {
          onNativeSession: (nativeSessionId) => {
            this.store.setSession({
              workspaceRoot: request.workspaceRoot,
              mode: request.mode,
              nativeSessionId
            });
          }
        });
      } catch (error) {
        if (request.options.engine === 'acp') {
          throw error;
        }
        fallbackReason = error instanceof Error ? error.message : String(error);
      }
    }
    return runGrokCli(request, prompt, signal, fallbackReason);
  }
}

export function buildStructuredRunResult(input: {
  readonly runId: string;
  readonly request: RunRequest;
  readonly result: GrokRunResult;
  readonly before: GitAudit;
  readonly after: GitAudit;
  readonly readOnlyViolation: boolean;
  readonly status: Extract<RunStatus, 'success' | 'error' | 'cancelled'>;
  readonly logPath: string | undefined;
  readonly createdAt: number;
  readonly completedAt: number;
}): StructuredRunResult {
  const safety = formatSafety(input.request, input.before, input.after, input.readOnlyViolation);
  return {
    type: 'grok_delegate_run',
    version: 1,
    runId: input.runId,
    mode: input.request.mode,
    status: input.status,
    engine: input.result.engine,
    workspaceRoot: input.request.workspaceRoot,
    cwd: input.request.cwd,
    allowWrites: input.request.allowWrites,
    nativeSessionId: input.result.nativeSessionId,
    sessionResolution: input.result.sessionResolution,
    fallbackReason: input.result.fallbackReason,
    exitCode: input.result.exitCode,
    changedFiles: input.after.isGitRepo ? input.after.changedFiles : [],
    diffStat: input.after.isGitRepo ? input.after.diffStat || null : null,
    gitAuditAvailable: input.after.isGitRepo,
    workspaceWasDirty: input.before.isGitRepo && input.before.statusShort.length > 0,
    testsObserved: observedTests(input.result),
    safety,
    logPath: input.logPath,
    grokOutput: input.result.output || '(no Grok output)',
    startedAt: new Date(input.createdAt).toISOString(),
    completedAt: new Date(input.completedAt).toISOString(),
    durationMs: input.completedAt - input.createdAt
  };
}

export function formatRunSummary(result: StructuredRunResult): string {
  return [
    'Structured Result',
    '```json',
    JSON.stringify(result, null, 2),
    '```',
    '',
    `Run ID: ${result.runId}`,
    `Mode: ${result.mode}`,
    `Status: ${result.status}`,
    result.engine ? `Engine: ${result.engine}` : undefined,
    result.sessionResolution ? `Session: ${result.sessionResolution}` : undefined,
    result.fallbackReason ? `Fallback Reason: ${result.fallbackReason}` : undefined,
    result.nativeSessionId ? `Native Session: ${result.nativeSessionId}` : undefined,
    result.logPath ? `Log: ${result.logPath}` : undefined,
    '',
    'Grok Output',
    truncate(result.grokOutput, 12000),
    '',
    'Changed Files',
    result.gitAuditAvailable
      ? result.changedFiles.length > 0
        ? result.changedFiles.map((file) => `- ${file}`).join('\n')
        : 'none'
      : 'unavailable',
    '',
    'Diff Stat',
    result.diffStat ?? '(no git diff stat)',
    '',
    'Tests Run',
    result.testsObserved.length > 0
      ? result.testsObserved.map((test) => `- ${test.command} (${test.status})`).join('\n')
      : 'No test command observed by the plugin. Codex must run relevant verification.',
    '',
    'Safety',
    result.safety
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

function observedTests(result: GrokRunResult): readonly ObservedTestCommand[] {
  return result.terminalCommands
    .filter((command) =>
      /\b(test|vitest|jest|pytest|cargo test|go test|swift test)\b/u.test(
        [command.command, ...command.args].join(' ')
      )
    )
    .map((command) => {
      const status =
        command.exitCode === null
          ? `signal ${command.signal ?? 'unknown'}`
          : `exit ${String(command.exitCode)}`;
      return { command: [command.command, ...command.args].join(' '), status };
    });
}

function formatSafety(
  request: RunRequest,
  before: GitAudit,
  after: GitAudit,
  readOnlyViolation: boolean
): string {
  if (!after.isGitRepo) {
    return 'Git diff audit unavailable; Codex must manually inspect workspace changes.';
  }
  if (!request.allowWrites) {
    return readOnlyViolation
      ? 'FAILED: read-only run changed the git working tree.'
      : 'OK: read-only run did not change the git working tree.';
  }
  if (before.statusShort.length > 0) {
    return 'Workspace was already dirty before Grok ran; Codex must distinguish prior changes from Grok changes.';
  }
  return 'Write-capable run completed; Codex must inspect diff before reporting completion.';
}

export function hasObservedTestCommand(result: GrokRunResult): boolean {
  return result.terminalCommands.some((command) =>
    /\b(test|vitest|jest|pytest|cargo test|go test|swift test)\b/u.test(
      [command.command, ...command.args].join(' ')
    )
  );
}

function firstLine(value: string): string {
  return truncate(value.trim().split(/\r?\n/u)[0] ?? '', 160);
}
