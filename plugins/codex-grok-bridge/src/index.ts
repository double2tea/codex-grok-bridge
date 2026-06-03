import { McpServer } from './mcp-server.js';

const server = new McpServer(process.stdin, process.stdout);
server.start();
