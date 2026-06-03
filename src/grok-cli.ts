import { spawn } from 'node:child_process';
import readline from 'node:readline';
import type { GrokRunResult, RunRequest } from './types.js';
import { buildCliArgs } from './grok-common.js';
import { parseJson, stripAnsi } from './utils.js';

export function runGrokCli(
  request: RunRequest,
  prompt: string,
  signal: AbortSignal,
  fallbackReason?: string
): Promise<GrokRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      request.options.grokBin,
      [...buildCliArgs(prompt, request.cwd, request.options)],
      {
        cwd: request.cwd,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    let output = '';
    let stderr = '';
    let aborted = false;
    const abort = (): void => {
      aborted = true;
      child.kill('SIGTERM');
    };
    signal.addEventListener('abort', abort, { once: true });

    const stdout = readline.createInterface({ input: child.stdout });
    const stderrLines = readline.createInterface({ input: child.stderr });
    stdout.on('line', (line) => {
      output += parseStreamingLine(line);
    });
    stderrLines.on('line', (line) => {
      stderr += `${stripAnsi(line)}\n`;
    });
    child.on('error', (error) => {
      signal.removeEventListener('abort', abort);
      stdout.close();
      stderrLines.close();
      reject(error);
    });
    child.on('close', (exitCode) => {
      signal.removeEventListener('abort', abort);
      stdout.close();
      stderrLines.close();
      if (aborted) {
        reject(new Error('Grok run cancelled'));
        return;
      }
      const text = output.trim() || stderr.trim();
      resolve({
        engine: 'cli',
        output: text,
        exitCode: exitCode ?? 0,
        fallbackReason,
        terminalCommands: []
      });
    });
  });
}

export function parseStreamingLine(line: string): string {
  const parsed = parseJson(line);
  const text = findText(parsed);
  if (text) {
    return text;
  }
  if (typeof parsed === 'undefined') {
    return `${line}\n`;
  }
  return '';
}

function findText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return `${value}\n`;
  }
  if (Array.isArray(value)) {
    const pieces = value.map(findText).filter((item): item is string => item !== undefined);
    return pieces.length > 0 ? pieces.join('') : undefined;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['text', 'content', 'message', 'delta', 'output']) {
    const item = record[key];
    const text = findText(item);
    if (text) {
      return text;
    }
  }
  return undefined;
}
