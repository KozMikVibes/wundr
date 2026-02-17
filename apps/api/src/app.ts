import Fastify from "fastify";

import { securityPlugin } from "./plugins/security.js";
import { authPlugin } from "./plugins/auth.js";
import { authzPlugin } from "./plugins/authz.js";
import { tenantPlugin } from "./plugins/tenant.js";
import { rlsPlugin } from "./plugins/rls.js";

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

  await app.register(securityPlugin);

  await app.register(authPlugin);
  await app.register(authzPlugin);

  await app.register(tenantPlugin);
  await app.register(rlsPlugin);

  // Public utility routes
  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(metricsRoutes, { prefix: "/metrics" });

  // Public auth routes
  await app.register(authRoutes, { prefix: "/auth" });

  // Core
  await app.register(assetRoutes, { prefix: "/assets" });

  // Protected
  await app.register(meRoutes, { prefix: "/me" });
  await app.register(eventRoutes, { prefix: "/events" });
  await app.register(academyRoutes, { prefix: "/academy" });
  await app.register(marketplaceRoutes, { prefix: "/marketplace" });

  // Canonical naming
  await app.register(messagingRoutes, { prefix: "/smoke-signals" });
  await app.register(adventureRoutes, { prefix: "/wanderlust" });

  // HARD 404 (no more “API online” on random paths)
  app.setNotFoundHandler(async (req, reply) => {
    return reply.code(404).send({
      error: "not_found",
      method: req.method,
      path: req.url,
    });
  });

  // Hardened JSON errors
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
