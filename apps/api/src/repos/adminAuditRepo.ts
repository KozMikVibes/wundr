import { q } from "../lib/db.js";

export async function audit(input: {
  actor: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: any;
}) {
  await q(
    `
    INSERT INTO admin_audit_log (actor, action, target_type, target_id, details)
    VALUES ($1,$2,$3,$4,$5::jsonb)
    `,
    [input.actor, input.action, input.targetType, input.targetId ?? null, JSON.stringify(input.details ?? {})]
  );
}
