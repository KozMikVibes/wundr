import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { pool } from "../lib/db.internal.js";

const TenantIdSchema = z.string().uuid();

declare module "fastify" {
  interface FastifyRequest {
    tenant?: { id: string };
  }

  interface FastifyInstance {
    requireTenant: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function isMember(tenantId: string, userId: string) {
  const r = await pool.query<{ ok: boolean }>(
    `SELECT true as ok
     FROM tenant_memberships
     WHERE tenant_id = $1 AND user_id = $2
     LIMIT 1`,
    [tenantId, userId]
  );
  return (r.rowCount ?? 0) > 0;
}

export const tenantPlugin = fp(async (app) => {
  app.decorate("requireTenant", async (req: FastifyRequest, reply: FastifyReply) => {
    const raw = req.headers["x-tenant-id"];
    const tid = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;

    if (!tid) {
      return reply.code(400).send({ error: "tenant_required", message: "x-tenant-id header is required" });
    }

    let tenantId: string;
    try {
      tenantId = TenantIdSchema.parse(tid);
    } catch {
      return reply.code(400).send({ error: "tenant_invalid", message: "x-tenant-id must be a UUID" });
    }

    // Hard stance (for now): tenant-scoped endpoints require a user id.
    // Later we’ll enable web3 sessions to set uid by linking wallets.
    const uid = req.auth?.uid;
    if (!uid) {
      return reply.code(403).send({
        error: "user_required",
        message: "Tenant-scoped endpoints require a user session (wallet-only not yet linked).",
      });
    }

    const ok = await isMember(tenantId, uid);
    if (!ok) {
      return reply.code(403).send({ error: "tenant_forbidden", message: "Not a member of this tenant." });
    }

    req.tenant = { id: tenantId };
  });
});
