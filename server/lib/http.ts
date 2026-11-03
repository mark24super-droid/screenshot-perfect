import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "./errors";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

export function fail(res: Response, status: number, code: string, message: string, details?: unknown): void {
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    if (error.status >= 500) {
      console.error(JSON.stringify({ level: "error", scope: "api", path: req.path, code: error.code, message: error.message }));
    }
    fail(res, error.status, error.code, error.message, error.details);
    return;
  }
  if (error instanceof AppError) {
    if (error.status >= 500) {
      console.error(JSON.stringify({ level: "error", scope: "api", path: req.path, code: error.code, message: error.message }));
    }
    fail(res, error.status, error.code, error.message, error.details);
    return;
  }
  if (error instanceof ZodError) {
    fail(res, 422, "validation_failed", "Some fields are invalid.", error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })));
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    fail(res, 400, "invalid_json", "The request body is not valid JSON.");
    return;
  }
  console.error(
    JSON.stringify({
      level: "error",
      scope: "api",
      path: req.path,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 4).join(" | ") : undefined,
    }),
  );
  fail(res, 500, "internal_error", "Something went wrong on our side. Please try again.");
}

export function parsePagination(req: Request, defaultLimit = 20, maxLimit = 100) {
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) ? Math.min(maxLimit, Math.max(1, Math.floor(limitRaw))) : defaultLimit;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
  return { limit, offset };
}
