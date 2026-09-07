import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseConnection } from '../supabase/index.js';
import { registerCheckAccountTool } from './check-account.js';
import { registerCheckCardCreationStatusTool } from './check-card-creation-status.js';
import { registerCreateCardTool } from './create-card.js';
import { registerDeleteCustomCardTool } from './delete-custom-card.js';
import { registerSearchDictionaryTool } from './search-dictionary.js';

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
  registerCheckAccountTool(server);
  registerSearchDictionaryTool(server, connection);
  registerCreateCardTool(server, connection);
  registerCheckCardCreationStatusTool(server, connection);
  registerDeleteCustomCardTool(server, connection);
};
