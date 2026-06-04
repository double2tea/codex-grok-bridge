import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCommand } from '../src/process.js';
import { RunLogger } from '../src/run-log.js';
import { RunManager } from '../src/run-manager.js';
import { SessionStore } from '../src/session-store.js';
import type { RunRequest } from '../src/types.js';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('RunManager', () => {
  it('runs fake Grok ACP and reports changed files', async () => {
    const workspaceRoot = await makeGitWorkspace();
    const fakeGrok = await writeFakeGrok('write');
    const stateDir = await makeTempDir('codex-grok-bridge-state-');
    const store = new SessionStore(stateDir);
    const manager = new RunManager(store, new RunLogger(stateDir));

    const summary = await manager.run(makeRequest(workspaceRoot, fakeGrok, true));

    const logPath = extractLogPath(summary);
    expect(summary).toContain('Engine: acp');
    expect(summary).toContain('```json');
    expect(summary).toContain('grok.txt');
    expect(summary).toContain('Tests Run');
    expect(logPath).toBeTruthy();
    await expect(fs.stat(logPath)).resolves.toBeTruthy();
  });

  it('blocks obvious write commands in read-only runs', async () => {
    const workspaceRoot = await makeGitWorkspace();
    const fakeGrok = await writeFakeGrok('write');
    const store = new SessionStore(await makeTempDir('codex-grok-bridge-state-'));
    const manager = new RunManager(store);

    const summary = await manager.run(makeRequest(workspaceRoot, fakeGrok, false));

    expect(summary).toContain('write denied');
    expect(summary).toContain('OK: read-only run did not change the git working tree');
  });

  it('falls back to CLI when ACP startup fails', async () => {
    const workspaceRoot = await makeGitWorkspace();
    const fakeGrok = await writeFakeCliFallbackGrok();
    const store = new SessionStore(await makeTempDir('codex-grok-bridge-state-'));
    const manager = new RunManager(store);

    const summary = await manager.run(makeRequest(workspaceRoot, fakeGrok, true, 'auto'));

    expect(summary).toContain('Engine: cli');
    expect(summary).toContain('cli output');
    expect(summary).toContain('cli.txt');
  });

  it('disables CLI fallback for read-only runs', async () => {
    const workspaceRoot = await makeGitWorkspace();
    const fakeGrok = await writeFakeCliFallbackGrok();
    const store = new SessionStore(await makeTempDir('codex-grok-bridge-state-'));
    const manager = new RunManager(store);

    await expect(manager.run(makeRequest(workspaceRoot, fakeGrok, false, 'auto'))).rejects.toThrow(
      'Read-only Grok ACP failed; CLI fallback disabled'
    );
    await expect(fs.stat(path.join(workspaceRoot, 'cli.txt'))).rejects.toThrow();
  });

  it('rejects read-only runs on dirty git workspaces', async () => {
    const workspaceRoot = await makeGitWorkspace();
    const fakeGrok = await writeFakeGrok('write');
    const store = new SessionStore(await makeTempDir('codex-grok-bridge-state-'));
    const manager = new RunManager(store);
    await fs.writeFile(path.join(workspaceRoot, 'existing.txt'), 'dirty');

    await expect(manager.run(makeRequest(workspaceRoot, fakeGrok, false))).rejects.toThrow(
      'Read-only Grok run requires a clean git working tree'
    );
    await expect(fs.stat(path.join(workspaceRoot, 'grok.txt'))).rejects.toThrow();
  });

  it('cancels an active ACP run', async () => {
    const workspaceRoot = await makeGitWorkspace();
    const fakeGrok = await writeFakeSlowGrok();
    const store = new SessionStore(await makeTempDir('codex-grok-bridge-state-'));
    const manager = new RunManager(store);

    const runPromise = manager.run(makeRequest(workspaceRoot, fakeGrok, false));
    const runId = await waitForRunId(manager);

    expect(manager.cancel(runId)).toBe(true);
    await expect(runPromise).rejects.toThrow('Grok run cancelled');
  });
});

function makeRequest(
  workspaceRoot: string,
  grokBin: string,
  allowWrites: boolean,
  engine: RunRequest['options']['engine'] = 'acp'
): RunRequest {
  return {
    task: 'create a marker file',
    workspaceRoot,
    cwd: workspaceRoot,
    mode: allowWrites ? 'execute' : 'review',
    allowWrites,
    options: {
      grokBin,
      engine,
      disableWebSearch: true,
      allow: [],
      deny: [],
      timeoutMs: 30000
    }
  };
}

