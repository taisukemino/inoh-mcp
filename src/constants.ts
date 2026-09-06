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
