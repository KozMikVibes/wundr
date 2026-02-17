import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { pool } from "../lib/db.internal.js";

declare module "fastify" {
  interface FastifyRequest {
    db?: PoolClient; // request-scoped tx client
    _rls?: { active: boolean; mode: "tenant" | "user" };
  }

  interface FastifyInstance {
    useRlsTx: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireTenantDb: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

    // NEW: user-only RLS tx
    useUserTx: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireUserDb: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function beginTenantTx(req: FastifyRequest): Promise<PoolClient> {
  const tenantId = (req as any).tenant?.id;
  const userId = req.auth?.uid;

  if (!tenantId) throw new Error("tenant_context_missing");
  if (!userId) throw new Error("user_context_missing");

  const c = await pool.connect();
  await c.query("BEGIN");

  await c.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
  await c.query("select set_config('app.user_id', $1, true)", [userId]);

  return c;
}

async function beginUserOnlyTx(req: FastifyRequest): Promise<PoolClient> {
  const userId = req.auth?.uid;
  if (!userId) throw new Error("user_context_missing");

  const c = await pool.connect();
  await c.query("BEGIN");

  // No tenant required. Set tenant_id to empty string to avoid accidental leakage.
  await c.query("select set_config('app.tenant_id', $1, true)", [""]);
  await c.query("select set_config('app.user_id', $1, true)", [userId]);

  return c;
}

export const rlsPlugin = fp(async (app) => {
  // ---- tenant-mode tx ----
  app.decorate("useRlsTx", async (req, reply) => {
    if (req._rls?.active) return;

    try {
      const c = await beginTenantTx(req);
      req.db = c;
      req._rls = { active: true, mode: "tenant" };
    } catch (e: any) {
      return reply.code(500).send({ error: "rls_tx_init_failed", message: e?.message ?? "rls_tx_init_failed" });
    }
  });

  app.decorate("requireTenantDb", async (req, reply) => {
    await (app as any).requireAuth(req, reply);
    if (reply.sent) return;

    await (app as any).requireTenant(req, reply);
    if (reply.sent) return;

    await (app as any).useRlsTx(req, reply);
  });

  // ---- user-only tx ----
  app.decorate("useUserTx", async (req, reply) => {
    if (req._rls?.active) return;

    try {
      const c = await beginUserOnlyTx(req);
      req.db = c;
      req._rls = { active: true, mode: "user" };
    } catch (e: any) {
      return reply.code(500).send({ error: "user_tx_init_failed", message: e?.message ?? "user_tx_init_failed" });
    }
  });

  app.decorate("requireUserDb", async (req, reply) => {
    await (app as any).requireAuth(req, reply);
    if (reply.sent) return;

    // requires uid (web2 or linked-web3)
    await (app as any).requireUser(req, reply);
    if (reply.sent) return;

    await (app as any).useUserTx(req, reply);
  });

  // Commit on success
  app.addHook("onSend", async (req, _reply, payload) => {
    if (!req._rls?.active || !req.db) return payload;

    try {
      await req.db.query("COMMIT");
    } catch {
      try {
        await req.db.query("ROLLBACK");
      } catch {}
    } finally {
      try {
        req.db.release();
      } catch {}
      req.db = undefined;
      req._rls = undefined;
    }

    return payload;
  });

  // Rollback on error
  app.addHook("onError", async (req, _reply, _error) => {
    if (!req._rls?.active || !req.db) return;

    try {
      await req.db.query("ROLLBACK");
    } catch {} finally {
      try {
        req.db.release();
      } catch {}
      req.db = undefined;
      req._rls = undefined;
    }
  });
});
