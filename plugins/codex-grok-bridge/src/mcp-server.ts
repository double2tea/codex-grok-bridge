import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { runCapabilityTool } from './capability.js';
import { parseRunId, parseRunRequest } from './input.js';
import { RunManager } from './run-manager.js';
import { toolSchemas } from './tool-schemas.js';
import { isRecord, parseJson, readString } from './utils.js';

type JsonRpcId = string | number | null;

interface JsonRpcRequest extends Record<string, unknown> {
  readonly jsonrpc?: string;
  readonly id?: JsonRpcId;
  readonly method?: string;
  readonly params?: unknown;
}

export class McpServer {
  private readonly manager = new RunManager();

  constructor(
    private readonly input: Readable,
    private readonly output: Writable
  ) {}

  start(): void {
    const rl = readline.createInterface({ input: this.input });
    rl.on('line', (line) => {
      const parsed = parseJson(line);
      if (!isRecord(parsed)) {
        return;
      }
      void this.handle(parsed);
    });
  }

  private async handle(message: JsonRpcRequest): Promise<void> {
    const id = readJsonRpcId(message);
    const method = readString(message, 'method');
    if (!method) {
      return;
    }
    try {
      if (method === 'initialize') {
        this.respond(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'codex-grok-bridge', version: '0.1.1' }
        });
        return;
      }
      if (method === 'notifications/initialized') {
        return;
      }
      if (method === 'tools/list') {
        this.respond(id, { tools: toolSchemas });
        return;
      }
      if (method === 'tools/call') {
        try {
          this.respond(id, await this.callTool(message.params));
        } catch (error) {
          this.respond(id, toolText(error instanceof Error ? error.message : String(error), true));
        }
        return;
      }
      this.respondError(id, -32601, `Unknown method: ${method}`);
    } catch (error) {
      this.respondError(id, -32000, error instanceof Error ? error.message : String(error));
    }
  }

  private async callTool(params: unknown): Promise<Record<string, unknown>> {
    if (!isRecord(params)) {
      throw new Error('tools/call params must be an object');
    }
    const name = readString(params, 'name');
    const args = params.arguments;
    if (name === 'grok_delegate') {
      return toolText(await this.manager.run(parseRunRequest(args, 'delegate')));
    }
    if (name === 'grok_execute') {
      return toolText(await this.manager.run(parseRunRequest(args, 'execute')));
    }
    if (name === 'grok_review') {
      return toolText(await this.manager.run(parseRunRequest(args, 'review')));
    }
    if (name === 'grok_search') {
      return toolText(await runCapabilityTool(this.manager, args, 'search'));
    }
    if (name === 'grok_generate_image') {
      return toolText(await runCapabilityTool(this.manager, args, 'image'));
    }
    if (name === 'grok_generate_video') {
      return toolText(await runCapabilityTool(this.manager, args, 'video'));
    }
    if (name === 'grok_status') {
      return toolText(this.manager.status());
    }
    if (name === 'grok_cancel') {
      const cancelled = this.manager.cancel(parseRunId(args));
      return toolText(cancelled ? 'cancel requested' : 'no active run matched runId', !cancelled);
    }
    throw new Error(`Unknown tool: ${String(name)}`);
  }

  private respond(id: JsonRpcId | undefined, result: unknown): void {
    if (id === undefined) {
      return;
    }
    this.output.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
  }

  private respondError(id: JsonRpcId | undefined, code: number, message: string): void {
    if (id === undefined) {
      return;
    }
    this.output.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
  }
}

function toolText(text: string, isError = false): Record<string, unknown> {
  return {
    content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {})
  };
}

function readJsonRpcId(message: JsonRpcRequest): JsonRpcId | undefined {
  const value = message.id;
  if (typeof value === 'string' || typeof value === 'number' || value === null) {
    return value;
  }
  return undefined;
}
