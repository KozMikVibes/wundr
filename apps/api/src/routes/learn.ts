import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCap } from "../middleware/auth.js";
import { requireCsrf } from "../lib/csrf.js";
import { sanitizeSlug, sanitizeString } from "../lib/sanitize.js";
import { CAPS } from "../lib/caps.js";
import * as repo from "../repos/learnRepo.js";
import { q } from "../lib/db.js";

function normAddress(addr: string) {
  return sanitizeString(addr, 80).toLowerCase();
}

function normParamString(v: unknown, max = 256): string {
  if (Array.isArray(v)) v = v[0];
  if (typeof v !== "string") throw Object.assign(new Error("bad_request"), { status: 400 });
  return sanitizeString(v, max);
}

// Server-side XP policy (tweak freely)
function xpForNodeType(t: repo.NodeType): number {
  switch (t) {
    case "reading":
      return 10;
    case "checklist":
      return 15;
    case "reflection":
      return 15;
    case "quiz":
      return 25;
    case "puzzle":
      return 30;
    case "irl":
      return 40;
    case "onchain":
      return 50;
    default:
      return 10;
  }
}

const CreateCategorySchema = z.object({
  slug: z.string().min(3).max(64),
  title: z.string().min(3).max(120),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().min(1).max(32)).max(20).default([]),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
});

const CreateQuestSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(3).max(140),
  difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
  estimatedMinutes: z.number().int().positive().max(10_000).default(30),
});

const CreateNodeSchema = z.object({
  questId: z.string().uuid(),
  type: z.enum(["reading", "checklist", "puzzle", "quiz", "reflection", "onchain", "irl"]),
  title: z.string().min(3).max(140),
  content: z.any().default({}),
});

const AddEdgeSchema = z.object({
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  condition: z.string().max(200).optional(),
});

const CompleteNodeSchema = z.object({
  questId: z.string().uuid(),
  nodeId: z.string().uuid(),
  badge: z.string().max(64).optional(),
});

