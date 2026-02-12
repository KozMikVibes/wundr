import IORedis from "ioredis";
import { loadEnv } from "./env.js";

let _redis: IORedis | undefined;

export function redis(): IORedis {
  if (_redis) return _redis;
  const env = loadEnv();
  _redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false
  });
  return _redis;
}

export async function setNonce(address: string, nonce: string, ttlSeconds: number): Promise<void> {
  await redis().set(`nonce:${address.toLowerCase()}`, nonce, "EX", ttlSeconds);
}

export async function consumeNonce(address: string): Promise<string | null> {
  const key = `nonce:${address.toLowerCase()}`;
  const val = await redis().get(key);
  if (val) await redis().del(key);
  return val;
}
