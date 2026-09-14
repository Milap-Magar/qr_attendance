// All environment variables are read HERE and nowhere else.
// Bun loads `.env` automatically, so no dotenv import is needed.

// crash at startup (not on the first request) if a required variable is missing
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),

  // access token = short-lived JWT sent on every request ("15m", "1h", ...)
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  // refresh token = long-lived random string, only used to get a new access token
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),

  // which frontend origins may call the API, comma separated.
  // unset = allow any origin (fine for local dev, set it in production)
  corsOrigin: process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? true,

  // production = JSON logs; anything else = pretty colored logs
  isProduction: process.env.NODE_ENV === "production",
  // trace | debug | info | warn | error | fatal | silent
  logLevel: process.env.LOG_LEVEL ?? "info",
};
