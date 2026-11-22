// reviews-repo（plugin-spec-roadmaps 1.4，code-design §6）——spec_reviews 统一复核表 DAO：
// appendReview（四级统一——entity_kind/entity_id）唯一写径（INSERT；append-only 双触发器
// UPDATE/DELETE ABORT 兜底，repo 零改删路径）+ latestByEntity（idx_spec_reviews_entity
// 前缀 + created_at 尾列逆序取首）。
import type Database from "@dsh-forge/lib-db";
import type { SpecDbTables } from "../migrations/version-1.js";
import type { ReviewRow } from "../row-types.js";

interface ReviewRowDb {
  id: string;
  entity_kind: string;
  entity_id: string;
  verdict: string;
  content: string;
  gap_note: string | null;
  actor: string;
  created_at: string;
}

function toReview(row: ReviewRowDb): ReviewRow {
  return {
    id: row.id,
    entityKind: row.entity_kind as ReviewRow["entityKind"],
    entityId: row.entity_id,
    verdict: row.verdict as ReviewRow["verdict"],
    content: row.content,
    gapNote: row.gap_note,
    actor: row.actor as ReviewRow["actor"],
    createdAt: row.created_at,
  };
}

export class ReviewsRepo {
  constructor(
    private readonly db: Database.Database,
    private readonly t: SpecDbTables,
  ) {}

  appendReview(row: ReviewRow): void {
    this.db
      .prepare(
        `INSERT INTO ${this.t.reviews}
         (id, entity_kind, entity_id, verdict, content, gap_note, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.entityKind, row.entityId, row.verdict, row.content, row.gapNote, row.actor, row.createdAt);
  }

  /** 按对象取最新报告（多轮复核全史保全——取首 = created_at 逆序 + id 决胜）。 */
  latestByEntity(entityKind: ReviewRow["entityKind"], entityId: string): ReviewRow | undefined {
    const row = this.db
      .prepare<unknown[], ReviewRowDb>(
        `SELECT * FROM ${this.t.reviews} WHERE entity_kind = ? AND entity_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(entityKind, entityId);
    return row === undefined ? undefined : toReview(row);
  }
}
