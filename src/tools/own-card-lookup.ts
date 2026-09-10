import type { SupabaseClient } from '@supabase/supabase-js';
import { findCardById, findOwnCardsByWord, type DictionaryCard } from '../dictionary/index.js';

/**
 * What naming a card by `word` or `cardId` turned out to mean.
 *
 * Reason: delete_custom_card and update_custom_card both act on one card the
 * caller made, and both have to settle which one from the same two arguments.
 * The lookup is shared; the wording is not, because "cannot be deleted" and
 * "cannot be redone" need different advice attached.
 */
export type OwnCardLookup =
  | { kind: 'found'; card: DictionaryCard }
  | { kind: 'noCardWithId'; cardId: string }
  | { kind: 'curatedCard'; card: DictionaryCard }
  | { kind: 'noCardForWord'; word: string }
  | { kind: 'severalCardsForWord'; word: string; cards: DictionaryCard[] };

/**
 * Find the one custom card of the caller's that `word` or `cardId` names.
 *
 * Exactly one of the two is expected — requireOneCardSelector checks that
 * first. RLS limits both routes to curated entries and the caller's own cards,
 * so someone else's card id simply finds nothing.
 *
 * @param supabase - Client acting as the signed-in user
 * @param word - The word on the card, when that is how it was named
 * @param cardId - The card's id, when that is how it was named
 * @returns The card, or which of the ways this can fail happened
 * @throws {Error} When the lookup itself fails
 */
export const lookupOwnCard = async (
  supabase: SupabaseClient,
  word: string | undefined,
  cardId: string | undefined,
): Promise<OwnCardLookup> => {
  if (cardId !== undefined) {
    const card = await findCardById(supabase, cardId);

    if (card === null) {
      return { kind: 'noCardWithId', cardId };
    }

    return card.owner_user_id === null ? { kind: 'curatedCard', card } : { kind: 'found', card };
  }

  const requestedWord = word ?? '';
  const matches = await findOwnCardsByWord(supabase, requestedWord);

  if (matches.length === 0) {
    return { kind: 'noCardForWord', word: requestedWord };
  }

  // Reason: a card its owner deleted is minutes from being destroyed, so it is
  // not the one they mean while a live card for the same word exists -- someone
  // who deleted a card and had it made again should not then be asked which of
  // the two they meant. When every match is on its way out, they stay in the
  // running, so the caller can be told the card was deleted rather than that
  // there never was one.
  const liveMatches = matches.filter((card) => card.orphaned_at === null);
  const candidates = liveMatches.length > 0 ? liveMatches : matches;

  if (candidates.length > 1) {
    return { kind: 'severalCardsForWord', word: requestedWord, cards: candidates };
  }

  const [card] = candidates;
  return card === undefined
    ? { kind: 'noCardForWord', word: requestedWord }
    : { kind: 'found', card };
};
