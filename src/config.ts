/**
 * Runtime configuration read from environment variables.
 *
 * Reason: keeping all env access in one place makes it obvious what the
 * server needs to run and avoids scattered `process.env` lookups.
 */
export interface ServerConfig {
  port: number;
  host: string;
}

const DEFAULT_PORT = 3333;
const DEFAULT_HOST = '127.0.0.1';

/**
 * Parses server configuration from `process.env`.
 *
 * @returns Validated server configuration with defaults applied
 * @throws {Error} When PORT is set but is not a positive integer
 */
export const loadServerConfig = (): ServerConfig => {
  const rawPort = process.env.PORT;
  const port = rawPort === undefined ? DEFAULT_PORT : Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}". Expected a positive integer.`);
  }

  return {
    port,
    host: process.env.HOST ?? DEFAULT_HOST,
  };
};
