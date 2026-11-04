// @feature:knowledge
// Journey: knowledge-seed-migration（knowledge 插件首启轻量种子迁移）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage1-foundation/testing/contracts/knowledge-seed-migration/contract.md
//   （CT-seed-migration-1..4 ← journey J1-1..J1-4；SC-4/SC-10 子集）。
// 策略：真自持装配链 vitest 面——startSelfHostedStorage 首启（config 注入旧库路径）→
// 种子迁移（migrate.ts 真身）→ 服务消费触发首用 rebuild（rebuild.ts 真身）→ 二次启动幂等。
// 旧库夹具 = core 现役三表 schema 最小子集（本文件内联 SQL 预播，零 core 依赖）。
// 真机限定面（Electron host 装配 + 写径故障/双实例并发注入）标注于末尾 skip 留痕。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiagEventPayload } from '../../../packages/contracts/src/index.js'
import { startSelfHostedStorage } from '../../../packages/plugins/knowledge/src/storage/start.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/index.js'
import { createWsPathResolver } from '../../../packages/plugins/knowledge/src/tools/session.js'
import { canonicalWsPath } from '../../../packages/plugins/knowledge/src/storage/registry.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-j-seed-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

/** 旧 core state.db 夹具（v1 三表最小子集：projects + knowledge_entries + knowledge_recall_logs） */
function buildLegacyDb(
  dir: string,
  rows: readonly { wsPath: string; knowledgeDir: string; entries: number; recalls: number }[],
): string {
  const file = join(dir, 'state.db')
  const db = new Database(file)
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
  const insProject = db.prepare(
    `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, knowledge_dir, created_at, updated_at)
     VALUES (?, ?, ?, 'p', ?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
  )
  const insEntry = db.prepare(
    `INSERT INTO knowledge_entries (project_id, rel_path, domain_path, title, summary, digest, indexed_at)
     VALUES (?, ?, '', ?, ?, '', '2026-01-01T00:00:00Z')`,
  )
  const insRecall = db.prepare(
    `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, hit_count, created_at)
     VALUES (?, ?, ?, 'search', NULL, 1, '2026-01-02T00:00:00Z')`,
  )
  rows.forEach((r, i) => {
    insProject.run(`pid-${i}`, `ws-${i}`, r.wsPath, join(dir, 'forge'), r.knowledgeDir)
    for (let k = 0; k < r.entries; k += 1) insEntry.run(`pid-${i}`, `e${k}.md`, `t${k}`, `s${k}`)
    for (let k = 0; k < r.recalls; k += 1) insRecall.run(`pid-${i}`, `c${i}-${k}`, `sess-${i}-${k}`)
  })
  db.close()
  return file
}

/** 预播知识 corpus（rebuild 再生断言的期望全集） */
function seedCorpus(wsDir: string, relPaths: readonly string[]): string {
  const knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  for (const rel of relPaths) {
    const abs = join(knowledgeDir, ...rel.split('/'))
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(
      abs,
      `---\nsummary: ${rel} 摘要\nkeywords: [seed]\nupdated: "2026-01-15T00:00:00.000Z"\n---\n正文`,
      'utf8',
    )
  }
  return knowledgeDir
}

function collector(): { emit: (p: DiagEventPayload) => void; events: DiagEventPayload[] } {
  const events: DiagEventPayload[] = []
  return { events, emit: (p) => events.push(p) }
}

function migrateEvents(events: readonly DiagEventPayload[]): DiagEventPayload[] {
  return events.filter((e) => e.event === 'knowledge-migrate')
}

function rebuildEvents(events: readonly DiagEventPayload[]): DiagEventPayload[] {
  return events.filter((e) => e.event === 'knowledge-index-rebuild')
}

describe('CT-seed-migration-1（J1-1：注册行种子迁移全量等价）', () => {
  it('success：start→里程碑→cutover 事件序列 + 注册行 wsPath 集合等价 + recall_logs 行数等价 + entries 零迁', () => {
    const root = tmpRoot()
    const wsA = join(root, 'ws-a')
    const wsB = join(root, 'ws-b')
    const legacy = buildLegacyDb(root, [
      { wsPath: wsA, knowledgeDir: join(wsA, '.knowledge'), entries: 41, recalls: 237 }, // dev 形态变体同场（boundary：41 行旧缓存）
      { wsPath: wsB, knowledgeDir: join(wsB, '.knowledge'), entries: 0, recalls: 0 },
    ])
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { emit, events } = collector()
    const storage = startSelfHostedStorage({ dbFile, legacyStateDb: legacy, emit })!

    // Output：migrated 终态 + 事件序列完整且次序成立（start 首位 / 里程碑 / cutover 末位）
    expect(storage.migration?.status).toBe('migrated')
    expect(storage.migration?.registryRows).toBe(2)
    expect(storage.migration?.recallRows).toBe(237)
    const seq = migrateEvents(events)
    expect(seq.length).toBeGreaterThanOrEqual(3)
    expect(seq[0]!.message).toContain('种子迁移开始')
    expect(seq[0]!.level).toBe('info')
    expect(seq[seq.length - 1]!.message).toContain('cutover')
    expect(seq.some((e) => e.message.includes('注册行种子完成'))).toBe(true)

    // State：自持库在 config 注入路径落盘；payload 携带旧库路径摘要（cwd 面）
    expect(seq[0]!.cwd).toBe(legacy)
    // 注册表 wsPath 集合 ≡ 旧库集合（canonical 等价）
    const rows = storage.registry.list().map((r) => r.wsPath).sort()
    expect(rows).toEqual([canonicalWsPath(wsA), canonicalWsPath(wsB)].sort())
    // recall_logs 行数等价；entries 零迁（dev 41 行旧缓存变体也不携带）
    const n = (table: string) =>
      (storage.db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0)
    expect(n('knowledge_recall_logs')).toBe(237)
    expect(n('knowledge_entries')).toBe(0)
    storage.close()
  })

  it('boundary-重复启动：二次启动零 start 事件、注册表行数不变（幂等去重）', () => {
    const root = tmpRoot()
    const ws = join(root, 'ws')
    const legacy = buildLegacyDb(root, [{ wsPath: ws, knowledgeDir: join(ws, '.knowledge'), entries: 0, recalls: 3 }])
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const first = startSelfHostedStorage({ dbFile, legacyStateDb: legacy })!
    first.close()
    const { emit, events } = collector()
    const second = startSelfHostedStorage({ dbFile, legacyStateDb: legacy, emit })!
    expect(second.migration?.status).toBe('skipped-done')
    expect(migrateEvents(events)).toEqual([]) // 零事件
    expect(second.registry.list()).toHaveLength(1)
    second.close()
  })
})

describe('CT-seed-migration-2（J1-2：旧库缺席 / 零注册行 → 常规路径）', () => {
  it('success-未注入/文件不存在：不触发迁移、自持库常规初始化、宿主面可用（空数据语义）', async () => {
    const root = tmpRoot()
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { emit, events } = collector()
    const a = startSelfHostedStorage({ dbFile, emit })!
    const b = startSelfHostedStorage({ dbFile, legacyStateDb: join(root, 'nope.db'), emit })!
    expect(a.migration?.status).toBe('skipped-absent')
    expect(b.migration?.status).toBe('skipped-absent')
    expect(migrateEvents(events)).toEqual([]) // 无迁移事件（常规路径非静默失败——判定条件不满足）
    // 五通道可用（空语义）：服务面在场，无注册行项目 → 可判定缺席（fail-loud 错误语义）
    const service = createKnowledgeService({ db: a.db, resolveWsPath: () => undefined })
    await expect(service.listEntries({ projectId: 'p-x' })).rejects.toThrow(/项目不存在/)
    a.close()
    b.close()
  })

  it('boundary-旧库在但零注册行：不触发迁移、无注册行落表、无 start 事件', () => {
    const root = tmpRoot()
    const empty = buildLegacyDb(root, [])
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { emit, events } = collector()
    const storage = startSelfHostedStorage({ dbFile, legacyStateDb: empty, emit })!
    expect(storage.migration?.status).toBe('skipped-empty')
    expect(migrateEvents(events)).toEqual([])
    expect(storage.registry.list()).toHaveLength(0)
    storage.close()
  })
})

describe('CT-seed-migration-3（J1-3：recall_logs 拷贝失败 best-effort + diag 记账）', () => {
  it('success（best-effort 语义）：注册行完整 + warn 指认 recall 段 + cutover 仍产生', () => {
    const root = tmpRoot()
    const ws = join(root, 'ws')
    const legacy = buildLegacyDb(root, [{ wsPath: ws, knowledgeDir: join(ws, '.knowledge'), entries: 0, recalls: 5 }])
    // 故障注入：源表读取通道损坏（视图遮蔽——prepared 读即抛）
    const src = new Database(legacy)
    src.exec(`DROP TABLE knowledge_recall_logs`)
    src.exec(`CREATE TABLE knowledge_recall_logs_broken AS SELECT 1 AS nope`)
    src.exec(`CREATE VIEW knowledge_recall_logs AS SELECT * FROM knowledge_recall_logs_broken`)
    src.close()

    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { emit, events } = collector()
    const storage = startSelfHostedStorage({ dbFile, legacyStateDb: legacy, emit })!
    expect(storage.migration?.status).toBe('recall-degraded')
    expect(storage.migration?.registryRows).toBe(1) // 注册行完整性优先
    expect(storage.registry.list()).toHaveLength(1)
    const warn = migrateEvents(events).find((e) => e.level === 'warn')
    expect(warn?.message).toContain('recall_logs') // diag 记账指认 recall 拷贝段（无静默失败）
    expect(migrateEvents(events).some((e) => e.message.includes('cutover'))).toBe(true) // 迁移收口不中断
    storage.close()
  })
})

describe('CT-seed-migration-4（J1-4：entries 零迁 + 首用 rebuild 再生）', () => {
  it('success：首用消费触发静默 rebuild 再生全集 + rebuild 成功事件 + 二次消费零重复 rebuild', async () => {
    const root = tmpRoot()
    const ws = join(root, 'ws')
    const knowledgeDir = seedCorpus(ws, ['前端/框架选型.md', '前端/样式令牌.md', '后端/API规范.md', '指南.md'])
    const legacy = buildLegacyDb(root, [{ wsPath: ws, knowledgeDir, entries: 41, recalls: 0 }]) // dev 41 行旧缓存变体
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { emit, events } = collector()
    const storage = startSelfHostedStorage({ dbFile, legacyStateDb: legacy, emit })!
    expect(storage.migration?.status).toBe('migrated')
    // 迁移后 entries 初建为空（不携带旧缓存行）
    expect(
      storage.db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_entries`).get()?.n,
    ).toBe(0)

    // 首用知识消费（五通道之一）：首用 rebuild 自动再生索引全集
    const projectId = 'p-seed'
    const service = createKnowledgeService({
      db: storage.db,
      resolveWsPath: createWsPathResolver([{ wsPath: ws, projectId }]),
      emit,
    })
    const cards = await service.listEntries({ projectId })
    expect(cards).toHaveLength(4) // 再生全集 = fixture corpus 全集
    const rebuilds = rebuildEvents(events)
    expect(rebuilds.length).toBe(1) // knowledge-index-rebuild 事件产生（静默重建 warn 级）
    expect(rebuilds[0]!.level).toBe('warn')
    expect(rebuilds[0]!.message).toContain('indexed=4')

    // 再次消费同一查询：结果一致 + 零重复 rebuild 副作用（幂等）
    const again = await service.listEntries({ projectId })
    expect(again.map((c) => c.title)).toEqual(cards.map((c) => c.title))
    expect(rebuildEvents(events)).toHaveLength(1)
    storage.close()
  })

  it('boundary-零知识项目（无 corpus）：rebuild 空转成功（indexed=0），事件仍产生，不报错', async () => {
    const root = tmpRoot()
    const ws = join(root, 'ws-empty')
    mkdirSync(join(ws, '.knowledge'), { recursive: true }) // 空知识目录（无 corpus）
    const dbFile = join(root, 'knowledge', 'knowledge.db')
    const { emit, events } = collector()
    const storage = startSelfHostedStorage({ dbFile, emit })!
    storage.registry.upsert(ws, join(ws, '.knowledge'))
    const projectId = 'p-empty'
    const service = createKnowledgeService({
      db: storage.db,
      resolveWsPath: createWsPathResolver([{ wsPath: ws, projectId }]),
      emit,
    })
    await expect(service.listEntries({ projectId })).resolves.toEqual([]) // 空转成功不报错
    expect(rebuildEvents(events).some((e) => e.message.includes('indexed=0'))).toBe(true) // 事件仍产生（零静默）
    storage.close()
  })
})

// ── 真机限定面（留痕，不在 vitest 层断言） ──
// CT-seed-migration-1 Outcome 2（fail-注册行写入异常：自持库写径故障注入）与 Outcome 4
// （双实例并发首启）：需真机进程对 + 真实写径故障面承载，归 Playwright test-run 收口任务
// （pnpm test:e2e）；vitest 层等价面已由包内单测承接——
// packages/plugins/knowledge/src/storage/{migrate,concurrency}.test.ts（短事务/BEGIN
// IMMEDIATE 单飞语义）。旧表随 core 退役移除的实机时序（无双供数窗口）由 core schema
// v4 结构退役迁移线承载（1.8 落地）。
describe('真机面留痕（CT-seed-migration-1 fail/并发分支）', () => {
  it.skip('fail-注册行写入异常 + 双启动并发首启：需真机 Electron 宿主环境（环境前提：pnpm test:e2e，归 test-run 收口）', () => {
    expect(true).toBe(true)
  })
})
