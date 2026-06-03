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
export declare class RunLogger {
    private readonly runsDir;
    constructor(dataDir: string);
    write(runId: string, record: RunLogRecord): string;
}
export declare function runRequestLogView(request: RunRequest): RunLogRecord['request'];
//# sourceMappingURL=run-log.d.ts.map