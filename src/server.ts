import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseConnection } from './supabase/index.js';
import { registerAllTools } from './tools/index.js';

const SERVER_NAME = 'inoh-mcp';
// Keep in sync with the version in package.json and with what is published to
// the MCP Registry: clients display this from the initialize handshake.
const SERVER_VERSION = '0.0.1';

/**
 * What every client model is told once, before it sees a single tool.
 *
 * Reason: tool names are plumbing. A user who hears "update_custom_card" has
 * to translate it back into something they could have said, so the phrasing
 * rule belongs here rather than repeated in every tool description.
 */
const SERVER_INSTRUCTIONS =
  'Inoh is a vocabulary app: people keep decks of word cards and review them.\n\n' +
  'Never show an Inoh tool name to the user. When you offer them a next step, phrase it as ' +
  'something they could say back — "I can remake the enshittification card instead, which ' +
  'keeps your review progress" — not as the tool that would do it. The same goes for cardIds: ' +
  'when two cards share a word, ask which meaning they mean by quoting the definitions.';

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
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerAllTools(server, connection);
  return server;
};
