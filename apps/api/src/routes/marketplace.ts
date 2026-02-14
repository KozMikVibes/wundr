import { withTenant, q } from "../lib/db.internal.js";
import { z } from "zod";

export async function marketplaceRoutes(app: any) {
  app.get("/items", { preHandler: app.requireTenant }, async (req: any) => {
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };
    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `SELECT id, title, status, kind, price_cents, currency, created_at
         FROM marketplace_items
         WHERE status = 'PUBLISHED'
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
    kind: z.enum(["DIGITAL", "PHYSICAL", "SERVICE"]),
    priceCents: z.number().int().min(0).default(0),
    currency: z.string().default("USD"),
    quantityAvailable: z.number().int().positive().optional()
  });

  app.post("/items", { preHandler: app.requireTenant }, async (req: any) => {
    if (!["FOUNDER", "TENANT_ADMIN", "VENDOR"].includes(req.tenant.role)) {
      return req.reply.code(403).send({ error: "insufficient_role" });
    }

    const body = Create.parse(req.body);
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };

    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `INSERT INTO marketplace_items (tenant_id, vendor_user_id, kind, title, description, price_cents, currency, quantity_available)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, title, status`,
        [ctx.tenantId, ctx.userId, body.kind, body.title, body.description ?? null, body.priceCents, body.currency, body.quantityAvailable ?? null]
      );
      return r.rows[0];
    });
  });

  app.post("/items/:id/publish", { preHandler: app.requireTenant }, async (req: any) => {
    if (!["FOUNDER", "TENANT_ADMIN", "VENDOR"].includes(req.tenant.role)) {
      return req.reply.code(403).send({ error: "insufficient_role" });
    }

    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };
    const id = String(req.params.id);

    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `UPDATE marketplace_items SET status = 'PUBLISHED', updated_at = now()
         WHERE id = $1
         RETURNING id, status`,
        [id]
      );
      if (r.rowCount === 0) return req.reply.code(404).send({ error: "not_found" });
      return r.rows[0];
    });
  });
}
