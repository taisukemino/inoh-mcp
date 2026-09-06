# Developing inoh-mcp

For using the server, see the [README](../README.md). This covers the parts you cannot infer from
`package.json` or the source tree.

## Running against local Supabase

```bash
cp .env.example .env
pnpm dev
```

Point `SUPABASE_URL` at the local Supabase from `inoh-backend` (`http://127.0.0.1:54321`, not
`localhost`, because it has to match the `iss` claim in Supabase's tokens exactly) and copy
`PUBLISHABLE_KEY` and `JWT_SECRET` from `supabase status -o env`.

There is no OAuth flow locally. Mint a token signed with the local JWT secret instead:

```bash
TOKEN=$(pnpm -s token:local --email you@example.com --user <existing-user-uuid>)

claude mcp add --transport http inoh http://127.0.0.1:3333/mcp --header "Authorization: Bearer $TOKEN"
```

Pass `--user` with a real `auth.users` id when the tool has to touch data. The default is a random
uuid, which fails any insert with a foreign key to a user.

## Things worth knowing before you change something

- **`src/tools/index.ts` is the security boundary.** A tool that is not registered there is
  unreachable, which is the whole authorization model. Adding a file under `tools/` does nothing on
  its own.
- **The server never holds a service-role key.** Tools call Supabase with the caller's own token so
  Row Level Security scopes every read and write. Keep it that way; a service-role client here would
  make every RLS policy in `inoh-backend` advisory.
- **Both Supabase signing schemes are accepted**: HS256 with the shared secret, and ES256/RS256 via
  the project JWKS. Projects migrate between them, so do not assume either.
- **`/mcp` validates `Origin`**, allowing requests with no `Origin` at all (every native client) plus
  whatever is in `ALLOWED_ORIGINS`, default `https://inoh.app`. A browser based client needs adding
  there or it gets a 403.
- **Quota numbers are mirrored, not owned.** `CUSTOM_CARD_MONTHLY_LIMITS` only reports what the
  `enforce_monthly_custom_card_limit` trigger in `inoh-backend` enforces. Change the trigger first.

## Releasing

Registry versions are immutable, so a metadata fix needs a new version. Bump it in three places
that must agree: `package.json`, `SERVER_VERSION` in `src/server.ts`, and `server.json`.

```bash
mcp-publisher validate
mcp-publisher publish
```

## Roadmap

1. Rate limiting
2. CRUD tools: `add_card`, `search_cards`, `create_deck`, list decks and cards
3. Contextual card construction, then voice review
