// Throw this from any service or route to send an error response.
//
//   throw new AppError(404, "User not found");
//   throw new AppError(409, "Already scanned", "ALREADY_SCANNED");
//
// The global error handler in src/app.ts turns it into:
//   { "message": "Already scanned", "code": "ALREADY_SCANNED" }  with status 409
//
// `code` is optional. Add one when the frontend needs to react differently
// to errors that share a status code (e.g. the scanner screen).
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

// Postgres "unique_violation". Two people adding the same class or roll number at the same moment
// both pass an "is it taken?" SELECT and then one of the INSERTs loses — the constraint is the only
// check that can't be raced, so we catch its error rather than trusting a prior read.
// `constraint` narrows it to one index, since a row can violate several.
//
// Drizzle wraps driver errors (the real PostgresError, carrying `code` and `constraint_name`,
// sits on `.cause`), so walk the chain rather than reading the top-level error only.
export function isUniqueViolation(error: unknown, constraint?: string) {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    const pg = current as { code?: string; constraint_name?: string };
    if (pg.code === "23505") {
      return !constraint || pg.constraint_name === constraint;
    }
  }
  return false;
}
