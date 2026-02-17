import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { loadEnv } from "./env.js";

const env = loadEnv();

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export type DbCtx = { db?: PoolClient };

export async function q<T extends QueryResultRow = any>(
  text: string,
  params?: readonly unknown[]
): Promise<QueryResult<T>>;
export async function q<T extends QueryResultRow = any>(
  ctxOrClient: DbCtx | PoolClient,
  text: string,
  params?: readonly unknown[]
): Promise<QueryResult<T>>;
export async function q<T extends QueryResultRow = any>(
  a: string | DbCtx | PoolClient,
  b?: string | readonly unknown[],
  c?: readonly unknown[]
): Promise<QueryResult<T>> {
  if (typeof a === "string") {
    const text = a;
    const params = (b as readonly unknown[] | undefined) ?? [];
    return pool.query<T>(text, params as any[]);
  }

  const text = b as string;
  const params = c ?? [];

  const client =
    typeof (a as PoolClient).query === "function"
      ? (a as PoolClient)
      : (a as DbCtx).db;

  return (client ?? pool).query<T>(text, params as any[]);
}

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function withRls<T>(
  ctx: { tenantId: string; userId?: string },
  fn: (c: PoolClient) => Promise<T>
): Promise<T> {
  return withTx(async (c) => {
    await c.query("select set_config('app.tenant_id', $1, true)", [ctx.tenantId]);
    await c.query("select set_config('app.user_id', $1, true)", [ctx.userId ?? ""]);
    return fn(c);
  });
}

export async function withTenant<T>(
  ctx: { tenantId: string; userId?: string },
  fn: (c: PoolClient) => Promise<T>
): Promise<T> {
  return withRls(ctx, fn);
}
