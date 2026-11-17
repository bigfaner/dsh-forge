// 共库分域版本线回归（bug e62f3458——1.6 复跑实证）：共库 forge.db 被 spec/knowledge
// 先行迁移抬升（旧形状 schema_meta 全局行 v1/v2 + 指纹行在场）时，task-loop 以自身
// 支持上限 1 做全局判读即拒开。修复处方 = R3-dba「锚域不锚表集合」分域版本线——
// openDomainDb 传 domain 锚，版本门只判读 task-loop 域版本线，异域高版本行不触发拒开；
// 单装缺省路径（本域独占库）行为零变化。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { openDomainDb } from "../../host/db/connection.js";
import { TASK_LOOP_DB_SCHEMA_DOMAIN, TASK_LOOP_DB_SCHEMA_VERSION } from "../../host/db/migrations/version-1.js";

let dir: string | undefined;
afterAll(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
});

/** 共库文件路径（逐用例独立）。 */
function sharedDbFile(): string {
  dir ??= mkdtempSync(join(tmpdir(), "task-loop-shared-db-"));
  return join(dir, `combo-${Math.random().toString(36).slice(2)}.db`);
}

/** 模拟共库初态：旧形状 schema_meta 全局行 v1/v2（异域 spec/knowledge 先行迁移）+ 全局指纹行。 */
function seedForeignDomainRows(file: string): void {
  const raw = new Database(file);
  try {
    raw.exec(`CREATE TABLE schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
    raw.exec(`CREATE TABLE migration_digests (version INTEGER PRIMARY KEY, digest TEXT NOT NULL)`);
    raw.prepare(`INSERT INTO schema_meta VALUES (?, ?)`).run(1, "2026-01-01T00:00:00.000Z");
    raw.prepare(`INSERT INTO schema_meta VALUES (?, ?)`).run(2, "2026-01-02T00:00:00.000Z");
    raw.prepare(`INSERT INTO migration_digests VALUES (?, ?)`).run(1, "foreign-spec-digest-v1");
    raw.prepare(`INSERT INTO migration_digests VALUES (?, ?)`).run(2, "foreign-knowledge-digest-v2");
  } finally {
    raw.close();
  }
}

describe("task-loop 共库分域版本线（bug e62f3458）", () => {
  it("共库预置异域高版本行（v2 > 上限 1）→ 开库成功：task_* 六表落地 + 本域版本行入线，异域行不动", () => {
    const file = sharedDbFile();
    seedForeignDomainRows(file);
    const domain = openDomainDb(".", { file });
    try {
      // 六表在场（域前缀分表——与异域互不越界）
      const tables = domain.db
        .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all()
        .map((r) => r.name);
      for (const t of Object.values(domain.tables)) expect(tables).toContain(t);
      // 本域版本行入线，异域行原样保留（锚域不锚全局表集合）
      const rows = domain.db
        .prepare<unknown[], { domain: string; version: number }>(`SELECT domain, version FROM schema_meta ORDER BY domain, version`)
        .all();
      expect(rows).toEqual([
        { domain: "", version: 1 },
        { domain: "", version: 2 },
        { domain: TASK_LOOP_DB_SCHEMA_DOMAIN, version: TASK_LOOP_DB_SCHEMA_VERSION },
      ]);
    } finally {
      domain.db.close();
    }
    // 重开幂等（不重迁移、异域行仍不动）
    const again = openDomainDb(".", { file });
    const rows = again.db
      .prepare<unknown[], { domain: string; version: number }>(`SELECT domain, version FROM schema_meta WHERE domain != ''`)
      .all();
    expect(rows).toEqual([{ domain: TASK_LOOP_DB_SCHEMA_DOMAIN, version: TASK_LOOP_DB_SCHEMA_VERSION }]);
    again.db.close();
  });

  it("单装缺省路径零变化：本域自持库版本线 = 1（域行读面与既有 lineage 断言同型）", () => {
    dir ??= mkdtempSync(join(tmpdir(), "task-loop-shared-db-"));
    const file = join(dir, `solo-${Math.random().toString(36).slice(2)}.db`);
    const domain = openDomainDb(".", { file });
    try {
      const rows = domain.db
        .prepare<unknown[], { version: number }>(`SELECT version FROM schema_meta ORDER BY version`)
        .all();
      expect(rows).toEqual([{ version: 1 }]);
    } finally {
      domain.db.close();
    }
  });
});
