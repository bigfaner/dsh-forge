// knowledge 写侧域内写回归（bug 34645ce2——e62f3458 同族第三处：knowledge 写面）：共库
// 形态锚表已被先开域（spec/task-loop 分域配方）落为分域形状（schema_meta 复合主键
// (domain, version)）时，knowledge 自持 open 的写点 `INSERT INTO schema_meta (version,
// applied_at)` 违反 domain NOT NULL 即断链，其版本门抬「全局线」的写法即同族复发源。
// 修复处方 = fix-3 task-loop 同配方（lib/db 单源）：openKnowledgeDatabase 经 lib/db
// openDatabase domain 模式——版本行/指纹行按 knowledge 域分域写，异域行零触碰；单装
// 自持库行为零变化（既有 storage 测试全绿）。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { openKnowledgeDatabase } from "../../host/storage/open.js";
import { KNOWLEDGE_DB_SCHEMA_DOMAIN, STORAGE_SCHEMA_VERSION } from "../../host/storage/schema.js";

let dir: string | undefined;
afterAll(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
});

/** 共库文件路径（逐用例独立）。 */
function sharedDbFile(): string {
  dir ??= mkdtempSync(join(tmpdir(), "knowledge-shared-db-"));
  return join(dir, `combo-${Math.random().toString(36).slice(2)}.db`);
}

/** 模拟共库初态：先开域（spec 分域配方）已落分域形状锚表 + spec 域版本/指纹行。 */
function seedSpecDomainRows(file: string): void {
  const raw = new Database(file);
  try {
    raw.exec(`CREATE TABLE schema_meta (
    domain     TEXT NOT NULL,
    version    INTEGER NOT NULL,
    applied_at TEXT NOT NULL,
    PRIMARY KEY (domain, version)
)`);
    raw.exec(`CREATE TABLE migration_digests (
    domain TEXT NOT NULL,
    version INTEGER NOT NULL,
    digest  TEXT NOT NULL,
    PRIMARY KEY (domain, version)
)`);
    raw.prepare(`INSERT INTO schema_meta VALUES (?, ?, ?)`).run("spec", 1, "2026-01-01T00:00:00.000Z");
    raw.prepare(`INSERT INTO migration_digests VALUES (?, ?, ?)`).run("spec", 1, "foreign-spec-digest-v1");
  } finally {
    raw.close();
  }
}

describe("knowledge 写侧域内写（bug 34645ce2）", () => {
  it("共库锚表为分域形状（spec 先开）→ openKnowledgeDatabase 开库成功：knowledge_* 表落地 + 版本行按域写，异域行不动", () => {
    const file = sharedDbFile();
    seedSpecDomainRows(file);
    const db = openKnowledgeDatabase(file);
    try {
      const tables = db
        .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all()
        .map((r) => r.name);
      for (const t of ["knowledge_registry", "knowledge_entries", "knowledge_recall_logs", "knowledge_domains"]) {
        expect(tables).toContain(t);
      }
      // 版本行按域写（上限版本在 knowledge 域线），spec 异域行原样保留
      const rows = db
        .prepare<unknown[], { domain: string; version: number }>(`SELECT domain, version FROM schema_meta ORDER BY domain, version`)
        .all();
      const specRows = rows.filter((r) => r.domain === "spec");
      expect(specRows).toEqual([{ domain: "spec", version: 1 }]);
      const kTop = Math.max(...rows.filter((r) => r.domain === KNOWLEDGE_DB_SCHEMA_DOMAIN).map((r) => r.version));
      expect(kTop).toBe(STORAGE_SCHEMA_VERSION);
    } finally {
      db.close();
    }
    // 重开幂等（不重迁移、异域行仍不动）
    const again = openKnowledgeDatabase(file);
    const rows = again
      .prepare<unknown[], { domain: string; version: number }>(`SELECT domain, version FROM schema_meta WHERE domain != ''`)
      .all();
    expect(rows).toEqual([
      { domain: KNOWLEDGE_DB_SCHEMA_DOMAIN, version: 1 },
      { domain: KNOWLEDGE_DB_SCHEMA_DOMAIN, version: 2 },
      { domain: KNOWLEDGE_DB_SCHEMA_DOMAIN, version: 3 },
      { domain: KNOWLEDGE_DB_SCHEMA_DOMAIN, version: 4 },
      { domain: KNOWLEDGE_DB_SCHEMA_DOMAIN, version: 5 },
      { domain: KNOWLEDGE_DB_SCHEMA_DOMAIN, version: 6 },
      { domain: KNOWLEDGE_DB_SCHEMA_DOMAIN, version: 7 },
      { domain: "spec", version: 1 },
    ]);
    again.close();
  });

  it("单装缺省路径零变化：knowledge 自持库版本线 = 1..7", () => {
    dir ??= mkdtempSync(join(tmpdir(), "knowledge-shared-db-"));
    const file = join(dir, `solo-${Math.random().toString(36).slice(2)}.db`);
    const db = openKnowledgeDatabase(file);
    try {
      const versions = db
        .prepare<unknown[], { version: number }>(`SELECT version FROM schema_meta ORDER BY version`)
        .all()
        .map((r) => r.version);
      expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7]);
    } finally {
      db.close();
    }
  });
});
