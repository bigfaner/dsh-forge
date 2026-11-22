// roadmap-repo（plugin-spec-roadmaps 1.4，code-design §6）——spec_roadmaps DAO 单源
// （行级唯一 SQL 落点）：insertRoadmap / updateRoadmapFields / updateStatus（状态流转唯一径，
// 含验收确认——调用方事务闭包内与统一台账两写）/ getBySlug（uq 点查）/ listByProject
// （idx_spec_roadmaps_listing 索引序）。排序锚纪律：ORDER BY created_at 决定性锚。
import type Database from "@dsh-forge/lib-db";
import type { SpecDbTables } from "../migrations/version-1.js";
import type { AcEntry, ObjectiveStatus, RoadmapRow } from "../row-types.js";

interface RoadmapRowDb {
  id: string;
  project_key: string;
  slug: string;
  title: string;
  brief: string | null;
  ac_json: string;
  roadmap_status: string;
  created_at: string;
  updated_at: string;
}

function toRoadmap(row: RoadmapRowDb): RoadmapRow {
  return {
    id: row.id,
    projectKey: row.project_key,
    slug: row.slug,
    title: row.title,
    brief: row.brief,
    acJson: JSON.parse(row.ac_json) as AcEntry[],
    roadmapStatus: row.roadmap_status as ObjectiveStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RoadmapRepo {
  constructor(
    private readonly db: Database.Database,
    private readonly t: SpecDbTables,
  ) {}

  insertRoadmap(row: RoadmapRow): void {
    this.db
      .prepare(
        `INSERT INTO ${this.t.roadmaps}
         (id, project_key, slug, title, brief, ac_json, roadmap_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.projectKey,
        row.slug,
        row.title,
        row.brief,
        JSON.stringify(row.acJson),
        row.roadmapStatus,
        row.createdAt,
        row.updatedAt,
      );
  }

  /** 字段级修订（title/brief/ac_json——状态流转走 updateStatus 单径）。 */
  updateRoadmapFields(
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
    this.db.prepare(`UPDATE ${this.t.roadmaps} SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  }

  /** roadmap_status 现值改写——唯一合法写径 = 推进/确认动词两写事务闭包内调用。 */
  updateStatus(id: string, roadmapStatus: ObjectiveStatus, updatedAt: string): void {
    this.db
      .prepare(`UPDATE ${this.t.roadmaps} SET roadmap_status = ?, updated_at = ? WHERE id = ?`)
      .run(roadmapStatus, updatedAt, id);
  }

  /** uq(project_key, slug) 点查（queryRoadmap 定位主径）。 */
  getBySlug(projectKey: string, slug: string): RoadmapRow | undefined {
    const row = this.db
      .prepare<unknown[], RoadmapRowDb>(
        `SELECT * FROM ${this.t.roadmaps} WHERE project_key = ? AND slug = ?`,
      )
      .get(projectKey, slug);
    return row === undefined ? undefined : toRoadmap(row);
  }

  /** id 点查（复核动词 entityId 存在性守卫——milestone-repo.findById 同径）。 */
  findById(id: string): RoadmapRow | undefined {
    const row = this.db.prepare<unknown[], RoadmapRowDb>(`SELECT * FROM ${this.t.roadmaps} WHERE id = ?`).get(id);
    return row === undefined ? undefined : toRoadmap(row);
  }

  /** listing 索引序（idx_spec_roadmaps_listing：project_key 等值前缀 + created_at 序）。 */
  listByProject(projectKey: string): RoadmapRow[] {
    const rows = this.db
      .prepare<unknown[], RoadmapRowDb>(
        `SELECT * FROM ${this.t.roadmaps} WHERE project_key = ? ORDER BY created_at, id`,
      )
      .all(projectKey);
    return rows.map(toRoadmap);
  }
}
