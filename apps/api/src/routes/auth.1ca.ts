import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { SiweMessage } from "siwe";

import { validateBody } from "../middleware/validate.js";
import { setNonce, consumeNonce } from "../lib/redis.js";
import { assertSiweHardChecks, extractCaps } from "../lib/siwe.js";
import { issueCsrfCookie } from "../lib/csrf.js";
import { setSessionCookie, clearSessionCookie } from "../middleware/auth.js";
import { loadEnv } from "../lib/env.js";
import { sanitizeString } from "../lib/sanitize.js";
import { listRoles } from "../repos/roleRepo.js";

const env = loadEnv();

const NonceTTLSeconds = 300;

const VerifySchema = z.object({
  nonceId: z.string().uuid(),
  message: z.string().min(1),
  signature: z.string().min(1),
});

function normAddress(addr: string) {
  return sanitizeString(addr, 80).toLowerCase();
}

export function auth1caRouter() {
  const r = Router();

  /**
   * GET /auth/1ca/nonce
   * Returns { nonceId, nonce } where nonce is inserted into the SIWE message.
   * nonceId allows the server to look up + consume the expected nonce (one-time use).
   */
  r.get("/nonce", async (_req, res, next) => {
    try {
      const nonceId = crypto.randomUUID();
      const nonce = crypto.randomBytes(16).toString("hex");

      await setNonce(nonceId, nonce, NonceTTLSeconds);

      res.json({ nonceId, nonce });
    } catch (e) {
      next(e);
    }
  });

  /**
   * POST /auth/1ca/verify
   * Body: { nonceId, message, signature }
   * - consumes nonce (one-time use)
   * - strict SIWE validation (domain/uri/chain/issuedAt freshness)
   * - verifies SIWE signature
   * - extracts capabilities from SIWE resources (wundr://cap/*)
   * - loads server roles from Postgres and embeds into session
   * - issues HttpOnly session cookie + CSRF cookie
   */
  r.post("/verify", validateBody(VerifySchema), async (req, res, next) => {
    try {
      const { nonceId, message, signature } = (req as any).validatedBody as z.infer<
        typeof VerifySchema
      >;

      // One-time nonce (Redis)
      const expectedNonce = await consumeNonce(nonceId);
      if (!expectedNonce) return res.status(400).json({ error: "nonce_invalid_or_expired" });

      // Parse message
      const siwe = new SiweMessage(message);

      // Hard checks BEFORE signature verify
      assertSiweHardChecks(siwe);

      // Verify signature + domain + expected nonce
      const result = await siwe.verify({
        signature,
        domain: env.SIWE_DOMAIN,
        nonce: expectedNonce,
      });

      const address = normAddress(result.data.address);
      const chainId = Number(result.data.chainId);

      // Capabilities: only allow wundr://cap/*
      const caps = extractCaps(result.data.resources);

      // Server roles (DB-owned authorization)
      const roles = await listRoles(address);
      // Always include "user" default for app logic if DB returns none
      const safeRoles = roles.length ? roles : ["user"];

      // HttpOnly session cookie with roles + caps
      setSessionCookie(res, {
        sub: address,
        chainId,
        caps,
        roles: safeRoles,
      });

      // CSRF cookie (double-submit)
      const csrfToken = issueCsrfCookie(req, res);

      res.json({
        ok: true,
        address,
        chainId,
        caps,
        roles: safeRoles,
        csrfToken, // convenience (cookie also set)
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * POST /auth/1ca/logout
   * Clears session cookie.
   */
  r.post("/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  return r;
}
