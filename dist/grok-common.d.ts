import type { GrokOptions } from './types.js';
export declare function buildAgentArgs(options: GrokOptions): readonly string[];
export declare function buildCliArgs(prompt: string, cwd: string, options: GrokOptions): readonly string[];
export declare function formatCommand(command: string, args: readonly string[]): string;
export declare function isProbablyWritingCommand(command: string, args: readonly string[]): boolean;
export declare function isReadOnlySafeCommand(command: string, args: readonly string[]): boolean;
//# sourceMappingURL=grok-common.d.ts.map