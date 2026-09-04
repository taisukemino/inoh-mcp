/**
 * Builds the OAuth issuer URL for a Supabase project.
 *
 * Reason: Supabase Auth issues tokens with `iss` set to `<project-url>/auth/v1`,
 * and serves its OAuth server metadata under the same issuer.
 *
 * @param supabaseUrl - The Supabase project URL
 * @returns The issuer URL, without a trailing slash
 */
export const buildSupabaseIssuer = (supabaseUrl: URL): string => {
  return new URL('/auth/v1', supabaseUrl).href;
};
