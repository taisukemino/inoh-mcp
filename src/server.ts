import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseConnection } from './supabase/index.js';
import { registerAllTools } from './tools/index.js';

const SERVER_NAME = 'inoh-mcp';
const SERVER_VERSION = '0.1.0';

/**
 * Builds a fresh `McpServer` with all Inoh tools registered.
 *
 * Reason: the HTTP layer runs in stateless mode, so a new server instance is
 * created per request. Keeping construction here keeps that layer thin.
 *
 * @param connection - Supabase project the data tools talk to
 * @returns A configured, not-yet-connected MCP server
 */
export const createInohMcpServer = (connection: SupabaseConnection): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerAllTools(server, connection);
  return server;
};
