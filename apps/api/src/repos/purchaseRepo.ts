import { q } from "../lib/db.internal.js";

export type PurchaseRow = {
  id: string;
  buyer: string;
  listing_id: string;
  price_id: string | null;
  currency: string;
  amount_int: string;
  status: "pending" | "completed" | "failed" | "refunded" | "canceled";
  metadata: any;
  rail: string | null;
  chain_id: number | null;
  tx_hash: string | null;
  created_at: string;
};

export async function createPendingPurchase(input: {
  buyer: string;
  listingId: string;
  priceId: string | null;
  currency: string;
  amountInt: string; // bigint string
  rail: string;
  chainId: number | null;
  txHash: string;
  metadata?: any;
}) {
  const res = await q(
    `
    INSERT INTO marketplace_purchases
      (buyer, listing_id, price_id, currency, amount_int, status, metadata, rail, chain_id, tx_hash)
    VALUES
      ($1,$2,$3,$4,$5::bigint,'pending',$6::jsonb,$7,$8,$9)
    RETURNING *
    `,
    [
      input.buyer,
      input.listingId,
      input.priceId,
      input.currency,
      input.amountInt,
      JSON.stringify(input.metadata ?? {}),
      input.rail,
      input.chainId,
      input.txHash
    ]
  );
  return res.rows[0] as PurchaseRow;
}

export async function listPendingPurchases(limit: number) {
  const res = await q<PurchaseRow>(
    `
    SELECT *
    FROM marketplace_purchases
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [limit]
  );
  return res.rows;
}

export async function markPurchaseCompleted(input: {
  purchaseId: string;
  verifiedAmountInt: string; // bigint string
  verifiedConfirmations: number;
  verifiedMeta?: any;
}) {
  const res = await q(
    `
    UPDATE marketplace_purchases
    SET status = 'completed',
        verified_amount_int = $2::bigint,
        verified_confirmations = $3,
        verified_at = now(),
        metadata = metadata || $4::jsonb
    WHERE id = $1 AND status = 'pending'
    RETURNING *
    `,
    [input.purchaseId, input.verifiedAmountInt, input.verifiedConfirmations, JSON.stringify(input.verifiedMeta ?? {})]
  );
  return res.rows[0] ?? null;
}

export async function markPurchaseFailed(purchaseId: string, reason: string) {
  const res = await q(
    `
    UPDATE marketplace_purchases
    SET status = 'failed',
        metadata = metadata || jsonb_build_object('fail_reason', $2, 'failed_at', now())
    WHERE id = $1 AND status = 'pending'
    RETURNING *
    `,
    [purchaseId, reason]
  );
  return res.rows[0] ?? null;
}
