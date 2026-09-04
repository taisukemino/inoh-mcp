# inoh-mcp

Remote [MCP](https://modelcontextprotocol.io) server for [Inoh](https://inoh.app). It gives AI clients
(Claude, ChatGPT, Codex, and any other MCP-compatible client) a controlled interface to Inoh
vocabulary decks.

```
AI client → inoh-mcp → Inoh backend (Supabase) → DB + AI services
```

The AI never gets arbitrary backend access. It can only call the tools explicitly registered in
`src/tools/index.ts`.

Tracking issue: [PRI-20600](https://linear.app/tai-lab/issue/PRI-20600/mcp-server-implementation)

## Status

Stateless Streamable HTTP server with bearer-token auth. Tools: `ping`, `whoami`,
`search_dictionary`. The OAuth
sign-in flow itself is handled by Supabase and still needs to be switched on (see
[Authentication](#authentication)).

## Requirements

- Node.js 22+
- pnpm 10

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_JWT_SECRET
pnpm dev
```

The server listens on `http://127.0.0.1:3333/mcp` by default. `GET /health` returns `{"status":"ok"}`.

For local development point `SUPABASE_URL` at the local Supabase from `inoh-backend`
(`http://127.0.0.1:54321`) and copy `PUBLISHABLE_KEY` and `JWT_SECRET` from `supabase status -o env`.

## Scripts

| Script              | What it does                               |
| ------------------- | ------------------------------------------ |
| `pnpm dev`          | Run with `tsx` and restart on file changes |
| `pnpm build`        | Compile TypeScript to `dist/`              |
| `pnpm start`        | Run the compiled server from `dist/`       |
| `pnpm typecheck`    | Type-check without emitting                |
| `pnpm lint`         | ESLint                                     |
| `pnpm lint:strict`  | ESLint, failing on warnings                |
| `pnpm format`       | Prettier write                             |
| `pnpm format:check` | Prettier check                             |

## Authentication

Every request to `/mcp` must carry `Authorization: Bearer <Supabase user access token>`. The
server verifies the token locally (signature, issuer `<SUPABASE_URL>/auth/v1`, audience
`authenticated`, expiry) and hands the user id and email to tools via `getAuthenticatedUser`.
Both signing schemes Supabase uses are accepted: HS256 with the project's shared secret, and
ES256/RS256 via the project's JWKS.

Sign-in uses Supabase Auth as the OAuth 2.1 authorization server, so the MCP server never sees
an email or OTP code:

```
MCP client ──401──▶ /.well-known/oauth-protected-resource/mcp
           ──────▶ Supabase /auth/v1/oauth/authorize
           ◀──────  redirect to Inoh web app /oauth/consent?authorization_id=…
                      user signs in with the normal email OTP flow, approves
           ◀──────  code → Supabase /auth/v1/oauth/token → access + refresh token
           ──────▶ /mcp with Bearer token
```

Unauthenticated requests get a `401` whose `WWW-Authenticate` header points at the metadata
document, which lists Supabase as the authorization server. MCP clients discover the rest.

### One-time setup still required

1. **Supabase dashboard** (prod project): Authentication → OAuth Server → enable, allow dynamic
   client registration (Claude, ChatGPT and Cursor register themselves), set the authorization
   path to `/oauth/consent`. Locally: `[auth.oauth_server]` in `inoh-backend/supabase/config.toml`.
2. **Inoh web app**: add a `/oauth/consent` page that reuses the existing OTP sign-in, then calls
   `supabase.auth.oauth.getAuthorizationDetails`, `approveAuthorization` / `denyAuthorization`
   and redirects to the returned URL.
3. Deploy this server and set `PUBLIC_URL` to its public base URL.

### Try it locally without OAuth

Mint a token signed with the local JWT secret and call the server directly:

```bash
TOKEN=$(pnpm -s token:local --email you@example.com)

curl -s http://127.0.0.1:3333/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```

Or connect from Claude Code with the token as a header:

```bash
claude mcp add --transport http inoh http://127.0.0.1:3333/mcp \
  --header "Authorization: Bearer $TOKEN"
```

## Tools

| Tool                | What it does                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ping`              | Connectivity check                                                                                                  |
| `whoami`            | Returns the signed-in user's id and email                                                                           |
| `search_dictionary` | Searches the Inoh dictionary by word: contains match, exact first, typo-tolerant fallback. Returns up to 20 entries |

Data tools call Supabase with the user's own bearer token, so Row Level Security applies as it does
in the app. `search_dictionary` calls the `search_dictionary_words` Postgres function from
`inoh-backend`, the same one the app's Discover search bar uses, so both stay in sync.

## Project layout

```
src/
  index.ts       # entry point: load config, start HTTP server
  config.ts      # env parsing
  constants.ts   # route paths
  http.ts        # Express app: /mcp (bearer-protected), OAuth metadata, /health
  server.ts      # builds an McpServer with all tools registered
  auth/          # Supabase JWT verifier, protected-resource metadata, user helpers
  supabase/      # per-request Supabase client acting as the signed-in user
  tools/         # one file per tool, allowlisted in tools/index.ts
scripts/
  mint-local-token.ts  # dev helper behind `pnpm token:local`
```

## Roadmap

See the Linear issue for the full discussion. In order:

1. Enable Supabase OAuth server + consent page in the Inoh web app; rate limiting
2. CRUD tools: `add_card`, `search_cards`, `create_deck`, list decks/cards
3. `generate_card` orchestration (text, image, audio) with credit-based metering
4. Contextual card construction, then voice review
