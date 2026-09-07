import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod/v4';
import { getUserAccessToken } from '../auth/index.js';
import { createUserSupabaseClient, type SupabaseConnection } from '../supabase/index.js';
import { buildToolError } from './tool-result.js';

const DELETE_CUSTOM_CARD_FUNCTION = 'delete-custom-card';

interface OwnedCard {
  id: string;
  word: string;
  definition: string;
}

/**
 * Find the caller's own custom cards for a word.
 *
 * Reason: RLS lets a user read curated entries too, so `owner_user_id is not
 * null` is what keeps this to cards they made. Under RLS those can only ever be
 * their own, so no user filter is needed.
 */
const _findOwnCardsByWord = async (
  supabase: SupabaseClient,
  word: string,
): Promise<OwnedCard[]> => {
  const { data, error } = await supabase
    .from('dictionary')
    .select('id, word, definition')
    .ilike('word', word)
    .not('owner_user_id', 'is', null);

  if (error) {
    throw new Error(`Could not look up your cards: ${error.message}`);
  }

  return (data ?? []) as OwnedCard[];
};

/** The response supabase-js attaches to a FunctionsHttpError. */
interface FunctionErrorContext {
  json?: () => Promise<unknown>;
}

/**
 * Read the message the edge function put in its JSON body.
 *
 * Reason: supabase-js turns any non-2xx into a generic FunctionsHttpError whose
 * message is just the status. The useful part — "you can only delete cards you
 * created" — is in the response body, which it hands back untouched.
 *
 * Duck-typed rather than `instanceof Response`: this project compiles with
 * `lib: ES2022` and no DOM, so the global `Response` type comes from
 * @types/node and is not the same shape on every version.
 */
const _readFunctionErrorMessage = async (error: unknown): Promise<string | null> => {
  const context = (error as { context?: FunctionErrorContext }).context;
  if (typeof context?.json !== 'function') return null;

  try {
    const body = (await context.json()) as { error?: string } | null;
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
};

/**
 * Registers a `delete_custom_card` tool that deletes one of the signed-in
 * user's own custom cards, along with its media.
 *
 * @param server - The MCP server to register the tool on
 * @param connection - Supabase project URL and publishable key
 */
export const registerDeleteCustomCardTool = (
  server: McpServer,
  connection: SupabaseConnection,
): void => {
  server.registerTool(
    'delete_custom_card',
    {
      title: 'Delete a card you created',
      description:
        'Permanently deletes a card the signed-in user created with create_card: the card ' +
        'itself, its place in their deck, and its image and audio files. This cannot be ' +
        'undone, so confirm with the user first. Identify the card by `word`, or by `cardId` ' +
        'from check_card_creation_status. Only cards the user made can be deleted — a card ' +
        'from the shared Inoh dictionary belongs to everyone, and removing one of those from ' +
        'a deck is done in the Inoh app. Deleting a card does not give back the monthly ' +
        'custom card allowance it used.',
      inputSchema: {
        word: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('The word on the card to delete, e.g. "runway". Use this or cardId.'),
        cardId: z
          .string()
          .uuid()
          .optional()
          .describe('The cardId from check_card_creation_status. Use this or word.'),
      },
    },
    async ({ word, cardId }, extra) => {
      const hasWord = word !== undefined;
      const hasCardId = cardId !== undefined;
      if (hasWord === hasCardId) {
        return buildToolError(
          'Pass exactly one of `word` or `cardId` to say which card to delete.',
        );
      }

      const supabase = createUserSupabaseClient(connection, getUserAccessToken(extra.authInfo));

      let targetCardId = cardId;
      if (word !== undefined) {
        const matches = await _findOwnCardsByWord(supabase, word);

        if (matches.length === 0) {
          return buildToolError(
            `The user has no custom card for "${word}". Only cards they created with ` +
              'create_card can be deleted; cards from the Inoh dictionary cannot.',
          );
        }

        if (matches.length > 1) {
          const options = matches
            .map((card) => `- cardId ${card.id}: ${card.definition}`)
            .join('\n');
          return buildToolError(
            `The user has ${matches.length} custom cards for "${word}". Ask which one, then ` +
              `call delete_custom_card again with its cardId:\n${options}`,
          );
        }

        targetCardId = matches[0]?.id;
      }

      const { data, error } = await supabase.functions.invoke(DELETE_CUSTOM_CARD_FUNCTION, {
        body: { dictionary_id: targetCardId },
      });

      if (error) {
        const functionMessage = await _readFunctionErrorMessage(error);
        if (functionMessage !== null) {
          return buildToolError(functionMessage);
        }
        throw new Error(`Could not delete the card: ${error.message}`);
      }

      const result = data as { word?: string; media_deleted?: boolean };
      const deletedWord = result.word ?? word ?? 'the card';
      const mediaCaveat =
        result.media_deleted === false
          ? ' Its image and audio could not be removed just now and will be cleaned up separately.'
          : '';

      return {
        content: [
          {
            type: 'text',
            text:
              `Deleted the custom card for "${deletedWord}" — it is gone from the user's deck, ` +
              `along with its image and audio.${mediaCaveat} ` +
              'It did not restore any of their monthly custom card allowance.',
          },
        ],
      };
    },
  );
};
