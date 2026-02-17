import type { FastifyInstance } from "fastify";
import { authWeb2Routes } from "./web2.js";
import { authWeb3Routes } from "./web3.js";
import { authWalletRoutes } from "./wallets.js";

export async function authRoutes(app: FastifyInstance) {
  await app.register(authWeb2Routes, { prefix: "/web2" });
  await app.register(authWeb3Routes, { prefix: "/web3" });

  // wallet management lives with web3 routes, but is user-authenticated
  await app.register(authWalletRoutes, { prefix: "/web3" });

  app.post("/logout", async (_req, reply) => reply.send({ ok: true }));
}
