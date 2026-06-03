export interface GitAudit {
    readonly isGitRepo: boolean;
    readonly statusShort: string;
    readonly diffStat: string;
    readonly changedFiles: readonly string[];
    readonly error?: string;
}
export declare function getGitAudit(workspaceRoot: string): Promise<GitAudit>;
export declare function gitAuditChanged(before: GitAudit, after: GitAudit): boolean;
//# sourceMappingURL=git.d.ts.map