async function makeGitWorkspace(): Promise<string> {
  const dir = await makeTempDir('codex-grok-bridge-workspace-');
  await runCommand('git', ['init'], dir);
  return dir;
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeFakeGrok(kind: 'write'): Promise<string> {
  const dir = await makeTempDir('codex-grok-bridge-fake-');
  const filePath = path.join(dir, 'fake-grok.mjs');
  await fs.writeFile(filePath, fakeGrokScript(kind), { mode: 0o755 });
  return filePath;
}

async function writeFakeCliFallbackGrok(): Promise<string> {
  const dir = await makeTempDir('codex-grok-bridge-fake-');
  const filePath = path.join(dir, 'fake-grok-cli.mjs');
  await fs.writeFile(filePath, fakeCliFallbackScript(), { mode: 0o755 });
  return filePath;
}

async function writeFakeSlowGrok(): Promise<string> {
  const dir = await makeTempDir('codex-grok-bridge-fake-');
  const filePath = path.join(dir, 'fake-grok-slow.mjs');
  await fs.writeFile(filePath, fakeSlowGrokScript(), { mode: 0o755 });
  return filePath;
}

function fakeGrokScript(_kind: 'write'): string {
  return `#!/usr/bin/env node
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
let promptId = 0;
let cwd = process.cwd();
let terminalId = '';

function send(message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n');
}

rl.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    send({ id: message.id, result: { protocolVersion: 1, authMethods: [{ id: 'cached_token' }], agentCapabilities: { loadSession: true } } });
    return;
  }
  if (message.method === 'authenticate') {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === 'session/new') {
    cwd = message.params.cwd;
    send({ id: message.id, result: { sessionId: 'sess_fake' } });
    return;
  }
  if (message.method === 'session/prompt') {
    promptId = message.id;
    send({
      id: 101,
      method: 'terminal/create',
      params: {
        command: process.execPath,
        args: ['-e', 'require("fs").writeFileSync("grok.txt", "ok")'],
        cwd
      }
    });
    return;
  }
  if (message.id === 101) {
    if (message.error) {
      send({ method: 'session/update', params: { sessionId: 'sess_fake', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'write denied' } } } });
      send({ id: promptId, result: { stopReason: 'end_turn' } });
      return;
    }
    terminalId = message.result.terminalId;
    send({ id: 102, method: 'terminal/wait_for_exit', params: { terminalId } });
    return;
  }
  if (message.id === 102) {
    send({ method: 'session/update', params: { sessionId: 'sess_fake', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'created grok.txt' } } } });
    send({ id: promptId, result: { stopReason: 'end_turn' } });
  }
});
`;
}

function fakeCliFallbackScript(): string {
  return `#!/usr/bin/env node
import fs from 'node:fs';

if (process.argv.includes('agent')) {
  process.stderr.write('acp unavailable\\n');
  process.exit(1);
}

fs.writeFileSync('cli.txt', 'ok');
process.stdout.write(JSON.stringify({ content: { text: 'cli output' } }) + '\\n');
`;
}

function fakeSlowGrokScript(): string {
  return `#!/usr/bin/env node
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });

function send(message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n');
}

rl.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    send({ id: message.id, result: { protocolVersion: 1, authMethods: [{ id: 'cached_token' }] } });
    return;
  }
  if (message.method === 'authenticate') {
    send({ id: message.id, result: {} });
    return;
  }
  if (message.method === 'session/new') {
    send({ id: message.id, result: { sessionId: 'sess_slow' } });
    return;
  }
  if (message.method === 'session/cancel') {
    send({ id: message.id, result: {} });
  }
});
`;
}

function extractLogPath(summary: string): string {
  const match = /^Log: (?<path>.+)$/mu.exec(summary);
  return match?.groups?.path ?? '';
}

async function waitForRunId(manager: RunManager): Promise<string> {
  for (let index = 0; index < 50; index += 1) {
    const match = /(grok_run_[a-f0-9]+)/u.exec(manager.status());
    if (match) {
      return match[1] ?? '';
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('run id did not appear');
}
