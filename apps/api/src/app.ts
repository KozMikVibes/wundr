import Fastify from "fastify";

import { securityPlugin } from "./plugins/security.js";
import { authPlugin } from "./plugins/auth.js";
import { authzPlugin } from "./plugins/authz.js";
import { tenantPlugin } from "./plugins/tenant.js";
import { rlsPlugin } from "./plugins/rls.js";

// Routes
import { assetRoutes } from "./routes/assets.js";
import { healthRoutes } from "./routes/health.js";
import { metricsRoutes } from "./routes/metrics.js";

import { authRoutes } from "./routes/auth/index.js";
import { meRoutes } from "./routes/me.js";
import { eventRoutes } from "./routes/events.js";
import { academyRoutes } from "./routes/academy.js";
import { marketplaceRoutes } from "./routes/marketplace.js";
import { messagingRoutes } from "./routes/messaging.js";
import { adventureRoutes } from "./routes/adventure.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  // --- core security headers/rate-limits/cors (no auth required)
  await app.register(securityPlugin);

  // --- auth + authz attach req.auth, then enforce roles/caps
  await app.register(authPlugin);
  await app.register(authzPlugin);

  // --- tenant context and db rls context
  await app.register(tenantPlugin);
  await app.register(rlsPlugin);

  // --- public utility routes
  // Hard-mount health at /health ONLY
  await app.register(healthRoutes, { prefix: "/health" });

  // Metrics should mount at /metrics and define GET "/" internally
  await app.register(metricsRoutes, { prefix: "/metrics" });

  // --- public auth routes
  await app.register(authRoutes, { prefix: "/auth" });

  // --- app routes
  await app.register(assetRoutes, { prefix: "/assets" });

  // Protected (these route modules should enforce auth internally or via preHandler)
  await app.register(meRoutes, { prefix: "/me" });
  await app.register(eventRoutes, { prefix: "/events" });
  await app.register(academyRoutes, { prefix: "/academy" });
  await app.register(marketplaceRoutes, { prefix: "/marketplace" });

  // Canonical naming (public API surface)
  await app.register(messagingRoutes, { prefix: "/smoke-signals" });
  await app.register(adventureRoutes, { prefix: "/wanderlust" });

  // ---- explicit 404 so missing routes don't look "OK"
  app.setNotFoundHandler(async (req, reply) => {
    return reply.code(404).send({
      error: "not_found",
      method: req.method,
      path: req.url,
    });
  });

  // ---- centralized error handler (keeps errors JSON)
  app.setErrorHandler(async (err: any, _req, reply) => {
  const status =
    err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;

  if (status >= 500) app.log.error(err);

  return reply.code(status).send({
    error: err?.code ?? "internal_error",
    message: err?.message ?? "Internal Error",
  });
});


  return app;
}
