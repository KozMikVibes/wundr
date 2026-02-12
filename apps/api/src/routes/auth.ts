import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../lib/db.js";

export async function authRoutes(app: FastifyInstance) {
  const Register = z.object({
    email: z.string().email(),
    password: z.string().min(10),
    displayName: z.string().min(2),
  });

  app.post(
    "/register",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = Register.parse((req as any).body);

      // Keep it deterministic until you add BCRYPT_COST to env schema
      const hash = await bcrypt.hash(body.password, 12);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const u = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash)
           VALUES ($1, $2)
           RETURNING id`,
          [body.email, hash]
        );

        const userId = u.rows[0]?.id;
        if (!userId) throw new Error("user_insert_failed");

        await client.query(
          `INSERT INTO user_profiles (user_id, display_name)
           VALUES ($1, $2)`,
          [userId, body.displayName]
        );

        await client.query("COMMIT");

        const token = (app as any).signJwt({ userId });
        return reply.code(201).send({ token });
      } catch (e: any) {
        await client.query("ROLLBACK");
        if (e?.code === "23505") return reply.code(409).send({ error: "email_taken" });
        throw e;
      } finally {
        client.release();
      }
    }
  );

  const Login = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  app.post(
    "/login",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = Login.parse((req as any).body);

      const u = await pool.query<{ id: string; password_hash: string | null }>(
        `SELECT id, password_hash
         FROM users
         WHERE email = $1 AND status = 'active'
         LIMIT 1`,
        [body.email]
      );

      if ((u.rowCount ?? 0) === 0) return reply.code(401).send({ error: "invalid_credentials" });

      const row = u.rows[0]!;
      const ok = await bcrypt.compare(body.password, row.password_hash ?? "");
      if (!ok) return reply.code(401).send({ error: "invalid_credentials" });

      const token = (app as any).signJwt({ userId: row.id });
      return reply.send({ token });
    }
  );
}
