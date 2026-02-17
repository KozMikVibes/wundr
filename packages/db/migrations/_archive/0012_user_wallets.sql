-- 010_user_wallets.sql
-- Wallet <-> user linking
-- Idempotent + safe

BEGIN;

CREATE TABLE IF NOT EXISTS user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address text NOT NULL,
  chain_id int NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Normalize address uniqueness: lowercase(address) per chain
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'user_wallets_chain_address_ux'
  ) THEN
    CREATE UNIQUE INDEX user_wallets_chain_address_ux
      ON user_wallets (chain_id, lower(address));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'user_wallets_user_idx'
  ) THEN
    CREATE INDEX user_wallets_user_idx
      ON user_wallets (user_id);
  END IF;
END $$;

-- RLS: wallet links are user-owned (global table; not tenant-partitioned)
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;

-- Drop/recreate policies idempotently
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_wallets' AND policyname='uw_select_own') THEN
    DROP POLICY uw_select_own ON user_wallets;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_wallets' AND policyname='uw_insert_own') THEN
    DROP POLICY uw_insert_own ON user_wallets;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_wallets' AND policyname='uw_delete_own') THEN
    DROP POLICY uw_delete_own ON user_wallets;
  END IF;
END $$;

-- NOTE: app.current_user_id() should already exist in your DB migrations.
-- It should return uuid or null based on current_setting('app.user_id', true).
CREATE POLICY uw_select_own
  ON user_wallets
  FOR SELECT
  USING (user_id = app.current_user_id());

CREATE POLICY uw_insert_own
  ON user_wallets
  FOR INSERT
  WITH CHECK (user_id = app.current_user_id());

CREATE POLICY uw_delete_own
  ON user_wallets
  FOR DELETE
  USING (user_id = app.current_user_id());

COMMIT;
