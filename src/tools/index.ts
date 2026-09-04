import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPingTool } from './ping.js';

/**
 * Registers every tool the Inoh MCP server exposes.
 *
 * Reason: this is the allowlist. A tool that is not registered here is not
 * reachable by any AI client, which is the core of the security model.
 *
 * @param server - The MCP server to register tools on
 */
export const registerAllTools = (server: McpServer): void => {
  registerPingTool(server);
};
