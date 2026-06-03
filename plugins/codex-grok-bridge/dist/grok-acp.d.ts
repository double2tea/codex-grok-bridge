import type { GrokRunResult, RunRequest, StoredSession } from './types.js';
interface AcpRunCallbacks {
    readonly onNativeSession: (nativeSessionId: string) => void;
}
export declare function runGrokAcp(request: RunRequest, prompt: string, storedSession: StoredSession | undefined, signal: AbortSignal, callbacks: AcpRunCallbacks): Promise<GrokRunResult>;
export declare function parseAcpUpdate(update: unknown): string | undefined;
export {};
//# sourceMappingURL=grok-acp.d.ts.map