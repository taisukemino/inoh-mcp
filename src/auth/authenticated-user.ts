import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export interface AuthenticatedUser {
  id: string;
  email: string | undefined;
}

/**
 * Extracts the signed-in Inoh user from the auth info attached to a tool call.
 *
 * @param authInfo - `extra.authInfo` passed to a tool callback
 * @returns The authenticated user's id and email
 * @throws {Error} When the request reached a tool without passing bearer auth
 */
export const getAuthenticatedUser = (authInfo: AuthInfo | undefined): AuthenticatedUser => {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== 'string') {
    // Reason: bearer auth is enforced on the /mcp route, so this only fires if
    // the route wiring is wrong. Failing loudly beats acting as nobody.
    throw new Error('Tool invoked without an authenticated user.');
  }

  const email = authInfo?.extra?.email;
  return { id: userId, email: typeof email === 'string' ? email : undefined };
};

/**
 * Extracts the raw access token the MCP client authenticated with, so tools
 * can act on Supabase as that user.
 *
 * @param authInfo - `extra.authInfo` passed to a tool callback
 * @returns The verified bearer token
 * @throws {Error} When the request reached a tool without passing bearer auth
 */
export const getUserAccessToken = (authInfo: AuthInfo | undefined): string => {
  if (authInfo?.token === undefined || authInfo.token === '') {
    throw new Error('Tool invoked without an authenticated user.');
  }
  return authInfo.token;
};
