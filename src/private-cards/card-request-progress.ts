import { buildWordPageUrl } from '../web-app-urls.js';

/** The six database statuses collapsed into what a caller actually needs. */
export type PrivateCardProgress = 'generating' | 'ready' | 'failed' | 'deleted';

/** Columns every private-card tool reads back from `card_requests`. */
export const CARD_REQUEST_COLUMNS =
  'id, word, context, status, error_reason, error_detail, dictionary_id, target_dictionary_id, created_at';

export interface CardRequestRow {
  id: string;
  word: string;
  context: string;
  status: string;
  error_reason: string | null;
  error_detail: string | null;
  dictionary_id: string | null;
  target_dictionary_id: string | null;
  created_at: string;
}

export interface PrivateCardStatus {
  requestId: string;
  word: string;
  context: string;
  progress: PrivateCardProgress;
  requestedAt: string;
  /** Set once the card exists. This is what delete_private_card takes. */
  cardId?: string;
  /** Set once the card exists, so the client can link straight to it. */
  cardUrl?: string;
  /**
   * Set when this request rewrites a card that already existed rather than
   * making a new one, so a caller does not report a redo as a new card.
   */
  redoOfCardId?: string;
  /** Why it could not be made, when it could not be made. */
  error?: string;
  /** Set when the card was made and later deleted. */
  note?: string;
}

/**
 * Collapse a request's status the way the app's My Requests screen does.
 *
 * Reason: `failed` with no error_reason means the pipeline will pick the row up
 * again, so it is still in progress as far as the user is concerned. Only a
 * classified failure is worth reporting as one.
 *
 * An approved request whose `dictionary_id` is null is a card the user has since
 * deleted — the FK is ON DELETE SET NULL, and the request row itself is kept
 * because it is what the monthly quota counts. Reporting that as `ready` would
 * have a caller hand out a link to a card that no longer exists.
 */
const _readProgress = (row: CardRequestRow): PrivateCardProgress => {
  if (row.status === 'approved') return row.dictionary_id === null ? 'deleted' : 'ready';
  if (row.status === 'rejected') return 'failed';
  if (row.status === 'failed' && row.error_reason !== null) return 'failed';
  return 'generating';
};

/**
 * How to describe one request in a sentence: making a card, or redoing one.
 *
 * @param status - A shaped status
 * @returns A phrase naming the card and what is happening to it
 */
export const describePrivateCardStatus = (status: PrivateCardStatus): string =>
  status.redoOfCardId === undefined
    ? `Card "${status.word}" is ${status.progress}.`
    : `The redo of "${status.word}" is ${status.progress}.`;

/**
 * Shape one `card_requests` row into the status a tool reports.
 *
 * @param row - A row belonging to the signed-in user
 * @returns Progress plus the card link or failure reason, when there is one
 */
export const toPrivateCardStatus = (row: CardRequestRow): PrivateCardStatus => {
  const progress = _readProgress(row);

  return {
    requestId: row.id,
    word: row.word,
    context: row.context,
    progress,
    requestedAt: row.created_at,
    ...(row.target_dictionary_id === null ? {} : { redoOfCardId: row.target_dictionary_id }),
    ...(progress === 'ready' && row.dictionary_id !== null
      ? { cardId: row.dictionary_id, cardUrl: buildWordPageUrl(row.dictionary_id) }
      : {}),
    ...(progress === 'deleted' ? { note: 'The user deleted this card.' } : {}),
    ...(progress === 'failed'
      ? { error: row.error_detail ?? row.error_reason ?? 'Generation failed.' }
      : {}),
  };
};
