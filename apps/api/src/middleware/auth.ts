import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();

type Session = {
  sub: string;
  chainId: number;
  caps: string[];
  roles?: string[];
  typ: "wundr_session";
};

export function setSessionCookie(res: Response, session: Omit<Session, "typ">) {
  const token = jwt.sign({ ...session, typ: "wundr_session" }, env.JWT_SECRET, {
    expiresIn: env.SESSION_TTL_SECONDS
  });

  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS * 1000
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(env.COOKIE_NAME, { path: "/" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "unauthorized" });

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as Session;
    (req as any).user = { address: decoded.sub, chainId: decoded.chainId, caps: decoded.caps ?? [], roles: decoded.roles ?? ["user"] };
    next();
  } catch {
    return res.status(401).json({ error: "invalid_session" });
  }
}

export function requireCap(cap: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as { caps: string[] } | undefined;
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (!user.caps.includes(cap)) return res.status(403).json({ error: "missing_capability", cap });
    next();
  };
}
