import { qPublic } from "../../lib/db.js";

/** Normalize address for storage / comparisons */
export function normAddr(address: string) {
  return address.trim().toLowerCase();
}

export async function findActiveUserByEmail(email: string): Promise<{ id: string; email: string; password_hash: string | null } | null> {
  const r = await qPublic<{ id: string; email: string; password_hash: string | null }>(
    `SELECT id, email, password_hash
     FROM users
     WHERE email = $1 AND status = 'active'
     LIMIT 1`,
    [email]
  );
  return r.rows[0] ?? null;
}

export async function insertUser(params: { email: string; passwordHash: string }): Promise<{ id: string }> {
  const r = await qPublic<{ id: string }>(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id`,
    [params.email, params.passwordHash]
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error("user_insert_failed");
  return { id };
}

export async function insertUserProfile(params: { userId: string; displayName: string }): Promise<void> {
  await qPublic(
    `INSERT INTO user_profiles (user_id, display_name)
     VALUES ($1, $2)`,
    [params.userId, params.displayName]
  );
}

/** Returns linked user_id for a wallet if it exists */
export async function getUserIdByWallet(params: { address: string; chainId: number }): Promise<string | null> {
  const r = await qPublic<{ user_id: string }>(
    `SELECT user_id
     FROM user_wallets
     WHERE chain_id = $1 AND lower(address) = lower($2)
     LIMIT 1`,
    [params.chainId, normAddr(params.address)]
  );
  return r.rows[0]?.user_id ?? null;
}

/**
 * Links a wallet to a user.
 * - Enforced by UNIQUE(chain_id, lower(address))
 * - Returns "linked" if inserted, "already_linked" if already owned by same user
 * - Throws if wallet belongs to another user
 */
export async function linkWalletToUser(params: { userId: string; address: string; chainId: number }) {
  const address = normAddr(params.address);

  // Check existing owner (public lookup)
  const existing = await qPublic<{ user_id: string }>(
    `SELECT user_id
     FROM user_wallets
     WHERE chain_id = $1 AND lower(address) = lower($2)
     LIMIT 1`,
    [params.chainId, address]
  );

  const owner = existing.rows[0]?.user_id;
  if (owner && owner !== params.userId) {
    return { status: "wallet_owned_by_another_user" as const, ownerUserId: owner };
  }
  if (owner && owner === params.userId) {
    return { status: "already_linked" as const };
  }

  // Insert link (RLS will enforce user_id matches app.current_user_id() IF you run in RLS context)
  // If called outside RLS tx, this insert may fail due to RLS. In our flow, we insert via req.db using qReq.
  return { status: "link_required_insert" as const };
}

export async function listWalletsForUser(userId: string): Promise<Array<{ address: string; chain_id: number; verified_at: string }>> {
  const r = await qPublic<{ address: string; chain_id: number; verified_at: string }>(
    `SELECT address, chain_id, verified_at
     FROM user_wallets
     WHERE user_id = $1
     ORDER BY verified_at DESC`,
    [userId]
  );
  return r.rows;
}
