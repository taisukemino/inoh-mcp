import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseConnection } from '../supabase/index.js';
import { registerAddCardToDeckTool } from './add-card-to-deck.js';
import { registerCheckAccountTool } from './check-account.js';
import { registerCustomCardCreationStatusTool } from './custom-card-creation-status.js';
import { registerCreateCustomCardTool } from './create-custom-card.js';
import { registerDeleteCustomCardTool } from './delete-custom-card.js';
import { registerRemoveCardFromDeckTool } from './remove-card-from-deck.js';
import { registerSearchDictionaryTool } from './search-dictionary.js';
import { registerUpdateCustomCardTool } from './update-custom-card.js';

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
  registerAddCardToDeckTool(server, connection);
  registerRemoveCardFromDeckTool(server, connection);
  registerCreateCustomCardTool(server, connection);
  registerUpdateCustomCardTool(server, connection);
  registerCustomCardCreationStatusTool(server, connection);
  registerDeleteCustomCardTool(server, connection);
};
