// Logging = Fastify's built-in pino logger (fast: JSON lines, no string formatting on the hot path).
//
//   development → pretty, colored lines via pino-pretty (runs in a worker thread)
//   production  → raw JSON lines on stdout, ready for any log collector
//
// Every request prints ONE line when it finishes:
//   INFO: POST /api/auth/login 200 12.4ms   { reqId, userId, role, ip }
// 5xx logs as error, 4xx as warn, everything else as info.
//
// On startup the full list of API routes is printed once.
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { config } from "../config";

export const loggerOptions: FastifyServerOptions["logger"] = {
  level: config.logLevel,
  // never write secrets to the logs, even if someone logs a whole body or header object
  redact: {
    paths: [
      "req.headers.authorization",
      "*.password",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[redacted]",
  },
  ...(config.isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { translateTime: "HH:MM:ss", ignore: "pid,hostname", singleLine: true },
        },
      }),
};

// Fastify's default is two lines per request ("incoming request" + "request completed").
// Turn that off with `disableRequestLogging: true` and use this single summary line instead.
export function registerRequestLogging(fastify: FastifyInstance) {
  fastify.addHook("onResponse", async (request, reply) => {
    const status = reply.statusCode;
    // /health is polled by uptime checkers: only visible with LOG_LEVEL=debug
    const level =
      status >= 500 ? "error" : status >= 400 ? "warn" : request.url === "/health" ? "debug" : "info";

    request.log[level](
      {
        userId: request.user?.userId,
        role: request.user?.role,
        ip: request.ip,
      },
      `${request.method} ${request.url} ${status} ${reply.elapsedTime.toFixed(1)}ms`,
    );
  });
}

// Collects every route as it is registered, then prints them once the app is ready.
// Must be called BEFORE the route plugins are registered.
export function registerRouteList(fastify: FastifyInstance) {
  const routes: { method: string; url: string }[] = [];

  fastify.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      // HEAD is auto-added for every GET, OPTIONS * comes from CORS: noise
      if (method === "HEAD" || method === "OPTIONS") continue;
      routes.push({ method, url: route.url });
    }
  });

  fastify.addHook("onReady", async () => {
    routes.sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method));
    const lines = routes.map((r) => `  ${r.method.padEnd(6)} ${r.url}`);
    fastify.log.info(`${routes.length} API routes:\n${lines.join("\n")}`);
  });
}
