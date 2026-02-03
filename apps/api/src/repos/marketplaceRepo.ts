import { q } from "../lib/db.js";

export async function upsertCreator(input: {
  address: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  websiteUrl?: string | null;
}) {
  const sql = `
    INSERT INTO creators (address, display_name, bio, avatar_url, website_url)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (address) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      bio = EXCLUDED.bio,
      avatar_url = EXCLUDED.avatar_url,
      website_url = EXCLUDED.website_url,
      updated_at = now()
    RETURNING *
  `;
  const res = await q(sql, [
    input.address,
    input.displayName,
    input.bio ?? null,
    input.avatarUrl ?? null,
    input.websiteUrl ?? null
  ]);
  return res.rows[0];
}

export async function createListing(input: {
  type: "category" | "quest" | "bundle";
  categoryId?: string | null;
  questId?: string | null;
  bundleJson?: any | null;
  title: string;
  description?: string | null;
  tags: string[];
  coverUrl?: string | null;
  createdBy: string;
}) {
  const sql = `
    INSERT INTO marketplace_listings (type, category_id, quest_id, bundle_json, title, description, tags, cover_url, created_by)
    VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)
    RETURNING *
  `;
  const res = await q(sql, [
    input.type,
    input.categoryId ?? null,
    input.questId ?? null,
    JSON.stringify(input.bundleJson ?? null),
    input.title,
    input.description ?? null,
    input.tags,
    input.coverUrl ?? null,
    input.createdBy
  ]);
  return res.rows[0];
}

export async function setListingStatus(listingId: string, status: "draft" | "published" | "archived" | "banned") {
  const res = await q(
    `UPDATE marketplace_listings SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [listingId, status]
  );
  return res.rows[0] ?? null;
}

export async function addPrice(input: {
  listingId: string;
  currency: PriceCurrency;
  amountInt: string; // bigint as string
}) {
  const res = await q(
    `
    INSERT INTO marketplace_prices (listing_id, currency, amount_int, active)
    VALUES ($1,$2,$3::bigint,true)
    RETURNING *
    `,
    [input.listingId, input.currency, input.amountInt]
  );
  return res.rows[0];
}

export async function listPublishedListings(params: { tag?: string | null; limit: number }) {
  if (params.tag) {
    const res = await q(
      `
      SELECT * FROM marketplace_listings
      WHERE status = 'published' AND $1 = ANY(tags)
      ORDER BY updated_at DESC
      LIMIT $2
      `,
      [params.tag, params.limit]
    );
    return res.rows;
  }

  const res = await q(
    `
    SELECT * FROM marketplace_listings
    WHERE status = 'published'
    ORDER BY updated_at DESC
    LIMIT $1
    `,
    [params.limit]
  );
  return res.rows;
}

export async function grantEntitlementFromPurchase(input: {
  buyer: string;
  listingId: string;
  purchaseId: string;
}) {
  const res = await q(
    `
    INSERT INTO marketplace_entitlements (buyer, listing_id, granted_by_purchase_id)
    VALUES ($1,$2,$3)
    ON CONFLICT (buyer, listing_id) DO UPDATE SET granted_by_purchase_id = EXCLUDED.granted_by_purchase_id
    RETURNING *
    `,
    [input.buyer, input.listingId, input.purchaseId]
  );
  return res.rows[0];
}

export async function hasEntitlement(buyer: string, listingId: string) {
  const res = await q(
    `SELECT 1 FROM marketplace_entitlements WHERE buyer = $1 AND listing_id = $2`,
    [buyer, listingId]
  );
  return res.rowCount > 0;
}

export async function createReview(input: {
  listingId: string;
  author: string;
  rating: number;
  title?: string | null;
  body?: string | null;
}) {
  const res = await q(
    `
    INSERT INTO marketplace_reviews (listing_id, author, rating, title, body)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (listing_id, author) DO UPDATE SET
      rating = EXCLUDED.rating,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      updated_at = now()
    RETURNING *
    `,
    [input.listingId, input.author, input.rating, input.title ?? null, input.body ?? null]
  );
  return res.rows[0];
}

export async function getListingById(listingId: string) {
  const res = await q(`SELECT * FROM marketplace_listings WHERE id = $1`, [listingId]);
  return res.rows[0] ?? null;
}

export type PriceCurrency = "usd" | "usdc" | "eth" | "btc" | "xrp" | "pi";

export async function getActivePrice(listingId: string, currency: PriceCurrency) {
  const res = await q(
    `
    SELECT *
    FROM marketplace_prices
    WHERE listing_id = $1 AND currency = $2 AND active = true
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [listingId, currency]
  );
  return res.rows[0] ?? null;
}

export async function createPurchase(input: {
  buyer: string;
  listingId: string;
  priceId: string | null;
  currency: "usd" | "usdc" | "eth";
  amountInt: string; // bigint string
  metadata?: any;
}) {
  const res = await q(
    `
    INSERT INTO marketplace_purchases (buyer, listing_id, price_id, currency, amount_int, status, metadata)
    VALUES ($1,$2,$3,$4,$5::bigint,'completed',$6::jsonb)
    RETURNING *
    `,
    [input.buyer, input.listingId, input.priceId, input.currency, input.amountInt, JSON.stringify(input.metadata ?? {})]
  );
  return res.rows[0];
}

export async function requireEntitlement(buyer: string, listingId: string) {
  const res = await q(
    `SELECT 1 FROM marketplace_entitlements WHERE buyer = $1 AND listing_id = $2`,
    [buyer, listingId]
  );
  return res.rowCount > 0;
}

