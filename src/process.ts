import { spawn } from 'node:child_process';

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
}

export function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs = 30000
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, signal });
    });
  });
}
