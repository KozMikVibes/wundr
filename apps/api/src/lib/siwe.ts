import { SiweMessage } from "siwe";
import { loadEnv } from "./env.js";

const env = loadEnv();

const uriAllow = new Set(env.SIWE_URI_ALLOWLIST.split(",").map(s => s.trim()).filter(Boolean));
const chainAllow = new Set(env.SIWE_CHAIN_ALLOWLIST.split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n)));

export function extractCaps(resources?: string[]) {
  if (!resources?.length) return [];
  return resources.map(r => r.trim()).filter(r => r.startsWith("wundr://cap/"));
}

export function assertSiweHardChecks(siwe: SiweMessage) {
  if (siwe.domain !== env.SIWE_DOMAIN) throw Object.assign(new Error("siwe_domain_mismatch"), { status: 400 });

  if (!siwe.uri || !uriAllow.has(siwe.uri)) throw Object.assign(new Error("siwe_uri_not_allowed"), { status: 400 });

  const chainId = Number(siwe.chainId);
  if (!chainAllow.has(chainId)) throw Object.assign(new Error("siwe_chain_not_allowed"), { status: 400 });

  // issuedAt freshness
  const issuedAt = siwe.issuedAt ? Date.parse(siwe.issuedAt) : NaN;
  if (!Number.isFinite(issuedAt)) throw Object.assign(new Error("siwe_missing_issuedAt"), { status: 400 });

  const ageMs = Date.now() - issuedAt;
  if (ageMs < -60_000) throw Object.assign(new Error("siwe_clock_skew"), { status: 400 }); // too far in future
  if (ageMs > env.SIWE_ISSUED_AT_MAX_AGE_SECONDS * 1000) throw Object.assign(new Error("siwe_too_old"), { status: 400 });
}
