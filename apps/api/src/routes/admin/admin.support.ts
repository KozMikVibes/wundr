import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { requireCsrf } from "../../lib/csrf.js";
import { sanitizeString } from "../../lib/sanitize.js";
import { grantEntitlementManual } from "../../repos/supportRepo.js";
import { audit } from "../../repos/adminAuditRepo.js";

function normAddress(addr: string) {
  return sanitizeString(addr, 80).toLowerCase();
}

const GrantSchema = z.object({
  buyer: z.string().min(6).max(80),
  listingId: z.string().uuid(),
  note: z.string().max(300).optional()
});

export function adminSupportRouter() {
  const r = Router();

  r.post("/grant-entitlement", requireAuth, requireRole("admin"), requireCsrf, async (req, res, next) => {
    try {
      const actor = normAddress((req as any).user.address);
      const input = GrantSchema.parse(req.body ?? {});
      const buyer = normAddress(input.buyer);

      const item = await grantEntitlementManual({
        buyer,
        listingId: input.listingId,
        note: input.note ? sanitizeString(input.note, 300) : null
      });

      await audit({
        actor,
        action: "support.grant_entitlement",
        targetType: "entitlement",
        targetId: `${buyer}:${input.listingId}`,
        details: { note: input.note ?? null }
      });

      res.status(201).json({ item });
    } catch (e) { next(e); }
  });

  return r;
}
