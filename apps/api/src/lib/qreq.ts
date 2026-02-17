import type { FastifyRequest } from "fastify";
import type { QueryResult, QueryResultRow } from "pg";
import { pool } from "./db.internal.js";

/**
 * Tenant/RLS query: requires req.db (request-scoped tx client).
 * This is the hard lock: if a dev forgets requireTenantDb/useRlsTx, it fails loudly.
 */
export async function qReq<T extends QueryResultRow = any>(
  req: FastifyRequest,
  text: string,
  params: readonly unknown[] = []
): Promise<QueryResult<T>> {
  if (!req.db) {
    throw new Error("RLS_REQUIRED: qReq() called without req.db. Use preHandler: [app.requireTenantDb].");
  }
  return req.db.query<T>(text, params as any[]);
}

/**
 * Explicitly non-tenant query (use sparingly).
 * Good for /health, /auth, bootstrap endpoints.
 */
export async function qPublic<T extends QueryResultRow = any>(
  text: string,
  params: readonly unknown[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as any[]);
}
