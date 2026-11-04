// A2 库初始化单测：单文件全表同库、WAL + busy_timeout PRAGMA、schema_meta 版本线
//（v1 初始版本行 + 打开幂等 + 版本门拒开）、库目录显式权限位（判例 cd85fde5）。
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { BUSY_TIMEOUT_MS } from './concurrency.js'
import { ensureKnowledgeDbDir, openKnowledgeDatabase } from './open.js'
import { STORAGE_SCHEMA_VERSION } from './schema.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-storage-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function schemaMetaRows(db: Database.Database): Array<{ version: number; applied_at: string }> {
  return db.prepare<unknown[], { version: number; applied_at: string }>(
    `SELECT version, applied_at FROM schema_meta ORDER BY version`,
  ).all()
}

describe('A2 open：单文件全表同库 + 并发 PRAGMA + 版本线', () => {
  it('首开：建库 + WAL + busy_timeout + v1 版本行 + 注册表在场（单文件含全部表）', () => {
    const root = tmpRoot()
    const file = join(root, 'sub', 'knowledge.db')
    const db = openKnowledgeDatabase(file)
    try {
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
      expect(db.pragma('busy_timeout', { simple: true })).toBe(BUSY_TIMEOUT_MS)
      expect(schemaMetaRows(db).map((r) => r.version)).toEqual([1, 2, 3]) // v3：projects.project_id 列（fix-2）
      const tables = db
        .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all()
        .map((r) => r.name)
      expect(tables).toContain('schema_meta')
      expect(tables).toContain('projects') // 单库含全部表（v2：entries/recall_logs/seed_migration）
    } finally {
      db.close()
    }
  })

  it('重开幂等：version 相等不重复迁移、不重复版本行', () => {
    const file = join(tmpRoot(), 'knowledge.db')
    const first = openKnowledgeDatabase(file)
    first.close()
    const second = openKnowledgeDatabase(file)
    try {
      expect(schemaMetaRows(second)).toHaveLength(3)
    } finally {
      second.close()
    }
  })

  it('版本门：库内 version 超出本代码上限 → 拒开（句柄不泄漏）', () => {
    const file = join(tmpRoot(), 'knowledge.db')
    const db = openKnowledgeDatabase(file)
    db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)`).run(
      STORAGE_SCHEMA_VERSION + 1,
      new Date().toISOString(),
    )
    db.close()
    expect(() => openKnowledgeDatabase(file)).toThrow(/exceeds supported/)
    // 拒开后句柄已关——同进程可再开普通库（不残留句柄锁）
    const other = openKnowledgeDatabase(join(tmpRoot(), 'other.db'))
    other.close()
  })
})

describe('A2 库目录显式权限位（判例 cd85fde5——不随 umask 落 700）', () => {
  it('ensureKnowledgeDbDir：目录权限位显式 0o755（POSIX 断言；Windows chmod 无 0o700 语义仅验不抛）', () => {
    const dir = join(tmpRoot(), 'knowledge')
    ensureKnowledgeDbDir(dir)
    expect(statSync(dir).isDirectory()).toBe(true)
    if (process.platform !== 'win32') {
      expect(statSync(dir).mode & 0o777).toBe(0o755)
    }
  })

  it('openKnowledgeDatabase 经 ensureKnowledgeDbDir 建目录（多层缺失一次补齐）', () => {
    const file = join(tmpRoot(), 'a', 'b', 'knowledge.db')
    const db = openKnowledgeDatabase(file)
    db.close()
    expect(statSync(file).isFile()).toBe(true)
  })
})
