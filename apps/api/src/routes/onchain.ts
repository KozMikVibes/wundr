import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireCsrf } from "../lib/csrf.js";
import { sanitizeString } from "../lib/sanitize.js";
import * as market from "../repos/marketplaceRepo.js";
import { q } from "../lib/db.js";
import { makeClient, verifyNativePayment, verifyErc20Payment, type SupportedChainId } from "../lib/onchainVerify.js";

function normAddress(addr: string) {
  return sanitizeString(addr, 80).toLowerCase();
}

const OnchainPurchaseSchema = z.object({
  listingId: z.string().uuid(),
  chainId: z.number().int(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  currency: z.enum(["eth", "usdc"]),
});

export function marketplaceOnchainRouter() {
  const r = Router();

  r.post("/purchase/onchain", requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const buyer = normAddress((req as any).user.address);
      const input = OnchainPurchaseSchema.parse(req.body ?? {});

      const listing = await market.getListingById(input.listingId);
      if (!listing || listing.status !== "published") {
        return res.status(404).json({ error: "listing_not_available" });
      }

      // Resolve active price from DB
      // Map eth/usdc -> price currency enum (eth/usdc)
      const priceCurrency = input.currency === "eth" ? "eth" : "usdc";
      const price = await market.getActivePrice(input.listingId, priceCurrency);
      if (!price) return res.status(400).json({ error: "price_not_found" });

      // Prevent replay quickly
      const replay = await q(
        `SELECT 1 FROM marketplace_purchases WHERE chain_id = $1 AND tx_hash = $2 LIMIT 1`,
        [input.chainId, input.txHash]
      );
      if ((replay.rowCount ?? 0) > 0) return res.status(409).json({ error: "tx_already_used" });

      // Chain config (put in env/ConfigMap in k8s)
      const chainId = input.chainId as SupportedChainId;

      const rpcUrl =
        chainId === 1 ? process.env.RPC_MAINNET :
        chainId === 8453 ? process.env.RPC_BASE :
        chainId === 137 ? process.env.RPC_POLYGON :
        null;

      if (!rpcUrl) return res.status(400).json({ error: "chain_not_supported" });

      const treasury = (process.env.TREASURY_ADDRESS || "").toLowerCase();
      if (!treasury) return res.status(500).json({ error: "treasury_not_configured" });

      const client = makeClient(chainId, rpcUrl);

      // Verify payment
      if (input.currency === "eth") {
        const ok = await verifyNativePayment({
          client,
          txHash: input.txHash as any,
          buyer: buyer as any,
          treasury: treasury as any,
          minWei: BigInt(price.amount_int),
        });
        if (!ok.ok) return res.status(400).json({ error: "payment_not_verified", reason: ok.reason });
      } else {
        const token = (process.env.USDC_ADDRESS || "").toLowerCase();
        if (!token) return res.status(500).json({ error: "token_not_configured" });

        const ok = await verifyErc20Payment({
          client,
          txHash: input.txHash as any,
          buyer: buyer as any,
          treasury: treasury as any,
          token: token as any,
          minTokenAmount: BigInt(price.amount_int),
        });
        if (!ok.ok) return res.status(400).json({ error: "payment_not_verified", reason: ok.reason });
      }

      // Atomic: purchase + entitlement
      await q("BEGIN");
      try {
        const purchase = await market.createPurchase({
          buyer,
          listingId: input.listingId,
          priceId: price.id,
          currency: priceCurrency,
          amountInt: String(price.amount_int),
          metadata: { method: "onchain", chainId, txHash: input.txHash },
        });

        // Store tx hash on the purchase record (or extend createPurchase to include it)
        await q(
          `UPDATE marketplace_purchases SET chain_id = $2, tx_hash = $3 WHERE id = $1`,
          [purchase.id, chainId, input.txHash]
        );

        const entitlement = await market.grantEntitlementFromPurchase({
          buyer,
          listingId: input.listingId,
          purchaseId: purchase.id,
        });

        await q("COMMIT");
        res.status(201).json({ purchase, entitlement });
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
