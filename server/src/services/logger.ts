/**
 * Logger used by the services. Fastify's pino logger is installed at startup
 * (`setLogger(fastify.log)`); scripts and tests get the console.
 */
export interface ServiceLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

let current: ServiceLogger = console;

export function setLogger(logger: ServiceLogger): void {
  current = logger;
}

/** Stable handle that always forwards to the current logger. */
export const log: ServiceLogger = {
  info: (msg) => current.info(msg),
  warn: (msg) => current.warn(msg),
  error: (msg) => current.error(msg),
};
