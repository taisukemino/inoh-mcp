/** A card the caller has to choose between, as offered back to them. */
export interface CardChoice {
  id: string;
  definition: string;
}

/**
 * Check that the caller named a card exactly one way.
 *
 * Reason: `word` and `cardId` are alternatives, not a pair. Passing both is
 * ambiguous when they disagree, and passing neither says nothing at all.
 *
 * @param word - The `word` argument, when given
 * @param cardId - The `cardId` argument, when given
 * @returns An explanation to return to the caller, or null when the input is fine
 */
export const requireOneCardSelector = (
  word: string | undefined,
  cardId: string | undefined,
): string | null => {
  const hasWord = word !== undefined;
  const hasCardId = cardId !== undefined;

  return hasWord === hasCardId
    ? 'Pass exactly one of `word` or `cardId` to say which card you mean.'
    : null;
};

/**
 * List cards by id and definition so the caller can pick one.
 *
 * Definitions are what tells two entries for the same word apart, so they are
 * the only field worth showing here.
 *
 * @param choices - The cards that matched
 * @returns One line per card, ready to append to a message
 */
export const formatCardChoices = (choices: CardChoice[]): string =>
  choices.map((choice) => `- cardId ${choice.id}: ${choice.definition}`).join('\n');
