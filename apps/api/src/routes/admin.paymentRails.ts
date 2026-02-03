import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireCsrf } from "../lib/csrf.js";
import { sanitizeString } from "../lib/sanitize.js";
import * as railsRepo from "../repos/paymentRailsRepo.js";
import { audit } from "../repos/adminAuditRepo.js";

function normAddress(addr: string) {
  return sanitizeString(addr, 80).toLowerCase();
}

const UpsertSchema = z.object({
  rail: z.enum(["eth", "btc", "xrp", "pi"]),
  chainId: z.number().int().nullable().optional(),
  currency: z.enum(["usd", "usdc", "eth", "btc", "xrp", "pi"]),
  treasury: z.string().min(3).max(200),
  rpcUrl: z.string().max(500).nullable().optional(),
  enabled: z.boolean(),
  minConfirmations: z.number().int().min(0).max(10_000),
  metadata: z.any().optional()
});

export function adminPaymentRailsRouter() {
  const r = Router();

  r.get("/", requireAuth, requireRole("admin"), async (_req, res, next) => {
    try {
      const items = await railsRepo.listRails();
      res.json({ items });
    } catch (e) { next(e); }
  });

  r.post("/upsert", requireAuth, requireRole("admin"), requireCsrf, async (req, res, next) => {
    try {
      const actor = normAddress((req as any).user.address);
      const input = UpsertSchema.parse(req.body ?? {});
      const chainId = input.chainId ?? null;

      const item = await railsRepo.upsertRail({
        rail: input.rail,
        chainId,
        currency: input.currency,
        treasury: sanitizeString(input.treasury, 200),
        rpcUrl: input.rpcUrl ? sanitizeString(input.rpcUrl, 500) : null,
        enabled: input.enabled,
        minConfirmations: input.minConfirmations,
        metadata: input.metadata ?? {}
      });

      await audit({
        actor,
        action: "payment_rails.upsert",
        targetType: "payment_rail",
        targetId: `${input.rail}:${chainId ?? "null"}`,
        details: { item }
      });

      res.status(201).json({ item });
    } catch (e) { next(e); }
  });

  return r;
}
