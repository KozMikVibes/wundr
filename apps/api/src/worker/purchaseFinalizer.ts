import { Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { q } from "../lib/db.internal.js";
import * as railsRepo from "../repos/paymentRailsRepo.js";
import * as purchaseRepo from "../repos/purchaseRepo.js";
import * as market from "../repos/marketplaceRepo.js";
import { buildVerifierForRail } from "../lib/payments/buildFromDb.js";

const QUEUE = "purchase-finalizer";

// How many pending purchases to scan each run (keep modest for beta)
const BATCH = Number(process.env.PURCHASE_FINALIZER_BATCH || "50");

// Re-run cadence via BullMQ repeat or external cron. For beta: run continuously with small concurrency.
export function startPurchaseFinalizerWorker() {
  const worker = new Worker(
    QUEUE,
    async () => {
      const pending = await purchaseRepo.listPendingPurchases(BATCH);

      for (const p of pending) {
        if (!p.rail || !p.tx_hash) continue;

        const rail = p.rail as any;
        const chainId = p.chain_id ?? null;

        const railCfg = await railsRepo.getRail(rail, chainId);
        if (!railCfg || !railCfg.enabled) continue;

        const verifier = buildVerifierForRail(railCfg);

        // Look up price row for minAtomic. Purchase stores amount_int but always re-use listing price as source-of-truth.
        // If you want "price locked at purchase time", use p.amount_int instead. For beta, lock purchase amount_int:
        const minAtomic = String(p.amount_int);

        const vr = await verifier.verify(
          {
            rail,
            listingId: p.listing_id,
            buyerAddress: p.buyer,
            txId: p.tx_hash,
            chainId: p.chain_id ?? undefined
          },
          {
            treasury: railCfg.treasury,
            minAtomic,
            minConfirmations: railCfg.min_confirmations,
            extras: railCfg.metadata ?? {}
          }
        );

        if (!vr.ok) {
          // don’t instantly fail on “insufficient_confirmations”
          if (vr.reason === "insufficient_confirmations" || vr.reason === "unconfirmed" || vr.reason === "not_validated") {
            continue;
          }
          await purchaseRepo.markPurchaseFailed(p.id, vr.reason);
          continue;
        }

        if (vr.confirmations < railCfg.min_confirmations) continue;

        // Complete + entitlement
        await q("BEGIN");
        try {
          const completed = await purchaseRepo.markPurchaseCompleted({
            purchaseId: p.id,
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
            continue;
          }

          await market.grantEntitlementFromPurchase({
            buyer: p.buyer,
            listingId: p.listing_id,
            purchaseId: p.id
          });

          await q("COMMIT");
        } catch (err) {
          await q("ROLLBACK");
          throw err;
        }
      }

      return { scanned: pending.length };
    },
    {
      connection: redis as any,
      concurrency: Number(process.env.PURCHASE_FINALIZER_CONCURRENCY || "1")
    }
  );

  worker.on("failed", (job, err) => {
    console.error("purchase finalizer failed", job?.id, err);
  });

  return worker;
}
