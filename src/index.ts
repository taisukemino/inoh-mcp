import express from 'express';
import { loadServerConfig } from './config.js';
import { MCP_PATH } from './constants.js';
import { registerHttpRoutes } from './http.js';

const config = loadServerConfig();

// Reason: Vercel detects an Express backend by the entry file importing
// `express` and either exporting the app or listening on a port, so the app
// is assembled here rather than behind a helper.
const app = express();
registerHttpRoutes(app, config);

if (!process.env.VERCEL) {
  app.listen(config.port, config.host, () => {
    console.log(`inoh-mcp listening on ${new URL(MCP_PATH, config.publicUrl).href}`);
  });
}

export default app;
