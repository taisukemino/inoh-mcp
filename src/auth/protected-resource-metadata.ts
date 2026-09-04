import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { OAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { MCP_PATH } from '../constants.js';
import { buildSupabaseIssuer } from './supabase-issuer.js';

const RESOURCE_NAME = 'Inoh';

export interface ProtectedResourceMetadataOptions {
  publicUrl: URL;
  supabaseUrl: URL;
}

export interface ProtectedResourceMetadataBundle {
  /** Document served at the well-known URL (RFC 9728). */
  document: OAuthProtectedResourceMetadata;
  /** Absolute URL of that document, advertised in WWW-Authenticate on 401. */
  metadataUrl: string;
}

/**
 * Builds the OAuth Protected Resource Metadata that tells MCP clients where to
 * sign in. Clients read `authorization_servers`, then discover Supabase's
 * authorize/token/registration endpoints from the issuer.
 *
 * @param options - Public URL of this server and the Supabase project URL
 * @returns The metadata document and the URL it is served at
 */
export const buildProtectedResourceMetadata = ({
  publicUrl,
  supabaseUrl,
}: ProtectedResourceMetadataOptions): ProtectedResourceMetadataBundle => {
  const resourceUrl = new URL(MCP_PATH, publicUrl);

  return {
    document: {
      resource: resourceUrl.href,
      authorization_servers: [buildSupabaseIssuer(supabaseUrl)],
      bearer_methods_supported: ['header'],
      resource_name: RESOURCE_NAME,
    },
    metadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
  };
};
