import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A dictionary row as the card tools read it.
 *
 * `owner_user_id` is null on curated entries and set on a card its owner made,
 * which is the distinction every card tool turns on. `orphaned_at` is set while
 * a custom card sits outside every deck, waiting to be swept.
 */
export interface DictionaryCard {
  id: string;
  word: string;
  definition: string;
  owner_user_id: string | null;
  orphaned_at: string | null;
}

const DICTIONARY_CARD_COLUMNS = 'id, word, definition, owner_user_id, orphaned_at';

/**
 * Every card for a word the caller is allowed to see: curated entries plus
 * their own.
 *
 * Matches the whole word rather than searching, so "square" does not turn up
 * "square away". Unlike search_dictionary, which is curated-only, this includes
 * the caller's own cards, because deciding what to do about a word means
 * knowing whether they already made one.
 *
 * @param supabase - Client acting as the signed-in user
 * @param word - The exact word to match, ignoring case
 * @returns Matching cards, curated and owned mixed together
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
 * RLS limits this to curated entries and the caller's own cards, so an id
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
