import { withTenant, q } from "../lib/db.js";
import { z } from "zod";

export async function messagingRoutes(app: any) {
  app.get("/inbox", { preHandler: app.requireTenant }, async (req: any) => {
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };
    return withTenant(ctx, async (c) => {
      const r = await q(c,
        `SELECT conv.id, conv.kind, conv.title, conv.last_message_at
         FROM conversations conv
         JOIN conversation_members cm ON cm.conversation_id = conv.id
         WHERE cm.user_id = $1
         ORDER BY conv.last_message_at DESC NULLS LAST, conv.created_at DESC
         LIMIT 100`,
        [ctx.userId]
      );
      return r.rows;
    });
  });

  const Create = z.object({
    kind: z.string().default("dm"),
    title: z.string().optional(),
    memberUserIds: z.array(z.string().uuid()).min(1)
  });

  app.post("/conversations", { preHandler: app.requireTenant }, async (req: any) => {
    const body = Create.parse(req.body);
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };

    const memberIds = Array.from(new Set([ctx.userId, ...body.memberUserIds]));

    return withTenant(ctx, async (c) => {
      const conv = await q(c,
        `INSERT INTO conversations (tenant_id, kind, title, created_by_user_id)
         VALUES ($1,$2,$3,$4)
         RETURNING id`,
        [ctx.tenantId, body.kind, body.title ?? null, ctx.userId]
      );

      for (const uid of memberIds) {
        await q(c,
          `INSERT INTO conversation_members (tenant_id, conversation_id, user_id)
           VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [ctx.tenantId, conv.rows[0].id, uid]
        );
      }

      return { id: conv.rows[0].id };
    });
  });

  const Send = z.object({ body: z.string().min(1).max(8000) });

  app.post("/conversations/:id/messages", { preHandler: app.requireTenant }, async (req: any) => {
    const body = Send.parse(req.body);
    const conversationId = String(req.params.id);
    const ctx = { tenantId: req.tenant.tenantId, userId: req.auth.userId };

    return withTenant(ctx, async (c) => {
      // Ensure membership
      const mem = await q(c,
        `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, ctx.userId]
      );
      if (mem.rowCount === 0) return req.reply.code(403).send({ error: "not_in_conversation" });

      const msg = await q(c,
        `INSERT INTO messages (tenant_id, conversation_id, sender_user_id, body)
         VALUES ($1,$2,$3,$4)
         RETURNING id, created_at`,
        [ctx.tenantId, conversationId, ctx.userId, body.body]
      );

      await q(c,
        `UPDATE conversations SET last_message_at = now() WHERE id = $1`,
        [conversationId]
      );

      return msg.rows[0];
    });
  });
}
