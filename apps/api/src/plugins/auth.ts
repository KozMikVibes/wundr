import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: { userId: string };
  }
  interface FastifyInstance {
    requireAuth: (req: any, reply: any) => Promise<void>;
    signJwt: (payload: { userId: string }) => string;
  }
}

export const authPlugin = fp(async (app) => {
  app.decorate("signJwt", (payload: { userId: string }) =>
    jwt.sign(payload, env.JWT_SECRET, { expiresIn: "2h" })
  );

  app.decorate("requireAuth", async (req, reply) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return reply.code(401).send({ error: "missing_token" });

    const token = h.slice("Bearer ".length);
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      req.auth = { userId: decoded.userId };
    } catch {
      return reply.code(401).send({ error: "invalid_token" });
    }
  });
});
