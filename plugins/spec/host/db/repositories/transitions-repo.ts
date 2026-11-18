// transitions-repo（plugin-spec 1.3 / v2 统一台账适配）——spec_transitions append-only 台账 DAO：
// 唯一写径 append（INSERT）；读取面 listBySpec（idx 前缀序）。
// v2 统一台账形态（entities.md §4）：entity_kind/entity_id 多态归属——本 repo 固定
// entity_kind='spec'（对读锚 entities.md §3 重建迁入同值），对外 TransitionRow（specId）
// 形态零改——四级写径（goal/milestone/roadmap）归 v2 服务域任务追加。
// 台账 UPDATE/DELETE 由双触发器 ABORT 兜底（entities.md §4），repo 零改删路径。
import type Database from "better-sqlite3";
import type { SpecDbTables } from "../migrations/version-1.js";
import type { TransitionRow } from "../row-types.js";

interface TransitionRowDb {
  id: string;
  entity_id: string;
  from_status: string;
  to_status: string;
  note: string | null;
  actor: string;
  created_at: string;
}

export class TransitionsRepo {
  constructor(
    private readonly db: Database.Database,
    private readonly t: SpecDbTables,
  ) {}

  append(row: TransitionRow): void {
    this.db
      .prepare(
        `INSERT INTO ${this.t.transitions}
         (id, entity_kind, entity_id, from_status, to_status, note, actor, created_at)
         VALUES (?, 'spec', ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.specId, row.fromStatus, row.toStatus, row.note, row.actor, row.createdAt);
  }

  listBySpec(specId: string): TransitionRow[] {
    return (
      this.db
        .prepare<unknown[], TransitionRowDb>(
          `SELECT * FROM ${this.t.transitions} WHERE entity_kind = 'spec' AND entity_id = ? ORDER BY created_at, id`,
        )
        .all(specId) as TransitionRowDb[]
    ).map((r) => ({
      id: r.id,
      specId: r.entity_id,
      fromStatus: r.from_status as TransitionRow["fromStatus"],
      toStatus: r.to_status as TransitionRow["toStatus"],
      note: r.note,
      actor: r.actor as TransitionRow["actor"],
      createdAt: r.created_at,
    }));
  }
}
