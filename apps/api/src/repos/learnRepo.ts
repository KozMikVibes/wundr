import { q } from "../lib/db.internal.js";

export type Visibility = "public" | "unlisted" | "private";
export type Difficulty = "easy" | "medium" | "hard";
export type NodeType = "reading" | "checklist" | "puzzle" | "quiz" | "reflection" | "onchain" | "irl";

export type CategoryRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
  visibility: Visibility;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type QuestRow = {
  id: string;
  category_id: string;
  title: string;
  difficulty: Difficulty;
  estimated_minutes: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type NodeRow = {
  id: string;
  quest_id: string;
  type: NodeType;
  title: string;
  content: any;
  created_at: string;
  updated_at: string;
};

export type EdgeRow = {
  from_node_id: string;
  to_node_id: string;
  condition: string | null;
  created_at: string;
};

export type ProgressRow = {
  id: string;
  address: string;
  quest_id: string;
  xp: number;
  badges: string[];
  created_at: string;
  updated_at: string;
};

export async function listCategories(address: string) {
  // Show public + unlisted; show private only if created_by = address
  const sql = `
    SELECT *
    FROM learn_categories
    WHERE visibility IN ('public','unlisted')
       OR (visibility = 'private' AND created_by = $1)
    ORDER BY created_at DESC
    LIMIT 200
  `;
  const res = await q<CategoryRow>(sql, [address]);
  return res.rows;
}

export async function createCategory(input: {
  slug: string;
  title: string;
  description?: string | null;
  tags: string[];
  visibility: Visibility;
  createdBy: string;
}) {
  const sql = `
    INSERT INTO learn_categories (slug, title, description, tags, visibility, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const res = await q<CategoryRow>(sql, [
    input.slug,
    input.title,
    input.description ?? null,
    input.tags,
    input.visibility,
    input.createdBy
  ]);
  return res.rows[0];
}

export async function getCategoryById(categoryId: string) {
  const res = await q<CategoryRow>(`SELECT * FROM learn_categories WHERE id = $1`, [categoryId]);
  return res.rows[0] ?? null;
}

export async function createQuest(input: {
  categoryId: string;
  title: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  createdBy: string;
}) {
  const sql = `
    INSERT INTO learn_quests (category_id, title, difficulty, estimated_minutes, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const res = await q<QuestRow>(sql, [
    input.categoryId,
    input.title,
    input.difficulty,
    input.estimatedMinutes,
    input.createdBy
  ]);
  return res.rows[0];
}

export async function getQuestById(questId: string) {
  const res = await q<QuestRow>(`SELECT * FROM learn_quests WHERE id = $1`, [questId]);
  return res.rows[0] ?? null;
}

export async function listQuestGraph(questId: string) {
  const nodes = await q<NodeRow>(`SELECT * FROM learn_nodes WHERE quest_id = $1 ORDER BY created_at ASC`, [questId]);
  const edges = await q<EdgeRow>(
    `
    SELECT e.*
    FROM learn_node_edges e
    JOIN learn_nodes n ON n.id = e.from_node_id
    WHERE n.quest_id = $1
    ORDER BY e.created_at ASC
    `,
    [questId]
  );
  return { nodes: nodes.rows, edges: edges.rows };
}

export async function createNode(input: {
  questId: string;
  type: NodeType;
  title: string;
  content: any;
}) {
  const sql = `
    INSERT INTO learn_nodes (quest_id, type, title, content)
    VALUES ($1, $2, $3, $4::jsonb)
    RETURNING *
  `;
  const res = await q<NodeRow>(sql, [input.questId, input.type, input.title, JSON.stringify(input.content ?? {})]);
  return res.rows[0];
}

export async function addEdge(input: { fromNodeId: string; toNodeId: string; condition?: string | null }) {
  const sql = `
    INSERT INTO learn_node_edges (from_node_id, to_node_id, condition)
    VALUES ($1, $2, $3)
    ON CONFLICT (from_node_id, to_node_id) DO UPDATE SET condition = EXCLUDED.condition
    RETURNING *
  `;
  const res = await q<EdgeRow>(sql, [input.fromNodeId, input.toNodeId, input.condition ?? null]);
  return res.rows[0];
}

export async function ensureProgress(address: string, questId: string) {
  // Idempotent ensure + return row
  const sql = `
    INSERT INTO learn_progress (address, quest_id)
    VALUES ($1, $2)
    ON CONFLICT (address, quest_id) DO UPDATE SET updated_at = now()
    RETURNING *
  `;
  const res = await q<ProgressRow>(sql, [address, questId]);
  return res.rows[0];
}

export async function markNodeComplete(progressId: string, nodeId: string) {
  // Idempotent completion insert
  const sql = `
    INSERT INTO learn_progress_nodes (progress_id, node_id)
    VALUES ($1, $2)
    ON CONFLICT (progress_id, node_id) DO NOTHING
    RETURNING progress_id, node_id, completed_at
  `;
  const res = await q<{ progress_id: string; node_id: string; completed_at: string }>(sql, [progressId, nodeId]);
  return res.rows[0] ?? null; // null => already completed
}

export async function awardXpAndBadge(input: { progressId: string; xpDelta: number; badge?: string | null }) {
  // Server-controlled XP/badges only.
  // Badge appended if provided and not already present.
  const sql = `
    UPDATE learn_progress
    SET
      xp = xp + $2,
      badges = CASE
        WHEN $3 IS NULL THEN badges
        WHEN $3 = ANY(badges) THEN badges
        ELSE array_append(badges, $3)
      END,
      updated_at = now()
    WHERE id = $1
    RETURNING *
  `;
  const res = await q<ProgressRow>(sql, [input.progressId, input.xpDelta, input.badge ?? null]);
  return res.rows[0];
}

export async function getProgress(address: string, questId: string) {
  const res = await q<ProgressRow>(`SELECT * FROM learn_progress WHERE address = $1 AND quest_id = $2`, [
    address,
    questId
  ]);
  return res.rows[0] ?? null;
}

export async function listCompletedNodes(progressId: string) {
  const res = await q<{ node_id: string; completed_at: string }>(
    `SELECT node_id, completed_at FROM learn_progress_nodes WHERE progress_id = $1 ORDER BY completed_at ASC`,
    [progressId]
  );
  return res.rows;
}
