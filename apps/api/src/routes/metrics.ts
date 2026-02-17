import type { FastifyInstance } from "fastify";

export async function metricsRoutes(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    // Replace with prom-client / real metrics later
    return reply.type("text/plain").send("metrics_ok 1\n");
  });
}
