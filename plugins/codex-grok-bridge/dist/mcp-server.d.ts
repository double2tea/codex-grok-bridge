import type { Readable, Writable } from 'node:stream';
export declare class McpServer {
    private readonly input;
    private readonly output;
    private readonly manager;
    constructor(input: Readable, output: Writable);
    start(): void;
    private handle;
    private callTool;
    private respond;
    private respondError;
}
//# sourceMappingURL=mcp-server.d.ts.map