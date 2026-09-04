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

Basic scaffold. One `ping` tool over stateless Streamable HTTP. No auth yet.

## Requirements

- Node.js 22+
- pnpm 10

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

The server listens on `http://127.0.0.1:3333/mcp` by default. `GET /health` returns `{"status":"ok"}`.

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

## Try it

Initialize a session and list tools with `curl`:

```bash
curl -s http://127.0.0.1:3333/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

curl -s http://127.0.0.1:3333/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Or connect from Claude Code:

```bash
claude mcp add --transport http inoh http://127.0.0.1:3333/mcp
```

## Project layout

```
src/
  index.ts       # entry point: load config, start HTTP server
  config.ts      # env parsing
  http.ts        # Express app, /mcp and /health routes
  server.ts      # builds an McpServer with all tools registered
  tools/         # one file per tool, allowlisted in tools/index.ts
```

## Roadmap

See the Linear issue for the full discussion. In order:

1. Auth (per-user), authorization checks, rate limiting
2. CRUD tools: `add_card`, `search_cards`, `create_deck`, list decks/cards
3. `generate_card` orchestration (text, image, audio) with credit-based metering
4. Contextual card construction, then voice review
