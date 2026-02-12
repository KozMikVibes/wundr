import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(10),
  JWT_SECRET: z.string().min(16),
  BCRYPT_COST: z.coerce.number().default(12)
});

export const env = Env.parse(process.env);
