import { loadServerConfig } from './config.js';
import { createHttpApp } from './http.js';

const { port, host } = loadServerConfig();
const app = createHttpApp(host);

app.listen(port, host, () => {
  console.log(`inoh-mcp listening on http://${host}:${port}/mcp`);
});
