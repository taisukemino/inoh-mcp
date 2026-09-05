import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseConnection } from '../supabase/index.js';
import { registerCreateCardTool } from './create-card.js';
import { registerDeleteCardTool } from './delete-card.js';
import { registerGetCardStatusTool } from './get-card-status.js';
import { registerPingTool } from './ping.js';
import { registerSearchDictionaryTool } from './search-dictionary.js';
import { registerWhoamiTool } from './whoami.js';

/**
 * Registers every tool the Inoh MCP server exposes.
 *
 * Reason: this is the allowlist. A tool that is not registered here is not
 * reachable by any AI client, which is the core of the security model.
 *
 * @param server - The MCP server to register tools on
 * @param connection - Supabase project the data tools talk to
 */
export const registerAllTools = (server: McpServer, connection: SupabaseConnection): void => {
  registerPingTool(server);
  registerWhoamiTool(server);
  registerSearchDictionaryTool(server, connection);
  registerCreateCardTool(server, connection);
  registerGetCardStatusTool(server, connection);
  registerDeleteCardTool(server, connection);
};
