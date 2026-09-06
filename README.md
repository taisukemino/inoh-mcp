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
`search_dictionary`, `create_card`, `get_card_status`, `delete_card`. The OAuth
sign-in flow itself is handled by Supabase and still needs to be switched on (see
[Authentication](#authentication)).

## Custom cards

`create_card` gives a user their own card for a word the dictionary does not
cover — or covers in the wrong sense. The card belongs to them alone: it never
enters the shared dictionary, the Discover feed, or `search_dictionary`, and two
users asking for the same word each get their own.

It is a complete card, not a stub — definition, example sentence, three audio
clips, image, phonetic and both sets of quiz distractors — so it is quizzable in
the Inoh app the moment it appears, alongside curated cards.

```
create_card({ word, context?, deckName? })
  → inserts a card_requests row (destination 'custom', source 'mcp') under RLS
  → returns { requestId, status: 'generating', trackAt, customCardsUsedThisMonth }

  the inoh-backend card generator publishes it within ~10-20 seconds

get_card_status({ requestId? })
  → { progress: 'generating' | 'ready' | 'failed', cardUrl?, error? }
```

`context` is the sense to teach ("months of cash a startup has left, not the
airport kind"). It is optional, but worth passing for any word with more than
one meaning: nothing reviews the result before it reaches the user. `deckName`
must name one of the user's existing decks; omit it for their default deck.

### Deleting a card

```
delete_card({ word })  or  delete_card({ cardId })
  → deletes the dictionary row, its place in the deck, and the media files
```

A user can delete a card **they** created and nothing else. Ask `delete_card` to
remove a curated dictionary entry — by id or by word — and it refuses: those are
shared with everyone, and dropping one from a deck is done in the Inoh app.

Deletion is permanent and the tool says so, so confirm with the user first.
Identify the card by `word` (the tool resolves it, and lists the options if the
user has several custom cards for that word) or by the `cardId` from
`get_card_status`.

It does **not** refund the monthly allowance the card used — otherwise a
create/delete loop would mint unlimited cards. A card that was made and later
deleted reports `progress: 'deleted'` from `get_card_status`, since its request
row lives on as the quota ledger.

The work happens in the `delete-custom-card` edge function, because Storage is
service-role-only: this server could delete the row but never the image and
audio. Media shared with another card (uploads are deduped by content hash) is
kept.

`delete_card` is the immediate path. Removing a custom card from a deck in the
Inoh app (or Raycast, Obsidian, the browser extension) also deletes it, just not
instantly: removal there is undoable, so inoh-backend defers the delete by ~10
minutes and cancels it if the user undoes. Either way the card and its media end
up gone.

This server never holds a service-role key. It inserts the request as the
signed-in user and RLS decides the rest, so the generation pipeline — and the
quota below — cannot be bypassed from here.

**Monthly quota** (enforced by the `enforce_monthly_custom_card_limit` trigger
in inoh-backend; `CUSTOM_CARD_MONTHLY_LIMITS` here only reports it):

| Plan | Custom cards per calendar month |
| ---- | ------------------------------- |
| Free | 50                              |
| Plus | 300                             |
| Pro  | 1,000                           |

Requests that failed do not count against the quota.

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

### Origin validation

The Streamable HTTP spec requires servers to validate `Origin` so a hostile page cannot drive the
server from a victim's browser. `/mcp` therefore accepts a request only when it carries no `Origin`
header at all — every native client (Claude Desktop, the CLI, Codex, Cursor) sends none — or when
the origin is on the `ALLOWED_ORIGINS` list, which defaults to `https://inoh.app`. Anything else
gets a `403`. `/health` and the OAuth metadata documents stay open to any origin.

Bearer auth already makes this defence-in-depth rather than the main protection: credentials live in
a header, not a cookie, so a random page cannot borrow a signed-in user's token.

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

| Tool                                                                                                | What it does                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ping`                                                                                              | Connectivity check                                                                                                                                                      |
| `whoami`                                                                                            | Returns the signed-in user's id and email                                                                                                                               |
| `search_dictionary`                                                                                 | Searches the curated Inoh dictionary by word: contains match, exact first, typo-tolerant fallback. Returns up to 20 entries, each with a link to its inoh.app word page |
| `create_card`                                                                                       | Generates a full card for the signed-in user and files it in their deck. Returns as soon as the work is queued — see [Custom cards](#custom-cards)                      |
| `get_card_status`                                                                                   | Whether the user's cards are still generating, ready (with a link), failed (with the reason), or deleted                                                                |
| `delete_card`                                                                                       | Permanently deletes one of the user's own custom cards, including its media. Refuses anything they did not create                                                       |
| Data tools call Supabase with the user's own bearer token, so Row Level Security applies as it does |
| in the app. `search_dictionary` calls the `search_dictionary_words` Postgres function from          |
| `inoh-backend`, the same one the app's Discover search bar uses, so both stay in sync. It returns   |
| curated entries only — a user's own custom cards are deliberately not searchable, since they are    |
| already in their deck.                                                                              |

## Project layout

```
src/
  index.ts       # entry point: load config, start HTTP server
  config.ts      # env parsing
  constants.ts   # route paths
  http.ts        # Express app: /mcp (bearer-protected), OAuth metadata, /health
  server.ts      # builds an McpServer with all tools registered
  web-app-urls.ts # inoh.app links handed back to clients
  auth/          # Supabase JWT verifier, protected-resource metadata, user helpers
  supabase/      # per-request Supabase client acting as the signed-in user
  custom-cards/  # monthly quota + request-status mapping shared by the card tools
  tools/         # one file per tool, allowlisted in tools/index.ts
scripts/
  mint-local-token.ts  # dev helper behind `pnpm token:local`
```

## Roadmap

See the Linear issue for the full discussion. In order:

1. Enable Supabase OAuth server + consent page in the Inoh web app; rate limiting
2. CRUD tools: `add_card`, `search_cards`, `create_deck`, list decks/cards
3. Contextual card construction, then voice review

Done: `create_card` covers card generation (text, image, audio, distractors),
metered by the per-plan monthly quota above rather than credits.
