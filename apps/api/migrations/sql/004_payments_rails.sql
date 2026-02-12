BEGIN;

ALTER TABLE marketplace_purchases
  ADD COLUMN IF NOT EXISTS chain_id integer,
  ADD COLUMN IF NOT EXISTS tx_hash text;

-- prevent reusing the same tx hash for multiple purchases
CREATE UNIQUE INDEX IF NOT EXISTS purchases_chain_txhash_uniq
  ON marketplace_purchases(chain_id, tx_hash)
  WHERE tx_hash IS NOT NULL;

COMMIT;
