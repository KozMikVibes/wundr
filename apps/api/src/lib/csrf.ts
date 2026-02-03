import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

export const CSRF_COOKIE = "wundr_csrf";

export function issueCsrfCookie(_req: Request, res: Response) {
  const token = crypto.randomBytes(32).toString("hex");
  // readable by JS so it can be sent back in header
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  return token;
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.header("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "csrf_failed" });
  }
  next();
}
