// 共库分域版本线回归（bug 34645ce2——e62f3458 同族第三处：spec 读侧）：共库 forge.db 被
// knowledge 自持版本门抬升全局 schema_meta 线（旧形状全局行 v1..v7）时，openSpecDb 无
// domain 读法、以全局 MAX(version)=7 对自身上限 1 判读即拒开（hl-smoke.err.log 次boot
// 拒开实锚）。修复处方 = fix-3 task-loop 同配方（R3-dba「锚域不锚表集合」）：openSpecDb
// 传 domain 锚，版本门只判读 spec 域版本线，异域高版本行不触发拒开；单装缺省路径零变化。
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { openSpecDb } from "../../host/db/connection.js";
import { SPEC_DB_SCHEMA_DOMAIN, SPEC_DB_SCHEMA_VERSION } from "../../host/db/migrations/version-1.js";

let dir: string | undefined;
afterAll(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
});

/** 共库文件路径（逐用例独立）。 */
function sharedDbFile(): string {
  dir ??= mkdtempSync(join(tmpdir(), "spec-shared-db-"));
  return join(dir, `combo-${Math.random().toString(36).slice(2)}.db`);
}

/**
 * 模拟共库初态：knowledge 自持版本门抬升的全局 schema_meta 行 v1..v7 + 全局指纹行
 * （旧写面形态——与 task-loop shared-db 回归同型夹具）。
 */
function seedKnowledgeGlobalLine(file: string): void {
  const raw = new Database(file);
  try {
    raw.exec(`CREATE TABLE schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
    raw.exec(`CREATE TABLE migration_digests (version INTEGER PRIMARY KEY, digest TEXT NOT NULL)`);
    for (let v = 1; v <= 7; v++) {
      raw.prepare(`INSERT INTO schema_meta VALUES (?, ?)`).run(v, "2026-01-01T00:00:00.000Z");
      raw.prepare(`INSERT INTO migration_digests VALUES (?, ?)`).run(v, `foreign-knowledge-digest-v${v}`);
    }
  } finally {
    raw.close();
  }
}

describe("spec 共库分域版本线（bug 34645ce2）", () => {
  it("共库预置异域高版本行（v7 > 上限）→ openSpecDb 开库成功：spec_* 八表落地 + 本域版本行入线，异域行不动", () => {
    const file = sharedDbFile();
    seedKnowledgeGlobalLine(file);
    const domain = openSpecDb(".", { file });
    try {
      // 五表在场（域前缀分表——与异域互不越界）
      const tables = domain.db
        .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all()
        .map((r) => r.name);
      for (const t of Object.values(domain.tables)) expect(tables).toContain(t);
      // 本域版本行入线；knowledge 异域行原样保留（锚域不锚全局表集合）
      const rows = domain.db
        .prepare<unknown[], { domain: string; version: number }>(`SELECT domain, version FROM schema_meta ORDER BY domain, version`)
        .all();
      const domains = new Set(rows.map((r) => r.domain));
      expect(domains).toContain(SPEC_DB_SCHEMA_DOMAIN);
      expect(domains).toContain("");
      const specTop = Math.max(...rows.filter((r) => r.domain === SPEC_DB_SCHEMA_DOMAIN).map((r) => r.version));
      expect(specTop).toBe(SPEC_DB_SCHEMA_VERSION);
    } finally {
      domain.db.close();
    }
    // 次boot（hl-smoke.err.log 拒开复现路径）：重开幂等、不拒开、不重迁移
    const again = openSpecDb(".", { file });
    const rows = again.db
      .prepare<unknown[], { domain: string; version: number }>(`SELECT domain, version FROM schema_meta WHERE domain = ?`)
      .all(SPEC_DB_SCHEMA_DOMAIN);
    expect(rows).toEqual([
      { domain: SPEC_DB_SCHEMA_DOMAIN, version: 1 },
      { domain: SPEC_DB_SCHEMA_DOMAIN, version: SPEC_DB_SCHEMA_VERSION },
    ]);
    again.db.close();
  });

  it("单装缺省路径零变化：spec 自持库版本线 = 上限 2", () => {
    dir ??= mkdtempSync(join(tmpdir(), "spec-shared-db-"));
    const file = join(dir, `solo-${Math.random().toString(36).slice(2)}.db`);
    const domain = openSpecDb(".", { file });
    try {
      const rows = domain.db
        .prepare<unknown[], { version: number }>(`SELECT version FROM schema_meta ORDER BY version`)
        .all();
      expect(rows).toEqual([{ version: 1 }, { version: SPEC_DB_SCHEMA_VERSION }]);
    } finally {
      domain.db.close();
    }
  });
});
