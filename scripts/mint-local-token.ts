/**
 * Mints a Supabase-shaped user access token signed with SUPABASE_JWT_SECRET.
 *
 * Reason: lets you exercise the MCP server as a signed-in user before the
 * Supabase OAuth server is enabled. Only meaningful against a local Supabase
 * instance whose JWT secret you hold.
 *
 * Usage: pnpm token:local [--email you@example.com] [--user <uuid>]
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { SignJWT } from 'jose';
import { buildSupabaseIssuer } from '../src/auth/supabase-issuer.js';
import { loadServerConfig } from '../src/config.js';

const TOKEN_LIFETIME = '1h';

const { values } = parseArgs({
  options: {
    email: { type: 'string', default: 'local-dev@inoh.test' },
    user: { type: 'string', default: randomUUID() },
  },
});

const { supabaseUrl, supabaseJwtSecret } = loadServerConfig();
if (supabaseJwtSecret === undefined) {
  throw new Error('SUPABASE_JWT_SECRET must be set to mint an HS256 token.');
}

const token = await new SignJWT({
  email: values.email,
  role: 'authenticated',
  session_id: randomUUID(),
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setIssuer(buildSupabaseIssuer(supabaseUrl))
  .setSubject(values.user)
  .setAudience('authenticated')
  .setIssuedAt()
  .setExpirationTime(TOKEN_LIFETIME)
  .sign(new TextEncoder().encode(supabaseJwtSecret));

console.log(token);
