import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireCsrf } from "../lib/csrf.js";
import { sanitizeString } from "../lib/sanitize.js";
import * as publish from "../repos/publishRepo.js";
import { q } from "../lib/db.js";

function normAddress(addr: string) {
  return sanitizeString(addr, 80).toLowerCase();
}

const PublishCategorySchema = z.object({ categoryId: z.string().uuid() });
const PublishQuestSchema = z.object({ questId: z.string().uuid() });

export function publishRouter() {
  const r = Router();

  // Publish category (creator only)
  r.post(
    "/category",
    requireAuth,
    requireRole("creator"),
    requireCsrf,
    async (req, res, next) => {
      try {
        const actor = normAddress((req as any).user.address);
        const input = PublishCategorySchema.parse(req.body ?? {});

        await q("BEGIN");
        try {
          const item = await publish.publishCategory(input.categoryId, actor);
          if (!item) {
            await q("ROLLBACK");
            return res.status(404).json({ error: "category_not_found" });
          }
          await q("COMMIT");
          res.json({ item });
        } catch (err) {
          await q("ROLLBACK");
          throw err;
        }
      } catch (e) { next(e); }
    }
  );

  // Publish quest (creator only)
  r.post(
    "/quest",
    requireAuth,
    requireRole("creator"),
    requireCsrf,
    async (req, res, next) => {
      try {
        const actor = normAddress((req as any).user.address);
        const input = PublishQuestSchema.parse(req.body ?? {});

        await q("BEGIN");
        try {
          const item = await publish.publishQuest(input.questId, actor);
          if (!item) {
            await q("ROLLBACK");
            return res.status(404).json({ error: "quest_not_found" });
          }
          await q("COMMIT");
          res.json({ item });
        } catch (err) {
          await q("ROLLBACK");
          throw err;
        }
      } catch (e) { next(e); }
    }
  );

  return r;
}
