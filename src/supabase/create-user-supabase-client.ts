import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ServerConfig } from '../config.js';

export type SupabaseConnection = Pick<ServerConfig, 'supabaseUrl' | 'supabasePublishableKey'>;

/**
 * Creates a Supabase client that acts as the signed-in user for one tool call.
 *
 * Reason: forwarding the caller's own access token means Row Level Security
 * decides what each tool can read or write. The MCP server never holds a
 * service-role key, so a bug in a tool cannot escalate past the user.
 *
 * @param connection - Supabase project URL and publishable key
 * @param userAccessToken - The bearer token the MCP client authenticated with
 * @returns A client scoped to that user, with no session persistence
 */
export const createUserSupabaseClient = (
  connection: SupabaseConnection,
  userAccessToken: string,
): SupabaseClient => {
  return createClient(connection.supabaseUrl.toString(), connection.supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${userAccessToken}` } },
    // Reason: stateless server, one client per request. Nothing to persist or refresh.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};
