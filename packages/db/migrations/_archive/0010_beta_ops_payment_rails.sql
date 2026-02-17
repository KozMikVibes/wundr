BEGIN;

-- Purchase status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_status') THEN
    CREATE TYPE purchase_status AS ENUM ('pending','completed','failed','refunded','canceled');
  END IF;
END$$;

-- Ensure marketplace_purchases has status as enum + payment verification fields
ALTER TABLE marketplace_purchases
  ALTER COLUMN status TYPE purchase_status
  USING CASE
    WHEN status IN ('completed','pending','failed','refunded','canceled') THEN status::purchase_status
    ELSE 'completed'::purchase_status
  END;

ALTER TABLE marketplace_purchases
  ADD COLUMN IF NOT EXISTS verified_amount_int bigint,
  ADD COLUMN IF NOT EXISTS verified_confirmations integer,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Payment rails configuration (dynamic)
-- NOTE: "currency" ties to marketplace_prices.currency (price_currency enum).
CREATE TABLE IF NOT EXISTS payment_rails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rail text NOT NULL,               -- 'eth'|'btc'|'xrp'|'pi'
  chain_id integer,                 -- required for eth, null for others
  currency price_currency NOT NULL, -- eth|btc|xrp|pi|usdc|usd...
  treasury text NOT NULL,           -- destination address/account per rail
  rpc_url text,                     -- eth and xrp can use this; btc uses rpc_url too
  enabled boolean NOT NULL DEFAULT true,
  min_confirmations integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rail, chain_id)
);

CREATE INDEX IF NOT EXISTS payment_rails_enabled_idx ON payment_rails(enabled);
CREATE INDEX IF NOT EXISTS payment_rails_currency_idx ON payment_rails(currency);

-- Fast worker scan for pending purchases
CREATE INDEX IF NOT EXISTS purchases_pending_idx
  ON marketplace_purchases(status, created_at)
  WHERE status = 'pending';

COMMIT;
