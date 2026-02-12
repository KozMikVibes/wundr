import Fastify from "fastify";
import { authPlugin } from "./plugins/auth.js";
import { tenantPlugin } from "./plugins/tenant.js";

import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { eventRoutes } from "./routes/events.js";
import { academyRoutes } from "./routes/academy.js";
import { marketplaceRoutes } from "./routes/marketplace.js";
import { messagingRoutes } from "./routes/messaging.js";
import { adventureRoutes } from "./routes/adventure.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(authPlugin);
  await app.register(tenantPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/auth" });

  // Protected
  await app.register(meRoutes, { prefix: "/me" });
  await app.register(eventRoutes, { prefix: "/events" });
  await app.register(academyRoutes, { prefix: "/academy" });
  await app.register(marketplaceRoutes, { prefix: "/marketplace" });
  await app.register(messagingRoutes, { prefix: "/messaging" });
  await app.register(adventureRoutes, { prefix: "/adventure" });

  return app;
}
