import { loadServerConfig } from './config.js';
import { MCP_PATH } from './constants.js';
import { createHttpApp } from './http.js';

const config = loadServerConfig();
const app = createHttpApp(config);

app.listen(config.port, config.host, () => {
  console.log(`inoh-mcp listening on ${new URL(MCP_PATH, config.publicUrl).href}`);
});
