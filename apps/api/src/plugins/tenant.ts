import fp from "fastify-plugin";
import { pool } from "../lib/db.js";

declare module "fastify" {
  interface FastifyRequest {
    tenant?: { tenantId: string; role: string };
  }
  interface FastifyInstance {
    requireTenant: (req: any, reply: any) => Promise<void>;
  }
}

export const tenantPlugin = fp(async (app) => {
  app.decorate("requireTenant", async (req, reply) => {
    await app.requireAuth(req, reply);
    const userId = req.auth!.userId;

    const tenantId = String(req.headers["x-tenant-id"] ?? "").trim();
    if (!tenantId) return reply.code(400).send({ error: "missing_tenant_id" });

    // Membership lookup MUST NOT rely on tenant RLS (it determines tenant)
    const r = await pool.query(
      `SELECT role, is_active FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId]
    );

    if (r.rowCount === 0 || !r.rows[0].is_active) {
      return reply.code(403).send({ error: "not_a_member" });
    }

    req.tenant = { tenantId, role: r.rows[0].role };
  });
});
