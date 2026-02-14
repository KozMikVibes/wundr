import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireCsrf } from "../lib/csrf.js";
import { sanitizeString } from "../lib/sanitize.js";
import { q } from "../lib/db.internal.js";

import * as market from "../repos/marketplaceRepo.js";
import * as railsRepo from "../repos/paymentRailsRepo.js";
import * as purchaseRepo from "../repos/purchaseRepo.js";
import { buildVerifierForRail } from "../lib/payments/buildFromDb.js";
import type { Rail } from "../lib/payments/types.js";

function normAddress(addr: string) {
  return sanitizeString(addr, 80).toLowerCase();
}

const Schema = z.object({
  rail: z.enum(["eth", "btc", "xrp", "pi"]),
  listingId: z.string().uuid(),
  txId: z.string().min(8).max(200),
  chainId: z.number().int().optional() // required for eth
});

export function marketplacePurchaseVerifyRouter() {
  const r = Router();

  r.post("/purchase/verify", requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const buyer = normAddress((req as any).user.address);
      const input = Schema.parse(req.body ?? {});
      const rail = input.rail as Rail;

      const chainId = rail === "eth" ? (input.chainId ?? null) : null;
      if (rail === "eth" && chainId == null) {
        return res.status(400).json({ error: "chainId_required_for_eth" });
      }

      // Listing must be published
      const listing = await market.getListingById(input.listingId);
      if (!listing || listing.status !== "published") {
        return res.status(404).json({ error: "listing_not_available" });
      }

      // Fetch rail config (DB-driven)
      const railCfg = await railsRepo.getRail(rail, chainId);
      if (!railCfg) return res.status(400).json({ error: "rail_not_configured" });
      if (!railCfg.enabled) return res.status(403).json({ error: "rail_disabled" });

      // Price currency is dictated by rail config
      const price = await market.getActivePrice(input.listingId, railCfg.currency as any);
      if (!price) return res.status(400).json({ error: "price_not_found_for_rail_currency", currency: railCfg.currency });

      // Replay protection
      const replay = await q(
        `SELECT 1 FROM marketplace_purchases WHERE rail = $1 AND chain_id IS NOT DISTINCT FROM $2 AND tx_hash = $3 LIMIT 1`,
        [rail, chainId, input.txId]
      );
      if ((replay.rowCount ?? 0) > 0) return res.status(409).json({ error: "tx_already_used" });

      // Create pending purchase first (source-of-truth)
      // NOTE: if verification fails, we mark failed; if pending, worker completes.
      const pending = await purchaseRepo.createPendingPurchase({
        buyer,
        listingId: input.listingId,
        priceId: price.id,
        currency: railCfg.currency,
        amountInt: String(price.amount_int),
        rail,
        chainId,
        txHash: input.txId,
        metadata: { method: "verify_v1", created_from: "api" }
      });

      const verifier = buildVerifierForRail(railCfg);

      // Verify now
      const vr = await verifier.verify(
        {
          rail,
          listingId: input.listingId,
          buyerAddress: buyer,
          txId: input.txId,
          chainId: input.chainId
        },
        {
          treasury: railCfg.treasury,
          minAtomic: String(price.amount_int),
          minConfirmations: railCfg.min_confirmations,
          extras: railCfg.metadata ?? {}
        }
      );

      if (!vr.ok) {
        await purchaseRepo.markPurchaseFailed(pending.id, vr.reason);
        return res.status(400).json({ error: "payment_not_verified", reason: vr.reason, meta: vr.meta ?? null });
      }

      // If verified but still not deep enough, keep pending (verifier should enforce minConfirmations,
      // but some rails treat "validated" differently; we accept verifier’s confirmations number)
      if (vr.confirmations < railCfg.min_confirmations) {
        // Keep as pending for worker to re-check later
        return res.status(202).json({ ok: true, status: "pending", purchase: pending, verified: vr });
      }

      // Complete + entitlement atomically
      await q("BEGIN");
      try {
        const completed = await purchaseRepo.markPurchaseCompleted({
          purchaseId: pending.id,
          verifiedAmountInt: vr.amountAtomic,
          verifiedConfirmations: vr.confirmations,
          verifiedMeta: {
            verified: {
              rail,
              canonicalId: vr.canonicalId,
              confirmations: vr.confirmations,
              amountAtomic: vr.amountAtomic,
              meta: vr.meta ?? null
            }
          }
        });

        if (!completed) {
          await q("ROLLBACK");
          return res.status(409).json({ error: "purchase_not_pending" });
        }

        const entitlement = await market.grantEntitlementFromPurchase({
          buyer,
          listingId: input.listingId,
          purchaseId: pending.id
        });

        await q("COMMIT");
        res.status(201).json({ ok: true, status: "completed", purchase: completed, entitlement, verified: vr });
      } catch (err) {
        await q("ROLLBACK");
        throw err;
      }
    } catch (e) {
      next(e);
    }
  });

  return r;
}
