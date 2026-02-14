import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(10),

  // auth
  JWT_SECRET: z.string().min(16),
  BCRYPT_COST: z.coerce.number().default(12),

  // optional but already in docker-compose.yml
  REDIS_URL: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),

  // SIWE (since you already have env placeholders)
  SIWE_DOMAIN: z.string().optional(),
  SIWE_URI_ALLOWLIST: z.string().optional(),
  SIWE_CHAIN_ALLOWLIST: z.string().optional(),
  SIWE_ISSUED_AT_MAX_AGE_SECONDS: z.coerce.number().optional(),

  // cookies/session (future)
  COOKIE_NAME: z.string().optional(),
  COOKIE_SECURE: z.coerce.boolean().optional(),
  SESSION_TTL_SECONDS: z.coerce.number().optional()
});

export const env = Env.parse(process.env);
