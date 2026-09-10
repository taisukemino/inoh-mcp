/** Path the MCP endpoint is served on. */
export const MCP_PATH = '/mcp';

/** Unauthenticated liveness endpoint. */
export const HEALTH_PATH = '/health';

/** Public Inoh web app. Word pages live at `/word/<dictionaryId>` and are open to guests. */
export const INOH_WEB_APP_URL = 'https://inoh.app';

/**
 * Longest word or phrase the tools accept.
 *
 * Reason: mirrors MAX_WORD_LENGTH in the Inoh app and the bound
 * search_dictionary_words applies to its own query, so a caller cannot send
 * something the database would reject anyway.
 */
export const MAX_WORD_LENGTH = 50;

/**
 * Characters a word or phrase may be made of: ASCII letters, digits, spaces,
 * hyphens and apostrophes.
 *
 * Reason: mirrors WORD_CHARACTER_REGEX in the Inoh app, which gates its own
 * request form. Inoh only generates English cards — the definition prompt asks
 * for American English, the phonetic step rejects non-US IPA, and distractors
 * are drawn from English — so a word in another script would spend a slot of
 * the monthly allowance on a card the generator cannot make. Digits and
 * apostrophes are allowed for terms like "30 Under 30", "don't" and "co-op".
 */
export const WORD_CHARACTER_REGEX = /^[a-zA-Z0-9\s'-]+$/;

/**
 * How long a deleted custom card can still be brought back.
 *
 * Reason: deleting a card takes it out of the user's deck, and the backend's
 * sweep-orphaned-custom-cards job destroys the row and its media once the card
 * has been out of every deck for GRACE_MINUTES (10). That job runs every five
 * minutes, so the true window is 10-15 minutes; the tools quote the lower
 * bound, which is the only part a user can count on. Keep in sync with
 * GRACE_MINUTES in inoh-backend's sweep-orphaned-custom-cards.
 */
export const CUSTOM_CARD_RESCUE_MINUTES = 10;
