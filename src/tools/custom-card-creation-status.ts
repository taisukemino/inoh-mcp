import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { getUserAccessToken } from '../auth/index.js';
import {
  CARD_REQUEST_COLUMNS,
  describeCustomCardStatus,
  describeLowAllowance,
  fetchCustomCardQuota,
  toCustomCardStatus,
  type CardRequestRow,
} from '../custom-cards/index.js';
import { createUserSupabaseClient, type SupabaseConnection } from '../supabase/index.js';

/** How many recent cards to report when no specific request is named. */
const RECENT_CARD_LIMIT = 5;

/**
 * Registers a `custom_card_creation_status` tool that reports whether the cards
 * a user asked for are ready yet.
 *
 * @param server - The MCP server to register the tool on
 * @param connection - Supabase project URL and publishable key
 */
export const registerCustomCardCreationStatusTool = (
  server: McpServer,
  connection: SupabaseConnection,
): void => {
  server.registerTool(
    'custom_card_creation_status',
    {
      title: 'Custom card creation status',
      description:
        'Reports how the custom cards the signed-in user asked for are coming along: still ' +
        'generating, ready (with a link to the card), or failed (with the reason). Pass the ' +
        'requestId from create_custom_card or update_custom_card to check one, or omit it for ' +
        'their most recent cards. A `redoOfCardId` means that entry is remaking a card they ' +
        'already had rather than adding a new one. Generation normally takes under a minute, ' +
        'so if something is still generating it is worth waiting a moment before checking ' +
        'again.',
      inputSchema: {
        requestId: z
          .string()
          .uuid()
          .optional()
          .describe(
            'The requestId returned by create_custom_card or update_custom_card. Omit to list ' +
              'recent cards.',
          ),
      },
    },
    async ({ requestId }, extra) => {
      const supabase = createUserSupabaseClient(connection, getUserAccessToken(extra.authInfo));

      // RLS restricts card_requests to the caller's own rows, so no user filter
      // is needed here; asking for someone else's id simply finds nothing.
      let query = supabase
        .from('card_requests')
        .select(CARD_REQUEST_COLUMNS)
        .eq('destination', 'custom');

      query =
        requestId === undefined
          ? query.order('created_at', { ascending: false }).limit(RECENT_CARD_LIMIT)
          : query.eq('id', requestId);

      const { data, error } = await query;

      if (error) {
        throw new Error(`Could not read card status: ${error.message}`);
      }

      const statuses = ((data ?? []) as CardRequestRow[]).map(toCustomCardStatus);
      const [firstStatus] = statuses;

      if (firstStatus === undefined) {
        return {
          content: [
            {
              type: 'text',
              text:
                requestId === undefined
                  ? 'This user has not created any custom cards yet. Use create_custom_card to make one.'
                  : `No custom card request found with id ${requestId}. It may belong to another account.`,
            },
          ],
        };
      }

      const summary =
        requestId === undefined
          ? `${statuses.length} most recent custom card(s).`
          : describeCustomCardStatus(firstStatus);

      // Reason: read only to decide whether the allowance is worth raising. The
      // tally is deliberately not reported on every check — see describeLowAllowance.
      const lowAllowanceNote = describeLowAllowance(await fetchCustomCardQuota(supabase));

      return {
        content: [
          {
            type: 'text',
            text:
              `${summary}\n${JSON.stringify(statuses, null, 2)}` +
              `${lowAllowanceNote === null ? '' : `\n\n${lowAllowanceNote}`}`,
          },
        ],
      };
    },
  );
};
