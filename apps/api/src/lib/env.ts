import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  CORS_ORIGIN: z.string().default("http://localhost:3001"),

  JWT_SECRET: z.string().min(16).default("change_me_change_me_change_me_change_me"),
  COOKIE_NAME: z.string().default("wundr_session"),
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === "true")
    .default("false" as unknown as boolean),

  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  SIWE_DOMAIN: z.string().default("localhost"),
  SIWE_URI_ALLOWLIST: z.string().default("http://localhost:3001"),
  SIWE_CHAIN_ALLOWLIST: z.string().default("1,8453,137"),
  SIWE_ISSUED_AT_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(600)
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // zod error format is very readable for ops
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten());
    throw new Error("Invalid environment variables");
  }
  cached = parsed.data;
  return cached;
}
