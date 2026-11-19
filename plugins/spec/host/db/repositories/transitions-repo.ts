// transitions-repo（plugin-spec 1.3 → v2 统一台账，plugin-spec-roadmaps 1.4）——
// spec_transitions append-only 台账 DAO：唯一写径 appendTransition（四级统一——
// entity_kind/entity_id）+ listByEntity（idx_spec_trans_entity 前缀序）+ collectByGroup
// （分组归集：调用方父链解析出 (kind,id) 集 → 逐 kind 索引序出 → 应用层归并）。
// v1 spec 径（append/listBySpec，TransitionRow.specId 形态）保留为统一台账薄委托——
// M3 现役消费面零改。台账 UPDATE/DELETE 由双触发器 ABORT 兜底（entities.md §4）。
import type Database from "better-sqlite3";
import type { SpecDbTables } from "../migrations/version-1.js";
import type { EntityKind, EntityTransitionRow, SpecStatus, TransitionRow } from "../row-types.js";

interface TransitionRowDb {
  id: string;
  entity_kind: string;
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

  /** 统一台账唯一写径（四级——spec/goal/milestone/roadmap；from/to 值域校验归应用层 per-kind 单点）。 */
  appendTransition(row: EntityTransitionRow): void {
    this.db
      .prepare(
        `INSERT INTO ${this.t.transitions}
         (id, entity_kind, entity_id, from_status, to_status, note, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.entityKind, row.entityId, row.fromStatus, row.toStatus, row.note, row.actor, row.createdAt);
  }

  /** idx 前缀序（(kind,id) 等值 + created_at 序）。 */
  listByEntity(entityKind: EntityKind, entityId: string): EntityTransitionRow[] {
    const rows = this.db
      .prepare<unknown[], TransitionRowDb>(
        `SELECT * FROM ${this.t.transitions} WHERE entity_kind = ? AND entity_id = ? ORDER BY created_at, id`,
      )
      .all(entityKind, entityId);
    return rows.map((r) => ({
      id: r.id,
      entityKind: r.entity_kind as EntityKind,
      entityId: r.entity_id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      note: r.note,
      actor: r.actor as EntityTransitionRow["actor"],
      createdAt: r.created_at,
    }));
  }

  /** 分组归集：entries = 调用方父链解析出的 (kind,id) 集——逐项索引序出，键 `${kind}:${id}`
   *  应用层归并（单 roadmap 行数级，毫秒级；零 GROUP CONCAT 技巧）。 */
  collectByGroup(
    entries: ReadonlyArray<{ entityKind: EntityKind; entityId: string }>,
  ): Map<string, EntityTransitionRow[]> {
    const grouped = new Map<string, EntityTransitionRow[]>();
    const stmt = this.db.prepare<unknown[], TransitionRowDb>(
      `SELECT * FROM ${this.t.transitions} WHERE entity_kind = ? AND entity_id = ? ORDER BY created_at, id`,
    );
    for (const e of entries) {
      grouped.set(`${e.entityKind}:${e.entityId}`, stmt.all(e.entityKind, e.entityId).map((r) => ({
        id: r.id,
        entityKind: r.entity_kind as EntityKind,
        entityId: r.entity_id,
        fromStatus: r.from_status,
        toStatus: r.to_status,
        note: r.note,
        actor: r.actor as EntityTransitionRow["actor"],
        createdAt: r.created_at,
      })));
    }
    return grouped;
  }

  // ── v1 spec 径（薄委托——M3 现役消费面零改）──

  append(row: TransitionRow): void {
    this.appendTransition({
      id: row.id,
      entityKind: "spec",
      entityId: row.specId,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: row.note,
      actor: row.actor,
      createdAt: row.createdAt,
    });
  }

  listBySpec(specId: string): TransitionRow[] {
    return this.listByEntity("spec", specId).map((r) => ({
      id: r.id,
      specId: r.entityId,
      fromStatus: r.fromStatus as SpecStatus,
      toStatus: r.toStatus as SpecStatus,
      note: r.note,
      actor: r.actor,
      createdAt: r.createdAt,
    }));
  }
}
