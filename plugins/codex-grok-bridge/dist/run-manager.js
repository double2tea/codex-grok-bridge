"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunManager = void 0;
exports.buildStructuredRunResult = buildStructuredRunResult;
exports.formatRunSummary = formatRunSummary;
exports.hasObservedTestCommand = hasObservedTestCommand;
const git_js_1 = require("./git.js");
const grok_acp_js_1 = require("./grok-acp.js");
const grok_cli_js_1 = require("./grok-cli.js");
const prompt_js_1 = require("./prompt.js");
const run_log_js_1 = require("./run-log.js");
const session_store_js_1 = require("./session-store.js");
const utils_js_1 = require("./utils.js");
class RunManager {
    store;
    activeRuns = new Map();
    queues = new Map();
    logger;
    constructor(store = new session_store_js_1.SessionStore(), logger) {
        this.store = store;
        this.logger = logger ?? new run_log_js_1.RunLogger(store.dataDir);
    }
    async run(request) {
        const runId = (0, utils_js_1.randomId)('grok_run');
        const active = {
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
        }
        finally {
            clearTimeout(timeout);
            if (this.queues.get(queueKey)?.promise === next) {
                this.queues.delete(queueKey);
            }
            this.activeRuns.delete(runId);
        }
    }
    cancel(runId) {
        const run = this.activeRuns.get(runId);
        if (!run) {
            return false;
        }
        run.phase = 'cancelling';
        run.controller.abort();
        return true;
    }
    status() {
        const active = [...this.activeRuns.values()].map((run) => `- ${run.runId} ${run.mode} ${run.workspaceRoot} ${run.phase} ${String(Math.floor((Date.now() - run.startedAt) / 1000))}s`);
        const recent = this.store
            .recentRuns()
            .map((run) => `- ${run.runId} ${run.mode} ${run.status}${run.engine ? ` via ${run.engine}` : ''}: ${run.summary}`);
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
    async runUnqueued(runId, request, signal) {
        const createdAt = Date.now();
        const before = await (0, git_js_1.getGitAudit)(request.workspaceRoot);
        let terminalFailureLogged = false;
        if (signal.aborted) {
            const error = new Error('Grok run cancelled before start');
            this.logger.write(runId, {
                request: (0, run_log_js_1.runRequestLogView)(request),
                status: 'cancelled',
                beforeGit: before,
                error: error.message
            });
            throw error;
        }
        try {
            const result = await this.invokeGrok(request, signal);
            const after = await (0, git_js_1.getGitAudit)(request.workspaceRoot);
            const readOnlyViolation = !request.allowWrites && (0, git_js_1.gitAuditChanged)(before, after);
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
                request: (0, run_log_js_1.runRequestLogView)(request),
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
        }
        catch (error) {
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
                request: (0, run_log_js_1.runRequestLogView)(request),
                status,
                beforeGit: before,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    async invokeGrok(request, signal) {
        const prompt = (0, prompt_js_1.buildGrokPrompt)(request);
        const storedSession = this.store.getSession(request.workspaceRoot, request.mode);
        let fallbackReason;
        if (request.options.engine !== 'cli') {
            try {
                return await (0, grok_acp_js_1.runGrokAcp)(request, prompt, storedSession, signal, {
                    onNativeSession: (nativeSessionId) => {
                        this.store.setSession({
                            workspaceRoot: request.workspaceRoot,
                            mode: request.mode,
                            nativeSessionId
                        });
                    }
                });
            }
            catch (error) {
                if (request.options.engine === 'acp') {
                    throw error;
                }
                fallbackReason = error instanceof Error ? error.message : String(error);
            }
        }
        return (0, grok_cli_js_1.runGrokCli)(request, prompt, signal, fallbackReason);
    }
}
exports.RunManager = RunManager;
function buildStructuredRunResult(input) {
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
function formatRunSummary(result) {
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
        (0, utils_js_1.truncate)(result.grokOutput, 12000),
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
        .filter((line) => line !== undefined)
        .join('\n');
}
function observedTests(result) {
    return result.terminalCommands
        .filter((command) => /\b(test|vitest|jest|pytest|cargo test|go test|swift test)\b/u.test([command.command, ...command.args].join(' ')))
        .map((command) => {
        const status = command.exitCode === null
            ? `signal ${command.signal ?? 'unknown'}`
            : `exit ${String(command.exitCode)}`;
        return { command: [command.command, ...command.args].join(' '), status };
    });
}
function formatSafety(request, before, after, readOnlyViolation) {
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
function hasObservedTestCommand(result) {
    return result.terminalCommands.some((command) => /\b(test|vitest|jest|pytest|cargo test|go test|swift test)\b/u.test([command.command, ...command.args].join(' ')));
}
function firstLine(value) {
    return (0, utils_js_1.truncate)(value.trim().split(/\r?\n/u)[0] ?? '', 160);
}
//# sourceMappingURL=run-manager.js.map