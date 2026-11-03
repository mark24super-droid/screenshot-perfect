import type { NextFunction, Request, Response } from "express";
import { config } from "../config";

/** Basic same-origin protection for cookie-authenticated mutations. */
export function originCheck(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (!origin) {
    // Non-browser clients. Session cookies are httpOnly + sameSite=lax, so this
    // does not create a cross-site request forgery vector in browsers.
    next();
    return;
  }
  const allowed = new Set<string>([config.appUrl, `http://localhost:5173`, `http://127.0.0.1:5173`]);
  if (config.apiPublicUrl) allowed.add(config.apiPublicUrl);
  const host = req.headers.host;
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (allowed.has(origin)) {
    next();
    return;
  }
  res.status(403).json({ error: { code: "origin_rejected", message: "Request origin is not allowed." } });
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}
