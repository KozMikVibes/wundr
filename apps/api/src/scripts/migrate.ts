import fs from "node:fs";
import path from "node:path";
import { pool } from "../lib/db.js";

async function main() {
  const dir = path.resolve(process.cwd(), "migrations");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    console.log("Applying", f);
    await pool.query(sql);
  }

  console.log("Migrations applied");
  process.exit(0);
}

main().catch((e) => {
  console.error("Migration failed", e);
  process.exit(1);
});
