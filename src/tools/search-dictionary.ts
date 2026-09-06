import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { getUserAccessToken } from '../auth/index.js';
import { MAX_WORD_LENGTH } from '../constants.js';
import { createUserSupabaseClient, type SupabaseConnection } from '../supabase/index.js';
import { buildWordPageUrl } from '../web-app-urls.js';

/**
 * Columns an AI client can use. Media paths and quiz distractors are left out
 * on purpose: they are meaningless in a chat and bloat every result.
 */
const SEARCH_RESULT_COLUMNS = 'id, word, phonetic, definition, example_sentence';

interface DictionarySearchRow {
  id: string;
  word: string;
  phonetic: string | null;
  definition: string;
  example_sentence: string;
}

interface DictionarySearchResult extends DictionarySearchRow {
  /** Public word page in the Inoh web app, so clients can link to the full card. */
  url: string;
}

const _toSearchResult = (row: DictionarySearchRow): DictionarySearchResult => ({
  ...row,
  url: buildWordPageUrl(row.id),
});

/**
 * Registers a `search_dictionary` tool backed by the `search_dictionary_words`
 * Postgres function, the same search the Inoh app's Discover bar uses.
 *
 * @param server - The MCP server to register the tool on
 * @param connection - Supabase project URL and publishable key
 */
export const registerSearchDictionaryTool = (
  server: McpServer,
  connection: SupabaseConnection,
): void => {
  server.registerTool(
    'search_dictionary',
    {
      title: 'Search dictionary',
      description:
        'Searches the Inoh dictionary for a word or phrase. Matches words containing the query ' +
        '(exact matches first) and falls back to typo-tolerant matching when nothing contains it. ' +
        'Returns up to 20 entries with id, word, phonetic, definition, example sentence and a ' +
        'link to the word page on inoh.app. Use the id when adding a card to a deck.',
      inputSchema: {
        query: z
          .string()
          .trim()
          .min(1)
          .max(MAX_WORD_LENGTH)
          .describe('Word or phrase to look up, e.g. "banyan" or "get by"'),
      },
    },
    async ({ query }, extra) => {
      const supabase = createUserSupabaseClient(connection, getUserAccessToken(extra.authInfo));
      const { data, error } = await supabase
        .rpc('search_dictionary_words', { query })
        .select(SEARCH_RESULT_COLUMNS);

      if (error) {
        throw new Error(`Dictionary search failed: ${error.message}`);
      }

      const matches = ((data ?? []) as DictionarySearchRow[]).map(_toSearchResult);
      const summary =
        matches.length === 0
          ? `No dictionary entry matches "${query}". The word may not be in the Inoh dictionary yet.`
          : `${matches.length} match(es) for "${query}".`;

      return {
        content: [{ type: 'text', text: `${summary}\n${JSON.stringify(matches, null, 2)}` }],
      };
    },
  );
};
