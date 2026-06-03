export interface CommandResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number | null;
    readonly signal: string | null;
}
export declare function runCommand(command: string, args: readonly string[], cwd: string, timeoutMs?: number): Promise<CommandResult>;
//# sourceMappingURL=process.d.ts.map