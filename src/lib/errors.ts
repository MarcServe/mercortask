/** Error with an HTTP status that is safe to show to API clients. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (msg: string) => new AppError(400, "bad_request", msg);
export const unauthorized = () => new AppError(401, "unauthorized", "Missing or invalid bearer token");
export const notFound = (msg = "Not found") => new AppError(404, "not_found", msg);
export const upstream = (msg: string) => new AppError(502, "upstream_error", msg);
