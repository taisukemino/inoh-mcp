import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';

/**
 * Registers a `ping` tool that echoes an optional message back to the caller.
 *
 * Reason: a trivial tool lets us verify end-to-end connectivity from any MCP
 * client before real Inoh tools exist.
 *
 * @param server - The MCP server to register the tool on
 */
export const registerPingTool = (server: McpServer): void => {
  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Health check. Returns "pong" plus the optional message you sent.',
      inputSchema: {
        message: z.string().max(200).optional().describe('Optional text to echo back'),
      },
    },
    async ({ message }) => {
      const reply = message === undefined ? 'pong' : `pong: ${message}`;
      return {
        content: [{ type: 'text', text: reply }],
      };
    },
  );
};
