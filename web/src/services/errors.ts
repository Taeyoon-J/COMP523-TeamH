/** An expected failure with a user-facing message; `status` doubles as the HTTP status in API routes. */
export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}
