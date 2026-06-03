import type { GitAudit } from './git.js';
import { RunLogger } from './run-log.js';
import { SessionStore } from './session-store.js';
import type { GrokRunResult, RunRequest, RunStatus, StructuredRunResult } from './types.js';
export declare class RunManager {
    private readonly store;
    private readonly activeRuns;
    private readonly queues;
    private readonly logger;
    constructor(store?: SessionStore, logger?: RunLogger);
    run(request: RunRequest): Promise<string>;
    cancel(runId: string): boolean;
    status(): string;
    private runUnqueued;
    private invokeGrok;
}
export declare function buildStructuredRunResult(input: {
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
}): StructuredRunResult;
export declare function formatRunSummary(result: StructuredRunResult): string;
export declare function hasObservedTestCommand(result: GrokRunResult): boolean;
//# sourceMappingURL=run-manager.d.ts.map