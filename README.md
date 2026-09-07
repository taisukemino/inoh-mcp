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

| Tool                         | What it does                                                   |
| ---------------------------- | -------------------------------------------------------------- |
| `search_dictionary`          | Look a word or phrase up in the Inoh dictionary                |
| `add_card_to_deck`           | Put a card that already exists into one of your decks          |
| `remove_card_from_deck`      | Take a dictionary card back out of your deck                   |
| `create_card`                | Build a complete flashcard for a word and file it in your deck |
| `check_card_creation_status` | Check whether a card you asked for is ready                    |
| `delete_custom_card`         | Permanently delete a card you created, including its media     |
| `check_account`              | Show which Inoh account you are signed in as                   |

Things people actually say:

- "Add _serendipity_ to my Inoh deck."
- "I keep seeing _runway_ in startup writing. Make me a card for that meaning, not the airport one."
- "Make cards for every word I got wrong in that article."
- "Is my _platitudinous_ card ready yet?"
- "Take _banyan_ out of my deck, I know it now."
- "Delete the _moat_ card I made earlier."

Ask for a word and the AI looks it up first, adding the curated card when Inoh already has one and
generating a fresh one only when it does not.

## Removing versus deleting

These are different things, and the tools keep them apart.

Taking a **dictionary card** out of your deck just ends your review of it. The word stays in Inoh
for everyone, and you can add it back whenever you like, though you start its review progress over.

A **card you made** cannot sit outside a deck, because nobody else has a copy to keep it alive.
Removing one means deleting it, so `remove_card_from_deck` declines and points at
`delete_custom_card` instead. Deleting is permanent and takes the image and audio with it.

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

Local setup, architecture and the release process live in
[docs/development.md](docs/development.md).

## Licence

All rights reserved. The source is published so you can audit what the server does with your
account, not as an open source release. See [LICENSE](LICENSE). Connecting to the hosted server
needs no licence.
