import Redis from "ioredis";
import { loadEnv } from "./env.js";

const env = loadEnv();
export const redis = new Redis(env.REDIS_URL, { lazyConnect: false });

export async function setNonce(nonceId: string, nonce: string, ttlSeconds: number) {
  // NX prevents overwrite
  const ok = await redis.set(`siwe:nonce:${nonceId}`, nonce, "EX", ttlSeconds, "NX");
  if (ok !== "OK") throw Object.assign(new Error("nonce_conflict"), { status: 409 });
}

export async function consumeNonce(nonceId: string) {
  const key = `siwe:nonce:${nonceId}`;
  const nonce = await redis.get(key);
  if (!nonce) return null;
  await redis.del(key); // one-time use
  return nonce;
}
