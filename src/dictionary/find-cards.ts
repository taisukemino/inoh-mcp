import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A dictionary row as the card tools read it.
 *
 * `owner_user_id` is null on a public dictionary entry and set on a card in
 * someone's private dictionary, which is the distinction every card tool turns
 * on: a private card is the only kind that can be deleted or redone.
 */
export interface DictionaryCard {
  id: string;
  word: string;
  definition: string;
  owner_user_id: string | null;
}

const DICTIONARY_CARD_COLUMNS = 'id, word, definition, owner_user_id';

/**
 * Every card for a word the caller is allowed to see: the public dictionary's
 * entries plus their own.
 *
 * Matches the whole word rather than searching, so "square" does not turn up
 * "square away".
 *
 * @param supabase - Client acting as the signed-in user
 * @param word - The exact word to match, ignoring case
 * @returns Matching cards, public and private mixed together
 * @throws {Error} When the lookup fails
 */
export const findCardsByWord = async (
  supabase: SupabaseClient,
  word: string,
): Promise<DictionaryCard[]> => {
  const { data, error } = await supabase
    .from('dictionary')
    .select(DICTIONARY_CARD_COLUMNS)
    .ilike('word', word);

  if (error) {
    throw new Error(`Could not look "${word}" up: ${error.message}`);
  }

  return (data ?? []) as DictionaryCard[];
};

/**
 * Look one card up by id.
 *
 * RLS limits this to the public dictionary and the caller's own cards, so an id
 * belonging to someone else's card simply finds nothing.
 *
 * @param supabase - Client acting as the signed-in user
 * @param cardId - The dictionary id to fetch
 * @returns The card, or null when there is no such card the caller can see
 * @throws {Error} When the lookup fails
 */
export const findCardById = async (
  supabase: SupabaseClient,
  cardId: string,
): Promise<DictionaryCard | null> => {
  const { data, error } = await supabase
    .from('dictionary')
    .select(DICTIONARY_CARD_COLUMNS)
    .eq('id', cardId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not look that card up: ${error.message}`);
  }

  return data as DictionaryCard | null;
};

/**
 * The caller's own cards for a word — their private dictionary's entries for it.
 *
 * Reason: RLS lets a user read the public dictionary too, so `owner_user_id is
 * not null` is what keeps this to cards they made. Under RLS those can only ever
 * be their own, so no user filter is needed.
 *
 * @param supabase - Client acting as the signed-in user
 * @param word - The exact word to match, ignoring case
 * @returns The caller's own cards for that word
 * @throws {Error} When the lookup fails
 */
export const findOwnCardsByWord = async (
  supabase: SupabaseClient,
  word: string,
): Promise<DictionaryCard[]> => {
  const { data, error } = await supabase
    .from('dictionary')
    .select(DICTIONARY_CARD_COLUMNS)
    .ilike('word', word)
    .not('owner_user_id', 'is', null);

  if (error) {
    throw new Error(`Could not look up your cards: ${error.message}`);
  }

  return (data ?? []) as DictionaryCard[];
};
