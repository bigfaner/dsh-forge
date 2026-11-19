// docs-repo（plugin-spec 1.3）——spec_docs 1:1 登记行 DAO（spec_id 自然键 PK，零代理 id）。
// 悬空态不在本表表达（读时 fs 现算，entities.md §4 分界）；rel_path 跨 spec 重复守卫
// 查询面 relPathTaken（服务层单点消费——本表无 project_key，经 specs JOIN 圈定归属）。
import type Database from "better-sqlite3";
import type { SpecDbTables } from "../migrations/version-1.js";
import type { DocRow } from "../row-types.js";

interface DocRowDb {
  spec_id: string;
  rel_path: string;
  created_at: string;
  updated_at: string;
}

export class DocsRepo {
  constructor(
    private readonly db: Database.Database,
    private readonly t: SpecDbTables,
  ) {}

  upsert(row: DocRow): void {
    this.db
      .prepare(
        `INSERT INTO ${this.t.docs} (spec_id, rel_path, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(spec_id) DO UPDATE SET rel_path = excluded.rel_path, updated_at = excluded.updated_at`,
      )
      .run(row.specId, row.relPath, row.createdAt, row.updatedAt);
  }

  getBySpec(specId: string): DocRow | undefined {
    const row = this.db
      .prepare<unknown[], DocRowDb>(
        `SELECT * FROM ${this.t.docs} WHERE spec_id = ?`,
      )
      .get(specId);
    return row === undefined
      ? undefined
      : { specId: row.spec_id, relPath: row.rel_path, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  /** 跨 spec rel_path 重复守卫查询面（同一 project 归属域内判定）。 */
  relPathTaken(relPath: string, projectKey: string, excludeSpecId?: string): boolean {
    const sql = excludeSpecId
      ? `SELECT 1 AS taken FROM ${this.t.docs} d
         JOIN ${this.t.specs} s ON s.id = d.spec_id
         WHERE d.rel_path = ? AND s.project_key = ? AND d.spec_id != ? LIMIT 1`
      : `SELECT 1 AS taken FROM ${this.t.docs} d
         JOIN ${this.t.specs} s ON s.id = d.spec_id
         WHERE d.rel_path = ? AND s.project_key = ? LIMIT 1`;
    return (
      (excludeSpecId
        ? this.db.prepare(sql).get(relPath, projectKey, excludeSpecId)
        : this.db.prepare(sql).get(relPath, projectKey)) !== undefined
    );
  }
}
