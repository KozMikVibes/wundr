import { q } from "../lib/db.js";

export async function grantEntitlementManual(input: {
  buyer: string;
  listingId: string;
  note?: string | null;
}) {
  // No purchase id; we set granted_by_purchase_id null.
  const res = await q(
    `
    INSERT INTO marketplace_entitlements (buyer, listing_id, granted_by_purchase_id)
    VALUES ($1,$2,NULL)
    ON CONFLICT (buyer, listing_id) DO NOTHING
    RETURNING buyer, listing_id, granted_at
    `,
    [input.buyer, input.listingId]
  );
  return res.rows[0] ?? null;
}
