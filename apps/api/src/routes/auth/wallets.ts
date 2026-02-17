import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { qReq } from "../../lib/db.js";
import { normAddr } from "./repo.js";

const ParamsSchema = z.object({
  chainId: z.string().regex(/^\d+$/),
  address: z.string().min(1),
});

export async function authWalletRoutes(app: FastifyInstance) {
  /**
   * GET /auth/web3/wallets
   * Lists wallets linked to the authenticated user (RLS-protected).
   */
  app.get(
    "/wallets",
    { preHandler: [app.requireUserDb] },
    async (req, reply) => {
      const r = await qReq<{ address: string; chain_id: number; verified_at: string }>(
        req,
        `SELECT address, chain_id, verified_at
         FROM user_wallets
         ORDER BY verified_at DESC`
      );
      return reply.send({ ok: true, wallets: r.rows });
    }
  );

  /**
   * DELETE /auth/web3/wallets/:chainId/:address
   * Unlinks a wallet from the authenticated user (RLS-protected).
   *
   * Safety:
   * - Requires an explicit SIWE re-verify in higher-assurance setups.
   * - For now, this is user-auth only. If you want, we can require a SIWE proof here too.
   */
  app.delete(
    "/wallets/:chainId/:address",
    { preHandler: [app.requireUserDb] },
    async (req, reply) => {
      const params = ParamsSchema.parse((req as any).params);
      const chainId = Number(params.chainId);
      const address = normAddr(params.address);

      const r = await qReq(
        req,
        `DELETE FROM user_wallets
         WHERE chain_id = $1 AND lower(address) = lower($2)
         RETURNING id`,
        [chainId, address]
      );

      if ((r.rowCount ?? 0) === 0) {
        return reply.code(404).send({ error: "wallet_not_found" });
      }

      return reply.send({ ok: true, unlinked: true });
    }
  );
}
