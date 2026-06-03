import type { GrokMode, RecentRun, StoredSession } from './types.js';
export declare class SessionStore {
    readonly dataDir: string;
    private readonly filePath;
    private data;
    constructor(dataDir?: string);
    sessionKey(workspaceRoot: string, mode: GrokMode): string;
    getSession(workspaceRoot: string, mode: GrokMode): StoredSession | undefined;
    setSession(input: {
        readonly workspaceRoot: string;
        readonly mode: GrokMode;
        readonly nativeSessionId: string;
    }): void;
    addRecentRun(run: RecentRun): void;
    recentRuns(): readonly RecentRun[];
    sessions(): readonly StoredSession[];
    private read;
    private write;
}
//# sourceMappingURL=session-store.d.ts.map