import { spawn } from 'node:child_process';
import type { ChildProcessByStdio, ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import type { Readable } from 'node:stream';
import type { GrokRunResult, RunRequest, StoredSession, TerminalCommand } from './types.js';
import { buildAgentArgs, formatCommand, isReadOnlySafeCommand } from './grok-common.js';
import { assertInsideWorkspace } from './workspace.js';
import { isRecord, parseJson, readString, stripAnsi, truncate } from './utils.js';

type JsonRpcId = number | string;

interface PendingRequest {
  readonly resolve: (value: Record<string, unknown>) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

interface TerminalExitStatus {
  readonly exitCode: number | null;
  readonly signal: string | null;
}

interface AcpTerminal {
  readonly proc: ChildProcessByStdio<null, Readable, Readable>;
  output: string;
  truncated: boolean;
  exitStatus: TerminalExitStatus | undefined;
  readonly outputByteLimit: number;
  readonly waiters: Array<(status: TerminalExitStatus) => void>;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

interface AcpRunCallbacks {
  readonly onNativeSession: (nativeSessionId: string) => void;
}

export async function runGrokAcp(
  request: RunRequest,
  prompt: string,
  storedSession: StoredSession | undefined,
  signal: AbortSignal,
  callbacks: AcpRunCallbacks
): Promise<GrokRunResult> {
  const client = new GrokAcpClient(request, callbacks);
  try {
    await client.initialize();
    const resolution = await client.getOrCreateSession(storedSession);
    const code = await client.prompt(resolution.sessionId, prompt, signal);
    return {
      engine: 'acp',
      output: client.output().trim(),
      exitCode: code,
      nativeSessionId: resolution.sessionId,
      sessionResolution: resolution.source,
      terminalCommands: client.terminalCommands()
    };
  } finally {
    client.close();
  }
}

class GrokAcpClient {
  private proc: ChildProcessWithoutNullStreams | undefined;
  private rl: readline.Interface | undefined;
  private nextId = 1;
  private nextTerminalId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly terminals = new Map<string, AcpTerminal>();
  private readonly terminalLog: TerminalCommand[] = [];
  private supportsLoadSession = false;
  private textOutput = '';

  constructor(
    private readonly requestInput: RunRequest,
    private readonly callbacks: AcpRunCallbacks
  ) {}

  async initialize(): Promise<void> {
    const proc = spawn(
      this.requestInput.options.grokBin,
      [...buildAgentArgs(this.requestInput.options)],
      {
        cwd: this.requestInput.cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );
    this.proc = proc;
    proc.stderr.on('data', (chunk) => {
      this.textOutput += `[grok stderr] ${stripAnsi(String(chunk))}`;
    });
    proc.on('error', (error) => {
      this.rejectPending(error);
    });
    proc.on('exit', () => {
      this.rejectPending(new Error('Grok ACP process exited'));
    });
    this.rl = readline.createInterface({ input: proc.stdout });
    this.rl.on('line', (line) => {
      this.handleLine(line);
    });

    const init = await this.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: false },
        terminal: true
      },
      clientInfo: {
        name: 'codex-grok-bridge',
        version: '0.1.1'
      }
    });
    this.supportsLoadSession = supportsAcpLoadSession(init);
    await this.request('authenticate', {
      methodId: chooseAuthMethod(init),
      _meta: { headless: true }
    });
  }

  async getOrCreateSession(
    storedSession: StoredSession | undefined
  ): Promise<{ readonly sessionId: string; readonly source: string }> {
    if (storedSession && this.supportsLoadSession) {
      try {
        await this.request(
          'session/load',
          {
            sessionId: storedSession.nativeSessionId,
            cwd: this.requestInput.cwd,
            mcpServers: []
          },
          180000
        );
        return { sessionId: storedSession.nativeSessionId, source: 'loaded' };
      } catch (error) {
        this.textOutput += `\nGrok session/load failed; creating new session: ${
          error instanceof Error ? error.message : String(error)
        }\n`;
      }
    }
    const result = await this.request('session/new', {
      cwd: this.requestInput.cwd,
      mcpServers: []
    });
    const sessionId = readString(result, 'sessionId');
    if (!sessionId) {
      throw new Error('Grok ACP did not return sessionId');
    }
    this.callbacks.onNativeSession(sessionId);
    return { sessionId, source: storedSession ? 'new_after_load_failed' : 'new' };
  }

  async prompt(sessionId: string, prompt: string, signal: AbortSignal): Promise<number> {
    let abort: (() => void) | undefined;
    const abortPromise = new Promise<Record<string, unknown>>((_, reject) => {
      abort = (): void => {
        void this.request('session/cancel', { sessionId }, 5000).catch(() => {
          this.proc?.kill('SIGTERM');
        });
        reject(new Error('Grok run cancelled'));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    });
    try {
      const result = await Promise.race([
        this.request(
          'session/prompt',
          {
            sessionId,
            prompt: [{ type: 'text', text: prompt }]
          },
          this.requestInput.options.timeoutMs
        ),
        abortPromise
      ]);
      return readString(result, 'stopReason') === 'end_turn' ? 0 : 1;
    } finally {
      if (abort) {
        signal.removeEventListener('abort', abort);
      }
    }
  }

  output(): string {
    return this.textOutput;
  }

  terminalCommands(): readonly TerminalCommand[] {
    return this.terminalLog;
  }

  close(): void {
    this.rl?.close();
    this.rl = undefined;
    this.releaseAllTerminals();
    this.rejectPending(new Error('Grok ACP process closed'));
    this.proc?.kill('SIGTERM');
    this.proc = undefined;
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 60000
  ): Promise<Record<string, unknown>> {
    if (!this.proc) {
      throw new Error('Grok ACP process is not running');
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Grok ACP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  private handleLine(line: string): void {
    const message = parseJson(line);
    if (!isRecord(message)) {
      return;
    }
    const method = readString(message, 'method');
    if (method === 'session/update') {
      this.handleSessionUpdate(message.params);
      return;
    }
    const id = readJsonRpcId(message, 'id');
    if (method && id !== undefined) {
      void this.handleClientRequest(id, method, message.params);
      return;
    }
    if (typeof id !== 'number') {
      return;
    }
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    this.pending.delete(id);
    clearTimeout(pending.timer);
    const error = message.error;
    if (isRecord(error)) {
      pending.reject(new Error(readString(error, 'message') ?? JSON.stringify(error)));
      return;
    }
    pending.resolve(isRecord(message.result) ? message.result : {});
  }

  private async handleClientRequest(id: JsonRpcId, method: string, params: unknown): Promise<void> {
    try {
      const result = await this.resolveClientRequest(method, params);
      this.proc?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
    } catch (error) {
      this.proc?.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: error instanceof Error ? error.message : String(error) }
        })}\n`
      );
    }
  }

  private async resolveClientRequest(method: string, params: unknown): Promise<unknown> {
    if (method === 'fs/read_text_file') {
      return this.readTextFile(params);
    }
    if (method === 'session/request_permission') {
      return { outcome: { outcome: 'cancelled' } };
    }
    if (method === 'terminal/create') {
      return this.createTerminal(params);
    }
    if (method === 'terminal/output') {
      return this.readTerminalOutput(params);
    }
    if (method === 'terminal/wait_for_exit') {
      return this.waitForTerminalExit(params);
    }
    if (method === 'terminal/kill') {
      this.killTerminal(params);
      return null;
    }
    if (method === 'terminal/release') {
      this.releaseTerminal(params);
      return null;
    }
    throw new Error(`Unsupported ACP client method: ${method}`);
  }

  private async readTextFile(params: unknown): Promise<{ readonly content: string }> {
    const record = expectRecord(params, 'fs/read_text_file params');
    const filePath = readString(record, 'path');
    if (!filePath) {
      throw new Error('fs/read_text_file requires path');
    }
    if (!path.isAbsolute(filePath)) {
      throw new Error('fs/read_text_file path must be absolute');
    }
    assertInsideWorkspace(this.requestInput.workspaceRoot, filePath, 'fs/read_text_file path');
    const content = await fs.readFile(filePath, 'utf8');
    const startLine =
      readPositiveInteger(record, 'line') ?? readPositiveInteger(record, 'startLine');
    const lineLimit =
      readPositiveInteger(record, 'limit') ?? readPositiveInteger(record, 'numLines');
    if (startLine === undefined && lineLimit === undefined) {
      return { content };
    }
    const lines = content.split(/\r?\n/u);
    const startIndex = (startLine ?? 1) - 1;
    const endIndex = lineLimit === undefined ? undefined : startIndex + lineLimit;
    return { content: lines.slice(startIndex, endIndex).join('\n') };
  }

  private createTerminal(params: unknown): { readonly terminalId: string } {
    const record = expectRecord(params, 'terminal params');
    const command = readString(record, 'command');
    if (!command) {
      throw new Error('terminal/create requires command');
    }
    const args = readStringArray(record.args);
    const cwd = readString(record, 'cwd') ?? this.requestInput.cwd;
    if (!path.isAbsolute(cwd)) {
      throw new Error('terminal/create cwd must be absolute');
    }
    assertInsideWorkspace(this.requestInput.workspaceRoot, cwd, 'terminal cwd');
    if (!this.requestInput.allowWrites && !isReadOnlySafeCommand(command, args)) {
      throw new Error(
        `read-only Grok run cannot execute non-allowlisted command: ${formatCommand(command, args)}`
      );
    }
    const outputByteLimit = readPositiveInteger(record, 'outputByteLimit') ?? 1024 * 1024;
    const proc = spawn(command, [...args], {
      cwd,
      env: { ...process.env, ...readEnv(record.env) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const terminalId = `term_${String(this.nextTerminalId)}`;
    this.nextTerminalId += 1;
    const terminal: AcpTerminal = {
      proc,
      output: '',
      truncated: false,
      exitStatus: undefined,
      outputByteLimit,
      waiters: [],
      command,
      args,
      cwd
    };
    this.terminals.set(terminalId, terminal);
    const append = (chunk: Buffer): void => {
      terminal.output = truncate(`${terminal.output}${stripAnsi(String(chunk))}`, outputByteLimit);
      terminal.truncated = terminal.output.length >= outputByteLimit;
    };
    proc.stdout.on('data', append);
    proc.stderr.on('data', append);
    proc.on('error', (error) => {
      terminal.output += `${error.message}\n`;
      this.finishTerminal(terminal, { exitCode: null, signal: null });
    });
    proc.on('close', (exitCode, signal) => {
      this.finishTerminal(terminal, { exitCode, signal });
    });
    return { terminalId };
  }

  private readTerminalOutput(params: unknown): {
    readonly output: string;
    readonly truncated: boolean;
    readonly exitStatus?: TerminalExitStatus;
  } {
    const terminal = this.getTerminal(params);
    return {
      output: terminal.output,
      truncated: terminal.truncated,
      ...(terminal.exitStatus ? { exitStatus: terminal.exitStatus } : {})
    };
  }

  private waitForTerminalExit(params: unknown): Promise<TerminalExitStatus> {
    const terminal = this.getTerminal(params);
    if (terminal.exitStatus) {
      return Promise.resolve(terminal.exitStatus);
    }
    return new Promise((resolve) => {
      terminal.waiters.push(resolve);
    });
  }

  private killTerminal(params: unknown): void {
    const terminal = this.getTerminal(params);
    if (!terminal.exitStatus) {
      terminal.proc.kill('SIGTERM');
    }
  }

  private releaseTerminal(params: unknown): void {
    const record = expectRecord(params, 'terminal params');
    const terminalId = readString(record, 'terminalId');
    if (!terminalId) {
      throw new Error('terminal request requires terminalId');
    }
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return;
    }
    if (!terminal.exitStatus) {
      terminal.proc.kill('SIGTERM');
    }
    this.terminals.delete(terminalId);
  }

  private releaseAllTerminals(): void {
    for (const terminal of this.terminals.values()) {
      if (!terminal.exitStatus) {
        terminal.proc.kill('SIGTERM');
      }
    }
    this.terminals.clear();
  }

  private getTerminal(params: unknown): AcpTerminal {
    const record = expectRecord(params, 'terminal params');
    const terminalId = readString(record, 'terminalId');
    if (!terminalId) {
      throw new Error('terminal request requires terminalId');
    }
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      throw new Error(`Unknown terminalId: ${terminalId}`);
    }
    return terminal;
  }

  private finishTerminal(terminal: AcpTerminal, status: TerminalExitStatus): void {
    if (terminal.exitStatus) {
      return;
    }
    terminal.exitStatus = status;
    this.terminalLog.push({
      command: terminal.command,
      args: terminal.args,
      cwd: terminal.cwd,
      exitCode: status.exitCode,
      signal: status.signal
    });
    const waiters = terminal.waiters.splice(0);
    for (const resolve of waiters) {
      resolve(status);
    }
  }

  private handleSessionUpdate(params: unknown): void {
    if (!isRecord(params)) {
      return;
    }
    const update = params.update;
    const text = parseAcpUpdate(update);
    if (text) {
      this.textOutput += text;
    }
  }

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}

export function parseAcpUpdate(update: unknown): string | undefined {
  if (!isRecord(update)) {
    return undefined;
  }
  const sessionUpdate = readString(update, 'sessionUpdate');
  const content = update.content;
  if (sessionUpdate === 'agent_message_chunk' && isRecord(content)) {
    const text = readString(content, 'text');
    return text ? text : undefined;
  }
  if (sessionUpdate?.includes('tool')) {
    const name = readString(update, 'toolName') ?? readString(update, 'title') ?? sessionUpdate;
    return `\n[tool] ${name}\n`;
  }
  return undefined;
}

function supportsAcpLoadSession(init: Record<string, unknown>): boolean {
  const capabilities = init.agentCapabilities;
  return isRecord(capabilities) && capabilities.loadSession === true;
}

function chooseAuthMethod(init: Record<string, unknown>): string {
  const methods = init.authMethods;
  if (!Array.isArray(methods)) {
    throw new Error('Grok ACP did not return auth methods');
  }
  const ids = methods
    .map((method) => (isRecord(method) ? readString(method, 'id') : undefined))
    .filter((id): id is string => id !== undefined);
  if (process.env.XAI_API_KEY && ids.includes('xai.api_key')) {
    return 'xai.api_key';
  }
  if (ids.includes('cached_token')) {
    return 'cached_token';
  }
  throw new Error('Run `grok login` first, or set XAI_API_KEY.');
}

function readJsonRpcId(record: Record<string, unknown>, key: string): JsonRpcId | undefined {
  const value = record[key];
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function readPositiveInteger(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function readStringArray(value: unknown): readonly string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('terminal/create args must be strings');
  }
  return value.map((item) => {
    if (typeof item !== 'string') {
      throw new Error('terminal/create args must be strings');
    }
    return item;
  });
}

function readEnv(value: unknown): NodeJS.ProcessEnv {
  if (!Array.isArray(value)) {
    return {};
  }
  const env: NodeJS.ProcessEnv = {};
  for (const item of value) {
    if (!isRecord(item)) {
      throw new Error('terminal/create env entries must be objects');
    }
    const name = readString(item, 'name');
    const envValue = readString(item, 'value');
    if (!name || envValue === undefined) {
      throw new Error('terminal/create env entries require name and value');
    }
    env[name] = envValue;
  }
  return env;
}
