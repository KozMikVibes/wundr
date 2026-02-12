import type { MigrationBuilder } from "node-pg-migrate";

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Extensions
  pgm.createExtension("pgcrypto", { ifNotExists: true });
  pgm.createExtension("citext", { ifNotExists: true });

  // Schema: app helpers
  pgm.createSchema("app", { ifNotExists: true });

  pgm.createFunction(
    "app.current_tenant_id",
    [],
    { returns: "uuid", language: "sql", stability: "stable" },
    `
      SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
    `
  );

  pgm.createFunction(
    "app.current_user_id",
    [],
    { returns: "uuid", language: "sql", stability: "stable" },
    `
      SELECT nullif(current_setting('app.user_id', true), '')::uuid
    `
  );

  // Types
  pgm.createType("tenant_role", ["FOUNDER", "TENANT_ADMIN", "TEACHER", "MEMBER", "SPONSOR", "VENDOR"], {
    ifNotExists: true,
  });

  pgm.createType("event_status", ["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"], { ifNotExists: true });
  pgm.createType("order_status", ["PENDING", "PAID", "CANCELLED", "REFUNDED", "FAILED"], { ifNotExists: true });
  pgm.createType("course_status", ["DRAFT", "PUBLISHED", "ARCHIVED"], { ifNotExists: true });
  pgm.createType("marketplace_kind", ["DIGITAL", "PHYSICAL", "SERVICE"], { ifNotExists: true });

  // Tables
  pgm.createTable(
    "tenants",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      slug: { type: "text", notNull: true, unique: true },
      name: { type: "text", notNull: true },
      status: { type: "text", notNull: true, default: "active" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "users",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      email: { type: "citext", unique: true },
      phone: { type: "text", unique: true },
      password_hash: { type: "text" },
      is_platform_admin: { type: "boolean", notNull: true, default: false },
      status: { type: "text", notNull: true, default: "active" },
      last_login_at: { type: "timestamptz" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("users", "users_email_or_phone_chk", {
    check: "(email IS NOT NULL OR phone IS NOT NULL)",
  });

  pgm.createTable(
    "tenant_memberships",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "cascade" },
      role: { type: "tenant_role", notNull: true, default: "MEMBER" },
      is_active: { type: "boolean", notNull: true, default: true },
      joined_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("tenant_memberships", "tenant_memberships_tenant_user_uniq", {
    unique: ["tenant_id", "user_id"],
  });

  pgm.createTable(
    "user_profiles",
    {
      user_id: { type: "uuid", primaryKey: true, references: "users(id)", onDelete: "cascade" },
      display_name: { type: "text", notNull: true },
      bio: { type: "text" },
      location_text: { type: "text" },
      avatar_asset_id: { type: "uuid" }, // references media_assets later
      website: { type: "text" },
      socials: { type: "jsonb", notNull: true, default: pgm.func(`'{}'::jsonb`) },
      badges: { type: "jsonb", notNull: true, default: pgm.func(`'[]'::jsonb`) },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  // Media
  pgm.createTable(
    "media_assets",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      owner_user_id: { type: "uuid", references: "users(id)", onDelete: "set null" },
      kind: { type: "text", notNull: true },
      storage_provider: { type: "text", notNull: true, default: "s3" },
      storage_bucket: { type: "text", notNull: true },
      storage_key: { type: "text", notNull: true },
      mime_type: { type: "text" },
      byte_size: { type: "bigint" },
      sha256: { type: "text" },
      metadata: { type: "jsonb", notNull: true, default: pgm.func(`'{}'::jsonb`) },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  // Events
  pgm.createTable(
    "events",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      created_by_user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "restrict" },
      title: { type: "text", notNull: true },
      description: { type: "text" },
      status: { type: "event_status", notNull: true, default: "DRAFT" },
      start_at: { type: "timestamptz", notNull: true },
      end_at: { type: "timestamptz", notNull: true },
      timezone: { type: "text", notNull: true, default: "UTC" },
      location_text: { type: "text" },
      capacity: { type: "integer" },
      cover_asset_id: { type: "uuid", references: "media_assets(id)", onDelete: "set null" },
      tags: { type: "text[]", notNull: true, default: pgm.func("ARRAY[]::text[]") },
      metadata: { type: "jsonb", notNull: true, default: pgm.func(`'{}'::jsonb`) },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("events", "events_time_chk", { check: "(end_at > start_at)" });

  pgm.createTable(
    "event_ticket_types",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      event_id: { type: "uuid", notNull: true, references: "events(id)", onDelete: "cascade" },
      name: { type: "text", notNull: true },
      currency: { type: "text", notNull: true, default: "USD" },
      price_cents: { type: "integer", notNull: true, default: 0 },
      quantity_total: { type: "integer" },
      quantity_sold: { type: "integer", notNull: true, default: 0 },
      sale_starts_at: { type: "timestamptz" },
      sale_ends_at: { type: "timestamptz" },
      is_active: { type: "boolean", notNull: true, default: true },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("event_ticket_types", "ticket_price_chk", { check: "(price_cents >= 0)" });

  // Orders (generic: event tickets + marketplace + courses)
  pgm.createTable(
    "orders",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      buyer_user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "restrict" },
      order_type: { type: "text", notNull: true },
      status: { type: "order_status", notNull: true, default: "PENDING" },
      currency: { type: "text", notNull: true, default: "USD" },
      subtotal_cents: { type: "integer", notNull: true, default: 0 },
      fees_cents: { type: "integer", notNull: true, default: 0 },
      total_cents: { type: "integer", notNull: true, default: 0 },
      stripe_checkout_session_id: { type: "text" },
      stripe_payment_intent_id: { type: "text" },
      provider_metadata: { type: "jsonb", notNull: true, default: pgm.func(`'{}'::jsonb`) },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("orders", "orders_amounts_chk", {
    check: "(subtotal_cents >= 0 AND fees_cents >= 0 AND total_cents >= 0)",
  });

  pgm.createTable(
    "order_items",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      order_id: { type: "uuid", notNull: true, references: "orders(id)", onDelete: "cascade" },
      item_type: { type: "text", notNull: true },
      ref_id: { type: "uuid", notNull: true },
      quantity: { type: "integer", notNull: true, default: 1 },
      unit_price_cents: { type: "integer", notNull: true, default: 0 },
      total_price_cents: { type: "integer", notNull: true, default: 0 },
      metadata: { type: "jsonb", notNull: true, default: pgm.func(`'{}'::jsonb`) },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("order_items", "order_items_chk", {
    check: "(quantity > 0 AND unit_price_cents >= 0 AND total_price_cents >= 0)",
  });

  pgm.createTable(
    "event_attendees",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      event_id: { type: "uuid", notNull: true, references: "events(id)", onDelete: "cascade" },
      user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "cascade" },
      order_id: { type: "uuid", references: "orders(id)", onDelete: "set null" },
      checked_in_at: { type: "timestamptz" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("event_attendees", "event_attendees_uniq", {
    unique: ["tenant_id", "event_id", "user_id"],
  });

  // Academy
  pgm.createTable(
    "courses",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      created_by_user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "restrict" },
      teacher_user_id: { type: "uuid", references: "users(id)", onDelete: "set null" },
      title: { type: "text", notNull: true },
      description: { type: "text" },
      status: { type: "course_status", notNull: true, default: "DRAFT" },
      cover_asset_id: { type: "uuid", references: "media_assets(id)", onDelete: "set null" },
      price_cents: { type: "integer", notNull: true, default: 0 },
      currency: { type: "text", notNull: true, default: "USD" },
      tags: { type: "text[]", notNull: true, default: pgm.func("ARRAY[]::text[]") },
      metadata: { type: "jsonb", notNull: true, default: pgm.func(`'{}'::jsonb`) },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("courses", "courses_price_chk", { check: "(price_cents >= 0)" });

  pgm.createTable(
    "course_lessons",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      course_id: { type: "uuid", notNull: true, references: "courses(id)", onDelete: "cascade" },
      title: { type: "text", notNull: true },
      content_type: { type: "text", notNull: true, default: "text" },
      content: { type: "text" },
      media_asset_id: { type: "uuid", references: "media_assets(id)", onDelete: "set null" },
      sort_order: { type: "integer", notNull: true, default: 0 },
      duration_seconds: { type: "integer" },
      is_published: { type: "boolean", notNull: true, default: false },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "course_enrollments",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      course_id: { type: "uuid", notNull: true, references: "courses(id)", onDelete: "cascade" },
      user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "cascade" },
      order_id: { type: "uuid", references: "orders(id)", onDelete: "set null" },
      enrolled_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("course_enrollments", "course_enrollments_uniq", {
    unique: ["tenant_id", "course_id", "user_id"],
  });

  pgm.createTable(
    "course_progress",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      course_id: { type: "uuid", notNull: true, references: "courses(id)", onDelete: "cascade" },
      lesson_id: { type: "uuid", notNull: true, references: "course_lessons(id)", onDelete: "cascade" },
      user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "cascade" },
      completed_at: { type: "timestamptz" },
      last_position_seconds: { type: "integer" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("course_progress", "course_progress_uniq", {
    unique: ["tenant_id", "lesson_id", "user_id"],
  });

  // Messaging
  pgm.createTable(
    "conversations",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      kind: { type: "text", notNull: true, default: "dm" },
      title: { type: "text" },
      created_by_user_id: { type: "uuid", references: "users(id)", onDelete: "set null" },
      last_message_at: { type: "timestamptz" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "conversation_members",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      conversation_id: { type: "uuid", notNull: true, references: "conversations(id)", onDelete: "cascade" },
      user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "cascade" },
      joined_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      last_read_at: { type: "timestamptz" },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("conversation_members", "conversation_members_uniq", {
    unique: ["tenant_id", "conversation_id", "user_id"],
  });

  pgm.createTable(
    "messages",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      conversation_id: { type: "uuid", notNull: true, references: "conversations(id)", onDelete: "cascade" },
      sender_user_id: { type: "uuid", references: "users(id)", onDelete: "set null" },
      body: { type: "text", notNull: true },
      media_asset_id: { type: "uuid", references: "media_assets(id)", onDelete: "set null" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  // Adventure logs
  pgm.createTable(
    "adventure_logs",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "cascade" },
      title: { type: "text", notNull: true },
      body: { type: "text" },
      visibility: { type: "text", notNull: true, default: "private" },
      location_text: { type: "text" },
      started_on: { type: "date" },
      ended_on: { type: "date" },
      tags: { type: "text[]", notNull: true, default: pgm.func("ARRAY[]::text[]") },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("adventure_logs", "adventure_date_chk", {
    check: "(ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)",
  });

  pgm.createTable(
    "adventure_log_media",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      adventure_log_id: { type: "uuid", notNull: true, references: "adventure_logs(id)", onDelete: "cascade" },
      media_asset_id: { type: "uuid", notNull: true, references: "media_assets(id)", onDelete: "cascade" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  // Marketplace
  pgm.createTable(
    "vendor_profiles",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "cascade" },
      display_name: { type: "text", notNull: true },
      bio: { type: "text" },
      payout_metadata: { type: "jsonb", notNull: true, default: pgm.func(`'{}'::jsonb`) },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("vendor_profiles", "vendor_profiles_uniq", { unique: ["tenant_id", "user_id"] });

  pgm.createTable(
    "marketplace_items",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      vendor_user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "restrict" },
      kind: { type: "marketplace_kind", notNull: true },
      status: { type: "text", notNull: true, default: "DRAFT" },
      title: { type: "text", notNull: true },
      description: { type: "text" },
      currency: { type: "text", notNull: true, default: "USD" },
      price_cents: { type: "integer", notNull: true, default: 0 },
      quantity_available: { type: "integer" },
      cover_asset_id: { type: "uuid", references: "media_assets(id)", onDelete: "set null" },
      tags: { type: "text[]", notNull: true, default: pgm.func("ARRAY[]::text[]") },
      metadata: { type: "jsonb", notNull: true, default: pgm.func(`'{}'::jsonb`) },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("marketplace_items", "market_items_price_chk", { check: "(price_cents >= 0)" });

  pgm.createTable(
    "marketplace_item_media",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      marketplace_item_id: { type: "uuid", notNull: true, references: "marketplace_items(id)", onDelete: "cascade" },
      media_asset_id: { type: "uuid", notNull: true, references: "media_assets(id)", onDelete: "cascade" },
      sort_order: { type: "integer", notNull: true, default: 0 },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "marketplace_reviews",
    {
      id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
      tenant_id: { type: "uuid", notNull: true, references: "tenants(id)", onDelete: "cascade" },
      marketplace_item_id: { type: "uuid", notNull: true, references: "marketplace_items(id)", onDelete: "cascade" },
      author_user_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "cascade" },
      rating: { type: "integer", notNull: true },
      body: { type: "text" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.addConstraint("marketplace_reviews", "marketplace_reviews_uniq", {
    unique: ["tenant_id", "marketplace_item_id", "author_user_id"],
  });

  pgm.addConstraint("marketplace_reviews", "marketplace_reviews_rating_chk", {
    check: "(rating >= 1 AND rating <= 5)",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop tables in reverse dependency order
  pgm.dropTable("marketplace_reviews", { ifExists: true });
  pgm.dropTable("marketplace_item_media", { ifExists: true });
  pgm.dropTable("marketplace_items", { ifExists: true });
  pgm.dropTable("vendor_profiles", { ifExists: true });

  pgm.dropTable("adventure_log_media", { ifExists: true });
  pgm.dropTable("adventure_logs", { ifExists: true });

  pgm.dropTable("messages", { ifExists: true });
  pgm.dropTable("conversation_members", { ifExists: true });
  pgm.dropTable("conversations", { ifExists: true });

  pgm.dropTable("course_progress", { ifExists: true });
  pgm.dropTable("course_enrollments", { ifExists: true });
  pgm.dropTable("course_lessons", { ifExists: true });
  pgm.dropTable("courses", { ifExists: true });

  pgm.dropTable("event_attendees", { ifExists: true });
  pgm.dropTable("order_items", { ifExists: true });
  pgm.dropTable("orders", { ifExists: true });
  pgm.dropTable("event_ticket_types", { ifExists: true });
  pgm.dropTable("events", { ifExists: true });

  pgm.dropTable("media_assets", { ifExists: true });

  pgm.dropTable("user_profiles", { ifExists: true });
  pgm.dropTable("tenant_memberships", { ifExists: true });
  pgm.dropTable("users", { ifExists: true });
  pgm.dropTable("tenants", { ifExists: true });

  // Drop types
  pgm.dropType("marketplace_kind", { ifExists: true });
  pgm.dropType("course_status", { ifExists: true });
  pgm.dropType("order_status", { ifExists: true });
  pgm.dropType("event_status", { ifExists: true });
  pgm.dropType("tenant_role", { ifExists: true });

  // Drop functions/schema
  pgm.dropFunction("app.current_user_id", [], { ifExists: true });
  pgm.dropFunction("app.current_tenant_id", [], { ifExists: true });
  pgm.dropSchema("app", { ifExists: true, cascade: true });
}
