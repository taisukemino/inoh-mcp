import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/index.js';

const SERVER_NAME = 'inoh-mcp';
const SERVER_VERSION = '0.1.0';

/**
 * Builds a fresh `McpServer` with all Inoh tools registered.
 *
 * Reason: the HTTP layer runs in stateless mode, so a new server instance is
 * created per request. Keeping construction here keeps that layer thin.
 *
 * @returns A configured, not-yet-connected MCP server
 */
export const createInohMcpServer = (): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerAllTools(server);
  return server;
};
