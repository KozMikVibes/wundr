import { q } from "../lib/db.internal.js";

export type ServerRole = "user" | "creator" | "moderator" | "admin";

export async function listRoles(address: string): Promise<ServerRole[]> {
  const res = await q<{ role: ServerRole }>(
    `SELECT role FROM user_roles WHERE address = $1`,
    [address]
  );
  return res.rows.map(r => r.role);
}

export async function grantRole(input: { address: string; role: ServerRole; grantedBy: string; reason?: string | null }) {
  const res = await q(
    `
    INSERT INTO user_roles (address, role, granted_by, reason)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (address, role) DO NOTHING
    RETURNING address, role
    `,
    [input.address, input.role, input.grantedBy, input.reason ?? null]
  );
  return res.rows[0] ?? null;
}
