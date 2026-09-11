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
