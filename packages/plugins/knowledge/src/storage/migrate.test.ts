// 轻量种子迁移单测（SC-4 轻量口径 / CT-seed-migration-1..3 单测面）：fixture 旧库 =
// core 现役三表 schema 最小子集（本包内联 SQL 预播——零 core 依赖，SC-2 结构铁律）。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openKnowledgeDatabase } from './open.js'
import { runSeedMigration } from './migrate.js'
import { canonicalWsPath } from './registry.js'
import { KNOWLEDGE_MIGRATE_EVENT, type DiagEmitter, type DiagEventPayload } from './index.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-migrate-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

/** 旧 core state.db 夹具（v1 三表最小子集：projects + knowledge_entries + knowledge_recall_logs） */
function buildLegacyDb(
  dir: string,
  rows: { wsPath: string; knowledgeDir: string; entries: number; recalls: number },
): string {
  const file = join(dir, 'state.db')
  const db = new Database(file)
  db.exec(`CREATE TABLE schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`)
  db.exec(`CREATE TABLE projects (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, ws_path TEXT NOT NULL, name TEXT NOT NULL,
    forge_dir TEXT NOT NULL, forge_dir_external INTEGER NOT NULL DEFAULT 0, knowledge_dir TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`)
  db.exec(`CREATE TABLE knowledge_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, frontmatter_id TEXT, rel_path TEXT NOT NULL,
    domain_path TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, keywords TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft', digest TEXT NOT NULL, indexed_at TEXT NOT NULL)`)
  db.exec(`CREATE TABLE knowledge_recall_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, call_id TEXT NOT NULL, session_id TEXT NOT NULL,
    verb TEXT NOT NULL, entry_id INTEGER, frontmatter_id TEXT, title_snap TEXT, domain_snap TEXT,
    query_json TEXT, hit_count INTEGER NOT NULL, duration_ms INTEGER, created_at TEXT NOT NULL)`)
  db.prepare(
    `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, knowledge_dir, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(`pid-${rows.wsPath.length}`, `ws-${rows.wsPath.length}`, rows.wsPath, 'p', join(dir, '.forge'), rows.knowledgeDir, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
  for (let i = 0; i < rows.entries; i += 1) {
    db.prepare(
      `INSERT INTO knowledge_entries (project_id, rel_path, domain_path, title, summary, digest, indexed_at)
       VALUES (?, ?, '', ?, ?, '', ?)`,
    ).run(`pid-${rows.wsPath.length}`, `e${i}.md`, `t${i}`, `s${i}`, '2026-01-01T00:00:00Z')
  }
  for (let i = 0; i < rows.recalls; i += 1) {
    db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, hit_count, created_at)
       VALUES (?, ?, ?, 'search', NULL, 1, ?)`,
    ).run(`pid-${rows.wsPath.length}`, `c${i}`, `s${i}`, `2026-01-02T00:00:00Z`)
  }
  db.close()
  return file
}

function openSelf(dir: string): Database.Database {
  return openKnowledgeDatabase(join(dir, 'knowledge', 'knowledge.db'))
}

/** 收集迁移事件序列（event + level） */
function collector(): { emit: DiagEmitter; events: DiagEventPayload[] } {
  const events: DiagEventPayload[] = []
  return { events, emit: (p) => events.push(p) }
}

