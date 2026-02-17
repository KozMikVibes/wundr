import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { RegisterSchema, LoginSchema } from "./schema.js";
import { issueSession } from "./service.js";
import { findActiveUserByEmail } from "./repo.js";
import { qPublic } from "../../lib/db.js";

export async function authWeb2Routes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const body = RegisterSchema.parse((req as any).body);

    const hash = await bcrypt.hash(body.password, 12);

    try {
      const u = await qPublic<{ id: string }>(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id`,
        [body.email, hash]
      );

      const userId = u.rows[0]?.id;
      if (!userId) throw new Error("user_insert_failed");

      await qPublic(
        `INSERT INTO user_profiles (user_id, display_name)
         VALUES ($1, $2)`,
        [userId, body.displayName]
      );

      const { token, claims } = issueSession(app, reply, {
        amr: "web2",
        uid: userId,
        email: body.email,
        roles: ["user"],
        caps: [],
      });

      return reply.code(201).send({ ok: true, token, claims });
    } catch (e: any) {
      if (e?.code === "23505") return reply.code(409).send({ error: "email_taken" });
      throw e;
    }
  });

  app.post("/login", async (req, reply) => {
    const body = LoginSchema.parse((req as any).body);

    const u = await findActiveUserByEmail(body.email);
    if (!u) return reply.code(401).send({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(body.password, u.password_hash ?? "");
    if (!ok) return reply.code(401).send({ error: "invalid_credentials" });

    const { token, claims } = issueSession(app, reply, {
      amr: "web2",
      uid: u.id,
      email: u.email,
      roles: ["user"],
      caps: [],
    });

    return reply.send({ ok: true, token, claims });
  });
}
