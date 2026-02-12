import { withTenant, q } from "../lib/db.js";
import { z } from "zod";

export async function academyRoutes(app: any) {
  app.get("/courses", { preHandler: app.requireTenant }, async (req: any) => {
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };
    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `SELECT id, title, status, price_cents, currency, created_at
         FROM courses
         ORDER BY created_at DESC
         LIMIT 100`,
        []
      );
      return r.rows;
    });
  });

  const Create = z.object({
    title: z.string().min(2),
    description: z.string().optional(),
    priceCents: z.number().int().min(0).default(0),
    currency: z.string().default("USD")
  });

  app.post("/courses", { preHandler: app.requireTenant }, async (req: any) => {
    if (!["FOUNDER", "TENANT_ADMIN", "TEACHER"].includes(req.tenant.role)) {
      return req.reply.code(403).send({ error: "insufficient_role" });
    }

    const body = Create.parse(req.body);
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };

    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `INSERT INTO courses (tenant_id, created_by_user_id, teacher_user_id, title, description, price_cents, currency)
         VALUES ($1,$2,$2,$3,$4,$5,$6)
         RETURNING id, title, status`,
        [ctx.tenantId, ctx.userId, body.title, body.description ?? null, body.priceCents, body.currency]
      );
      return r.rows[0];
    });
  });
}
