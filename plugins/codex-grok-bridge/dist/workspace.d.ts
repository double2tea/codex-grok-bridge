export interface WorkspaceContext {
    readonly workspaceRoot: string;
    readonly cwd: string;
}
export declare function resolveWorkspace(workspaceRootInput: string, cwdInput?: string): WorkspaceContext;
export declare function assertInsideWorkspace(workspaceRoot: string, target: string, label: string): void;
//# sourceMappingURL=workspace.d.ts.map