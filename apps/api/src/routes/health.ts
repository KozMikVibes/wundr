import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  // IMPORTANT: this module MUST NOT define "*" or "/*" routes.
  // Mount it with prefix "/health" and expose only GET "/".
  app.get("/", async (_req, reply) => {
    reply.type("text/plain");
    return reply.send("API online");
  });
}
