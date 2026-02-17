BEGIN;

-- Add enum values safely (Postgres doesn't support IF NOT EXISTS for ADD VALUE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'price_currency' AND e.enumlabel = 'btc'
  ) THEN
    ALTER TYPE price_currency ADD VALUE 'btc';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'price_currency' AND e.enumlabel = 'xrp'
  ) THEN
    ALTER TYPE price_currency ADD VALUE 'xrp';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'price_currency' AND e.enumlabel = 'pi'
  ) THEN
    ALTER TYPE price_currency ADD VALUE 'pi';
  END IF;
END$$;

-- Optional: speed up "active price per listing per currency"
CREATE INDEX IF NOT EXISTS marketplace_prices_active_lookup_idx
  ON marketplace_prices(listing_id, currency, active, created_at DESC);

COMMIT;
