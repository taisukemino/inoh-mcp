import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { getAuthenticatedUser, getUserAccessToken } from '../auth/index.js';
import {
  buildDefaultContext,
  describeCardRequestInsertError,
  describeLowAllowance,
  fetchCustomCardQuota,
} from '../custom-cards/index.js';
import { MAX_WORD_LENGTH, WORD_CHARACTER_REGEX } from '../constants.js';
import { describeMissingDeck, fetchDecks, findDeckByName } from '../decks/index.js';
import { findCardsByWord, type DictionaryCard } from '../dictionary/index.js';
import { createUserSupabaseClient, type SupabaseConnection } from '../supabase/index.js';
import { MY_REQUESTS_URL } from '../web-app-urls.js';
import { formatCardChoices } from './card-selection.js';
import { buildToolError } from './tool-result.js';

const MAX_CONTEXT_LENGTH = 300;

/** Canonical apostrophe (U+0027), the one the Inoh dictionary stores. */
const CANONICAL_APOSTROPHE = "'";

/**
 * Apostrophe-like characters that mean the same thing as U+0027.
 *
 * Mirrors APOSTROPHE_VARIANTS in the Inoh app: iOS keyboards produce U+2019,
 * and a model writing prose is just as likely to.
 */
const APOSTROPHE_VARIANTS = /[‘’ʼʹ]/g;

/**
 * Rewrite curly and modifier apostrophes as U+0027.
 *
 * Reason: runs before the character check so "one’s own" is accepted rather
 * than read as a foreign script, and before the word reaches the dictionary
 * lookup and the request row, which both compare against U+0027.
 *
 * @param word - The word as the caller sent it
 * @returns The same word with one kind of apostrophe
 */
const _normalizeApostrophes = (word: string): string =>
  word.replace(APOSTROPHE_VARIANTS, CANONICAL_APOSTROPHE);

/**
 * Explain that the word is already covered, and what to do instead.
 *
 * Reason: generating a duplicate spends a slot of the monthly allowance on a
 * worse copy of a card that already exists, and nothing reviews the result. The
 * tool description has always asked callers to search first, but an instruction
 * a model can skip is not a safeguard, so the check belongs here.
 *
 * @param word - The word that was requested
 * @param existingCards - What the dictionary already holds for it
 * @returns A message telling the caller how to proceed
 */
const _describeExistingCards = (word: string, existingCards: DictionaryCard[]): string => {
  const curated = existingCards.filter((card) => card.owner_user_id === null);
  const ownCards = existingCards.filter((card) => card.owner_user_id !== null);

  const paragraphs: string[] = [];

  if (curated.length > 0) {
    paragraphs.push(
      `The Inoh dictionary already has ${curated.length === 1 ? 'a card' : `${curated.length} cards`} ` +
        `for "${word}". A curated card is written and checked by Inoh, and adding one costs ` +
        `nothing against the monthly allowance:\n${formatCardChoices(curated)}`,
    );
  }

  if (ownCards.length > 0) {
    paragraphs.push(
      `The user has already made ${ownCards.length === 1 ? 'a card' : `${ownCards.length} cards`} ` +
        `for "${word}":\n${formatCardChoices(ownCards)}`,
    );
  }

  if (ownCards.length > 0) {
    paragraphs.push(
      'If the card they already made is simply not good enough — wrong sense, dull sentence, ' +
        'unhelpful image — update_custom_card remakes it in place and keeps its review ' +
        'progress, which is almost always what they want instead of a second card for the ' +
        'same word.',
    );
  }

  paragraphs.push(
    'Add one of those with add_card_to_deck instead. If the user genuinely wants a separate ' +
      'card because they mean a different sense of the word, call create_custom_card again with ' +
      'createAnyway set to true and a `context` saying which sense.',
  );

  return paragraphs.join('\n\n');
};

/**
 * Registers a `create_custom_card` tool that generates a full Inoh card for the
 * signed-in user and adds it to their deck.
 *
 * @param server - The MCP server to register the tool on
 * @param connection - Supabase project URL and publishable key
 */
