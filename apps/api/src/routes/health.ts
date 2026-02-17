import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    reply.type("text/plain");
    return reply.send("API online");
  });
}
