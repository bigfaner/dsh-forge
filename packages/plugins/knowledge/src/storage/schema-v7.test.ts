// DDL v7 单测（stage④ 1.3——提案 §2.1/§2.2/§2.3 存储面）：v6→v7 迁移（registry.scope
// ALTER + recall_logs 表重建承载 ck_krl_verb 四值枚举扩 + 七新列 + 业务行全量搬移行数
// 等价）+ downgradeGuard 拒降门（feedback<>0 OR turn_seq IS NOT NULL fail-loud；
// trigger_snap 不入门）+ 降级往返（v7→v6 形态恢复）+ 运行期 sqlite_version 门槛断言。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openKnowledgeDatabase } from './open.js'
import { STORAGE_MIGRATIONS, STORAGE_SCHEMA_VERSION, downgradeKnowledgeSchema } from './schema.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-schema-v7-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

/** 手工铸 v6 库（逐版应用 v1-v6 语句 + 落注册行与 recall 业务行）——模拟现网存量库 */
function buildV6Db(file: string, recallRows: number): void {
  const db = new Database(file)
  try {
    for (const m of STORAGE_MIGRATIONS.filter((m) => m.version <= 6)) {
      for (const stmt of m.statements) db.prepare(stmt).run()
      db.prepare(`INSERT INTO schema_meta (version, applied_at) VALUES (?, ?)`).run(m.version, '2026-01-01T00:00:00Z')
    }
    db.prepare(
      `INSERT INTO knowledge_registry (ws_path, knowledge_dir, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run('C:\\ws-a', 'C:\\ws-a\\.knowledge', 'pid-1', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')
    const insert = db.prepare(
      `INSERT INTO knowledge_recall_logs (
         project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap,
         query_json, hit_count, duration_ms, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const verbs = ['search', 'read-abstract', 'search', 'read-abstract']
    for (let i = 0; i < recallRows; i += 1) {
      insert.run(
        'p-legacy', `c-${i}`, `s-${i % 2}`, verbs[i % verbs.length]!, i % 3 === 0 ? null : (i % 5) + 1,
        i % 3 === 0 ? `kb-${i}` : null, `t-${i}`, 'd', null, 1, 12, '2026-01-03T00:00:00Z',
      )
    }
    db.close()
  } catch (e) {
    db.close()
    throw e
  }
}

interface RecallRowShape {
  id: number
  project_id: string
  call_id: string
  session_id: string
  verb: string
  entry_id: number | null
  frontmatter_id: string | null
  title_snap: string | null
  domain_snap: string | null
  query_json: string | null
  hit_count: number
  duration_ms: number | null
  created_at: string
}

function recallRowsAll(db: Database.Database): RecallRowShape[] {
  return db.prepare<unknown[], RecallRowShape>(
    `SELECT id, project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap,
            query_json, hit_count, duration_ms, created_at FROM knowledge_recall_logs ORDER BY id`,
  ).all()
}

function columnNames(db: Database.Database, table: string): string[] {
  return db.prepare<unknown[], { name: string }>(`PRAGMA table_info(${table})`).all().map((c) => c.name)
}

describe('DDL v7（八列 + verb 枚举扩 + recall_logs 表重建）', () => {
  it('运行期 sqlite 门槛：sqlite_version() ≥ 3.35（DROP COLUMN 承载面——降级语句依赖）', () => {
    const db = new Database(':memory:')
    try {
      const row = db.prepare<unknown[], { v: string }>('SELECT sqlite_version() AS v').get()
      const [major, minor] = (row?.v ?? '0.0.0').split('.').map((s) => Number(s))
      expect(major! * 1000 + minor!, `sqlite 版本 ${row?.v} 须 ≥ 3.35（DROP COLUMN 承载面）`).toBeGreaterThanOrEqual(3035)
    } finally {
      db.close()
    }
  })

  it('空库直开 = v7：registry.scope 列在场 + recall_logs 八列新形 + ck_krl_verb 四值枚举', () => {
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 7 })
      // registry.scope：无 DB CHECK——二值校验落应用层（迁移测试 pin 列形）
      const scopeCol = db
        .prepare<unknown[], { name: string; type: string; notnull: number; dflt_value: string }>(
          `PRAGMA table_info(knowledge_registry)`,
        )
        .all()
        .find((c) => c.name === 'scope')
      expect(scopeCol).toMatchObject({ type: 'TEXT', notnull: 1, dflt_value: "'project'" })
      // 七新列在场（feedback NOT NULL DEFAULT 0；其余可空——应用层校验，不入 CHECK）
      const cols = columnNames(db, 'knowledge_recall_logs')
      for (const c of ['feedback', 'feedback_note', 'feedback_at', 'turn_seq', 'trigger_snap', 'score', 'content_snap']) {
        expect(cols, `recall_logs 列 ${c}`).toContain(c)
      }
      // ck_krl_verb 四值：read/browse 可写入（迁移目的承载），非法值仍拒
      const insert = db.prepare(
        `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, hit_count, created_at)
         VALUES ('p', 'c', 's', ?, 0, '2026-01-01T00:00:00Z')`,
      )
      for (const verb of ['search', 'read-abstract', 'read', 'browse']) {
        expect(() => insert.run(verb), `verb ${verb} 可入`).not.toThrow()
      }
      expect(() => insert.run('read-full')).toThrow(/ck_krl_verb|CHECK/)
      // 三索引重建在场（表重建后 idx_krl_* 复建）
      const idx = db
        .prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_recall_logs'`)
        .all()
        .map((r) => r.name)
      for (const name of ['idx_krl_project_session', 'idx_krl_call', 'idx_krl_entry']) {
        expect(idx).toContain(name)
      }
    } finally {
      db.close()
    }
  })

  it('v6 存量库开库 → v7：业务行全量搬移（行数等价 + 逐字段等价 + id 保序）+ registry.scope 存量行落默认值', () => {
    const root = tmpRoot()
    const file = join(root, 'knowledge.db')
    buildV6Db(file, 37)
    const before = new Database(file)
    const legacyRows = before.prepare<unknown[], RecallRowShape>(
      `SELECT id, project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap,
              query_json, hit_count, duration_ms, created_at FROM knowledge_recall_logs ORDER BY id`,
    ).all()
    before.close()

    const db = openKnowledgeDatabase(file)
    try {
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 7 })
      const rows = recallRowsAll(db)
      expect(rows).toHaveLength(37)
      expect(rows).toEqual(legacyRows) // 全量搬移：id 与全部旧列逐字段等价
      // 新列存量行落默认形态（feedback=0 / 其余 NULL——应用层保证口径）
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_recall_logs WHERE feedback = 0`).get()).toEqual({ n: 37 })
      expect(
        db.prepare<unknown[], { n: number }>(
          `SELECT COUNT(*) AS n FROM knowledge_recall_logs WHERE feedback_note IS NOT NULL OR feedback_at IS NOT NULL
           OR turn_seq IS NOT NULL OR trigger_snap IS NOT NULL OR score IS NOT NULL OR content_snap IS NOT NULL`,
        ).get(),
      ).toEqual({ n: 0 })
      // registry 存量行 scope 落 DEFAULT 'project'
      const reg = db.prepare<unknown[], { ws_path: string; scope: string }>(
        `SELECT ws_path, scope FROM knowledge_registry`,
      ).get()
      expect(reg).toEqual({ ws_path: 'C:\\ws-a', scope: 'project' })
    } finally {
      db.close()
    }
  })

  it('verb 枚举扩为表内 CHECK 承载（重建非仅 ALTER）——v7 新形 CHECK 定义含四值', () => {
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      const sql = db
        .prepare<unknown[], { sql: string }>(`SELECT sql FROM sqlite_master WHERE type='table' AND name='knowledge_recall_logs'`)
        .get()
      expect(sql?.sql).toContain('ck_krl_verb')
      for (const v of ["'search'", "'read-abstract'", "'read'", "'browse'"]) {
        expect(sql?.sql).toContain(v)
      }
    } finally {
      db.close()
    }
  })
})

describe('downgradeGuard 拒降门（v7——通用逐版循环消费）', () => {
  it('feedback <> 0 行在场 → 目标 <7 降级 fail-loud（裸错不落半步）', () => {
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      db.prepare(
        `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, hit_count, feedback, feedback_note, feedback_at, created_at)
         VALUES ('p', 'c', 's', 'search', 1, -1, '误召回', '2026-01-04T00:00:00Z', '2026-01-04T00:00:00Z')`,
      ).run()
      expect(() => downgradeKnowledgeSchema(db, 6)).toThrow(/feedback|拒降|降级/)
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 7 })
    } finally {
      db.close()
    }
  })

  it('turn_seq IS NOT NULL 行在场 → fail-loud（turn_seq 恒非 NULL ⇒ 实质永拒降 = 账本完整性优先的设计行为）', () => {
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      db.prepare(
        `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, hit_count, turn_seq, created_at)
         VALUES ('p', 'c', 's', 'read', 1, 3, '2026-01-04T00:00:00Z')`,
      ).run()
      expect(() => downgradeKnowledgeSchema(db, 6)).toThrow()
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 7 })
    } finally {
      db.close()
    }
  })

  it('trigger_snap 不入门：有 trigger_snap 行（feedback=0 且 turn_seq NULL）仍可降级', () => {
    const root = tmpRoot()
    const file = join(root, 'knowledge.db')
    const db = openKnowledgeDatabase(file)
    try {
      db.prepare(
        `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, hit_count, trigger_snap, created_at)
         VALUES ('p', 'c', 's', 'search', 1, '触发输入快照', '2026-01-04T00:00:00Z')`,
      ).run()
      downgradeKnowledgeSchema(db, 6)
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 6 })
    } finally {
      db.close()
    }
    // 往返：重开 = 前向补迁 v7
    const db2 = openKnowledgeDatabase(file)
    try {
      expect(db2.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 7 })
    } finally {
      db2.close()
    }
  })

  it('干净库 v7→v6 降级：recall_logs 回 v6 列集（七新列全撤 + ck_krl_verb 回两值）+ registry.scope 撤 + 注册行保全', () => {
    const root = tmpRoot()
    const file = join(root, 'knowledge.db')
    buildV6Db(file, 5)
    const db = openKnowledgeDatabase(file)
    try {
      downgradeKnowledgeSchema(db, 6)
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 6 })
      // 七新列全撤
      const cols = columnNames(db, 'knowledge_recall_logs')
      for (const c of ['feedback', 'feedback_note', 'feedback_at', 'turn_seq', 'trigger_snap', 'score', 'content_snap']) {
        expect(cols).not.toContain(c)
      }
      // verb 回两值枚举（CHECK 语义验证：read 拒）
      const insert = db.prepare(
        `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, hit_count, created_at)
         VALUES ('p', 'c', 's', ?, 0, '2026-01-01T00:00:00Z')`,
      )
      expect(() => insert.run('search')).not.toThrow()
      expect(() => insert.run('read')).toThrow(/ck_krl_verb|CHECK/)
      // 业务行保全（5 行 + 本测 1 行 = 6）+ registry.scope 撤 + 注册行数据保全
      expect(recallRowsAll(db)).toHaveLength(6)
      expect(columnNames(db, 'knowledge_registry')).not.toContain('scope')
      expect(db.prepare<unknown[], { ws_path: string; project_id: string }>(
        `SELECT ws_path, project_id FROM knowledge_registry`,
      ).get()).toEqual({ ws_path: 'C:\\ws-a', project_id: 'pid-1' })
    } finally {
      db.close()
    }
  })

  it('v6 及以下版本无 downgradeGuard——干净库 v6→v3 逐版降级链不受 guard 波及', () => {
    const db = openKnowledgeDatabase(join(tmpRoot(), 'knowledge.db'))
    try {
      downgradeKnowledgeSchema(db, 3)
      expect(db.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()).toEqual({ v: 3 })
    } finally {
      db.close()
    }
  })
})

describe('v7 版本线登记', () => {
  it('STORAGE_SCHEMA_VERSION = 7 + STORAGE_MIGRATIONS 含 version 7 单条迁移', () => {
    expect(STORAGE_SCHEMA_VERSION).toBe(7)
    expect(STORAGE_MIGRATIONS.filter((m) => m.version === 7)).toHaveLength(1)
    expect(STORAGE_MIGRATIONS.find((m) => m.version === 7)?.downgradeGuard).toBeTypeOf('function')
  })
})
