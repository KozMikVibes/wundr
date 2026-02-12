import { withTenant, q } from "../lib/db.js";
import { z } from "zod";

export async function adventureRoutes(app: any) {
  app.get("/logs", { preHandler: app.requireTenant }, async (req: any) => {
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };
    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `SELECT id, title, location_text, started_on, ended_on, tags, created_at
         FROM adventure_logs
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [ctx.userId]
      );
      return r.rows;
    });
  });

  const Create = z.object({
    title: z.string().min(2),
    body: z.string().optional(),
    locationText: z.string().optional(),
    startedOn: z.string().optional(),
    endedOn: z.string().optional(),
    tags: z.array(z.string()).optional()
  });

  app.post("/logs", { preHandler: app.requireTenant }, async (req: any) => {
    const body = Create.parse(req.body);
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };

    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `INSERT INTO adventure_logs (tenant_id, user_id, title, body, location_text, started_on, ended_on, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, created_at`,
        [ctx.tenantId, ctx.userId, body.title, body.body ?? null, body.locationText ?? null,
         body.startedOn ?? null, body.endedOn ?? null, (body.tags ?? [])]
      );
      return r.rows[0];
    });
  });
}
