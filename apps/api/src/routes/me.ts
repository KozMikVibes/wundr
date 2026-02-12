import { pool } from "../lib/db.js";
import { z } from "zod";

export async function meRoutes(app: any) {
  app.get("/", { preHandler: app.requireAuth }, async (req: any) => {
    const userId = req.auth.userId;

    const r = await pool.query(
      `SELECT u.id, u.email, p.display_name, p.bio, p.location_text, p.socials, p.badges
       FROM users u
       JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    return r.rows[0];
  });

  const Patch = z.object({
    displayName: z.string().min(2).optional(),
    bio: z.string().max(2000).optional(),
    locationText: z.string().max(200).optional(),
    socials: z.record(z.string(), z.any()).optional()

  });

  app.patch("/", { preHandler: app.requireAuth }, async (req: any) => {
    const userId = req.auth.userId;
    const body = Patch.parse(req.body);

    const r = await pool.query(
      `UPDATE user_profiles
       SET display_name = COALESCE($2, display_name),
           bio = COALESCE($3, bio),
           location_text = COALESCE($4, location_text),
           socials = COALESCE($5, socials),
           updated_at = now()
       WHERE user_id = $1
       RETURNING user_id, display_name, bio, location_text, socials, badges`,
      [userId, body.displayName ?? null, body.bio ?? null, body.locationText ?? null, body.socials ?? null]
    );

    return r.rows[0];
  });
}
