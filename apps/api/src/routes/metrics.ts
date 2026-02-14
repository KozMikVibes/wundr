import type { FastifyInstance } from "fastify";

let counters: Record<string, number> = {
  http_requests_total: 0,
  purchase_verify_total: 0,
  purchase_verify_failed_total: 0,
  purchase_verify_completed_total: 0,
  purchase_verify_pending_total: 0,
};

export function inc(name: keyof typeof counters, delta = 1) {
  counters[name] = (counters[name] ?? 0) + delta;
}

export async function metricsRoutes(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    reply.type("text/plain");
    const lines = Object.entries(counters).map(([k, v]) => `${k} ${v}`);
    return reply.send(lines.join("\n") + "\n");
  });
}
