// schema v4/v5 迁移线单测（stage② A1 + followups #1）：v3 → v4 前向升级（注册行数据完整
// 迁移 + 六表在场）+ v5 台账表改名（存量行完整）+ 独立事务 downgrade（v5 → v3 形态恢复、
// 注册行数据保全、缓存表空表重建）+ 再升级。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openKnowledgeDatabase } from './open.js'
import { STORAGE_MIGRATIONS, STORAGE_SCHEMA_VERSION, downgradeKnowledgeSchema } from './schema.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-schema-v4-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

/** 手工铸 v3 库（逐版应用 v1-v3 语句 + 落注册行 + 旧缓存行）——模拟现网存量库 */
function buildV3Db(file: string): void {
  const db = new Database(file)
  try {
    for (const m of STORAGE_MIGRATIONS.filter((m) => m.version <= 3)) {
      for (const stmt of m.statements) db.prepare(stmt).run()
      db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)`).run(m.version, '2026-01-01T00:00:00Z')
    }
    db.prepare(
      `INSERT INTO projects (ws_path, knowledge_dir, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run('C:\\ws-a', 'C:\\ws-a\\.knowledge', 'pid-1', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')
    db.close()
  } catch (e) {
    db.close()
    throw e
  }
}

function tableNames(db: Database.Database): string[] {
  return db
    .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
    .all()
    .map((r) => r.name)
}

describe('schema v4 迁移线（独立事务可 downgrade）', () => {
  it('v3 存量库开库 → v5：六表在场（registry/entries 新形/versions/synonyms/supersede_ledger/recall_logs）+ FTS5 虚表 + 注册行数据完整迁移 + v5 台账表改名', () => {
    const root = tmpRoot()
    const file = join(root, 'knowledge.db')
    buildV3Db(file)
    const db = openKnowledgeDatabase(file)
    try {
      const tables = tableNames(db)
      expect(tables).toContain('knowledge_registry')
      expect(tables).not.toContain('projects') // 改名后旧名缺席
      expect(tables).toContain('knowledge_entries') // 新形（slug id 主键）
      expect(tables).toContain('knowledge_entry_versions')
      expect(tables).toContain('knowledge_synonyms')
      expect(tables).toContain('knowledge_supersede_ledger') // v5 改名（followups #1 用户裁决 2026-11-05）
      expect(tables).not.toContain('knowledge_merge_ledger') // 旧表名缺席（ALTER RENAME 零重建）
      expect(tables).toContain('knowledge_recall_logs')
      expect(tables).toContain('knowledge_fts') // FTS5 虚表
      // 新形列核销：slug 主键 + 三态 CHECK + 四档 rank CHECK + procedure_tag + merged_into + domain
      const cols = db
        .prepare<unknown[], { name: string }>(`PRAGMA table_info(knowledge_entries)`)
        .all()
        .map((r) => r.name)
      for (const c of [
        'id', 'title', 'title_norm', 'type', 'procedure_tag', 'status',
        'effective_rank', 'confirmed_version_id', 'merged_into', 'domain', 'updated_at',
      ]) {
        expect(cols).toContain(c)
      }
      // 注册行数据完整迁移（ALTER RENAME 零重建）
      const row = db
        .prepare<unknown[], { ws_path: string; knowledge_dir: string; project_id: string | null }>(
          `SELECT ws_path, knowledge_dir, project_id FROM knowledge_registry`,
        )
        .get()
      expect(row).toEqual({ ws_path: 'C:\\ws-a', knowledge_dir: 'C:\\ws-a\\.knowledge', project_id: 'pid-1' })
      const version = db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()
      expect(version).toEqual({ v: STORAGE_SCHEMA_VERSION })
    } finally {
      db.close()
    }
  })

  it('downgrade v5 → v3：新表全撤、旧 knowledge_entries 缓存空表重建、projects 改回且数据保全；再开库回 v5', () => {
    const root = tmpRoot()
    const file = join(root, 'knowledge.db')
    const db = openKnowledgeDatabase(file)
    // 落业务数据：注册行 + 词表 + 归并账（downgrade 数据保全面）
    db.prepare(
      `INSERT INTO knowledge_registry (ws_path, knowledge_dir, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run('C:\\ws-b', 'kd-b', 'pid-2', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
    db.prepare(`INSERT INTO knowledge_synonyms (term_norm, canonical_term) VALUES ('k8s', 'kubernetes')`).run()
    db.prepare(
      `INSERT INTO knowledge_supersede_ledger (winner_id, loser_id, reason, actor, merged_at) VALUES (?, ?, ?, ?, ?)`,
    ).run('winner', 'loser', 'dup', 'agent', '2026-01-03T00:00:00Z')
    downgradeKnowledgeSchema(db, 3)
    try {
      const tables = tableNames(db)
      expect(tables).toContain('projects') // 改回 v3 名
      expect(tables).not.toContain('knowledge_registry')
      expect(tables).not.toContain('knowledge_entry_versions')
      expect(tables).not.toContain('knowledge_synonyms')
      expect(tables).not.toContain('knowledge_supersede_ledger')
      expect(tables).not.toContain('knowledge_fts')
      // 旧 knowledge_entries 缓存空表恢复（v2 形态列核销）
      const cols = db
        .prepare<unknown[], { name: string }>(`PRAGMA table_info(knowledge_entries)`)
        .all()
        .map((r) => r.name)
      for (const c of ['ws_path', 'rel_path', 'domain_path', 'frontmatter_id', 'digest']) {
        expect(cols).toContain(c)
      }
      // 注册行数据保全
      const row = db.prepare<unknown[], { ws_path: string; project_id: string | null }>(
        `SELECT ws_path, project_id FROM projects`,
      ).get()
      expect(row).toEqual({ ws_path: 'C:\\ws-b', project_id: 'pid-2' })
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 3 })
    } finally {
      db.close()
    }
    // 再开库 → 回 v5（up/down 往返）
    const again = openKnowledgeDatabase(file)
    try {
      expect(again.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: STORAGE_SCHEMA_VERSION })
      expect(tableNames(again)).toContain('knowledge_fts')
      expect(
        again.prepare<unknown[], { ws_path: string }>(`SELECT ws_path FROM knowledge_registry`).get(),
      ).toEqual({ ws_path: 'C:\\ws-b' })
    } finally {
      again.close()
    }
  })

  it('downgrade 边界：目标 ≥ 库内版本（非降级路径）裸错；v3 以下无降级语句集裸错', () => {
    const root = tmpRoot()
    const db = openKnowledgeDatabase(join(root, 'knowledge.db'))
    try {
      expect(() => downgradeKnowledgeSchema(db, STORAGE_SCHEMA_VERSION)).toThrow(/非降级路径/)
      expect(() => downgradeKnowledgeSchema(db, 2)).toThrow(/无降级语句集/)
    } finally {
      db.close()
    }
  })
})
