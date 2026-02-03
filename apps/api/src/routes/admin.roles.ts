import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { sanitizeString } from "../lib/sanitize.js";
import { requireCsrf } from "../lib/csrf.js";
import { grantRole } from "../repos/roleRepo.js";

function normAddress(addr: string) {
  return sanitizeString(addr, 80).toLowerCase();
}

const GrantSchema = z.object({
  address: z.string().min(6).max(80),
  role: z.enum(["creator", "moderator", "admin"]),
  reason: z.string().max(200).optional()
});

export function adminRolesRouter() {
  const r = Router();

  r.post("/grant", requireAuth, requireRole("admin"), requireCsrf, async (req, res, next) => {
    try {
      const actor = normAddress((req as any).user.address);
      const input = GrantSchema.parse(req.body ?? {});
      const target = normAddress(input.address);

      const item = await grantRole({
        address: target,
        role: input.role,
        grantedBy: actor,
        reason: input.reason ? sanitizeString(input.reason, 200) : null
      });

      res.status(201).json({ item });
    } catch (e) { next(e); }
  });

  return r;
}
