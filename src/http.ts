import type { Express, Request, Response } from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createInohMcpServer } from './server.js';

const MCP_PATH = '/mcp';
const HEALTH_PATH = '/health';

const JSON_RPC_INTERNAL_ERROR = -32603;
const JSON_RPC_METHOD_NOT_ALLOWED = -32000;

const sendJsonRpcError = (
  response: Response,
  httpStatus: number,
  code: number,
  message: string,
): void => {
  response.status(httpStatus).json({ jsonrpc: '2.0', error: { code, message }, id: null });
};

const handleMcpPost = async (request: Request, response: Response): Promise<void> => {
  const server = createInohMcpServer();
  // Reason: stateless mode (no session id) so any instance can serve any
  // request, which keeps horizontal scaling and serverless deploys simple.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  response.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!response.headersSent) {
      sendJsonRpcError(response, 500, JSON_RPC_INTERNAL_ERROR, 'Internal server error');
    }
  }
};

const handleMcpMethodNotAllowed = (_request: Request, response: Response): void => {
  sendJsonRpcError(response, 405, JSON_RPC_METHOD_NOT_ALLOWED, 'Method not allowed.');
};

/**
 * Creates the Express app that exposes the MCP endpoint and a health check.
 *
 * @param host - Interface the app will bind to; drives DNS-rebinding protection
 * @returns A configured Express application
 */
export const createHttpApp = (host: string): Express => {
  const app = createMcpExpressApp({ host });

  app.get(HEALTH_PATH, (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.post(MCP_PATH, handleMcpPost);
  // Reason: GET (server-initiated SSE) and DELETE (session teardown) only make
  // sense in stateful mode, so they are rejected explicitly.
  app.get(MCP_PATH, handleMcpMethodNotAllowed);
  app.delete(MCP_PATH, handleMcpMethodNotAllowed);

  return app;
};
