import { q } from "../lib/db.js";

/**
 * Publish category: snapshot the current learn_categories row into learn_category_versions
 * and bump learn_categories.current_version and status.
 */
export async function publishCategory(categoryId: string, actor: string) {
  // Lock row to prevent race publishes
  const catRes = await q(
    `SELECT * FROM learn_categories WHERE id = $1 FOR UPDATE`,
    [categoryId]
  );
  const cat = catRes.rows[0];
  if (!cat) return null;

  if (cat.created_by !== actor) throw Object.assign(new Error("forbidden"), { status: 403 });

  const nextVersion = Number(cat.current_version) + 1;

  await q(
    `
    INSERT INTO learn_category_versions
      (category_id, version, slug, title, description, tags, visibility, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [categoryId, nextVersion, cat.slug, cat.title, cat.description, cat.tags, cat.visibility, cat.created_by]
  );

  const updated = await q(
    `
    UPDATE learn_categories
    SET status = 'published', published_at = now(), current_version = $2, updated_at = now()
    WHERE id = $1
    RETURNING *
    `,
    [categoryId, nextVersion]
  );

  return updated.rows[0];
}

/**
 * Publish quest: snapshot quest row + nodes + edges into version tables and bump version
 */
export async function publishQuest(questId: string, actor: string) {
  const questRes = await q(
    `SELECT * FROM learn_quests WHERE id = $1 FOR UPDATE`,
    [questId]
  );
  const quest = questRes.rows[0];
  if (!quest) return null;
  if (quest.created_by !== actor) throw Object.assign(new Error("forbidden"), { status: 403 });

  const nextVersion = Number(quest.current_version) + 1;

  // snapshot quest
  await q(
    `
    INSERT INTO learn_quest_versions
      (quest_id, category_id, version, title, difficulty, estimated_minutes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
    [questId, quest.category_id, nextVersion, quest.title, quest.difficulty, quest.estimated_minutes, quest.created_by]
  );

  // snapshot nodes
  const nodes = await q(
    `SELECT id, type, title, content FROM learn_nodes WHERE quest_id = $1`,
    [questId]
  );

  for (const n of nodes.rows) {
    await q(
      `
      INSERT INTO learn_node_versions (quest_id, version, node_id, type, title, content)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      `,
      [questId, nextVersion, n.id, n.type, n.title, JSON.stringify(n.content ?? {})]
    );
  }

  // snapshot edges (only edges whose from_node belongs to quest)
  const edges = await q(
    `
    SELECT e.from_node_id, e.to_node_id, e.condition
    FROM learn_node_edges e
    JOIN learn_nodes n ON n.id = e.from_node_id
    WHERE n.quest_id = $1
    `,
    [questId]
  );

  for (const e of edges.rows) {
    await q(
      `
      INSERT INTO learn_edge_versions (quest_id, version, from_node_id, to_node_id, condition)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [questId, nextVersion, e.from_node_id, e.to_node_id, e.condition]
    );
  }

  const updated = await q(
    `
    UPDATE learn_quests
    SET status = 'published', published_at = now(), current_version = $2, updated_at = now()
    WHERE id = $1
    RETURNING *
    `,
    [questId, nextVersion]
  );

  return updated.rows[0];
}
