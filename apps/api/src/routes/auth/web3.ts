import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import { SiweMessage } from "siwe";

import { WalletLinkSchema, SiweVerifySchema } from "./schema.js";
import { issueSession } from "./service.js";

import { setNonce, consumeNonce } from "../../lib/redis.js";
import { assertSiweHardChecks, extractCaps } from "../../lib/siwe.js";
import { sanitizeString } from "../../lib/sanitize.js";
import { loadEnv } from "../../lib/env.js";
import { listRoles } from "../../repos/roleRepo.js";

import { qReq } from "../../lib/db.js";
import { getUserIdByWallet, linkWalletToUser, normAddr } from "./repo.js";
import { requireUserId } from "../../lib/authz.js";

const env = loadEnv();
const NonceTTLSeconds = 300;

function normAddress(addr: string) {
  return sanitizeString(addr, 80).toLowerCase();
}

async function verifySiweOrThrow(params: { nonceId: string; message: string; signature: string }) {
  const expectedNonce = await consumeNonce(params.nonceId);
  if (!expectedNonce) {
    const err = new Error("nonce_invalid_or_expired");
    (err as any).statusCode = 400;
    throw err;
  }

  const siwe = new SiweMessage(params.message);
  assertSiweHardChecks(siwe);

  const result = await siwe.verify({
    signature: params.signature,
    domain: env.SIWE_DOMAIN,
    nonce: expectedNonce,
  });

  const address = normAddress(result.data.address);
  const chainId = Number(result.data.chainId);
  const caps = extractCaps(result.data.resources);

  return { address, chainId, caps };
}

export async function authWeb3Routes(app: FastifyInstance) {
  /**
   * GET /auth/web3/nonce
   */
  app.get("/nonce", async (_req, reply) => {
    const nonceId = crypto.randomUUID();
    const nonce = crypto.randomBytes(16).toString("hex");
    await setNonce(nonceId, nonce, NonceTTLSeconds);
    return reply.send({ nonceId, nonce });
  });

  /**
   * POST /auth/web3/verify
   * - wallet-only login unless wallet is already linked to a user
   * - if linked => include uid and sub=user:<uid>
   */
  app.post("/verify", async (req, reply) => {
    const { nonceId, message, signature } = SiweVerifySchema.parse((req as any).body);

    const { address, chainId, caps } = await verifySiweOrThrow({ nonceId, message, signature });

    const roles = await listRoles(address);
    const safeRoles = roles.length ? roles : ["user"];

    // If wallet is linked, we emit a USER session (uid + sub=user:<uid>)
    const linkedUserId = await getUserIdByWallet({ address, chainId });

    const { token, claims } = issueSession(app, reply, {
      amr: "web3",
      uid: linkedUserId ?? undefined,
      w: { a: address, c: chainId },
      roles: safeRoles,
      caps,
      // tid: (req as any).tenant?.id, // optional; enable once you choose tenant flow for web3 verify
    });

    return reply.send({ ok: true, token, claims });
  });

  /**
   * POST /auth/web3/link
   * Requires: user session + tenant-scoped DB tx (req.db) so RLS policies enforce ownership.
   *
   * Flow:
   * - requireAuth
   * - requireUser (must have uid)
   * - (optional) no tenant required; linking is user-owned, not tenant-owned
   * - BUT RLS policy on user_wallets uses app.current_user_id() => we MUST run in an RLS tx that sets app.user_id
   *
   * We can do that without tenant by setting a "personal" tenant; but your RLS locals currently also set tenant_id.
   * Easiest: use rls tx initialization even without tenant requirement by adding a new helper later.
   *
   * For now, we’ll requireTenantDb so app.user_id is set consistently and policy passes.
   */
  app.post(
    "/link",
    {
      preHandler: [app.requireUserDb],
    },
    async (req, reply) => {
      const uid = requireUserId(req);

      const { nonceId, message, signature } = WalletLinkSchema.parse((req as any).body);
      const { address, chainId } = await verifySiweOrThrow({ nonceId, message, signature });

      const check = await linkWalletToUser({ userId: uid, address, chainId });

      if (check.status === "wallet_owned_by_another_user") {
        return reply.code(409).send({ error: "wallet_already_linked" });
      }

      if (check.status === "already_linked") {
        // Return updated session (now guaranteed uid)
        const roles = req.auth?.roles?.length ? req.auth.roles : ["user"];
        const caps = req.auth?.caps ?? [];
        const { token, claims } = issueSession(app, reply, {
          amr: "web3",
          uid,
          w: { a: normAddr(address), c: chainId },
          roles,
          caps,
          tid: (req as any).tenant?.id,
        });
        return reply.send({ ok: true, linked: true, token, claims });
      }

      // Insert under RLS: user_id must equal app.current_user_id()
      await qReq(
        req,
        `INSERT INTO user_wallets (user_id, address, chain_id)
         VALUES ($1, $2, $3)`,
        [uid, normAddr(address), chainId]
      );

      // Return updated session (as user)
      const roles = req.auth?.roles?.length ? req.auth.roles : ["user"];
      const caps = req.auth?.caps ?? [];
      const { token, claims } = issueSession(app, reply, {
        amr: "web3",
        uid,
        w: { a: normAddr(address), c: chainId },
        roles,
        caps,
        tid: (req as any).tenant?.id,
      });

      return reply.send({ ok: true, linked: true, token, claims });
    }
  );

  app.post("/logout", async (_req, reply) => reply.send({ ok: true }));
}
