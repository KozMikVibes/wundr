import type { FastifyInstance } from "fastify";
import { qReq } from "../lib/db.js";

export async function assetRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      preHandler: [
        app.requireTenantDb,
        app.requireRole("admin"),
        app.requireCap("wundr:assets:read"),
      ],
    },
    async (req, reply) => {
      const r = await qReq(
        req,
        `SELECT *
         FROM assets
         ORDER BY created_at DESC
         LIMIT 50`
      );

      return reply.send({ ok: true, rows: r.rows });
    }
  );
}
