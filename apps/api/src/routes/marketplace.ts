import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCap } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireCsrf } from "../lib/csrf.js";
import { sanitizeString } from "../lib/sanitize.js";
import * as market from "../repos/marketplaceRepo.js";
import * as learn from "../repos/learnRepo.js";
import { q } from "../lib/db.js";

function normAddress(addr: string) {
  return sanitizeString(addr, 80).toLowerCase();
}

const CreateListingSchema = z.object({
  type: z.enum(["category", "quest", "bundle"]),
  categoryId: z.string().uuid().optional(),
  questId: z.string().uuid().optional(),
  bundleJson: z.any().optional(), // { categoryIds:[], questIds:[] }
  title: z.string().min(3).max(140),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(32)).max(30).default([]),
  coverUrl: z.string().max(500).optional()
});

const AddPriceSchema = z.object({
  listingId: z.string().uuid(),
  currency: z.enum(["usd", "usdc", "eth", "btc", "xrp", "pi"]),
  amountInt: z.string().regex(/^\d+$/)
});

const PublishListingSchema = z.object({
  listingId: z.string().uuid()
});

const ListSchema = z.object({
  tag: z.string().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

const PurchaseSchema = z.object({
  listingId: z.string().uuid(),
  currency: z.enum(["usd", "usdc", "eth"])
  // later: add txHash + chainId and verify onchain
});

const ReviewSchema = z.object({
  listingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().max(4000).optional()
});

export function marketplaceRouter() {
  const r = Router();

  // Browse published listings
  r.get("/listings", requireAuth, async (req, res, next) => {
    try {
      const input = ListSchema.parse(req.query ?? {});
      const tag = input.tag ? sanitizeString(input.tag, 32) : null;
      const items = await market.listPublishedListings({ tag, limit: input.limit });
      res.json({ items });
    } catch (e) { next(e); }
  });

  // Create listing (creator only)
  r.post(
    "/listings",
    requireAuth,
    requireRole("creator"),
    requireCsrf,
    async (req, res, next) => {
      try {
        const address = normAddress((req as any).user.address);
        const input = CreateListingSchema.parse(req.body ?? {});

        const title = sanitizeString(input.title, 140);
        const description = input.description ? sanitizeString(input.description, 2000) : null;
        const tags = input.tags.map(t => sanitizeString(t, 32)).filter(Boolean);
        const coverUrl = input.coverUrl ? sanitizeString(input.coverUrl, 500) : null;

        // Minimal integrity checks
        if (input.type === "category") {
          if (!input.categoryId) return res.status(400).json({ error: "categoryId_required" });
          const cat = await learn.getCategoryById(input.categoryId);
          if (!cat) return res.status(404).json({ error: "category_not_found" });
          if (cat.created_by !== address) return res.status(403).json({ error: "not_owner" });
        }

        if (input.type === "quest") {
          if (!input.questId) return res.status(400).json({ error: "questId_required" });
          const quest = await learn.getQuestById(input.questId);
          if (!quest) return res.status(404).json({ error: "quest_not_found" });
          if (quest.created_by !== address) return res.status(403).json({ error: "not_owner" });
        }

        const bundleJson = input.type === "bundle" ? (input.bundleJson ?? null) : null;

        const item = await market.createListing({
          type: input.type,
          categoryId: input.categoryId ?? null,
          questId: input.questId ?? null,
          bundleJson,
          title,
          description,
          tags,
          coverUrl,
          createdBy: address
        });

        res.status(201).json({ item });
      } catch (e) { next(e); }
    }
  );

  // Add price (creator only, must own listing)
  r.post(
    "/prices",
    requireAuth,
    requireRole("creator"),
    requireCsrf,
    async (req, res, next) => {
      try {
        const address = normAddress((req as any).user.address);
        const input = AddPriceSchema.parse(req.body ?? {});

        const listing = await market.getListingById(input.listingId);
        if (!listing) return res.status(404).json({ error: "listing_not_found" });
        if (listing.created_by !== address) return res.status(403).json({ error: "not_owner" });

        const item = await market.addPrice({
          listingId: input.listingId,
          currency: input.currency,
          amountInt: input.amountInt
        });

        res.status(201).json({ item });
      } catch (e) { next(e); }
    }
  );

  // Publish listing (creator only)
  // Safety: underlying content must be published (category/quest) before listing can be published.
  r.post(
    "/listings/publish",
    requireAuth,
    requireRole("creator"),
    requireCsrf,
    async (req, res, next) => {
      try {
        const address = normAddress((req as any).user.address);
        const input = PublishListingSchema.parse(req.body ?? {});
        const listing = await market.getListingById(input.listingId);
        if (!listing) return res.status(404).json({ error: "listing_not_found" });
        if (listing.created_by !== address) return res.status(403).json({ error: "not_owner" });

        // Verify content is published
        if (listing.type === "category" && listing.category_id) {
          const catRes = await q(`SELECT status FROM learn_categories WHERE id = $1`, [listing.category_id]);
          if (catRes.rows[0]?.status !== "published") return res.status(400).json({ error: "category_not_published" });
        }
        if (listing.type === "quest" && listing.quest_id) {
          const qRes = await q(`SELECT status FROM learn_quests WHERE id = $1`, [listing.quest_id]);
          if (qRes.rows[0]?.status !== "published") return res.status(400).json({ error: "quest_not_published" });
        }

        // Must have an active price to publish (unless you plan free listings)
        const price = await market.getActivePrice(input.listingId, "usd").catch(() => null);
        // If you support multi-currency only, adjust logic. We'll allow publish even without usd price, but require at least 1 active price:
        const anyPrice = await q(`SELECT 1 FROM marketplace_prices WHERE listing_id = $1 AND active = true LIMIT 1`, [
          input.listingId
        ]);
        if (anyPrice.rowCount === 0) return res.status(400).json({ error: "no_active_price" });

        const item = await market.setListingStatus(input.listingId, "published");
        res.json({ item });
      } catch (e) { next(e); }
    }
  );

  // Purchase (record purchase + entitlement) — scalable stub.
  // Later: add onchain receipt verification.
  r.post(
    "/purchase",
    requireAuth,
    requireCsrf,
    async (req, res, next) => {
      try {
        const buyer = normAddress((req as any).user.address);
        const input = PurchaseSchema.parse(req.body ?? {});

        const listing = await market.getListingById(input.listingId);
        if (!listing || listing.status !== "published") return res.status(404).json({ error: "listing_not_available" });

        const price = await market.getActivePrice(input.listingId, input.currency);
        if (!price) return res.status(400).json({ error: "price_not_found" });

        // Transaction: purchase + entitlement (atomic)
        await q("BEGIN");
        try {
          const purchase = await market.createPurchase({
            buyer,
            listingId: input.listingId,
            priceId: price.id,
            currency: input.currency,
            amountInt: String(price.amount_int),
            metadata: { method: "server_stub" }
          });

          const entitlement = await market.grantEntitlementFromPurchase({
            buyer,
            listingId: input.listingId,
            purchaseId: purchase.id
          });

          await q("COMMIT");
          res.status(201).json({ purchase, entitlement });
        } catch (err) {
          await q("ROLLBACK");
          throw err;
        }
      } catch (e) { next(e); }
    }
  );

  // Review (must be entitled)
  r.post(
    "/reviews",
    requireAuth,
    requireCsrf,
    async (req, res, next) => {
      try {
        const author = normAddress((req as any).user.address);
        const input = ReviewSchema.parse(req.body ?? {});

        const entitled = await market.requireEntitlement(author, input.listingId);
        if (!entitled) return res.status(403).json({ error: "not_entitled" });

        const title = input.title ? sanitizeString(input.title, 120) : null;
        const body = input.body ? sanitizeString(input.body, 4000) : null;

        const item = await market.createReview({
          listingId: input.listingId,
          author,
          rating: input.rating,
          title,
          body
        });

        res.status(201).json({ item });
      } catch (e) { next(e); }
    }
  );

  return r;
}
