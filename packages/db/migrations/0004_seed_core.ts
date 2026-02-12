import type { MigrationBuilder } from "node-pg-migrate";

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Seed tenants (safe idempotent upsert pattern using slug uniqueness)
  pgm.sql(`
    INSERT INTO tenants (slug, name)
    VALUES
      ('el-nido', 'El Nido Node'),
      ('romblon', 'Romblon Node'),
      ('siargao', 'Siargao Node')
    ON CONFLICT (slug) DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DELETE FROM tenants WHERE slug IN ('el-nido','romblon','siargao');`);
}
