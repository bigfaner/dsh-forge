// transitions-repo（plugin-spec 1.3）——spec_transitions append-only 台账 DAO：
// 唯一写径 appendTransition（INSERT）；读取面 listBySpec（idx 前缀序）。
// 台账 UPDATE/DELETE 由双触发器 ABORT 兜底（entities.md §5），repo 零改删路径。
import type Database from "better-sqlite3";
import type { SpecDbTables } from "../migrations/version-1.js";
import type { TransitionRow } from "../row-types.js";

interface TransitionRowDb {
  id: string;
  spec_id: string;
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
         (id, spec_id, from_status, to_status, note, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.specId, row.fromStatus, row.toStatus, row.note, row.actor, row.createdAt);
  }

  listBySpec(specId: string): TransitionRow[] {
    return (
      this.db
        .prepare<unknown[], TransitionRowDb>(
          `SELECT * FROM ${this.t.transitions} WHERE spec_id = ? ORDER BY created_at, id`,
        )
        .all(specId) as TransitionRowDb[]
    ).map((r) => ({
      id: r.id,
      specId: r.spec_id,
      fromStatus: r.from_status as TransitionRow["fromStatus"],
      toStatus: r.to_status as TransitionRow["toStatus"],
      note: r.note,
      actor: r.actor as TransitionRow["actor"],
      createdAt: r.created_at,
    }));
  }
}
