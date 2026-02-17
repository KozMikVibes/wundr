import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "../env.js";

export const securityPlugin = fp(async (app) => {
  await app.register(helmet);

  await app.register(cors, {
    origin: env.CORS_ORIGIN
      ? env.CORS_ORIGIN.split(",").map((s: string) => s.trim())
      : true,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });
});
