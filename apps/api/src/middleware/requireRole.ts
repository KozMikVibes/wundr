import type { Request, Response, NextFunction } from "express";

export function requireRole(role: "creator" | "moderator" | "admin") {
  return (req: Request, res: Response, next: NextFunction) => {
    const roles = ((req as any).user?.roles ?? []) as string[];
    if (!roles.includes(role) && !roles.includes("admin")) {
      return res.status(403).json({ error: "missing_role", role });
    }
    next();
  };
}
