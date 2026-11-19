// schema lineage（plugin-task-loop 1.6）：版本线 v1 锚（schema_meta 单版本单事务落地）+
// DDL 快照与 entities.md 单源对读——六表列名/序从 entities.md §3 SQL 块逐表解析，
// 与 version-1.ts 语句逐表逐序比对（列名/约束/索引/触发器全名与 entities 逐字一致）。
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openDomainDb } from "../../host/db/connection.js";
import { TASK_LOOP_DB_SCHEMA_VERSION, TASK_LOOP_MIGRATIONS, taskTableNames } from "../../host/db/migrations/version-1.js";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// entities.md 正本在检出根 .forge/docs/proposals/plugin-task-loop/——worktree 形态在检出根
// .forge 之下，逐级上溯定位（fix 6af5e91e 工作区约定：路径真值以实盘为准）。
function findUp(start: string, rel: string): string {
  let dir = start;
  for (;;) {
    const candidate = resolve(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`findUp: ${rel} not found from ${start}`);
    dir = parent;
  }
}
const ENTITIES_MD = findUp(pkgDir, join(".forge", "docs", "proposals", "plugin-task-loop", "entities.md"));

/** entities.md / version-1.ts 同构解析：取全部 ```sql 围栏中的 CREATE TABLE 块列名序列。 */
function tableColumnsOf(sqlFences: readonly string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const fence of sqlFences) {
    const m = fence.match(/^CREATE TABLE (\S+) \(/);
    if (!m) continue;
    const columns: string[] = [];
    for (const line of fence.split("\n")) {
      const cm = line.match(/^ {4}([A-Za-z_][A-Za-z0-9_]*)(\s|$)/);
      if (cm && !["CONSTRAINT", "PRIMARY", "UNIQUE"].includes(cm[1]!)) columns.push(cm[1]!);
    }
    result.set(m[1]!, columns);
  }
  return result;
}

function sqlFencesOf(text: string): string[] {
  return [...text.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]!);
}

const migrationSql = TASK_LOOP_MIGRATIONS[0]!.statements.map((s) => (typeof s === "string" ? s : s.sql));

describe("版本线 v1 锚", () => {
  it("版本上限 = 1；迁移序列恰一版 v1", () => {
    expect(TASK_LOOP_DB_SCHEMA_VERSION).toBe(1);
    expect(TASK_LOOP_MIGRATIONS).toHaveLength(1);
    expect(TASK_LOOP_MIGRATIONS[0]!.version).toBe(1);
  });

  it("开库后 schema_meta 版本线 = 1（新线单事务落地）", () => {
    const domain = openDomainDb(".", { file: ":memory:" });
    try {
      const row = domain.db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get();
      expect(row?.v).toBe(1);
      const applied = domain.db
        .prepare<unknown[], { version: number }>(`SELECT version FROM schema_meta ORDER BY version`)
        .all();
      expect(applied.map((r) => r.version)).toEqual([1]);
    } finally {
      domain.db.close();
    }
  });

  it("开库幂等：二次打开不重复迁移（版本门直接可用）", () => {
    const home = mkdtempSync(join(tmpdir(), "task-loop-db-idem-"));
    const file = resolve(home, "forge", "db", "task-loop", "task-loop.db");
    const d1 = openDomainDb(file);
    d1.db.close();
    const d2 = openDomainDb(file);
    try {
      const rows = d2.db
        .prepare<unknown[], { version: number }>(`SELECT version FROM schema_meta ORDER BY version`)
        .all();
      expect(rows.map((r) => r.version)).toEqual([1]);
    } finally {
      d2.db.close();
    }
  });
});

describe("DDL 与 entities.md 单源对读", () => {
  const entities = readFileSync(ENTITIES_MD, "utf8");
  const entitiesColumns = tableColumnsOf(sqlFencesOf(entities));
  const migrationColumns = tableColumnsOf(migrationSql);
  const tables = taskTableNames();

  it("六表列名/序逐表逐序一致（列名与 entities 逐字一致）", () => {
    for (const [table, key] of [
      ["task_tasks", "tasks"],
      ["task_settlements", "settlements"],
      ["task_checkpoints", "checkpoints"],
      ["task_edges", "edges"],
      ["task_session_links", "sessionLinks"],
      ["task_records", "records"],
    ] as const) {
      expect(tables[key]).toBe(table);
      const fromEntities = entitiesColumns.get(table);
      expect(fromEntities, `${table} 在 entities.md §3 无 CREATE TABLE 块`).toBeDefined();
      expect(migrationColumns.get(table), `${table} 列名/序漂移`).toEqual(fromEntities);
    }
  });

  it("列数锚：19/9/11/5/5/13（entities.md 字段级设计节口径）", () => {
    expect(entitiesColumns.get("task_tasks")).toHaveLength(19);
    expect(entitiesColumns.get("task_settlements")).toHaveLength(9);
    expect(entitiesColumns.get("task_checkpoints")).toHaveLength(11);
    expect(entitiesColumns.get("task_edges")).toHaveLength(5);
    expect(entitiesColumns.get("task_session_links")).toHaveLength(5);
    expect(entitiesColumns.get("task_records")).toHaveLength(13);
  });

  it("索引/触发器/表级 UNIQUE 全名（task_ 前缀）双侧在场", () => {
    const entitiesAll = sqlFencesOf(entities).join("\n");
    const migrationAll = migrationSql.join("\n");
    for (const name of [
      "uq_task_tasks_project_slug_local",
      "idx_task_tasks_container",
      "idx_task_tasks_fix",
      "uq_task_settle_seq",
      "uq_task_cp_milestone",
      "idx_task_cp_container",
      "idx_task_edges_prerequisite",
      "uq_task_tsl_task_session",
      "idx_task_tsl_session",
      "idx_task_records_task",
      "idx_task_records_session",
      "trg_task_settlements_no_update",
      "trg_task_settlements_no_delete",
      "trg_task_checkpoints_no_update",
      "trg_task_checkpoints_no_delete",
      "trg_task_records_no_update",
      "trg_task_records_no_delete",
    ]) {
      expect(entitiesAll, `${name} entities.md 缺席`).toContain(name);
      expect(migrationAll, `${name} 迁移 DDL 缺席`).toContain(name);
    }
  });

  it("CHECK 约束全名（ck_task_* 前缀）双侧在场", () => {
    const entitiesAll = sqlFencesOf(entities).join("\n");
    const migrationAll = migrationSql.join("\n");
    for (const name of [
      "ck_task_tasks_status",
      "ck_task_tasks_priority",
      "ck_task_tasks_breaking",
      "ck_task_tasks_complexity",
      "ck_task_settle_result",
      "ck_task_cp_mark",
      "ck_task_edges_origin",
      "ck_task_records_loop",
      "ck_task_records_actor",
    ]) {
      expect(entitiesAll).toContain(name);
      expect(migrationAll).toContain(name);
    }
  });
});

describe("DDL 快照锚（防抖动）", () => {
  it("v1 语句集快照", () => {
    expect(migrationSql).toMatchSnapshot();
  });
});
