# inoh-mcp

The remote [MCP](https://modelcontextprotocol.io) server for [Inoh](https://inoh.app), a vocabulary
app built on spaced repetition. Connect it to Claude, ChatGPT, Cursor or any MCP-capable client and
your AI can look words up in the Inoh dictionary and build flashcards for you, in your own account,
while you are talking to it.

Ask for a word you just met in an article and it becomes a card with a definition, an example
sentence, audio, an image and quiz options, ready to review in the Inoh app on your phone.

```
https://mcp.inoh.app/mcp
```

## Connecting

You need a free [Inoh](https://inoh.app) account. Sign-in happens in your browser through Inoh's
normal email flow, so your AI client never sees your password, and you can revoke it later.

Claude Code:

```bash
claude mcp add --transport http inoh https://mcp.inoh.app/mcp
```

Any other client: add `https://mcp.inoh.app/mcp` as a **Streamable HTTP** (remote) server. Clients
register themselves automatically, so there is no API key to copy and no configuration file to edit.
The first tool call opens a browser tab asking you to sign in and approve access.

## What you can ask for

| Tool                | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `search_dictionary` | Look a word or phrase up in the Inoh dictionary                |
| `create_card`       | Build a complete flashcard for a word and file it in your deck |
| `get_card_status`   | Check whether a card you asked for is ready                    |
| `delete_card`       | Permanently delete a card you created, including its media     |
| `whoami`            | Show which Inoh account you are signed in as                   |
| `ping`              | Connectivity check                                             |

Things people actually say:

- "Add _serendipity_ to my Inoh deck."
- "I keep seeing _runway_ in startup writing. Make me a card for that meaning, not the airport one."
- "Make cards for every word I got wrong in that article."
- "Is my _platitudinous_ card ready yet?"
- "Delete the _moat_ card I made earlier."

## Cards you create

A card you make here is yours alone. It never joins the shared Inoh dictionary, never appears in
the Discover feed, and never shows up in anyone else's search. Two people asking for the same word
each get their own.

It is a complete card rather than a stub: definition, example sentence, three audio clips, an image,
phonetic transcription and both sets of quiz options. That means you can review it in the app the
moment it appears, alongside curated cards. Making one takes about 20 seconds.

Tell the AI which sense you mean when a word has several. "Runway" as months of cash is a different
card from "runway" at an airport, and nothing reviews the result before it reaches you.

**How many you can make**, per calendar month:

| Plan | Cards per month |
| ---- | --------------- |
| Free | 50              |
| Plus | 300             |
| Pro  | 1,000           |

Deleting a card removes it completely: the card, its place in your deck, and its image and audio
files. It does not give back the monthly allowance it used. Removing one of your own cards from a
deck inside the Inoh app also deletes it, a few minutes later, once the undo window has passed.

## Privacy and data handling

- **The server stores nothing of its own.** It acts on your Inoh account using your access token,
  and everything it reads or writes is scoped to you by the database's row level security.
- **It holds no administrator credentials.** There is no service-role key here, so a bug in a tool
  cannot reach past your own data.
- **It logs no card content, no request bodies and no tokens.** The only things written to the log
  are the startup line, rejected origins, and unexpected errors.
- **Creating a card sends the word and the sense you described to Inoh's card pipeline**, which uses
  OpenAI for the text, Google Cloud for the speech, and Google Gemini for the image. Nothing else
  about you is sent.
- **Your cards stay yours.** Deleting a card deletes the underlying media too, unless another card
  legitimately shares the same file.
- **You can revoke access at any time** from your Inoh account, and nothing here survives it.

## Security

Requests are authenticated with OAuth 2.1 bearer tokens; an unauthenticated request gets a `401`
pointing at the server's protected-resource metadata, which is how MCP clients discover the sign-in
flow. The `/mcp` endpoint also validates the `Origin` header, so a web page cannot drive the server
from your browser.

Found something wrong? Open an issue on this repository.

## Development

Local setup, scripts, architecture and the release process live in
[docs/development.md](docs/development.md).
