// apps/api/migrate.config.cjs
module.exports = {
  dir: "migrations",
  migrationsTable: "schema_migrations",
  // By default, node-pg-migrate uses DATABASE_URL if present
};
