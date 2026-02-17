import type { FastifyInstance, FastifyReply } from "fastify";

export type WalletRef = { a: string; c: number }; // a=address, c=chainId

export type CanonicalClaimsV1 = {
  ver: 1;
  sub: string; // user:<uuid> | wallet:<addr>:<chainId>
  amr: "web2" | "web3";
  tid?: string;

  uid?: string;
  email?: string;

  w?: WalletRef;

  roles: string[];
  caps: string[];
};

function normalizeSub(input: { uid?: string; wallet?: WalletRef }) {
  if (input.uid) return `user:${input.uid}`;
  if (input.wallet) return `wallet:${input.wallet.a.toLowerCase()}:${Number(input.wallet.c)}`;
  throw new Error("auth_claims_missing_subject");
}

export function issueSession(
  app: FastifyInstance,
  reply: FastifyReply,
  input: Omit<CanonicalClaimsV1, "ver" | "sub"> & { uid?: string; w?: WalletRef }
) {
  const claims: CanonicalClaimsV1 = {
    ver: 1,
    sub: normalizeSub({ uid: input.uid, wallet: input.w }),
    amr: input.amr,
    tid: input.tid,
    uid: input.uid,
    email: input.email,
    w: input.w,
    roles: input.roles ?? ["user"],
    caps: input.caps ?? [],
  };

  const token = (app as any).signJwt(claims);

  return { token, claims };
}
