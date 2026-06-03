import { runCommand } from './process.js';

export interface GitAudit {
  readonly isGitRepo: boolean;
  readonly statusShort: string;
  readonly diffStat: string;
  readonly changedFiles: readonly string[];
  readonly error?: string;
}

export async function getGitAudit(workspaceRoot: string): Promise<GitAudit> {
  const inside = await runCommand(
    'git',
    ['rev-parse', '--is-inside-work-tree'],
    workspaceRoot
  ).catch((error: unknown) => ({
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
    runCommand('git', ['status', '--short'], workspaceRoot),
    runCommand('git', ['diff', '--stat'], workspaceRoot),
    runCommand('git', ['diff', '--name-only'], workspaceRoot)
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

export function gitAuditChanged(before: GitAudit, after: GitAudit): boolean {
  if (before.isGitRepo !== after.isGitRepo) {
    return true;
  }
  return before.statusShort !== after.statusShort || before.diffStat !== after.diffStat;
}

function parseStatusFiles(statusShort: string): readonly string[] {
  const files: string[] = [];
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
