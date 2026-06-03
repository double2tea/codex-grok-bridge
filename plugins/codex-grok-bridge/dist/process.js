"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommand = runCommand;
const node_child_process_1 = require("node:child_process");
function runCommand(command, args, cwd, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(command, [...args], {
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
//# sourceMappingURL=process.js.map