import type { MigrationBuilder } from "node-pg-migrate";

export const shorthands = undefined;

const TENANT_TABLES = [
  "media_assets",
  "events",
  "event_ticket_types",
  "orders",
  "order_items",
  "event_attendees",
  "courses",
  "course_lessons",
  "course_enrollments",
  "course_progress",
  "conversations",
  "conversation_members",
  "messages",
  "adventure_logs",
  "adventure_log_media",
  "vendor_profiles",
  "marketplace_items",
  "marketplace_item_media",
  "marketplace_reviews",
] as const;

export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const t of TENANT_TABLES) {
    pgm.sql(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    pgm.sql(`
      CREATE POLICY ${t}_tenant_isolation
      ON ${t}
      USING (tenant_id = app.current_tenant_id())
      WITH CHECK (tenant_id = app.current_tenant_id());
    `);
  }

  // NOTE:
  // tenant_memberships is intentionally NOT under tenant RLS in this pass because
  // you often need to look up membership to determine tenant_id.
  // You can add RLS later with an app_role strategy (or a SECURITY DEFINER function).
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const t of TENANT_TABLES) {
    pgm.sql(`DROP POLICY IF EXISTS ${t}_tenant_isolation ON ${t};`);
    pgm.sql(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY;`);
  }
}
