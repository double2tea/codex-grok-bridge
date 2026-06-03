"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpServer = void 0;
const node_readline_1 = __importDefault(require("node:readline"));
const capability_js_1 = require("./capability.js");
const input_js_1 = require("./input.js");
const run_manager_js_1 = require("./run-manager.js");
const tool_schemas_js_1 = require("./tool-schemas.js");
const utils_js_1 = require("./utils.js");
class McpServer {
    input;
    output;
    manager = new run_manager_js_1.RunManager();
    constructor(input, output) {
        this.input = input;
        this.output = output;
    }
    start() {
        const rl = node_readline_1.default.createInterface({ input: this.input });
        rl.on('line', (line) => {
            const parsed = (0, utils_js_1.parseJson)(line);
            if (!(0, utils_js_1.isRecord)(parsed)) {
                return;
            }
            void this.handle(parsed);
        });
    }
    async handle(message) {
        const id = readJsonRpcId(message);
        const method = (0, utils_js_1.readString)(message, 'method');
        if (!method) {
            return;
        }
        try {
            if (method === 'initialize') {
                this.respond(id, {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'codex-grok-bridge', version: '0.1.0' }
                });
                return;
            }
            if (method === 'notifications/initialized') {
                return;
            }
            if (method === 'tools/list') {
                this.respond(id, { tools: tool_schemas_js_1.toolSchemas });
                return;
            }
            if (method === 'tools/call') {
                try {
                    this.respond(id, await this.callTool(message.params));
                }
                catch (error) {
                    this.respond(id, toolText(error instanceof Error ? error.message : String(error), true));
                }
                return;
            }
            this.respondError(id, -32601, `Unknown method: ${method}`);
        }
        catch (error) {
            this.respondError(id, -32000, error instanceof Error ? error.message : String(error));
        }
    }
    async callTool(params) {
        if (!(0, utils_js_1.isRecord)(params)) {
            throw new Error('tools/call params must be an object');
        }
        const name = (0, utils_js_1.readString)(params, 'name');
        const args = params.arguments;
        if (name === 'grok_delegate') {
            return toolText(await this.manager.run((0, input_js_1.parseRunRequest)(args, 'delegate')));
        }
        if (name === 'grok_execute') {
            return toolText(await this.manager.run((0, input_js_1.parseRunRequest)(args, 'execute')));
        }
        if (name === 'grok_review') {
            return toolText(await this.manager.run((0, input_js_1.parseRunRequest)(args, 'review')));
        }
        if (name === 'grok_search') {
            return toolText(await (0, capability_js_1.runCapabilityTool)(this.manager, args, 'search'));
        }
        if (name === 'grok_generate_image') {
            return toolText(await (0, capability_js_1.runCapabilityTool)(this.manager, args, 'image'));
        }
        if (name === 'grok_generate_video') {
            return toolText(await (0, capability_js_1.runCapabilityTool)(this.manager, args, 'video'));
        }
        if (name === 'grok_status') {
            return toolText(this.manager.status());
        }
        if (name === 'grok_cancel') {
            const cancelled = this.manager.cancel((0, input_js_1.parseRunId)(args));
            return toolText(cancelled ? 'cancel requested' : 'no active run matched runId', !cancelled);
        }
        throw new Error(`Unknown tool: ${String(name)}`);
    }
    respond(id, result) {
        if (id === undefined) {
            return;
        }
        this.output.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
    }
    respondError(id, code, message) {
        if (id === undefined) {
            return;
        }
        this.output.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
    }
}
exports.McpServer = McpServer;
function toolText(text, isError = false) {
    return {
        content: [{ type: 'text', text }],
        ...(isError ? { isError: true } : {})
    };
}
function readJsonRpcId(message) {
    const value = message.id;
    if (typeof value === 'string' || typeof value === 'number' || value === null) {
        return value;
    }
    return undefined;
}
//# sourceMappingURL=mcp-server.js.map