describe('runSeedMigration（注册行种子 + recall best-effort + 幂等 + 只读）', () => {
  it('注册行全量等价迁移：wsPath canonical 化逐条落行 + recall_logs 行数等价 + entries 零迁 + 事件序列 start→里程碑→cutover', () => {
    const root = tmpRoot()
    const legacy = buildLegacyDb(root, {
      wsPath: join(root, 'ws-a'),
      knowledgeDir: join(root, 'ws-a', '.knowledge'),
      entries: 41,
      recalls: 237,
    })
    const self = openSelf(root)
    const { emit, events } = collector()
    const result = runSeedMigration(self, { legacyStateDb: legacy, emit })

    expect(result.status).toBe('migrated')
    expect(result.registryRows).toBe(1)
    expect(result.recallRows).toBe(237)

    const rows = self.prepare<{ ws_path: string; knowledge_dir: string }[]>(
      `SELECT ws_path, knowledge_dir FROM projects`,
    ).all()
    expect(rows).toEqual([{ ws_path: canonicalWsPath(join(root, 'ws-a')), knowledge_dir: join(root, 'ws-a', '.knowledge') }])
    expect(self.prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM knowledge_recall_logs`).get()).toEqual({ n: 237 })
    expect(self.prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM knowledge_entries`).get()).toEqual({ n: 0 })

    const seq = events.map((e) => `${e.event}:${e.level}`)
    expect(seq[0]).toBe(`${KNOWLEDGE_MIGRATE_EVENT}:info`)
    expect(seq[seq.length - 1]).toContain('info')
    expect(events.every((e) => e.event === KNOWLEDGE_MIGRATE_EVENT)).toBe(true)
    expect(events.some((e) => e.message.includes('cutover'))).toBe(true)
    self.close()
  })

  it('幂等：二次启动整体跳过（零事件零行变更）', () => {
    const root = tmpRoot()
    const legacy = buildLegacyDb(root, { wsPath: join(root, 'ws-b'), knowledgeDir: join(root, 'ws-b', '.knowledge'), entries: 0, recalls: 3 })
    const self = openSelf(root)
    runSeedMigration(self, { legacyStateDb: legacy })
    const { emit, events } = collector()
    const again = runSeedMigration(self, { legacyStateDb: legacy, emit })
    expect(again.status).toBe('skipped-done')
    expect(events).toEqual([])
    expect(self.prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM projects`).get()).toEqual({ n: 1 })
    self.close()
  })

  it('旧库缺席 / 零注册行 → 常规路径（零事件零迁移）', () => {
    const root = tmpRoot()
    const self = openSelf(root)
    const { emit, events } = collector()
    expect(runSeedMigration(self, { emit }).status).toBe('skipped-absent')
    expect(runSeedMigration(self, { legacyStateDb: join(root, 'nope.db'), emit }).status).toBe('skipped-absent')
    const empty = buildLegacyDb(root, { wsPath: join(root, 'ws-c'), knowledgeDir: 'x', entries: 0, recalls: 0 })
    db_deleteAllProjects(empty)
    expect(runSeedMigration(self, { legacyStateDb: empty, emit }).status).toBe('skipped-empty')
    expect(events).toEqual([])
    self.close()
  })

  it('坏库（文件损坏）→ 跳过且不中断（warn 记账，非静默）', () => {
    const root = tmpRoot()
    const bad = join(root, 'bad.db')
    writeFileSync(bad, 'this is not a sqlite database')
    const self = openSelf(root)
    const { emit, events } = collector()
    const result = runSeedMigration(self, { legacyStateDb: bad, emit })
    expect(result.status).toBe('skipped-unreadable')
    expect(events).toHaveLength(1)
    expect(events[0]!.level).toBe('warn')
    expect(events[0]!.event).toBe(KNOWLEDGE_MIGRATE_EVENT)
    self.close()
  })

  it('recall 拷贝失败注入 → 注册行仍完整 + warn 指认 recall 段 + cutover 仍产生（不中断）', () => {
    const root = tmpRoot()
    const legacy = buildLegacyDb(root, { wsPath: join(root, 'ws-d'), knowledgeDir: join(root, 'ws-d', '.knowledge'), entries: 0, recalls: 5 })
    // 源表损坏注入：recall_logs 建为含 CHECK 违背行的坏表（读取即抛）
    const src = new Database(legacy)
    src.exec(`DROP TABLE knowledge_recall_logs`)
    src.exec(`CREATE TABLE knowledge_recall_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, call_id TEXT NOT NULL, session_id TEXT NOT NULL,
      verb TEXT NOT NULL, entry_id INTEGER, frontmatter_id TEXT, title_snap TEXT, domain_snap TEXT,
      query_json TEXT, hit_count INTEGER NOT NULL, duration_ms INTEGER, created_at TEXT NOT NULL)`)
    // 让 SELECT 失败：以视图遮蔽同名表读取路径（prepared 读视图列缺失即抛）
    src.exec(`DROP TABLE knowledge_recall_logs`)
    src.exec(`CREATE TABLE knowledge_recall_logs_broken AS SELECT 1 AS nope`)
    src.exec(`CREATE VIEW knowledge_recall_logs AS SELECT * FROM knowledge_recall_logs_broken`)
    src.close()

    const self = openSelf(root)
    const { emit, events } = collector()
    const result = runSeedMigration(self, { legacyStateDb: legacy, emit })
    expect(result.status).toBe('recall-degraded')
    expect(result.registryRows).toBe(1)
    expect(self.prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM projects`).get()).toEqual({ n: 1 })
    const warn = events.find((e) => e.level === 'warn')
    expect(warn).toBeDefined()
    expect(warn!.message).toContain('recall_logs')
    expect(events.some((e) => e.message.includes('cutover'))).toBe(true)
    self.close()
  })

  it('旧库零写回：迁移后旧库内容逐字节不变（readonly 连接承载）', () => {
    const root = tmpRoot()
    const legacy = buildLegacyDb(root, { wsPath: join(root, 'ws-e'), knowledgeDir: 'kd', entries: 2, recalls: 4 })
    const before = readAllBytes(legacy)
    const self = openSelf(root)
    runSeedMigration(self, { legacyStateDb: legacy })
    self.close()
    expect(readAllBytes(legacy)).toEqual(before)
  })
})

function db_deleteAllProjects(file: string): void {
  const db = new Database(file)
  db.prepare(`DELETE FROM projects`).run()
  db.close()
}

function readAllBytes(file: string): Buffer {
  return readFileSync(file)
}
