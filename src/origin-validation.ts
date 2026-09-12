import type { Request, RequestHandler, Response } from 'express';

const HTTP_FORBIDDEN = 403;
const JSON_RPC_FORBIDDEN = -32000;

/**
 * Rejects browser requests from origins that are not on the allowlist.
 *
 * Reason: the Streamable HTTP spec requires servers to validate `Origin` so a
 * malicious page cannot drive the server from a victim's browser (DNS
 * rebinding). This server is bearer-authenticated rather than cookie-based, so
 * a hostile page cannot borrow a user's credentials anyway, but the check is
 * cheap and the spec asks for it.
 *
 * A missing `Origin` is allowed on purpose. Native MCP clients — Claude
 * Desktop, the Claude CLI, Codex, Cursor — send no `Origin` at all, and
 * rejecting them would break every non-browser caller. Only a request that
 * claims a browser origin has to prove that origin is one we know.
 *
 * @param allowedOrigins - Exact origins to accept, e.g. `https://app.inoh.app`
 * @returns Express middleware that forbids unknown browser origins
 */
export const createOriginValidation = (allowedOrigins: string[]): RequestHandler => {
  const allowed = new Set(allowedOrigins);

  return (request: Request, response: Response, next) => {
    const { origin } = request.headers;

    if (origin === undefined || allowed.has(origin)) {
      next();
      return;
    }

    console.warn(`Rejected MCP request from disallowed origin: ${origin}`);
    response.status(HTTP_FORBIDDEN).json({
      jsonrpc: '2.0',
      error: {
        code: JSON_RPC_FORBIDDEN,
        message:
          `Origin ${origin} is not allowed to call this server. ` +
          'Add it to ALLOWED_ORIGINS if this is a client you trust.',
      },
      id: null,
    });
  };
};
