import type { MigrationBuilder } from "node-pg-migrate";

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Memberships
  pgm.createIndex("tenant_memberships", ["user_id"], { name: "idx_memberships_user" });
  pgm.createIndex("tenant_memberships", ["tenant_id", "role"], { name: "idx_memberships_tenant_role" });

  // Media
  pgm.createIndex("media_assets", ["tenant_id", { name: "created_at", sort: "DESC" }], { name: "idx_media_tenant_time" });
  pgm.createIndex("media_assets", ["tenant_id", "owner_user_id", { name: "created_at", sort: "DESC" }], { name: "idx_media_owner_time" });

  // Events
  pgm.createIndex("events", ["tenant_id", { name: "start_at", sort: "DESC" }], { name: "idx_events_tenant_start" });
  pgm.createIndex("event_ticket_types", ["tenant_id", "event_id"], { name: "idx_ticket_types_event" });
  pgm.createIndex("event_attendees", ["tenant_id", "event_id"], { name: "idx_attendees_event" });

  // Orders
  pgm.createIndex("orders", ["tenant_id", "buyer_user_id", { name: "created_at", sort: "DESC" }], { name: "idx_orders_buyer_time" });
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_orders_stripe_session
    ON orders (stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL;
  `);
  pgm.createIndex("order_items", ["tenant_id", "order_id"], { name: "idx_order_items_order" });

  // Academy
  pgm.createIndex("courses", ["tenant_id", "status", { name: "created_at", sort: "DESC" }], { name: "idx_courses_tenant_status" });
  pgm.createIndex("course_lessons", ["tenant_id", "course_id", "sort_order"], { name: "idx_lessons_course_sort" });
  pgm.createIndex("course_enrollments", ["tenant_id", "user_id", { name: "enrolled_at", sort: "DESC" }], { name: "idx_enrollments_user_time" });
  pgm.createIndex("course_progress", ["tenant_id", "user_id", "course_id"], { name: "idx_progress_user_course" });

  // Messaging
  pgm.createIndex("conversations", ["tenant_id", { name: "last_message_at", sort: "DESC" }], { name: "idx_convos_last" });
  pgm.createIndex("conversation_members", ["tenant_id", "user_id"], { name: "idx_convo_members_user" });
  pgm.createIndex("messages", ["tenant_id", "conversation_id", { name: "created_at", sort: "DESC" }], { name: "idx_messages_convo_time" });

  // Adventure log
  pgm.createIndex("adventure_logs", ["tenant_id", "user_id", { name: "created_at", sort: "DESC" }], { name: "idx_adventure_user_time" });
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_adventure_tags ON adventure_logs USING GIN (tags);`);
  pgm.createIndex("adventure_log_media", ["tenant_id", "adventure_log_id"], { name: "idx_adventure_media_log" });

  // Marketplace
  pgm.createIndex("marketplace_items", ["tenant_id", "status", { name: "created_at", sort: "DESC" }], { name: "idx_market_items_status_time" });
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_market_items_tags ON marketplace_items USING GIN (tags);`);
  pgm.createIndex("marketplace_item_media", ["tenant_id", "marketplace_item_id", "sort_order"], { name: "idx_market_media_item_sort" });
  pgm.createIndex("marketplace_reviews", ["tenant_id", "marketplace_item_id", { name: "created_at", sort: "DESC" }], { name: "idx_reviews_item_time" });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Index drops are optional; keeping down minimal. If you want full down symmetry, say so.
}
