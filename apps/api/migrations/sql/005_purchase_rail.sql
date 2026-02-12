-- apps/api/migrations/005_purchase_rail.sql
BEGIN;

ALTER TABLE marketplace_purchases
  ADD COLUMN IF NOT EXISTS rail text;

CREATE UNIQUE INDEX IF NOT EXISTS purchases_rail_tx_uniq
  ON marketplace_purchases(rail, chain_id, tx_hash)
  WHERE tx_hash IS NOT NULL;

COMMIT;
