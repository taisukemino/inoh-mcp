import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod/v4';
import { getUserAccessToken } from '../auth/index.js';
import { MAX_WORD_LENGTH } from '../constants.js';
import { fetchDecks } from '../decks/index.js';
import { findCardById, findCardsByWord, type DictionaryCard } from '../dictionary/index.js';
import { createUserSupabaseClient, type SupabaseConnection } from '../supabase/index.js';
import { formatCardChoices, requireOneCardSelector } from './card-selection.js';
import { buildToolError } from './tool-result.js';

/** A card that is both in the dictionary and in one of the user's decks. */
interface CardInDeck extends DictionaryCard {
  userCardId: string;
  deckId: string;
}

/**
 * Narrow a set of dictionary cards to the ones actually in the user's decks.
 *
 * Reason: a word can have several dictionary entries but the user usually holds
 * one of them, so filtering by deck membership first avoids asking them to
 * choose between entries they do not have.
 */
const _keepCardsInDecks = async (
  supabase: SupabaseClient,
  cards: DictionaryCard[],
): Promise<CardInDeck[]> => {
  // RLS scopes user_cards to the caller, so these can only be their own rows.
  const { data, error } = await supabase
    .from('user_cards')
    .select('id, dictionary_id, deck_id')
    .in(
      'dictionary_id',
      cards.map((card) => card.id),
    );

  if (error) {
    throw new Error(`Could not check the user's decks: ${error.message}`);
  }

  const rows = (data ?? []) as { id: string; dictionary_id: string; deck_id: string }[];

  return rows.flatMap((row) => {
    const card = cards.find((candidate) => candidate.id === row.dictionary_id);
    return card === undefined ? [] : [{ ...card, userCardId: row.id, deckId: row.deck_id }];
  });
};

/**
 * Registers a `remove_card_from_deck` tool that takes a card out of the
 * signed-in user's deck without destroying the card itself.
 *
 * @param server - The MCP server to register the tool on
 * @param connection - Supabase project URL and publishable key
 */
export const registerRemoveCardFromDeckTool = (
  server: McpServer,
  connection: SupabaseConnection,
): void => {
  server.registerTool(
    'remove_card_from_deck',
    {
      title: 'Remove a card from a deck',
      description:
        "Takes a card out of the signed-in user's deck so it stops coming up in reviews. The " +
        'card stays in the shared Inoh dictionary for everyone else. Identify it by `word` or ' +
        'by `cardId`. Their review progress for the card is lost and adding it back later ' +
        'starts it over, so confirm with the user first. This only works on cards from the ' +
        'Inoh dictionary: a card the user created themselves cannot be parked outside a deck, ' +
        'so removing one means deleting it, which delete_custom_card does.',
      inputSchema: {
        word: z
          .string()
          .trim()
          .min(1)
          .max(MAX_WORD_LENGTH)
          .optional()
          .describe('The word on the card to remove, e.g. "serendipity". Use this or cardId.'),
        cardId: z
          .string()
          .uuid()
          .optional()
          .describe('The card id, as returned by search_dictionary. Use this or word.'),
      },
    },
    async ({ word, cardId }, extra) => {
      const selectorProblem = requireOneCardSelector(word, cardId);
      if (selectorProblem !== null) {
        return buildToolError(selectorProblem);
      }

      const supabase = createUserSupabaseClient(connection, getUserAccessToken(extra.authInfo));

      const candidates =
        cardId === undefined
          ? await findCardsByWord(supabase, word ?? '')
          : [await findCardById(supabase, cardId)].filter(
              (card): card is DictionaryCard => card !== null,
            );

      const describeCard = word === undefined ? `card ${cardId ?? ''}` : `"${word}"`;

      if (candidates.length === 0) {
        return buildToolError(`No card found for ${describeCard}, so there is nothing to remove.`);
      }

      const cardsInDecks = await _keepCardsInDecks(supabase, candidates);

      if (cardsInDecks.length === 0) {
        return buildToolError(`${describeCard} is not in the user's deck, so nothing was removed.`);
      }

      if (cardsInDecks.length > 1) {
        return buildToolError(
          `The user has ${cardsInDecks.length} cards for "${word ?? cardsInDecks[0]?.word}". Ask ` +
            'which one, then call remove_card_from_deck again with its cardId:\n' +
            formatCardChoices(cardsInDecks),
        );
      }

      const [card] = cardsInDecks;
      if (card === undefined) {
        return buildToolError('Could not work out which card to remove.');
      }

      // Reason: for a card the user made, leaving a deck is what starts the
      // deletion sweep, so this tool would quietly destroy it. Routing that
      // through delete_custom_card keeps "remove" and "delete" honest.
      if (card.owner_user_id !== null) {
        return buildToolError(
          `"${card.word}" is a card the user created, not one from the Inoh dictionary. Cards ` +
            'they made cannot sit outside a deck, so removing it would delete it along with its ' +
            'image and audio. Use delete_custom_card if that is what they want.',
        );
      }

      const { data, error } = await supabase
        .from('user_cards')
        .delete()
        .eq('id', card.userCardId)
        .select('id');

      if (error) {
        throw new Error(`Could not remove the card: ${error.message}`);
      }

      if ((data ?? []).length === 0) {
        return buildToolError(
          `"${card.word}" was no longer in the user's deck by the time it was removed.`,
        );
      }

      const decks = await fetchDecks(supabase);
      const deck = decks.find((candidate) => candidate.id === card.deckId);
      const deckLabel = deck === undefined ? 'their deck' : `their "${deck.name}" deck`;

      return {
        content: [
          {
            type: 'text',
            text:
              `Removed "${card.word}" from ${deckLabel}. The word is still in the Inoh ` +
              'dictionary, so it can be added back at any time, but the review progress for it ' +
              'is gone.',
          },
        ],
      };
    },
  );
};
