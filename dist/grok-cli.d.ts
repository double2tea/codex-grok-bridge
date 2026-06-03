import type { GrokRunResult, RunRequest } from './types.js';
export declare function runGrokCli(request: RunRequest, prompt: string, signal: AbortSignal, fallbackReason?: string): Promise<GrokRunResult>;
export declare function parseStreamingLine(line: string): string;
//# sourceMappingURL=grok-cli.d.ts.map