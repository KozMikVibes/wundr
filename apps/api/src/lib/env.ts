import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  CORS_ORIGIN: z.string().default("http://localhost:3001"),

  // SIWE strict checks
  SIWE_DOMAIN: z.string().min(1),              // e.g. "localhost" or "app.yourdomain.com"
  SIWE_URI_ALLOWLIST: z.string().min(1),       // comma-separated origins
  SIWE_CHAIN_ALLOWLIST: z.string().min(1),     // comma-separated ints, e.g. "1,8453,137"
  SIWE_ISSUED_AT_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(600),

  // Sessions
  JWT_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  COOKIE_NAME: z.string().default("wundr_session"),
  COOKIE_SECURE: z.coerce.boolean().default(false),

  // Redis for nonce/session state
  REDIS_URL: z.string().min(1),

  // Optional Postgres
  DATABASE_URL: z.string().optional()
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
