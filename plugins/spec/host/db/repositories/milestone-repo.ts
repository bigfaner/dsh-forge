// milestone-repo（plugin-spec-roadmaps 1.4，code-design §6）——spec_milestones DAO 单源：
// insertMilestone（seq 链内 max+1 赋序 + roadmap 终态守卫——settlement-repo nextSeq 同径）/
// updateFields / reassignSeq（重排两步法：全量临时负值区 → 目标值，避开 uq_spec_milestones_order，
// 调用方事务闭包内两步同事务）/ listByRoadmap（uq 前缀 seq 序）/ findById。
import type Database from "better-sqlite3";
import { SpecError } from "../../domain/specs/errors.js";
import type { SpecDbTables } from "../migrations/version-1.js";
import type { AcEntry, MilestoneInsert, MilestoneRow } from "../row-types.js";

interface MilestoneRowDb {
  id: string;
  roadmap_id: string;
  seq: number;
  title: string;
  brief: string | null;
  ac_json: string;
  milestone_status: string;
  created_at: string;
  updated_at: string;
}

function toMilestone(row: MilestoneRowDb): MilestoneRow {
  return {
    id: row.id,
    roadmapId: row.roadmap_id,
    seq: row.seq,
    title: row.title,
    brief: row.brief,
    acJson: JSON.parse(row.ac_json) as AcEntry[],
    milestoneStatus: row.milestone_status as MilestoneRow["milestoneStatus"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MilestoneRepo {
  constructor(
    private readonly db: Database.Database,
    private readonly t: SpecDbTables,
  ) {}

  /** seq 链内赋序（同 roadmap max+1，settlement-repo nextSeq 同径）+ roadmap 终态守卫
   *  （向 completed roadmap 追加 → ERR_SPEC_ROADMAP_TERMINAL——聚合恒假防护）。 */
  insertMilestone(row: MilestoneInsert): MilestoneRow {
    const roadmap = this.db
      .prepare<unknown[], { roadmap_status: string }>(
        `SELECT roadmap_status FROM ${this.t.roadmaps} WHERE id = ?`,
      )
      .get(row.roadmapId);
    if (roadmap === undefined) {
      throw new SpecError("ERR_SPEC_ROADMAP_UNKNOWN", `roadmap 缺席：${row.roadmapId}`, { roadmapId: row.roadmapId });
    }
    if (roadmap.roadmap_status === "completed") {
      throw new SpecError("ERR_SPEC_ROADMAP_TERMINAL", `roadmap 已 completed，禁止追加 milestone：${row.roadmapId}`, {
        roadmapId: row.roadmapId,
      });
    }
    const seqRow = this.db
      .prepare<unknown[], { n: number }>(
        `SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM ${this.t.milestones} WHERE roadmap_id = ?`,
      )
      .get(row.roadmapId);
    const seq = seqRow?.n ?? 1;
    this.db
      .prepare(
        `INSERT INTO ${this.t.milestones}
         (id, roadmap_id, seq, title, brief, ac_json, milestone_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.roadmapId, seq, row.title, row.brief, JSON.stringify(row.acJson), row.milestoneStatus, row.createdAt, row.updatedAt);
    return { ...row, seq };
  }

  /** 字段级修订（title/brief/ac_json——状态流转走统一台账两写径）。 */
  updateFields(
    id: string,
    patch: { title?: string; brief?: string | null; acJson?: AcEntry[] },
    updatedAt: string,
  ): void {
    const sets: string[] = ["updated_at = ?"];
    const args: unknown[] = [updatedAt];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      args.push(patch.title);
    }
    if (patch.brief !== undefined) {
      sets.push("brief = ?");
      args.push(patch.brief);
    }
    if (patch.acJson !== undefined) {
      sets.push("ac_json = ?");
      args.push(JSON.stringify(patch.acJson));
    }
    args.push(id);
    this.db.prepare(`UPDATE ${this.t.milestones} SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  }

  /** seq 重排两步法（moveMilestone 服务层展开排列后调用；调用方事务闭包内）：
   *  第一步全量落临时负值区（-(i+1) 互异，避开 uq(roadmap_id, seq) 正值冲突），
   *  第二步落目标值——任一步失败整体回滚，零负值残留。 */
  reassignSeq(
    roadmapId: string,
    assignments: ReadonlyArray<{ id: string; seq: number }>,
    updatedAt: string,
  ): void {
    const stepOne = this.db.prepare(
      `UPDATE ${this.t.milestones} SET seq = ?, updated_at = ? WHERE id = ? AND roadmap_id = ?`,
    );
    const stepTwo = this.db.prepare(
      `UPDATE ${this.t.milestones} SET seq = ?, updated_at = ? WHERE id = ? AND roadmap_id = ?`,
    );
    assignments.forEach((a, i) => stepOne.run(-(i + 1), updatedAt, a.id, roadmapId));
    for (const a of assignments) stepTwo.run(a.seq, updatedAt, a.id, roadmapId);
  }

  /** uq(roadmap_id, seq) 前缀 seq 序。 */
  listByRoadmap(roadmapId: string): MilestoneRow[] {
    const rows = this.db
      .prepare<unknown[], MilestoneRowDb>(
        `SELECT * FROM ${this.t.milestones} WHERE roadmap_id = ? ORDER BY seq`,
      )
      .all(roadmapId);
    return rows.map(toMilestone);
  }

  findById(id: string): MilestoneRow | undefined {
    const row = this.db
      .prepare<unknown[], MilestoneRowDb>(`SELECT * FROM ${this.t.milestones} WHERE id = ?`)
      .get(id);
    return row === undefined ? undefined : toMilestone(row);
  }
}
