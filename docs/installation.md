# Connecting Inoh to Your AI

> **The per-client setup steps now live at [docs.inoh.app](https://docs.inoh.app).**
> They are maintained there, in one place. This page keeps the server address,
> what to expect on first use, and troubleshooting.

Nothing installs on your computer. You are just telling your AI where to find Inoh on the
internet. The address it needs is:

```
https://mcp.inoh.app/mcp
```

The first time you ask your AI to do something with Inoh, a sign-in tab will open in your
browser. Sign in with your [Inoh account](https://app.inoh.app) and approve access. That is it.

---

## Setup for your client

**[Connect Inoh to your AI](https://docs.inoh.app)** covers ChatGPT, Claude.ai, Claude Desktop,
VS Code with Copilot, Cursor, Windsurf, Zed, Claude Code, Gemini CLI, Codex CLI and Grok CLI.

Every client there installs Inoh for your whole user account, so it is available in every project
and folder you work in. Where a tool can also install per-project, that is called out as the
alternative rather than the default.

Why the steps moved: clients rearrange their menus often, and this page and the site had already
drifted apart. This page told people to hand-edit `claude_desktop_config.json`, which is no longer
where a remote MCP server belongs in Claude Desktop. One copy cannot disagree with itself.

---

## Check that it worked

Once connected, ask your AI:

> _"Check my Inoh account."_

It should reply with the email address you used to sign in to Inoh. If it does, everything
is set up correctly.

---

## Something not working?

- **No sign-in tab appeared.** Try sending your AI another message that mentions Inoh. Sometimes
  it takes a second request to trigger the first connection.
- **Claude Desktop shows no tools.** Check that Inoh is listed under **Settings -> Connectors**,
  then fully quit and reopen the app (not just close the window).
- **A config file looks broken.** The editors that take JSON (Cursor, VS Code, Zed) are sensitive
  to a missing comma or bracket. Paste your file into [jsonlint.com](https://jsonlint.com) to
  check it.
- **Still stuck?** Open an issue on [GitHub](https://github.com/inoh-app/inoh-mcp).
