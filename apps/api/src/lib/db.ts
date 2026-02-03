import { Pool } from "pg";
import { loadEnv } from "./env.js";

const env = loadEnv();
export const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function q<T = any>(text: string, params: any[] = []) {
  return pool.query<T>(text, params);
}
