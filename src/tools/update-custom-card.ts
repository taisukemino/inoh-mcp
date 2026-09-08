import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod/v4';
import { getAuthenticatedUser, getUserAccessToken } from '../auth/index.js';
import { MAX_WORD_LENGTH } from '../constants.js';
import {
  buildDefaultContext,
  describeCardRequestInsertError,
  describeLowAllowance,
  fetchCustomCardQuota,
} from '../custom-cards/index.js';
import { findCardById, findOwnCardsByWord, type DictionaryCard } from '../dictionary/index.js';
import { createUserSupabaseClient, type SupabaseConnection } from '../supabase/index.js';
import { formatCardChoices, requireOneCardSelector } from './card-selection.js';
import { buildToolError } from './tool-result.js';

const MAX_CONTEXT_LENGTH = 300;

/**
 * Find the one custom card of the caller's this redo is for.
 *
 * Reason: a redo has to know the card's word, not just its id — the request
 * carries the word to the generator, and the database refuses a draft written
 * for a different one. So both routes read the row rather than trusting the
 * argument.
 *
 * @param supabase - Client acting as the signed-in user
 * @param word - The word on the card, when that is how it was named
 * @param cardId - The card's id, when that is how it was named
 * @returns The card, or the reason it could not be settled on one
 */
const _resolveOwnCard = async (
  supabase: SupabaseClient,
  word: string | undefined,
  cardId: string | undefined,
): Promise<{ card: DictionaryCard } | { problem: string }> => {
  if (cardId !== undefined) {
    const card = await findCardById(supabase, cardId);

    if (card === null) {
      return { problem: `There is no card with id ${cardId} on this account.` };
    }

    if (card.owner_user_id === null) {
      return {
        problem:
          `"${card.word}" is a card from the shared Inoh dictionary, which belongs to ` +
          'everyone, so it cannot be redone. Only cards the user created with ' +
          'create_custom_card can be.',
      };
    }

    return { card };
  }

  const matches = await findOwnCardsByWord(supabase, word ?? '');

  if (matches.length === 0) {
    return {
      problem:
        `The user has no custom card for "${word}". Only cards they created with ` +
        'create_custom_card can be redone. If Inoh has a curated card for the word, ' +
        'add_card_to_deck is what they want instead.',
    };
  }

  if (matches.length > 1) {
    return {
      problem:
        `The user has ${matches.length} custom cards for "${word}". Ask which one, then ` +
        `call update_custom_card again with its cardId:\n${formatCardChoices(matches)}`,
    };
  }

  const [card] = matches;
  return card === undefined ? { problem: 'Could not work out which card to redo.' } : { card };
};

/**
 * The sense the card was last made with.
 *
 * Reason: a redo with no new context should teach the same sense again rather
 * than drift to the dictionary meaning, and the sense lives on the request that
 * produced the card, not on the card. The newest wins, so a card redone twice
 * keeps the context from its latest version.
 */
const _readLastContext = async (
  supabase: SupabaseClient,
  cardId: string,
): Promise<string | null> => {
  const { data, error } = await supabase
    .from('card_requests')
    .select('context')
    .eq('dictionary_id', cardId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read what that card was made from: ${error.message}`);
  }

  return (data as { context: string } | null)?.context ?? null;
};

/**
 * Registers an `update_custom_card` tool that regenerates one of the signed-in
 * user's own cards in place, keeping its review history.
 *
 * @param server - The MCP server to register the tool on
 * @param connection - Supabase project URL and publishable key
 */
export const registerUpdateCustomCardTool = (
  server: McpServer,
  connection: SupabaseConnection,
): void => {
  server.registerTool(
    'update_custom_card',
    {
      title: 'Redo a card you created',
      description:
        'Remakes a card the signed-in user created with create_custom_card, when it came out ' +
        'wrong: a definition that misses the sense they meant, a flat example sentence, an ' +
        'unhelpful image. Inoh regenerates the definition, sentence, image, audio and quiz ' +
        'options and writes them over the same card, so the card keeps its place in the deck ' +
        'and all of its review progress — unlike deleting and making a new one, which starts ' +
        "the user's memory of the word over. Give `context` to say which sense to teach; " +
        'without it the card is simply made again from the sense it already had. Identify the ' +
        'card by `word` or by `cardId`. This only works on cards the user made: a card from ' +
        'the shared Inoh dictionary belongs to everyone. To teach a different word, delete ' +
        'this card and create one for that word instead. Takes about a minute and finishes in ' +
        'the background; call custom_card_creation_status to check on it. Counts as one card ' +
        "against the user's monthly allowance, because it generates a new image.",
      inputSchema: {
        word: z
          .string()
          .trim()
          .min(1)
          .max(MAX_WORD_LENGTH)
          .optional()
          .describe('The word on the card to redo, e.g. "runway". Use this or cardId.'),
        cardId: z
          .string()
          .uuid()
          .optional()
          .describe('The cardId from custom_card_creation_status. Use this or word.'),
        context: z
          .string()
          .trim()
          .min(1)
          .max(MAX_CONTEXT_LENGTH)
          .optional()
          .describe(
            'Which sense the card should teach this time, e.g. "months of cash a startup ' +
              'has left, not the airport kind". Omit to remake the card from the sense it ' +
              'already had, which is what to do when the sense was right but the wording, ' +
              'sentence or image was not.',
          ),
      },
    },
    async ({ word, cardId, context }, extra) => {
      const selectorProblem = requireOneCardSelector(word, cardId);
      if (selectorProblem !== null) {
        return buildToolError(selectorProblem);
      }

      const user = getAuthenticatedUser(extra.authInfo);
      const supabase = createUserSupabaseClient(connection, getUserAccessToken(extra.authInfo));

      const resolved = await _resolveOwnCard(supabase, word, cardId);
      if ('problem' in resolved) {
        return buildToolError(resolved.problem);
      }
      const { card } = resolved;

      const sense =
        context ?? (await _readLastContext(supabase, card.id)) ?? buildDefaultContext(card.word);

      const { data, error } = await supabase
        .from('card_requests')
        .insert({
          user_id: user.id,
          // Reason: the card's own spelling, not the caller's. The database
          // refuses a draft whose word does not match the card being rewritten.
          word: card.word,
          context: sense,
          destination: 'custom',
          source: 'mcp',
          target_dictionary_id: card.id,
        })
        .select('id')
        .single();

      if (error) {
        const explanation = describeCardRequestInsertError(
          error,
          `"${card.word}" is already being remade. Call custom_card_creation_status to see how ` +
            'it is going, and wait for it to finish before asking for another.',
        );
        if (explanation !== null) {
          return buildToolError(explanation);
        }
        throw new Error(`Could not start the redo: ${error.message}`);
      }

      // Reason: read only to decide whether the allowance is worth raising. The
      // tally is deliberately not reported on every card — see describeLowAllowance.
      const lowAllowanceNote = describeLowAllowance(await fetchCustomCardQuota(supabase));

      return {
        content: [
          {
            type: 'text',
            text:
              `Remaking the card for "${card.word}". It usually takes under a minute. The card ` +
              'keeps its id, its place in the deck and all of its review progress; its ' +
              'definition, example sentence, image, audio and quiz options are all replaced.\n\n' +
              `${JSON.stringify(
                {
                  requestId: data.id,
                  word: card.word,
                  cardId: card.id,
                  context: sense,
                  status: 'generating',
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
