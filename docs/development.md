# Inoh MCP - Developer & Self-Hosting Guide

> **You are in the right place if** you want to run the MCP server locally for development,
> audit the source code, or self-host it. If you just want to use Inoh inside your AI client,
> see **[installation.md](./installation.md)** instead.

---

## Prerequisites

- Node.js >= 22
- pnpm >= 10
- A running [Supabase](https://supabase.com) project (local or cloud) with the Inoh schema

---

## Quick start

```bash
git clone https://github.com/inoh-app/inoh-mcp.git
cd inoh-mcp
pnpm install
cp .env.example .env
```

Edit `.env` with your Supabase credentials (see [Environment variables](#environment-variables)),
then:

```bash
pnpm dev       # watch mode, restarts on changes
# or
pnpm build && pnpm start   # production build
```

The server listens on `http://127.0.0.1:3333/mcp` by default.

---

## Environment variables

All variables are documented in [`.env.example`](./../.env.example). The key ones:

| Variable                   | Required | Description                                                                                                                                                                                                           |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                     | no       | Port to listen on (default `3333`)                                                                                                                                                                                    |
| `HOST`                     | no       | Interface to bind (default `127.0.0.1`; use `0.0.0.0` in containers)                                                                                                                                                  |
| `PUBLIC_URL`               | no       | Externally reachable base URL. Advertised to clients in OAuth metadata. Defaults to `http://HOST:PORT`.                                                                                                               |
| `SUPABASE_URL`             | **yes**  | Your Supabase project URL. Must match the `iss` claim in JWTs exactly - use `http://127.0.0.1:54321`, not `localhost`, for local Supabase.                                                                            |
| `SUPABASE_PUBLISHABLE_KEY` | **yes**  | Supabase publishable (anon) key. Sent as `apikey` on every database request; the caller's bearer token is forwarded alongside it so Row Level Security still applies.                                                 |
| `SUPABASE_JWT_SECRET`      | **yes*** | Shared HS256 JWT secret. Required for projects signing tokens with HS256 (production today). Projects on asymmetric keys (ES256/RS256) are verified via JWKS and can leave this blank.                                |
| `ALLOWED_ORIGINS`          | no       | Comma-separated list of browser origins allowed to call `/mcp`. Native clients (no `Origin` header) are always allowed. Defaults to `https://app.inoh.app`. Add your web client's origin here or it will receive a `403`. |

Retrieve local values from your running Supabase instance:

```bash
supabase status -o env
# PUBLISHABLE_KEY  -> SUPABASE_PUBLISHABLE_KEY
# JWT_SECRET       -> SUPABASE_JWT_SECRET
```

---

## Local authentication (no OAuth flow)

There is no OAuth redirect loop when running locally. Mint a signed JWT instead:

```bash
TOKEN=$(pnpm -s token:local --email you@example.com --user <existing-auth-users-uuid>)
```

Pass `--user` with a real `auth.users` UUID; the default is a random UUID which fails any
insert that has a foreign-key constraint to a user row.

Add the minted token to your MCP client:

```bash
# Claude Code
TOKEN=$(pnpm -s token:local --email you@example.com --user <existing-auth-users-uuid>) \
  && claude mcp add --scope user --transport http inoh-local http://127.0.0.1:3333/mcp \
    --header "Authorization: Bearer $TOKEN"
```

Chain the two with `&&` rather than running them separately. If `$TOKEN` is empty — a fresh shell,
or a mint that failed — the header is written as the bare word `Bearer` and the server is
registered but permanently broken, reporting `Invalid Authorization header format` on every
connect. `&&` means a failed mint writes no config at all.

Or paste it as a Bearer token in any HTTP-capable MCP client.

Name it `inoh-local`, not `inoh`, so it cannot be confused with the hosted server registered as
`inoh` (see [installation.md](./installation.md)). The two can then coexist: `inoh` for
production, `inoh-local` for whatever `pnpm dev` is serving.

`--scope user` puts it in `~/.claude.json` and makes it reachable from any directory, which is
what you want when you are testing tool calls from a scratch folder rather than from this repo.
The bearer token stays out of version control either way — what you must not use here is
`--scope project`, which writes a committed `.mcp.json`. The cost of user scope is that
`inoh-local` shows up as failing everywhere whenever the dev server is not running.

`TOKEN_LIFETIME` in [`scripts/mint-local-token.ts`](./../scripts/mint-local-token.ts) is `14d`, so
you re-mint roughly once a fortnight and then re-run both commands. There is no OAuth flow
locally, so the header is the only way in. A long life is fine here only because the token is
signed with your local Supabase secret and is useless against any other project.

---

## Updating the local server

`pnpm dev` runs `node --watch`, so **there is no update step**: edit or `git pull`, and the server
restarts itself. `pnpm build && pnpm start` does not — it serves `dist/`, so rebuild after a pull.

Claude Code connects to an MCP server once, at session start. A restarted server therefore needs a
new session; until then `inoh-local` reports as failing, which is also what you see when the dev
server simply is not running.

To check which code is actually being served, ask the server rather than guessing:

```bash
claude mcp list          # is inoh-local connected?
```

Then call a tool and read its description — `delete_private_card` saying deletion is permanent means
you are on PRI-20766 or later.

After a schema change in `inoh-backend`, the local database has to move with it, or every tool
fails on a column that is not there yet:

```bash
cd ../inoh-backend && supabase migration up --local
```

### One tool a minted token cannot exercise

`delete_private_card` calls the `delete-private-card` edge function, which verifies the caller with
`auth.getUser`. That checks the token's `session_id` against `auth.sessions`, and a minted token
carries one that was never issued, so the function answers `Invalid or expired user token`.

Everything else works on a minted token, because Row Level Security reads the JWT's claims and
never looks the session up. To exercise deletion, sign a real user in for a genuine token:

```bash
TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .access_token)
```

---

## Architecture notes

### Security boundary

`src/tools/index.ts` is the only place tools are registered. A file under `src/tools/` that
is not imported there is unreachable, which is the entire authorisation model. Keep it that
way - do not export tools implicitly.

### No service-role key

The server calls Supabase exclusively with the **caller's own bearer token**, forwarded as-is.
This means every database read and write runs as that user and Row Level Security applies fully.
A service-role client here would make every RLS policy in `inoh-backend` advisory. Do not add
one.

### Dual JWT verification

Both Supabase signing schemes are accepted:

- **HS256** - verified against `SUPABASE_JWT_SECRET`
- **ES256 / RS256** - verified via the project JWKS endpoint

Projects migrate between them, so do not assume either scheme.

### Origin validation

`/mcp` checks the `Origin` header on every request. Requests with **no** `Origin` header (every
native client - Claude Desktop, the CLI, Cursor, Codex, etc.) are always allowed. A request
that carries a browser `Origin` must match `ALLOWED_ORIGINS` or it receives a `403`. Add new
web-based clients to `ALLOWED_ORIGINS` deliberately, not by widening the default.

### Tool names stay out of sight

`SERVER_INSTRUCTIONS` in `src/server.ts` is sent to every client in the initialize handshake, and
it says one thing: the user never hears a tool name. A person who is told "use `update_private_card`"
has to translate that back into something they could have said, so tool descriptions and results
name a card and a word - "I can remake the _runway_ card" - and cardIds are never read out either.

Tool names still appear inside descriptions and results, because that is how a tool tells the
client which sibling to call next. The rule is about what reaches the user, not about the strings
themselves: keep the cross-reference, phrase the advice around it in words the user could say back.

### Quota constants

`PRIVATE_CARD_MONTHLY_LIMITS` in the source mirrors the limits enforced by the
`enforce_monthly_private_card_limit` trigger in `inoh-backend`. Changing the constant here
changes only what the tool reports, not what the database allows. Update the trigger first.

---

## Releasing

Registry versions are immutable. A metadata fix requires a new version. Bump in all three
places that must agree:

- `package.json` -> `version`
- `src/server.ts` -> `SERVER_VERSION`
- `server.json` -> `version`

Then publish:

```bash
mcp-publisher validate
mcp-publisher publish
```

---

## Scripts reference

| Command             | Description                           |
| ------------------- | ------------------------------------- |
| `pnpm dev`          | Watch mode - restarts on file changes |
| `pnpm build`        | Compile TypeScript to `dist/`         |
| `pnpm start`        | Run compiled output                   |
| `pnpm token:local`  | Mint a local JWT for testing          |
| `pnpm typecheck`    | Type-check without emitting           |
| `pnpm lint`         | Run ESLint                            |
| `pnpm lint:strict`  | ESLint with zero warnings allowed     |
| `pnpm format`       | Format with Prettier                  |
| `pnpm format:check` | Check formatting without writing      |

---

## Roadmap

1. Rate limiting
2. CRUD tools: `add_card`, `search_cards`, `create_deck`, list decks and cards
3. Contextual card construction, then voice review
