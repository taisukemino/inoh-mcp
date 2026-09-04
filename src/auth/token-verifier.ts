import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { buildSupabaseIssuer } from './supabase-issuer.js';

// Reason: Supabase user tokens always carry aud "authenticated". Anything else
// (anon key, service role key) must be rejected at the MCP boundary.
const SUPABASE_USER_AUDIENCE = 'authenticated';
const SHARED_SECRET_ALGORITHM = 'HS256';
// Reason: projects on the legacy shared secret sign HS256; projects that have
// rotated to asymmetric signing keys publish ES256/RS256 keys on the JWKS.
const ALLOWED_ALGORITHMS = [SHARED_SECRET_ALGORITHM, 'ES256', 'RS256'];
const JWKS_PATH = '/auth/v1/.well-known/jwks.json';

/** Client id recorded for tokens that were not issued through OAuth (first-party apps). */
const FIRST_PARTY_CLIENT_ID = 'inoh';

interface SupabaseAccessTokenClaims {
  sub?: string;
  email?: string;
  exp?: number;
  /** Present only on tokens issued through the Supabase OAuth server. */
  client_id?: string;
  scope?: string;
}

export interface SupabaseTokenVerifierOptions {
  supabaseUrl: URL;
  /** Legacy shared secret. When absent, HS256 tokens are rejected. */
  supabaseJwtSecret: string | undefined;
}

const parseScopes = (scope: string | undefined): string[] => {
  return scope === undefined ? [] : scope.split(' ').filter((entry) => entry.length > 0);
};

const describeVerificationFailure = (error: unknown): string => {
  return error instanceof joseErrors.JWTExpired ? 'Token has expired' : 'Invalid token';
};

const createKeyResolver = ({
  supabaseUrl,
  supabaseJwtSecret,
}: SupabaseTokenVerifierOptions): JWTVerifyGetKey => {
  const remoteKeySet = createRemoteJWKSet(new URL(JWKS_PATH, supabaseUrl));
  const sharedSecretKey =
    supabaseJwtSecret === undefined ? undefined : new TextEncoder().encode(supabaseJwtSecret);

  return (protectedHeader, token) => {
    if (protectedHeader.alg !== SHARED_SECRET_ALGORITHM) {
      return remoteKeySet(protectedHeader, token);
    }
    if (sharedSecretKey === undefined) {
      throw new Error('HS256 token received but SUPABASE_JWT_SECRET is not configured');
    }
    return sharedSecretKey;
  };
};

/**
 * Creates a verifier for Supabase-issued user access tokens.
 *
 * Verifies signature, issuer, audience and expiry locally. Asymmetric tokens
 * are checked against the project's JWKS (cached by jose); HS256 tokens
 * against the configured shared secret. The resulting `AuthInfo.extra`
 * carries `userId` and `email` for tool handlers.
 *
 * @param options - Supabase project URL and optional JWT shared secret
 * @returns A verifier compatible with the MCP SDK bearer-auth middleware
 */
export const createSupabaseTokenVerifier = (
  options: SupabaseTokenVerifierOptions,
): OAuthTokenVerifier => {
  const resolveKey = createKeyResolver(options);
  const issuer = buildSupabaseIssuer(options.supabaseUrl);

  const verifyAccessToken = async (token: string): Promise<AuthInfo> => {
    let claims: SupabaseAccessTokenClaims;
    try {
      const verified = await jwtVerify<SupabaseAccessTokenClaims>(token, resolveKey, {
        issuer,
        audience: SUPABASE_USER_AUDIENCE,
        algorithms: ALLOWED_ALGORITHMS,
      });
      claims = verified.payload;
    } catch (error) {
      throw new InvalidTokenError(describeVerificationFailure(error));
    }

    if (claims.sub === undefined) {
      throw new InvalidTokenError('Token has no subject');
    }

    return {
      token,
      clientId: claims.client_id ?? FIRST_PARTY_CLIENT_ID,
      scopes: parseScopes(claims.scope),
      expiresAt: claims.exp,
      extra: { userId: claims.sub, email: claims.email },
    };
  };

  return { verifyAccessToken };
};
