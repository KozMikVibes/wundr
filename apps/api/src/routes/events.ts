import { withTenant, q } from "../lib/db.js";
import { z } from "zod";

export async function eventRoutes(app: any) {
  app.get("/", { preHandler: app.requireTenant }, async (req: any) => {
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };

    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `SELECT id, title, status, start_at, end_at, location_text, capacity, created_at
         FROM events
         ORDER BY start_at DESC
         LIMIT 100`,
        []
      );
      return r.rows;
    });
  });

  const Create = z.object({
    title: z.string().min(2),
    description: z.string().optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    timezone: z.string().default("UTC"),
    locationText: z.string().optional(),
    capacity: z.number().int().positive().optional()
  });

  app.post("/", { preHandler: app.requireTenant }, async (req: any) => {
    if (!["FOUNDER", "TENANT_ADMIN"].includes(req.tenant.role)) {
      return req.reply.code(403).send({ error: "insufficient_role" });
    }

    const body = Create.parse(req.body);
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };

    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `INSERT INTO events (tenant_id, created_by_user_id, title, description, start_at, end_at, timezone, location_text, capacity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, title, status, start_at, end_at`,
        [ctx.tenantId, ctx.userId, body.title, body.description ?? null, body.startAt, body.endAt, body.timezone, body.locationText ?? null, body.capacity ?? null]
      );
      return r.rows[0];
    });
  });

  app.post("/:id/publish", { preHandler: app.requireTenant }, async (req: any) => {
    if (!["FOUNDER", "TENANT_ADMIN"].includes(req.tenant.role)) {
      return req.reply.code(403).send({ error: "insufficient_role" });
    }

    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };
    const id = String(req.params.id);

    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `UPDATE events SET status = 'PUBLISHED', updated_at = now()
         WHERE id = $1
         RETURNING id, status`,
        [id]
      );
      if (r.rowCount === 0) return req.reply.code(404).send({ error: "not_found" });
      return r.rows[0];
    });
  });
}
