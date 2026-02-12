import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pgMigrate from "node-pg-migrate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const DATABASE_URL = mustGetEnv("DATABASE_URL");
const dir = path.resolve(__dirname, "../migrations");

const cmd = process.argv[2] ?? "status"; // up|down|status
const countArg = process.argv[3]; // optional steps
const count = countArg ? Number(countArg) : undefined;

await pgMigrate({
  direction: cmd as any,
  count,
  databaseUrl: DATABASE_URL,
  dir,
  migrationsTable: "pgm_migrations",
  verbose: true,
  ignorePattern: ".*\\.d\\.ts$"
});
