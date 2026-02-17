BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'server_role') THEN
    CREATE TYPE server_role AS ENUM ('user','creator','moderator','admin');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS user_roles (
  address    text NOT NULL,
  role       server_role NOT NULL,
  granted_by text,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (address, role)
);

CREATE INDEX IF NOT EXISTS user_roles_address_idx ON user_roles(address);

COMMIT;
