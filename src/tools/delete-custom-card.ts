import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { getUserAccessToken } from '../auth/index.js';
import { CUSTOM_CARD_RESCUE_MINUTES } from '../constants.js';
import { createUserSupabaseClient, type SupabaseConnection } from '../supabase/index.js';
import { buildCardChoiceQuestion, requireOneCardSelector } from './card-selection.js';
import { lookupOwnCard, type OwnCardLookup } from './own-card-lookup.js';
import { buildToolError } from './tool-result.js';

/**
 * Say why no card could be deleted, and what to do about it.
 *
 * @param lookup - A lookup result other than `found`
 * @returns The explanation to hand back to the caller
 */
const _describeUndeletableCard = (lookup: Exclude<OwnCardLookup, { kind: 'found' }>): string => {
  switch (lookup.kind) {
    case 'noCardWithId':
      return `There is no card with id ${lookup.cardId} on this account.`;
    case 'curatedCard':
      return (
        `"${lookup.card.word}" is a card from the shared Inoh dictionary, which belongs to ` +
        'everyone, so it cannot be deleted. Only cards the user created with create_custom_card ' +
        'can be. Taking this one out of the deck is the thing to offer instead — say it as ' +
        `"I can take ${lookup.card.word} out of your deck", and call remove_card_from_deck.`
      );
    case 'noCardForWord':
      return (
        `The user has no custom card for "${lookup.word}". Only cards they created with ` +
        'create_custom_card can be deleted; a card from the Inoh dictionary leaves a deck ' +
        `through remove_card_from_deck instead, which the user hears as taking "${lookup.word}" ` +
        'out of their deck.'
      );
    case 'severalCardsForWord':
      return (
        `The user has ${lookup.cards.length} custom cards for "${lookup.word}". ` +
        buildCardChoiceQuestion(lookup.cards)
      );
  }
};

/**
 * Registers a `delete_custom_card` tool that takes one of the signed-in user's
 * own cards out of their deck and leaves it to be destroyed.
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
        'Deletes a card the signed-in user created with create_custom_card. The card leaves ' +
        'their deck at once and stops coming up in reviews, and Inoh destroys it and its image ' +
        `and audio about ${CUSTOM_CARD_RESCUE_MINUTES} minutes later. Until then ` +
        'add_card_to_deck puts it back with the same definition, sentence, image and audio, ' +
        'though its review progress starts over. So when the user asks for a card to go, delete ' +
        'it and then offer to bring it back or make the word again, rather than warning them ' +
        'off first. Identify the card by `word`, or by `cardId` from ' +
        'custom_card_creation_status. Only cards the user made can be deleted: a card from the ' +
        'shared Inoh dictionary belongs to everyone, and remove_card_from_deck is what takes ' +
        'one of those out of a deck. If the card is bad rather than unwanted, ' +
        'update_custom_card remakes it in place and keeps its review progress, which deleting ' +
        'does not. Whichever way it goes, talk to the user about the card and the word — ' +
        '"I can remake the runway card" — and never name a tool to them.',
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
          .describe('The cardId from custom_card_creation_status. Use this or word.'),
      },
    },
    async ({ word, cardId }, extra) => {
      const selectorProblem = requireOneCardSelector(word, cardId);
      if (selectorProblem !== null) {
        return buildToolError(selectorProblem);
      }

      const supabase = createUserSupabaseClient(connection, getUserAccessToken(extra.authInfo));

      const lookup = await lookupOwnCard(supabase, word, cardId);
      if (lookup.kind !== 'found') {
        return buildToolError(_describeUndeletableCard(lookup));
      }
      const { card } = lookup;

      if (card.orphaned_at !== null) {
        return buildToolError(
          `"${card.word}" was already deleted and is out of the user's deck, waiting to be ` +
            'destroyed. Nothing more to do — though if they have changed their mind, it can ' +
            'still be put back in their deck for a few minutes, which add_card_to_deck does.',
        );
      }

      // Reason: deleting the deck row rather than the card is what makes this
      // undoable. track_custom_card_orphaning stamps the card as out of every
      // deck, sweep-orphaned-custom-cards destroys it and its media once it has
      // been out for CUSTOM_CARD_RESCUE_MINUTES, and an add_card_to_deck inside
      // that window clears the stamp and calls the sweep off. RLS scopes
      // user_cards to the caller, so this can only ever remove their own row.
      const { data, error } = await supabase
        .from('user_cards')
        .delete()
        .eq('dictionary_id', card.id)
        .select('id');

      if (error) {
        throw new Error(`Could not delete the card: ${error.message}`);
      }

      // Reason: unreachable in practice — a custom card with no deck row is
      // stamped as orphaned by the trigger, which the check above catches. Kept
      // so a card in that state does not report a deletion that never happened.
      if ((data ?? []).length === 0) {
        return buildToolError(
          `"${card.word}" is not in any of the user's decks, so there was nothing to delete.`,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text:
              `Deleted the card for "${card.word}" — it is out of the user's deck and will not ` +
              'come up in reviews again.\n\n' +
              `For about ${CUSTOM_CARD_RESCUE_MINUTES} minutes it can still be put back, image ` +
              'and audio included, though its review progress starts over; add_card_to_deck is ' +
              'what does that. After that the card and its media are gone for good.\n\n' +
              'Now ask the user whether they want the card back, or a fresh one made for the ' +
              `same word — in those words, e.g. "want me to put the ${card.word} card back?". ` +
              'They should never hear a tool name.',
          },
        ],
      };
    },
  );
};
