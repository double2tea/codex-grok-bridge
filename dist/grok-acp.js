"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGrokAcp = runGrokAcp;
exports.parseAcpUpdate = parseAcpUpdate;
const node_child_process_1 = require("node:child_process");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_readline_1 = __importDefault(require("node:readline"));
const grok_common_js_1 = require("./grok-common.js");
const workspace_js_1 = require("./workspace.js");
const utils_js_1 = require("./utils.js");
async function runGrokAcp(request, prompt, storedSession, signal, callbacks) {
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
    }
    finally {
        client.close();
    }
}
class GrokAcpClient {
    requestInput;
    callbacks;
    proc;
    rl;
    nextId = 1;
    nextTerminalId = 1;
    pending = new Map();
    terminals = new Map();
    terminalLog = [];
    supportsLoadSession = false;
    textOutput = '';
    constructor(requestInput, callbacks) {
        this.requestInput = requestInput;
        this.callbacks = callbacks;
    }
    async initialize() {
        const proc = (0, node_child_process_1.spawn)(this.requestInput.options.grokBin, [...(0, grok_common_js_1.buildAgentArgs)(this.requestInput.options)], {
            cwd: this.requestInput.cwd,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        this.proc = proc;
        proc.stderr.on('data', (chunk) => {
            this.textOutput += `[grok stderr] ${(0, utils_js_1.stripAnsi)(String(chunk))}`;
        });
        proc.on('error', (error) => {
            this.rejectPending(error);
        });
        proc.on('exit', () => {
            this.rejectPending(new Error('Grok ACP process exited'));
        });
        this.rl = node_readline_1.default.createInterface({ input: proc.stdout });
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
                version: '0.1.0'
            }
        });
        this.supportsLoadSession = supportsAcpLoadSession(init);
        await this.request('authenticate', {
            methodId: chooseAuthMethod(init),
            _meta: { headless: true }
        });
    }
    async getOrCreateSession(storedSession) {
        if (storedSession && this.supportsLoadSession) {
            try {
                await this.request('session/load', {
                    sessionId: storedSession.nativeSessionId,
                    cwd: this.requestInput.cwd,
                    mcpServers: []
                }, 180000);
                return { sessionId: storedSession.nativeSessionId, source: 'loaded' };
            }
            catch (error) {
                this.textOutput += `\nGrok session/load failed; creating new session: ${error instanceof Error ? error.message : String(error)}\n`;
            }
        }
        const result = await this.request('session/new', {
            cwd: this.requestInput.cwd,
            mcpServers: []
        });
        const sessionId = (0, utils_js_1.readString)(result, 'sessionId');
        if (!sessionId) {
            throw new Error('Grok ACP did not return sessionId');
        }
        this.callbacks.onNativeSession(sessionId);
        return { sessionId, source: storedSession ? 'new_after_load_failed' : 'new' };
    }
    async prompt(sessionId, prompt, signal) {
        let abort;
        const abortPromise = new Promise((_, reject) => {
            abort = () => {
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
                this.request('session/prompt', {
                    sessionId,
                    prompt: [{ type: 'text', text: prompt }]
                }, this.requestInput.options.timeoutMs),
                abortPromise
            ]);
            return (0, utils_js_1.readString)(result, 'stopReason') === 'end_turn' ? 0 : 1;
        }
        finally {
            if (abort) {
                signal.removeEventListener('abort', abort);
            }
        }
    }
    output() {
        return this.textOutput;
    }
    terminalCommands() {
        return this.terminalLog;
    }
    close() {
        this.rl?.close();
        this.rl = undefined;
        this.releaseAllTerminals();
        this.rejectPending(new Error('Grok ACP process closed'));
        this.proc?.kill('SIGTERM');
        this.proc = undefined;
    }
    request(method, params, timeoutMs = 60000) {
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
    handleLine(line) {
        const message = (0, utils_js_1.parseJson)(line);
        if (!(0, utils_js_1.isRecord)(message)) {
            return;
        }
        const method = (0, utils_js_1.readString)(message, 'method');
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
        if ((0, utils_js_1.isRecord)(error)) {
            pending.reject(new Error((0, utils_js_1.readString)(error, 'message') ?? JSON.stringify(error)));
            return;
        }
        pending.resolve((0, utils_js_1.isRecord)(message.result) ? message.result : {});
    }
    async handleClientRequest(id, method, params) {
        try {
            const result = await this.resolveClientRequest(method, params);
            this.proc?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
        }
        catch (error) {
            this.proc?.stdin.write(`${JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code: -32000, message: error instanceof Error ? error.message : String(error) }
            })}\n`);
        }
    }
    async resolveClientRequest(method, params) {
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
    async readTextFile(params) {
        const record = expectRecord(params, 'fs/read_text_file params');
        const filePath = (0, utils_js_1.readString)(record, 'path');
        if (!filePath) {
            throw new Error('fs/read_text_file requires path');
        }
        if (!node_path_1.default.isAbsolute(filePath)) {
            throw new Error('fs/read_text_file path must be absolute');
        }
        (0, workspace_js_1.assertInsideWorkspace)(this.requestInput.workspaceRoot, filePath, 'fs/read_text_file path');
        const content = await promises_1.default.readFile(filePath, 'utf8');
        const startLine = readPositiveInteger(record, 'line') ?? readPositiveInteger(record, 'startLine');
        const lineLimit = readPositiveInteger(record, 'limit') ?? readPositiveInteger(record, 'numLines');
        if (startLine === undefined && lineLimit === undefined) {
            return { content };
        }
        const lines = content.split(/\r?\n/u);
        const startIndex = (startLine ?? 1) - 1;
        const endIndex = lineLimit === undefined ? undefined : startIndex + lineLimit;
        return { content: lines.slice(startIndex, endIndex).join('\n') };
    }
    createTerminal(params) {
        const record = expectRecord(params, 'terminal params');
        const command = (0, utils_js_1.readString)(record, 'command');
        if (!command) {
            throw new Error('terminal/create requires command');
        }
        const args = readStringArray(record.args);
        const cwd = (0, utils_js_1.readString)(record, 'cwd') ?? this.requestInput.cwd;
        if (!node_path_1.default.isAbsolute(cwd)) {
            throw new Error('terminal/create cwd must be absolute');
        }
        (0, workspace_js_1.assertInsideWorkspace)(this.requestInput.workspaceRoot, cwd, 'terminal cwd');
        if (!this.requestInput.allowWrites && !(0, grok_common_js_1.isReadOnlySafeCommand)(command, args)) {
            throw new Error(`read-only Grok run cannot execute non-allowlisted command: ${(0, grok_common_js_1.formatCommand)(command, args)}`);
        }
        const outputByteLimit = readPositiveInteger(record, 'outputByteLimit') ?? 1024 * 1024;
        const proc = (0, node_child_process_1.spawn)(command, [...args], {
            cwd,
            env: { ...process.env, ...readEnv(record.env) },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        const terminalId = `term_${String(this.nextTerminalId)}`;
        this.nextTerminalId += 1;
        const terminal = {
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
        const append = (chunk) => {
            terminal.output = (0, utils_js_1.truncate)(`${terminal.output}${(0, utils_js_1.stripAnsi)(String(chunk))}`, outputByteLimit);
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
    readTerminalOutput(params) {
        const terminal = this.getTerminal(params);
        return {
            output: terminal.output,
            truncated: terminal.truncated,
            ...(terminal.exitStatus ? { exitStatus: terminal.exitStatus } : {})
        };
    }
    waitForTerminalExit(params) {
        const terminal = this.getTerminal(params);
        if (terminal.exitStatus) {
            return Promise.resolve(terminal.exitStatus);
        }
        return new Promise((resolve) => {
            terminal.waiters.push(resolve);
        });
    }
    killTerminal(params) {
        const terminal = this.getTerminal(params);
        if (!terminal.exitStatus) {
            terminal.proc.kill('SIGTERM');
        }
    }
    releaseTerminal(params) {
        const record = expectRecord(params, 'terminal params');
        const terminalId = (0, utils_js_1.readString)(record, 'terminalId');
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
    releaseAllTerminals() {
        for (const terminal of this.terminals.values()) {
            if (!terminal.exitStatus) {
                terminal.proc.kill('SIGTERM');
            }
        }
        this.terminals.clear();
    }
    getTerminal(params) {
        const record = expectRecord(params, 'terminal params');
        const terminalId = (0, utils_js_1.readString)(record, 'terminalId');
        if (!terminalId) {
            throw new Error('terminal request requires terminalId');
        }
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            throw new Error(`Unknown terminalId: ${terminalId}`);
        }
        return terminal;
    }
    finishTerminal(terminal, status) {
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
    handleSessionUpdate(params) {
        if (!(0, utils_js_1.isRecord)(params)) {
            return;
        }
        const update = params.update;
        const text = parseAcpUpdate(update);
        if (text) {
            this.textOutput += text;
        }
    }
    rejectPending(error) {
        for (const request of this.pending.values()) {
            clearTimeout(request.timer);
            request.reject(error);
        }
        this.pending.clear();
    }
}
function parseAcpUpdate(update) {
    if (!(0, utils_js_1.isRecord)(update)) {
        return undefined;
    }
    const sessionUpdate = (0, utils_js_1.readString)(update, 'sessionUpdate');
    const content = update.content;
    if (sessionUpdate === 'agent_message_chunk' && (0, utils_js_1.isRecord)(content)) {
        const text = (0, utils_js_1.readString)(content, 'text');
        return text ? text : undefined;
    }
    if (sessionUpdate?.includes('tool')) {
        const name = (0, utils_js_1.readString)(update, 'toolName') ?? (0, utils_js_1.readString)(update, 'title') ?? sessionUpdate;
        return `\n[tool] ${name}\n`;
    }
    return undefined;
}
function supportsAcpLoadSession(init) {
    const capabilities = init.agentCapabilities;
    return (0, utils_js_1.isRecord)(capabilities) && capabilities.loadSession === true;
}
function chooseAuthMethod(init) {
    const methods = init.authMethods;
    if (!Array.isArray(methods)) {
        throw new Error('Grok ACP did not return auth methods');
    }
    const ids = methods
        .map((method) => ((0, utils_js_1.isRecord)(method) ? (0, utils_js_1.readString)(method, 'id') : undefined))
        .filter((id) => id !== undefined);
    if (process.env.XAI_API_KEY && ids.includes('xai.api_key')) {
        return 'xai.api_key';
    }
    if (ids.includes('cached_token')) {
        return 'cached_token';
    }
    throw new Error('Run `grok login` first, or set XAI_API_KEY.');
}
function readJsonRpcId(record, key) {
    const value = record[key];
    return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}
function expectRecord(value, label) {
    if (!(0, utils_js_1.isRecord)(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value;
}
function readPositiveInteger(record, key) {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        return undefined;
    }
    return value;
}
function readStringArray(value) {
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
function readEnv(value) {
    if (!Array.isArray(value)) {
        return {};
    }
    const env = {};
    for (const item of value) {
        if (!(0, utils_js_1.isRecord)(item)) {
            throw new Error('terminal/create env entries must be objects');
        }
        const name = (0, utils_js_1.readString)(item, 'name');
        const envValue = (0, utils_js_1.readString)(item, 'value');
        if (!name || envValue === undefined) {
            throw new Error('terminal/create env entries require name and value');
        }
        env[name] = envValue;
    }
    return env;
}
//# sourceMappingURL=grok-acp.js.map