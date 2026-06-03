"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGrokCli = runGrokCli;
exports.parseStreamingLine = parseStreamingLine;
const node_child_process_1 = require("node:child_process");
const node_readline_1 = __importDefault(require("node:readline"));
const grok_common_js_1 = require("./grok-common.js");
const utils_js_1 = require("./utils.js");
function runGrokCli(request, prompt, signal, fallbackReason) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(request.options.grokBin, [...(0, grok_common_js_1.buildCliArgs)(prompt, request.cwd, request.options)], {
            cwd: request.cwd,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        let stderr = '';
        let aborted = false;
        const abort = () => {
            aborted = true;
            child.kill('SIGTERM');
        };
        signal.addEventListener('abort', abort, { once: true });
        const stdout = node_readline_1.default.createInterface({ input: child.stdout });
        const stderrLines = node_readline_1.default.createInterface({ input: child.stderr });
        stdout.on('line', (line) => {
            output += parseStreamingLine(line);
        });
        stderrLines.on('line', (line) => {
            stderr += `${(0, utils_js_1.stripAnsi)(line)}\n`;
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
function parseStreamingLine(line) {
    const parsed = (0, utils_js_1.parseJson)(line);
    const text = findText(parsed);
    if (text) {
        return text;
    }
    if (typeof parsed === 'undefined') {
        return `${line}\n`;
    }
    return '';
}
function findText(value) {
    if (typeof value === 'string') {
        return `${value}\n`;
    }
    if (Array.isArray(value)) {
        const pieces = value.map(findText).filter((item) => item !== undefined);
        return pieces.length > 0 ? pieces.join('') : undefined;
    }
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const record = value;
    for (const key of ['text', 'content', 'message', 'delta', 'output']) {
        const item = record[key];
        const text = findText(item);
        if (text) {
            return text;
        }
    }
    return undefined;
}
//# sourceMappingURL=grok-cli.js.map