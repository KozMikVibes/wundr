import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";

import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { apiLimiter, authLimiter } from "./lib/rateLimiters.js";
import { errorHandler, notFound } from "./middleware/error.js";

import { auth1caRouter } from "./routes/auth.1ca.js";
import { learnRouter } from "./routes/learn.js";
import { requireAuth } from "./middleware/auth.js";
import { requireCsrf } from "./lib/csrf.js";
import { marketplaceRouter } from "./routes/marketplace.js";
import { publishRouter } from "./routes/publish.js";
import { adminRolesRouter } from "./routes/admin.roles.js";
import { marketplacePurchaseVerifyRouter } from "./routes/marketplace.purchase.verify.js";
import { adminPaymentRailsRouter } from "./routes/admin.paymentRails.js";
import { adminSupportRouter } from "./routes/admin.support.js";
import { metricsRouter, inc } from "./routes/metrics.js";


export function createApp() {
  const env = loadEnv();
  const app = express();

  app.disable("x-powered-by");
  app.use(pinoHttp({ logger }));

  app.use(cors({
    origin: env.CORS_ORIGIN.split(",").map(s => s.trim()),
    credentials: true
  }));

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // broad limiter
  app.use(apiLimiter);

  // auth (tighter)
  app.use("/auth/1ca", authLimiter, auth1caRouter());

  // Example: state-changing routes require CSRF + auth
  app.use("/learn", requireAuth, learnRouter()); // read routes should be fine; enforce CSRF on write inside learnRouter

  // Example: global CSRF for unsafe methods (optional style)
  app.use((req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !req.path.startsWith("/auth/1ca")) {
      return requireCsrf(req, res, next);
    }
    next();
  });

  // ...
  app.use("/market", requireAuth, marketplaceRouter());

  // ...
  app.use("/publish", publishRouter());

  app.use("/admin/roles", adminRolesRouter());

  app.use("/market", marketplacePurchaseVerifyRouter());

  app.use("/admin/payment-rails", adminPaymentRailsRouter());

  app.use("/admin/support", adminSupportRouter());

  app.use((req, _res, next) => {
  inc("http_requests_total", 1);
  next();
  });

  app.use("/metrics", metricsRouter());








  app.use(notFound);
  app.use(errorHandler);
  return app;
}
