import { buildWordPageUrl } from '../web-app-urls.js';

/** The six database statuses collapsed into what a caller actually needs. */
export type CustomCardProgress = 'generating' | 'ready' | 'failed' | 'deleted';

/** Columns every custom-card tool reads back from `card_requests`. */
export const CARD_REQUEST_COLUMNS =
  'id, word, context, status, error_reason, error_detail, dictionary_id, created_at';

export interface CardRequestRow {
  id: string;
  word: string;
  context: string;
  status: string;
  error_reason: string | null;
  error_detail: string | null;
  dictionary_id: string | null;
  created_at: string;
}

export interface CustomCardStatus {
  requestId: string;
  word: string;
  context: string;
  progress: CustomCardProgress;
  requestedAt: string;
  /** Set once the card exists. This is what delete_card takes. */
  cardId?: string;
  /** Set once the card exists, so the client can link straight to it. */
  cardUrl?: string;
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
const readProgress = (row: CardRequestRow): CustomCardProgress => {
  if (row.status === 'approved') return row.dictionary_id === null ? 'deleted' : 'ready';
  if (row.status === 'rejected') return 'failed';
  if (row.status === 'failed' && row.error_reason !== null) return 'failed';
  return 'generating';
};

/**
 * Shape one `card_requests` row into the status a tool reports.
 *
 * @param row - A row belonging to the signed-in user
 * @returns Progress plus the card link or failure reason, when there is one
 */
export const toCustomCardStatus = (row: CardRequestRow): CustomCardStatus => {
  const progress = readProgress(row);

  return {
    requestId: row.id,
    word: row.word,
    context: row.context,
    progress,
    requestedAt: row.created_at,
    ...(progress === 'ready' && row.dictionary_id !== null
      ? { cardId: row.dictionary_id, cardUrl: buildWordPageUrl(row.dictionary_id) }
      : {}),
    ...(progress === 'deleted' ? { note: 'The user deleted this card.' } : {}),
    ...(progress === 'failed'
      ? { error: row.error_detail ?? row.error_reason ?? 'Generation failed.' }
      : {}),
  };
};