export const registerCreateCustomCardTool = (
  server: McpServer,
  connection: SupabaseConnection,
): void => {
  server.registerTool(
    'create_custom_card',
    {
      title: 'Create a custom card',
      description:
        'Creates a full Inoh flashcard for a word or phrase and adds it to the signed-in ' +
        "user's deck. The card is theirs alone: it never enters the shared Inoh dictionary " +
        'or the Discover feed. Inoh generates everything needed to quiz on it — definition, ' +
        'example sentence, pronunciation audio, image, phonetic and quiz distractors — so ' +
        'this takes about a minute and finishes in the background. Call ' +
        'custom_card_creation_status to check on it. If the Inoh dictionary already has the ' +
        'word, this stops and points at the existing card rather than making a duplicate, ' +
        'since a curated card is better and costs no allowance. Each plan allows a set ' +
        'number of custom cards per month. Inoh only generates English cards, so `word` has ' +
        'to be English — but the user can ask in any language, and `context` can be written ' +
        'in whatever language they used.',
      inputSchema: {
        word: z
          .string()
          .trim()
          .min(1)
          .max(MAX_WORD_LENGTH)
          .transform(_normalizeApostrophes)
          .refine((word) => WORD_CHARACTER_REGEX.test(word), {
            message:
              'Inoh generates cards for English words, so the word to teach has to be in ' +
              'English. The user can ask in any language, and `context` can be in any ' +
              'language too — only this word is restricted.',
          })
          .describe(
            'The word or phrase the card teaches, e.g. "runway" or "spill the beans". Must be ' +
              'an English word: Inoh only generates English cards.',
          ),
        context: z
          .string()
          .trim()
          .min(1)
          .max(MAX_CONTEXT_LENGTH)
          .optional()
          .describe(
            'Which sense of the word to teach, e.g. "months of cash a startup has left, not ' +
              'the airport kind". Strongly recommended for words with several meanings, since ' +
              'nobody reviews the result before it reaches the user. May be in any language — ' +
              "no need to translate the user's own words.",
          ),
        deckName: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "Name of an existing deck to file the card in. Defaults to the user's first deck.",
          ),
        createAnyway: z
          .boolean()
          .optional()
          .describe(
            'Set true to generate a card even though Inoh already has one for this word. Only ' +
              'do this when the user wants a sense the existing cards do not cover, and say ' +
              'which sense in `context`.',
          ),
      },
    },
    async ({ word, context, deckName, createAnyway }, extra) => {
      const user = getAuthenticatedUser(extra.authInfo);
      const supabase = createUserSupabaseClient(connection, getUserAccessToken(extra.authInfo));

      if (createAnyway !== true) {
        const existingCards = await findCardsByWord(supabase, word);
        if (existingCards.length > 0) {
          return buildToolError(_describeExistingCards(word, existingCards));
        }
      }

      // Left null when no deck is named: publish_custom_card resolves the
      // default server-side, which is one fewer round trip than doing it here.
      let deckId: string | null = null;
      if (deckName !== undefined) {
        const decks = await fetchDecks(supabase);
        const deck = findDeckByName(decks, deckName);
        if (deck === undefined) {
          return buildToolError(describeMissingDeck(deckName, decks));
        }
        deckId = deck.id;
      }

      const { data, error } = await supabase
        .from('card_requests')
        .insert({
          user_id: user.id,
          word,
          context: context ?? buildDefaultContext(word),
          destination: 'custom',
          source: 'mcp',
          deck_id: deckId,
        })
        .select('id')
        .single();

      if (error) {
        const explanation = describeCardRequestInsertError(
          error,
          `A card for "${word}" with that same context is already being made. ` +
            'Call custom_card_creation_status to see how it is going.',
        );
        if (explanation !== null) {
          return buildToolError(explanation);
        }
        throw new Error(`Could not start the card: ${error.message}`);
      }

      // Reason: read only to decide whether the allowance is worth raising. The
      // tally is deliberately not reported on every card — see describeLowAllowance.
      const lowAllowanceNote = describeLowAllowance(await fetchCustomCardQuota(supabase));

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
                },
                null,
                2,
              )}\n\n` +
              'Call custom_card_creation_status with this requestId to check whether it is ready.' +
              `${lowAllowanceNote === null ? '' : `\n\n${lowAllowanceNote}`}`,
          },
        ],
      };
    },
  );
};
