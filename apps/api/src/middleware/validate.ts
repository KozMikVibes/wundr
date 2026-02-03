import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(Object.assign(new Error("invalid_input"), { status: 400, details: parsed.error.flatten() }));
    }
    (req as any).validatedBody = parsed.data;
    next();
  };
}
