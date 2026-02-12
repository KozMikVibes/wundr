import { Pool, PoolClient, QueryResult } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  statement_timeout: 20_000
});

export type DbCtx = { tenantId: string; userId: string };

export async function withTenant<T>(ctx: DbCtx, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [ctx.userId]);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function q<T = any>(client: PoolClient, text: string, params: any[] = []): Promise<QueryResult<T>> {
  return client.query<T>(text, params);
}
