-- =========================================
-- WUNDR V1 Postgres Schema (Core)
-- =========================================

BEGIN;

-- -------------------------
-- Extensions
-- -------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive emails

-- -------------------------
-- Helpers: session context
-- -------------------------
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- =========================================
-- 2) Identity + Tenancy
-- =========================================

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE, -- e.g. el-nido, romblon
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active', -- active|suspended|deleted
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE,
  phone text UNIQUE,
  password_hash text, -- nullable if passwordless later
  is_platform_admin boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active', -- active|locked|deleted
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Roles are per-tenant via memberships.role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_role') THEN
    CREATE TYPE tenant_role AS ENUM (
      'FOUNDER',
      'TENANT_ADMIN',
      'TEACHER',
      'MEMBER',
      'SPONSOR',
      'VENDOR'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role tenant_role NOT NULL DEFAULT 'MEMBER',
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON tenant_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON tenant_memberships (tenant_id, role);

-- User profile is global (one per user), but safe to read within tenant context.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  bio text,
  location_text text,
  avatar_asset_id uuid, -- references media_assets(id) later
  website text,
  socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================
-- 3) Media Assets (S3 pointers)
-- =========================================

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL, -- image|video|audio|doc|other
  storage_provider text NOT NULL DEFAULT 's3',
  storage_bucket text NOT NULL,
  storage_key text NOT NULL, -- S3 key
  mime_type text,
  byte_size bigint,
  sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_tenant ON media_assets (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media_assets (tenant_id, owner_user_id, created_at DESC);

-- =========================================
-- 4) Events + Ticketing
-- =========================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE event_status AS ENUM ('DRAFT','PUBLISHED','CANCELLED','COMPLETED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  status event_status NOT NULL DEFAULT 'DRAFT',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  location_text text,
  capacity integer,
  cover_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_events_tenant_time ON events (tenant_id, start_at DESC);

CREATE TABLE IF NOT EXISTS event_ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  price_cents integer NOT NULL DEFAULT 0,
  quantity_total integer,
  quantity_sold integer NOT NULL DEFAULT 0,
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON event_ticket_types (tenant_id, event_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('PENDING','PAID','CANCELLED','REFUNDED','FAILED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_type text NOT NULL, -- event_ticket|marketplace
  status order_status NOT NULL DEFAULT 'PENDING',
  currency text NOT NULL DEFAULT 'USD',
  subtotal_cents integer NOT NULL DEFAULT 0,
  fees_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (subtotal_cents >= 0 AND fees_cents >= 0 AND total_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_buyer ON orders (tenant_id, buyer_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_orders_stripe_session ON orders (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type text NOT NULL, -- event_ticket_type|marketplace_item
  ref_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_cents integer NOT NULL DEFAULT 0,
  total_price_cents integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity > 0 AND unit_price_cents >= 0 AND total_price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (tenant_id, order_id);

-- Event attendance record (free RSVP OR paid ticket)
CREATE TABLE IF NOT EXISTS event_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  checked_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_attendees_event ON event_attendees (tenant_id, event_id);

-- =========================================
-- 5) Academy
-- =========================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'course_status') THEN
    CREATE TYPE course_status AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  teacher_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status course_status NOT NULL DEFAULT 'DRAFT',
  cover_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_courses_tenant_status ON courses (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  content_type text NOT NULL DEFAULT 'text', -- text|video|audio|link
  content text, -- markdown or link
  media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  duration_seconds integer,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_course ON course_lessons (tenant_id, course_id, sort_order);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, course_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user ON course_enrollments (tenant_id, user_id, enrolled_at DESC);

CREATE TABLE IF NOT EXISTS course_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at timestamptz,
  last_position_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, lesson_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user_course ON course_progress (tenant_id, user_id, course_id);

-- =========================================
-- 6) Messaging (tenant-isolated)
-- =========================================

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'dm', -- dm|group|event|marketplace
  title text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_convos_tenant_last ON conversations (tenant_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  UNIQUE (tenant_id, conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_convo_members_user ON conversation_members (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_convo_time ON messages (tenant_id, conversation_id, created_at DESC);

-- =========================================
-- 7) Adventure Log (tenant-isolated journaling)
-- =========================================

CREATE TABLE IF NOT EXISTS adventure_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  visibility text NOT NULL DEFAULT 'private', -- private|tenant|public (public later)
  location_text text,
  started_on date,
  ended_on date,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)
);

CREATE INDEX IF NOT EXISTS idx_adventure_user ON adventure_logs (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adventure_tags ON adventure_logs USING GIN (tags);

CREATE TABLE IF NOT EXISTS adventure_log_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  adventure_log_id uuid NOT NULL REFERENCES adventure_logs(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adventure_media_log ON adventure_log_media (tenant_id, adventure_log_id);

-- =========================================
-- 8) Marketplace (tenant-isolated)
-- =========================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketplace_kind') THEN
    CREATE TYPE marketplace_kind AS ENUM ('DIGITAL','PHYSICAL','SERVICE');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS vendor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  bio text,
  payout_metadata jsonb NOT NULL DEFAULT '{}'::jsonb, -- stripe acct id, etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS marketplace_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind marketplace_kind NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT', -- DRAFT|PUBLISHED|ARCHIVED
  title text NOT NULL,
  description text,
  currency text NOT NULL DEFAULT 'USD',
  price_cents integer NOT NULL DEFAULT 0,
  quantity_available integer, -- null = unlimited (digital/service)
  cover_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_market_items_tenant_status ON marketplace_items (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_items_tags ON marketplace_items USING GIN (tags);

CREATE TABLE IF NOT EXISTS marketplace_item_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  marketplace_item_id uuid NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_media_item ON marketplace_item_media (tenant_id, marketplace_item_id, sort_order);

-- Reviews (V1 optional; safe to include)
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  marketplace_item_id uuid NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, marketplace_item_id, author_user_id),
  CHECK (rating >= 1 AND rating <= 5)
);

CREATE INDEX IF NOT EXISTS idx_reviews_item ON marketplace_reviews (tenant_id, marketplace_item_id, created_at DESC);

-- =========================================
-- 9) RLS Enable + Policies (Tenant Isolation)
-- =========================================

-- Helper macro: apply to tenant-scoped tables
-- Policy: tenant_id must match app.current_tenant_id()

-- Media
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_tenant_isolation ON media_assets
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_tenant_isolation ON events
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE event_ticket_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_types_tenant_isolation ON event_ticket_types
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendees_tenant_isolation ON event_attendees
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_tenant_isolation ON orders
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_items_tenant_isolation ON order_items
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Academy
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY courses_tenant_isolation ON courses
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE course_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY lessons_tenant_isolation ON course_lessons
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrollments_tenant_isolation ON course_enrollments
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY progress_tenant_isolation ON course_progress
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Messaging
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY convos_tenant_isolation ON conversations
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY convo_members_tenant_isolation ON conversation_members
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_tenant_isolation ON messages
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Adventure log
ALTER TABLE adventure_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY adventure_tenant_isolation ON adventure_logs
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE adventure_log_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY adventure_media_tenant_isolation ON adventure_log_media
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Marketplace
ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendors_tenant_isolation ON vendor_profiles
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE marketplace_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY market_items_tenant_isolation ON marketplace_items
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE marketplace_item_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY market_media_tenant_isolation ON marketplace_item_media
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY market_reviews_tenant_isolation ON marketplace_reviews
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
