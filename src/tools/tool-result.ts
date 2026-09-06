import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Builds the failure result a tool returns for a caller mistake.
 *
 * Reason: a thrown error becomes a protocol-level failure, which reads to the
 * model as "the server broke". A tool result with `isError` keeps the
 * conversation going and lets the model act on the explanation — the right
 * shape for "you do not own that card" or "you are out of allowance".
 *
 * @param message - Explanation written for the person on the other end
 * @returns The MCP tool result marking the call as failed
 */
export const buildToolError = (message: string): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});
