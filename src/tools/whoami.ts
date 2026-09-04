import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAuthenticatedUser } from '../auth/index.js';

/**
 * Registers a `whoami` tool that reports which Inoh account the connection is
 * signed in as.
 *
 * @param server - The MCP server to register the tool on
 */
export const registerWhoamiTool = (server: McpServer): void => {
  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description:
        'Returns the Inoh account this connection is signed in as (user id and email). ' +
        'Use it to confirm sign-in worked.',
    },
    async (extra) => {
      const user = getAuthenticatedUser(extra.authInfo);
      return {
        content: [{ type: 'text', text: JSON.stringify(user, null, 2) }],
      };
    },
  );
};
