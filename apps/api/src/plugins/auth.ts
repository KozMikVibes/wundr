import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { loadEnv } from "../lib/env.js";

const env = loadEnv();

/**
 * Canonical Claims v1 (preferred)
 */
export type CanonicalClaimsV1 = {
  ver: 1;
  sub: string; // user:<uuid> | wallet:<addr>:<chainId>
  amr: "web2" | "web3";
  tid?: string;

  uid?: string;      // user uuid
  email?: string;

  w?: { a: string; c: number }; // wallet ref

  roles: string[];
  caps: string[];
};

/**
 * Legacy token shape still used in some places.
 */
type LegacyClaims = { userId: string };

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      // Back-compat
      userId?: string;

      // Canonical
      sub?: string;
      amr?: "web2" | "web3";
      tenantId?: string;

      uid?: string;
      email?: string;
      wallet?: { address: string; chainId: number };

      roles: string[];
      caps: string[];

      raw: any;
    };
  }
  interface FastifyInstance {
    requireAuth: (req: any, reply: any) => Promise<void>;
    signJwt: (payload: any) => string;
  }
}

function isClaimsV1(x: any): x is CanonicalClaimsV1 {
  return (
    x &&
    typeof x === "object" &&
    x.ver === 1 &&
    typeof x.sub === "string" &&
    (x.amr === "web2" || x.amr === "web3") &&
    Array.isArray(x.roles) &&
    Array.isArray(x.caps)
  );
}

export const authPlugin = fp(async (app) => {
  app.decorate("signJwt", (payload: any) =>
    jwt.sign(payload, env.JWT_SECRET, { expiresIn: "2h", algorithm: "HS256" })
  );

  app.decorate("requireAuth", async (req, reply) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return reply.code(401).send({ error: "missing_token" });

    const token = h.slice("Bearer ".length);

    let decoded: JwtPayload | string;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch {
      return reply.code(401).send({ error: "invalid_token" });
    }

    if (typeof decoded === "string") return reply.code(401).send({ error: "invalid_token_payload" });

    // Canonical v1
    if (isClaimsV1(decoded)) {
      const wallet = decoded.w
        ? { address: String(decoded.w.a).toLowerCase(), chainId: Number(decoded.w.c) }
        : undefined;

      req.auth = {
        userId: decoded.uid, // back-compat alias
        sub: decoded.sub,
        amr: decoded.amr,
        tenantId: decoded.tid,
        uid: decoded.uid,
        email: decoded.email,
        wallet,
        roles: decoded.roles ?? [],
        caps: decoded.caps ?? [],
        raw: decoded,
      };
      return;
    }

    // Legacy
    const legacy = decoded as JwtPayload & Partial<LegacyClaims>;
    if (!legacy.userId) return reply.code(401).send({ error: "invalid_token" });

    req.auth = {
      userId: legacy.userId,
      uid: legacy.userId, // treat as uid in legacy case
      roles: [],
      caps: [],
      raw: legacy,
    };
  });
});
