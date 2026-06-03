import fs from 'node:fs';
import path from 'node:path';

export interface WorkspaceContext {
  readonly workspaceRoot: string;
  readonly cwd: string;
}

export function resolveWorkspace(workspaceRootInput: string, cwdInput?: string): WorkspaceContext {
  const workspaceRootPath = path.resolve(workspaceRootInput);
  if (!fs.existsSync(workspaceRootPath)) {
    throw new Error(`workspaceRoot does not exist: ${workspaceRootPath}`);
  }
  const workspaceRoot = fs.realpathSync.native(workspaceRootPath);
  if (!fs.statSync(workspaceRoot).isDirectory()) {
    throw new Error(`workspaceRoot is not a directory: ${workspaceRoot}`);
  }
  const cwdPath = cwdInput ? path.resolve(workspaceRoot, cwdInput) : workspaceRoot;
  assertInsideWorkspace(workspaceRoot, cwdPath, 'cwd');
  if (!fs.existsSync(cwdPath)) {
    throw new Error(`cwd does not exist: ${cwdPath}`);
  }
  const cwd = fs.realpathSync.native(cwdPath);
  assertInsideWorkspace(workspaceRoot, cwd, 'cwd');
  if (!fs.statSync(cwd).isDirectory()) {
    throw new Error(`cwd is not a directory: ${cwd}`);
  }
  return { workspaceRoot, cwd };
}

export function assertInsideWorkspace(workspaceRoot: string, target: string, label: string): void {
  const root = fs.realpathSync.native(path.resolve(workspaceRoot));
  const targetPath = path.resolve(target);
  const resolved = fs.existsSync(targetPath) ? fs.realpathSync.native(targetPath) : targetPath;
  const relative = path.relative(root, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`${label} must stay inside workspaceRoot: ${resolved}`);
}
