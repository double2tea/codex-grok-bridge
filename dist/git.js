"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGitAudit = getGitAudit;
exports.gitAuditChanged = gitAuditChanged;
const process_js_1 = require("./process.js");
async function getGitAudit(workspaceRoot) {
    const inside = await (0, process_js_1.runCommand)('git', ['rev-parse', '--is-inside-work-tree'], workspaceRoot).catch((error) => ({
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
        signal: null
    }));
    if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') {
        return {
            isGitRepo: false,
            statusShort: '',
            diffStat: '',
            changedFiles: [],
            error: inside.stderr.trim() || 'workspace is not a git repository'
        };
    }
    const [status, stat, names] = await Promise.all([
        (0, process_js_1.runCommand)('git', ['status', '--short'], workspaceRoot),
        (0, process_js_1.runCommand)('git', ['diff', '--stat'], workspaceRoot),
        (0, process_js_1.runCommand)('git', ['diff', '--name-only'], workspaceRoot)
    ]);
    const statusFiles = parseStatusFiles(status.stdout);
    const diffFiles = names.stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    return {
        isGitRepo: true,
        statusShort: status.stdout.trim(),
        diffStat: stat.stdout.trim(),
        changedFiles: [...new Set([...statusFiles, ...diffFiles])].sort()
    };
}
function gitAuditChanged(before, after) {
    if (before.isGitRepo !== after.isGitRepo) {
        return true;
    }
    return before.statusShort !== after.statusShort || before.diffStat !== after.diffStat;
}
function parseStatusFiles(statusShort) {
    const files = [];
    for (const line of statusShort.split(/\r?\n/u)) {
        if (line.trim().length === 0 || line.length < 4) {
            continue;
        }
        const pathPart = line.slice(3).trim();
        const renameParts = pathPart.split(' -> ');
        files.push(renameParts.at(-1) ?? pathPart);
    }
    return files;
}
//# sourceMappingURL=git.js.map