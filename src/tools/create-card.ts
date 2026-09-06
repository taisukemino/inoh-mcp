import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod/v4';
import { getAuthenticatedUser, getUserAccessToken } from '../auth/index.js';
import { fetchCustomCardQuota } from '../custom-cards/index.js';
import { MAX_WORD_LENGTH } from '../constants.js';
import { createUserSupabaseClient, type SupabaseConnection } from '../supabase/index.js';
import { MY_REQUESTS_URL } from '../web-app-urls.js';
import { buildToolError } from './tool-result.js';

const MAX_CONTEXT_LENGTH = 300;

const POSTGRES_UNIQUE_VIOLATION = '23505';

/** Prefixes the database uses for limits, so each gets its own explanation. */
const QUOTA_ERROR_PREFIX = 'CUSTOM_CARD_LIMIT:';
const DAILY_CEILING_ERROR_PREFIX = 'DAILY_CARD_REQUEST_LIMIT:';

/**
 * Sense hint stored when the caller does not give one.
 *
 * Reason: card_requests.context is NOT NULL and is fed to the generator as the
 * sense to teach, so it cannot simply be blank. Naming the common meaning is
 * both true to what the user asked for and a usable hint.
 */
const _buildDefaultContext = (word: string): string => `the most common meaning of "${word}"`;

/**
 * Resolve a deck by name for the signed-in user.
 *
 * @returns The deck id, or the names of their decks when nothing matched
 */
const _resolveDeckByName = async (
  supabase: SupabaseClient,
  deckName: string,
): Promise<{ deckId: string } | { availableDeckNames: string[] }> => {
  // RLS scopes decks to the caller, so this can only ever match their own.
  const { data, error } = await supabase.from('decks').select('id, name');

  if (error) {
    throw new Error(`Could not look up your decks: ${error.message}`);
  }

  const decks = (data ?? []) as { id: string; name: string }[];
  const match = decks.find((deck) => deck.name.toLowerCase() === deckName.toLowerCase());

  return match ? { deckId: match.id } : { availableDeckNames: decks.map((deck) => deck.name) };
};

/**
 * Registers a `create_card` tool that generates a full Inoh card for the
 * signed-in user and adds it to their deck.
 *
 * @param server - The MCP server to register the tool on
 * @param connection - Supabase project URL and publishable key
 */
export const registerCreateCardTool = (server: McpServer, connection: SupabaseConnection): void => {
  server.registerTool(
    'create_card',
    {
      title: 'Create a card',
      description:
        'Creates a full Inoh flashcard for a word or phrase and adds it to the signed-in ' +
        "user's deck. The card is theirs alone: it never enters the shared Inoh dictionary " +
        'or the Discover feed. Inoh generates everything needed to quiz on it — definition, ' +
        'example sentence, pronunciation audio, image, phonetic and quiz distractors — so ' +
        'this takes about a minute and finishes in the background. Call get_card_status to ' +
        'check on it. Search the dictionary first: if a good curated card already exists, ' +
        'adding that one is better than making a duplicate. Each plan allows a set number of ' +
        'custom cards per month.',
      inputSchema: {
        word: z
          .string()
          .trim()
          .min(1)
          .max(MAX_WORD_LENGTH)
          .describe('The word or phrase the card teaches, e.g. "runway" or "spill the beans"'),
        context: z
          .string()
          .trim()
          .min(1)
          .max(MAX_CONTEXT_LENGTH)
          .optional()
          .describe(
            'Which sense of the word to teach, e.g. "months of cash a startup has left, not ' +
              'the airport kind". Strongly recommended for words with several meanings, since ' +
              'nobody reviews the result before it reaches the user.',
          ),
        deckName: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "Name of an existing deck to file the card in. Defaults to the user's first deck.",
          ),
      },
    },
    async ({ word, context, deckName }, extra) => {
      const user = getAuthenticatedUser(extra.authInfo);
      const supabase = createUserSupabaseClient(connection, getUserAccessToken(extra.authInfo));

      let deckId: string | null = null;
      if (deckName !== undefined) {
        const resolved = await _resolveDeckByName(supabase, deckName);
        if ('availableDeckNames' in resolved) {
          const deckList = resolved.availableDeckNames.map((name) => `"${name}"`).join(', ');
          return buildToolError(
            `No deck named "${deckName}". Your decks: ${deckList || 'none yet'}. ` +
              'Omit deckName to use the default deck.',
          );
        }
        deckId = resolved.deckId;
      }

      const { data, error } = await supabase
        .from('card_requests')
        .insert({
          user_id: user.id,
          word,
          context: context ?? _buildDefaultContext(word),
          destination: 'custom',
          source: 'mcp',
          deck_id: deckId,
        })
        .select('id')
        .single();

      if (error) {
        if (error.code === POSTGRES_UNIQUE_VIOLATION) {
          return buildToolError(
            `A card for "${word}" with that same context is already being made. ` +
              'Call get_card_status to see how it is going.',
          );
        }
        // Reason: both limit triggers raise messages written for the user, so
        // pass them through rather than restating them worse.
        if (error.message.includes(QUOTA_ERROR_PREFIX)) {
          const [, quotaExplanation] = error.message.split(QUOTA_ERROR_PREFIX);
          return buildToolError(quotaExplanation?.trim() ?? error.message);
        }
        if (error.message.includes(DAILY_CEILING_ERROR_PREFIX)) {
          return buildToolError(
            'That is a lot of cards in one day. Inoh has stopped accepting new ones until ' +
              'tomorrow as a safety measure.',
          );
        }
        throw new Error(`Could not start the card: ${error.message}`);
      }

      const quota = await fetchCustomCardQuota(supabase);

      return {
        content: [
          {
            type: 'text',
            text:
              `Making a card for "${word}". It usually takes under a minute, and lands in the ` +
              `user's deck ready to quiz.\n\n` +
              `${JSON.stringify(
                {
                  requestId: data.id,
                  word,
                  status: 'generating',
                  trackAt: MY_REQUESTS_URL,
                  customCardsUsedThisMonth: `${quota.used} of ${quota.limit} (${quota.plan} plan)`,
                },
                null,
                2,
              )}\n\n` +
              'Call get_card_status with this requestId to check whether it is ready.',
          },
        ],
      };
    },
  );
};
