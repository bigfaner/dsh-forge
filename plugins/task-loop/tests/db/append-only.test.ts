// append-only 双触发器在场机检（plugin-task-loop 1.6）：settlements/checkpoints/records
// 三表 UPDATE/DELETE 全拒（RAISE(ABORT)），INSERT 直行——UPDATE/DELETE 零白名单的
// schema 层兜底（entities.md §3.2/§3.3/§3.4）。
import { describe, expect, it } from "vitest";
import { openDomainDb } from "../../host/db/connection.js";

const NOW = "2026-11-10T00:00:00.000Z";

type Domain = ReturnType<typeof openDomainDb>;

function insertTask(domain: Domain, id: string): void {
  domain.db
    .prepare(
      `INSERT INTO task_tasks (id, slug, local_id, title, task_type, project_key, created_at, updated_at)
       VALUES (?, 'alpha', 'seed', 'seed', 'coding-feature', 'k@11111111', ?, ?)`,
    )
    .run(id, NOW, NOW);
}

function seedAppendOnlyRow(domain: Domain, table: "task_settlements" | "task_checkpoints" | "task_records"): string {
  insertTask(domain, "t-seed");
  const id = `row-${table}`;
  switch (table) {
    case "task_settlements":
      domain.db
        .prepare(
          `INSERT INTO task_settlements (id, task_id, seq, fix_root_id, result, ac_results_json, commit_hash, evidence_json, created_at)
           VALUES (?, 't-seed', 1, NULL, 'blocked', '[]', NULL, '{}', ?)`,
        )
        .run(id, NOW);
      break;
    case "task_checkpoints":
      domain.db
        .prepare(
          `INSERT INTO task_checkpoints (id, project_key, slug, mark, wave_seq, created_at, base_commit_hash,
             tasks_total, commits_total, fixes_total, evidence_debts_total)
           VALUES (?, 'k@11111111', 'alpha', 'first-pass-complete', NULL, ?, 'abc', 1, 1, 0, 0)`,
        )
        .run(id, NOW);
      break;
    case "task_records":
      domain.db
        .prepare(
          `INSERT INTO task_records (id, task_id, verb, from_status, to_status, note, payload_json, dispatch_digest,
             loop_sourced, actor, session_id, created_at, updated_at)
           VALUES (?, 't-seed', 'claim', 'pending', 'in_progress', NULL, NULL, NULL, 0, 'core', NULL, ?, ?)`,
        )
        .run(id, NOW, NOW);
      break;
  }
  return id;
}

describe("append-only 双触发器机检（settlements/checkpoints/records）", () => {
  for (const table of ["task_settlements", "task_checkpoints", "task_records"] as const) {
    it(`${table}: INSERT 直行`, () => {
      const domain = openDomainDb(".", { file: ":memory:" });
      try {
        expect(seedAppendOnlyRow(domain, table)).toBe(`row-${table}`);
      } finally {
        domain.db.close();
      }
    });

    it(`${table}: UPDATE 被拒（append-only violation）`, () => {
      const domain = openDomainDb(".", { file: ":memory:" });
      try {
        const id = seedAppendOnlyRow(domain, table);
        expect(() => domain.db.prepare(`UPDATE ${table} SET created_at = ? WHERE id = ?`).run(NOW, id)).toThrowError(
          /append-only violation \(update\)/,
        );
      } finally {
        domain.db.close();
      }
    });

    it(`${table}: DELETE 被拒（append-only violation）`, () => {
      const domain = openDomainDb(".", { file: ":memory:" });
      try {
        const id = seedAppendOnlyRow(domain, table);
        expect(() => domain.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)).toThrowError(
          /append-only violation \(delete\)/,
        );
      } finally {
        domain.db.close();
      }
    });
  }

  it("task_tasks（非 append-only 表）UPDATE 照常可行", () => {
    const domain = openDomainDb(".", { file: ":memory:" });
    try {
      insertTask(domain, "t-upd");
      domain.db.prepare(`UPDATE task_tasks SET title = ? WHERE id = ?`).run("new", "t-upd");
      const row = domain.db.prepare<[string], { title: string }>(`SELECT title FROM task_tasks WHERE id = ?`).get("t-upd");
      expect(row?.title).toBe("new");
    } finally {
      domain.db.close();
    }
  });
});