export function learnRouter() {
  const r = Router();

  // --- READS ---
  r.get("/categories", requireAuth, requireCap(CAPS.LEARN_READ), async (req, res, next) => {
    try {
      const address = normAddress((req as any).user.address);
      const items = await repo.listCategories(address);
      res.json({ items });
    } catch (e) {
      next(e);
    }
  });

  r.get("/quests/:questId/graph", requireAuth, requireCap(CAPS.LEARN_READ), async (req, res, next) => {
    try {
      const questId = normParamString((req as any).params?.questId, 128);
      const quest = await repo.getQuestById(questId);
      if (!quest) return res.status(404).json({ error: "quest_not_found" });

      const graph = await repo.listQuestGraph(questId);
      res.json({ quest, ...graph });
    } catch (e) {
      next(e);
    }
  });

  r.get("/progress/:questId", requireAuth, requireCap(CAPS.LEARN_READ), async (req, res, next) => {
    try {
      const address = normAddress((req as any).user.address);
      const questId = normParamString((req as any).params?.questId, 128);

      const prog = await repo.getProgress(address, questId);
      if (!prog) return res.json({ item: null });

      const completed = await repo.listCompletedNodes(prog.id);
      res.json({ item: { ...prog, completed } });
    } catch (e) {
      next(e);
    }
  });

  // --- WRITES (CSRF required) ---
  // NOTE: Your CAPS file (per earlier error) has LEARN_WRITE but not the granular create/write caps.
  // If you later add LEARN_CATEGORY_CREATE / LEARN_QUEST_CREATE / LEARN_PROGRESS_WRITE, swap them back in.
  const requireLearnWrite = [requireAuth, requireCap(CAPS.LEARN_WRITE), requireCsrf] as const;

  r.post("/categories", ...requireLearnWrite, async (req, res, next) => {
    try {
      const input = CreateCategorySchema.parse(req.body ?? {});
      const address = normAddress((req as any).user.address);

      const slug = sanitizeSlug(input.slug);
      const title = sanitizeString(input.title, 120);
      const description = input.description ? sanitizeString(input.description, 1000) : null;
      const tags = input.tags.map((t) => sanitizeString(t, 32)).filter(Boolean);

      const item = await repo.createCategory({
        slug,
        title,
        description,
        tags,
        visibility: input.visibility,
        createdBy: address,
      });

      res.status(201).json({ item });
    } catch (e) {
      next(e);
    }
  });

  r.post("/quests", ...requireLearnWrite, async (req, res, next) => {
    try {
      const input = CreateQuestSchema.parse(req.body ?? {});
      const address = normAddress((req as any).user.address);

      const category = await repo.getCategoryById(input.categoryId);
      if (!category) return res.status(404).json({ error: "category_not_found" });

      const title = sanitizeString(input.title, 140);

      const item = await repo.createQuest({
        categoryId: input.categoryId,
        title,
        difficulty: input.difficulty,
        estimatedMinutes: input.estimatedMinutes,
        createdBy: address,
      });

      res.status(201).json({ item });
    } catch (e) {
      next(e);
    }
  });

  r.post("/nodes", ...requireLearnWrite, async (req, res, next) => {
    try {
      const input = CreateNodeSchema.parse(req.body ?? {});
      const quest = await repo.getQuestById(input.questId);
      if (!quest) return res.status(404).json({ error: "quest_not_found" });

      const title = sanitizeString(input.title, 140);
      const content = input.content ?? {};

      const item = await repo.createNode({
        questId: input.questId,
        type: input.type,
        title,
        content,
      });

      res.status(201).json({ item });
    } catch (e) {
      next(e);
    }
  });

  r.post("/edges", ...requireLearnWrite, async (req, res, next) => {
    try {
      const input = AddEdgeSchema.parse(req.body ?? {});
      const condition = input.condition ? sanitizeString(input.condition, 200) : null;

      const resA = await q<{ quest_id: string }>(
        `SELECT quest_id FROM learn_nodes WHERE id = $1`,
        [input.fromNodeId]
      );
      const resB = await q<{ quest_id: string }>(
        `SELECT quest_id FROM learn_nodes WHERE id = $1`,
        [input.toNodeId]
      );

      const a = resA.rows[0]?.quest_id;
      const b = resB.rows[0]?.quest_id;
      if (!a || !b) return res.status(404).json({ error: "node_not_found" });
      if (a !== b) return res.status(400).json({ error: "cross_quest_edge_disallowed" });

      const item = await repo.addEdge({
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        condition,
      });

      res.status(201).json({ item });
    } catch (e) {
      next(e);
    }
  });

  r.post("/progress/complete", ...requireLearnWrite, async (req, res, next) => {
    try {
      const input = CompleteNodeSchema.parse(req.body ?? {});
      const address = normAddress((req as any).user.address);

      const quest = await repo.getQuestById(input.questId);
      if (!quest) return res.status(404).json({ error: "quest_not_found" });

      const nodeRes = await q<{ id: string; type: repo.NodeType }>(
        `SELECT id, type FROM learn_nodes WHERE id = $1 AND quest_id = $2`,
        [input.nodeId, input.questId]
      );
      const node = nodeRes.rows[0];
      if (!node) return res.status(404).json({ error: "node_not_found" });

      const progress = await repo.ensureProgress(address, input.questId);
      const newlyCompleted = await repo.markNodeComplete(progress.id, input.nodeId);

      let updated = progress;
      let awardedXp = 0;

      if (newlyCompleted) {
        awardedXp = xpForNodeType(node.type);
        const badge = input.badge ? sanitizeString(input.badge, 64) : null;
        updated = await repo.awardXpAndBadge({ progressId: progress.id, xpDelta: awardedXp, badge });
      }

      res.json({ ok: true, awardedXp, item: updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
