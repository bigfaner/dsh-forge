// spec-repo（plugin-spec 1.3）——specs/goals/acs 三表 DAO 单源（行级唯一 SQL 落点）。
// 排序锚纪律：读面 ORDER BY created_at/sort_key 索引序，禁 ORDER BY id 单锚。
import type Database from "better-sqlite3";
import type { SpecDbTables } from "../migrations/version-1.js";
import type { AcRow, GoalRow, GoalStatus, SpecRow, SpecStatus } from "../row-types.js";

interface SpecRowDb {
  id: string;
  slug: string;
  title: string;
  spec_status: string;
  tiers_json: string;
  project_key: string;
  created_at: string;
  updated_at: string;
}

function toSpec(row: SpecRowDb): SpecRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    specStatus: row.spec_status as SpecStatus,
    tiers: JSON.parse(row.tiers_json) as string[],
    projectKey: row.project_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SpecRepo {
  constructor(
    private readonly db: Database.Database,
    private readonly t: SpecDbTables,
  ) {}

  insert(row: SpecRow): void {
    this.db
      .prepare(
        `INSERT INTO ${this.t.specs}
         (id, slug, title, spec_status, tiers_json, project_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.slug,
        row.title,
        row.specStatus,
        JSON.stringify(row.tiers),
        row.projectKey,
        row.createdAt,
        row.updatedAt,
      );
  }

  getBySlug(projectKey: string, slug: string): SpecRow | undefined {
    const row = this.db
      .prepare<unknown[], SpecRowDb>(
        `SELECT * FROM ${this.t.specs} WHERE project_key = ? AND slug = ?`,
      )
      .get(projectKey, slug);
    return row === undefined ? undefined : toSpec(row);
  }

  /** listing 索引序（project_key 等值前缀 + spec_status 过滤 + created_at 序）。 */
  list(projectKey: string, statusFilter?: SpecStatus): SpecRow[] {
    const sql = statusFilter
      ? `SELECT * FROM ${this.t.specs} WHERE project_key = ? AND spec_status = ? ORDER BY created_at, id`
      : `SELECT * FROM ${this.t.specs} WHERE project_key = ? ORDER BY created_at, id`;
    const rows = statusFilter
      ? (this.db.prepare<unknown[], SpecRowDb>(sql).all(projectKey, statusFilter) as SpecRowDb[])
      : (this.db.prepare<unknown[], SpecRowDb>(sql).all(projectKey) as SpecRowDb[]);
    return rows.map(toSpec);
  }

  updateFields(
    id: string,
    patch: { title?: string; tiers?: string[] },
    updatedAt: string,
  ): void {
    const sets: string[] = ["updated_at = ?"];
    const args: unknown[] = [updatedAt];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      args.push(patch.title);
    }
    if (patch.tiers !== undefined) {
      sets.push("tiers_json = ?");
      args.push(JSON.stringify(patch.tiers));
    }
    args.push(id);
    this.db.prepare(`UPDATE ${this.t.specs} SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  }

  /** spec_status 现值改写——唯一合法写径 = 状态流转动词事务闭包内调用（transitionSpec 两写 /
   *  goal-advance Goal 链式收口与 C4 竞窗自愈两写）。 */
  updateStatus(id: string, specStatus: SpecStatus, updatedAt: string): void {
    this.db
      .prepare(`UPDATE ${this.t.specs} SET spec_status = ?, updated_at = ? WHERE id = ?`)
      .run(specStatus, updatedAt, id);
  }

  // ── goals ──
  /** insertGoal 入参（goal_status 落 DDL DEFAULT 'pending'——插入面零携带）。 */
  insertGoal(row: Omit<GoalRow, "goalStatus">): void {
    this.db
      .prepare(
        `INSERT INTO ${this.t.goals}
         (id, spec_id, sort_key, title, brief, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.specId, row.sortKey, row.title, row.brief, row.createdAt, row.updatedAt);
  }

  deleteAcsBySpec(specId: string): void {
    this.db
      .prepare(
        `DELETE FROM ${this.t.acs} WHERE goal_id IN (SELECT id FROM ${this.t.goals} WHERE spec_id = ?)`,
      )
      .run(specId);
  }

  deleteGoalsBySpec(specId: string): void {
    this.db.prepare(`DELETE FROM ${this.t.goals} WHERE spec_id = ?`).run(specId);
  }

  listGoalsBySpec(specId: string): GoalRow[] {
    const rows = this.db
      .prepare<unknown[], { id: string; spec_id: string; sort_key: number; title: string; brief: string | null; goal_status: string; created_at: string; updated_at: string }>(
        `SELECT * FROM ${this.t.goals} WHERE spec_id = ? ORDER BY sort_key`,
      )
      .all(specId);
    return rows.map((r) => ({
      id: r.id,
      specId: r.spec_id,
      sortKey: r.sort_key,
      title: r.title,
      brief: r.brief,
      goalStatus: r.goal_status as GoalStatus,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /** goal_status 现值改写——唯一合法写径 = Goal 推进/终审/复核三动词事务闭包内调用；
   *  human-only 机检锚：completed 写入全包仅 domain/specs/goal-finalize.ts 一处。 */
  updateGoalStatus(id: string, goalStatus: GoalStatus, updatedAt: string): void {
    this.db
      .prepare(`UPDATE ${this.t.goals} SET goal_status = ?, updated_at = ? WHERE id = ?`)
      .run(goalStatus, updatedAt, id);
  }

  // ── acs ──
  insertAc(row: AcRow): void {
    this.db
      .prepare(
        `INSERT INTO ${this.t.acs}
         (id, goal_id, sort_key, criterion, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.goalId, row.sortKey, row.criterion, row.createdAt, row.updatedAt);
  }

  listAcsByGoal(goalId: string): AcRow[] {
    const rows = this.db
      .prepare<unknown[], { id: string; goal_id: string; sort_key: number; criterion: string; created_at: string; updated_at: string }>(
        `SELECT * FROM ${this.t.acs} WHERE goal_id = ? ORDER BY sort_key`,
      )
      .all(goalId);
    return rows.map((r) => ({
      id: r.id,
      goalId: r.goal_id,
      sortKey: r.sort_key,
      criterion: r.criterion,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /** querySpec 父链追溯：spec→goals→acs 三跳（索引序出，criterion 逐字出库）。 */
  parentChain(projectKey: string, slug: string): { spec: SpecRow; goals: Array<{ goal: GoalRow; acs: AcRow[] }> } | undefined {
    const spec = this.getBySlug(projectKey, slug);
    if (!spec) return undefined;
    const goals = this.listGoalsBySpec(spec.id).map((goal) => ({
      goal,
      acs: this.listAcsByGoal(goal.id),
    }));
    return { spec, goals };
  }

  /** 聚合派生读面（plugin-spec-roadmaps 1.4，code-design §6）——milestone_id 等值圈行
   *  （idx_spec_specs_milestone partial 索引前缀 + spec_status 过滤列；NULL 未挂链行
   *  拒之索引外）：deriveMilestoneAchieved 输入单源（只出判定列，零全行搬运）。 */
  specsByMilestone(
    milestoneId: string,
  ): Array<{ id: string; slug: string; specStatus: SpecStatus }> {
    const rows = this.db
      .prepare<unknown[], { id: string; slug: string; spec_status: string }>(
        `SELECT id, slug, spec_status FROM ${this.t.specs}
         WHERE milestone_id = ? AND milestone_id IS NOT NULL ORDER BY created_at, id`,
      )
      .all(milestoneId);
    return rows.map((r) => ({ id: r.id, slug: r.slug, specStatus: r.spec_status as SpecStatus }));
  }
}
