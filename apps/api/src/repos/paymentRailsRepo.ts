import { q } from "../lib/db.internal.js";

export type Rail = "eth" | "btc" | "xrp" | "pi";
export type PriceCurrency = "usd" | "usdc" | "eth" | "btc" | "xrp" | "pi";

export type PaymentRailRow = {
  id: string;
  rail: Rail;
  chain_id: number | null;
  currency: PriceCurrency;
  treasury: string;
  rpc_url: string | null;
  enabled: boolean;
  min_confirmations: number;
  metadata: any;
  created_at: string;
  updated_at: string;
};

export async function getRail(rail: Rail, chainId: number | null) {
  const res = await q<PaymentRailRow>(
    `SELECT * FROM payment_rails WHERE rail = $1 AND chain_id IS NOT DISTINCT FROM $2 LIMIT 1`,
    [rail, chainId]
  );
  return res.rows[0] ?? null;
}

export async function listRails() {
  const res = await q<PaymentRailRow>(
    `SELECT * FROM payment_rails ORDER BY rail ASC, chain_id ASC NULLS FIRST`
  );
  return res.rows;
}

export async function upsertRail(input: {
  rail: Rail;
  chainId: number | null;
  currency: PriceCurrency;
  treasury: string;
  rpcUrl?: string | null;
  enabled: boolean;
  minConfirmations: number;
  metadata?: any;
}) {
  const res = await q<PaymentRailRow>(
    `
    INSERT INTO payment_rails (rail, chain_id, currency, treasury, rpc_url, enabled, min_confirmations, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    ON CONFLICT (rail, chain_id) DO UPDATE SET
      currency = EXCLUDED.currency,
      treasury = EXCLUDED.treasury,
      rpc_url = EXCLUDED.rpc_url,
      enabled = EXCLUDED.enabled,
      min_confirmations = EXCLUDED.min_confirmations,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING *
    `,
    [
      input.rail,
      input.chainId,
      input.currency,
      input.treasury,
      input.rpcUrl ?? null,
      input.enabled,
      input.minConfirmations,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return res.rows[0];
}

export async function setRailEnabled(rail: Rail, chainId: number | null, enabled: boolean) {
  const res = await q<PaymentRailRow>(
    `
    UPDATE payment_rails
    SET enabled = $3, updated_at = now()
    WHERE rail = $1 AND chain_id IS NOT DISTINCT FROM $2
    RETURNING *
    `,
    [rail, chainId, enabled]
  );
  return res.rows[0] ?? null;
}
