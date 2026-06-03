import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { McpServer } from '../src/mcp-server.js';
import { parseJson } from '../src/utils.js';

describe('McpServer', () => {
  it('responds to initialize and tools/list', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const server = new McpServer(input, output);
    server.start();

    const responses: unknown[] = [];
    output.on('data', (chunk) => {
      for (const line of String(chunk).trim().split(/\r?\n/u)) {
        if (line.length > 0) {
          responses.push(parseJson(line));
        }
      }
    });

    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(responses).toHaveLength(2);
    expect(JSON.stringify(responses[0])).toContain('codex-grok-bridge');
    expect(JSON.stringify(responses[1])).toContain('grok_execute');
    expect(JSON.stringify(responses[1])).toContain('grok_search');
    expect(JSON.stringify(responses[1])).toContain('grok_generate_image');
    expect(JSON.stringify(responses[1])).toContain('grok_generate_video');
  });
});
