// 任务 3.3 集成测试 —— 浏览查询面 listEntries / getEntryDetail / sessionRecall + 装配收口。
// 环境口径：每用例独占临时 SQLite（openDatabase，schema v1 迁移即建表）+ 临时知识目录；
// projects 行直插（注册链路归 forge 域 2.2 已测）。AC 对照：AC1 listEntries 过滤语义与
// 域树聚合同口径 / AC2 getEntryDetail 正文按需 + 元数据正文分离 / AC3 sessionRecall 统计头
// 口径（COUNT(DISTINCT call_id) / 去重覆盖——SQL 对拍）/ AC4 分组行快照展开 + 热度 /
// AC5 ctx.forgeKnowledge 双服务面完整（service.test.ts）。附：重建清引用（ER entry_id
// 「条目已重建清除（行保留）」——FK 修复）与 listEntries 静默重建联动（scope=index）。
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '../db/index.js'
import { createKnowledgeIndexService, type KnowledgeIndexService } from './index-service.js'
import { createKnowledgeRecallService } from './recall-service.js'
import { aggregateDomainTree, createKnowledgeBrowseService, recallStats } from './browse-service.js'
import { EntryNotFoundError, IndexStaleError, InvalidKnowledgeDirError } from './errors.js'

// ── 测试环境 ──

const dirs: string[] = []
const dbs: Database.Database[] = []
const wsSeq = { n: 0 }

afterAll(() => {
  for (const db of dbs) db.close()
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** 一套「库 + 知识目录 + projects 行 + 语料」夹具（rebuild = 是否先行重建索引） */
function fixture(options: { rebuild?: boolean } = {}): { db: Database.Database; knowledgeDir: string; projectId: string } {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-knbr-'))
  dirs.push(home)
  const db = openDatabase(join(home, 'state.db'))
  dbs.push(db)
  const knowledgeDir = join(home, 'knowledge')
  mkdirSync(knowledgeDir)
  const projectId = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
  ).run(projectId, randomUUID(), `C:\\ws-${++wsSeq.n}`, `p${wsSeq.n}`, join(home, '.forge'), knowledgeDir, now, now)
  writeCorpus(knowledgeDir)
  if (options.rebuild) {
    void createKnowledgeIndexService({ db }).rebuildIndex(projectId)
  }
  return { db, knowledgeDir, projectId }
}

/** 语料：前端 2 / 后端 3 / 编程-java 1 / 根域 1（updated/authors 变体供展示位断言） */
function writeCorpus(knowledgeDir: string): void {
  writeMd(knowledgeDir, '前端/框架选型.md', [
    'title: 框架选型', 'id: kb-fe-001', 'status: published',
    'summary: 前端框架选型基线', 'keywords: [react, frontend]',
    'updated: "2026-01-15T00:00:00.000Z"',
  ].join('\n'))
  writeMd(knowledgeDir, '前端/样式令牌.md', 'summary: 设计令牌与主题联动\nkeywords: [css, frontend]')
  writeMd(knowledgeDir, '后端/API规范.md', 'title: API 规范\nid: kb-be-001\nauthors: 平台组\nsummary: 接口设计规范\nkeywords: [api, backend]', '正文-接口细则')
  writeMd(knowledgeDir, '后端/安全编码规范.md', 'summary: 服务端输入校验与输出编码基线\nkeywords: [security, backend]')
  writeMd(knowledgeDir, '后端/网关.md', 'summary: API 网关路由规则\nkeywords: [api, backend]')
  writeMd(knowledgeDir, '编程/java/并发手册.md', 'summary: Java 并发实践\nkeywords: [java, concurrency]\nupdated: 2026-02-01')
  writeMd(knowledgeDir, '指南.md', 'summary: 新手指引\nkeywords: [guide]')
}

function writeMd(knowledgeDir: string, relPath: string, frontmatter: string, body = '正文'): void {
  const abs = join(knowledgeDir, ...relPath.split('/'))
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, `---\n${frontmatter}\n---\n${body}`, 'utf8')
}

// ── 行读取助手 ──

interface RecallLogRow { call_id: string; session_id: string; verb: string; entry_id: number | null; frontmatter_id: string | null; title_snap: string | null }

const recallLogsOf = (db: Database.Database, projectId: string): RecallLogRow[] =>
  db.prepare<unknown[], RecallLogRow>(`SELECT call_id, session_id, verb, entry_id, frontmatter_id, title_snap FROM knowledge_recall_logs WHERE project_id = ? ORDER BY id`).all(projectId)

interface KeyLogRow { level: string; scope: string; message: string }

const keyLogsOf = (db: Database.Database): KeyLogRow[] =>
  db.prepare<unknown[], KeyLogRow>(`SELECT level, scope, message FROM app_key_logs ORDER BY id`).all()

const entryIdByTitle = (db: Database.Database, projectId: string): Map<string, number> =>
  new Map(
    db.prepare<unknown[], { id: number; title: string }>(`SELECT id, title FROM knowledge_entries WHERE project_id = ?`).all(projectId)
      .map((r) => [r.title, r.id] as const),
  )

const titles = (cards: readonly { title: string }[]): string[] => cards.map((c) => c.title)

/** rebuild 计数器缝（fix-31 零重建断言）：包真实 index-service，计数 rebuildIndex 实际调用 */
function countingIndexService(db: Database.Database): { service: Pick<KnowledgeIndexService, 'rebuildIndex'>; calls(): number } {
  const real = createKnowledgeIndexService({ db })
  let n = 0
  return {
    service: {
      async rebuildIndex(projectId: string) {
        n += 1
        return real.rebuildIndex(projectId)
      },
    },
    calls: () => n,
  }
}

// ── AC1：listEntries 过滤语义（UF-6）+ 域树聚合同口径 ──

describe('listEntries 过滤语义（AC1·UF-6）', () => {
  it('全量卡片：字段集精确八字段，title/summary/keywords/status/domainPath 索引直读', async () => {
    const f = fixture({ rebuild: true })
    const cards = await createKnowledgeBrowseService({ db: f.db }).listEntries({ projectId: f.projectId })
    expect(cards).toHaveLength(7)
    expect(Object.keys(cards[0]!).sort()).toEqual(['domainPath', 'entryId', 'heat', 'keywords', 'status', 'summary', 'title', 'updated'])
    const fe = cards.find((c) => c.title === '框架选型')!
    expect(fe).toMatchObject({ summary: '前端框架选型基线', keywords: ['react', 'frontend'], status: 'published', domainPath: '前端', heat: 0 })
  })

  it('domainPrefix 目录路径前缀过滤：嵌套域命中子域；段前缀不误匹配；尾 "/" 归一', async () => {
    const f = fixture({ rebuild: true })
    const svc = createKnowledgeBrowseService({ db: f.db })
    expect(titles(await svc.listEntries({ projectId: f.projectId, domainPrefix: '前端' })).sort()).toEqual(['样式令牌', '框架选型'])
    expect(titles(await svc.listEntries({ projectId: f.projectId, domainPrefix: '编程' }))).toEqual(['并发手册']) // 编程 → 编程/java 子域
    expect(await svc.listEntries({ projectId: f.projectId, domainPrefix: '前' })).toHaveLength(0) // 「前」≠「前端」
    expect(await svc.listEntries({ projectId: f.projectId, domainPrefix: '后端/' })).toHaveLength(3) // 尾斜杠归一
  })

  it('domainPrefix 空串 = 根域（仅根文件，不误吞全域）', async () => {
    const f = fixture({ rebuild: true })
    expect(titles(await createKnowledgeBrowseService({ db: f.db }).listEntries({ projectId: f.projectId, domainPrefix: '' }))).toEqual(['指南'])
  })

  it('keyword 过滤 = keywords 维度细分（大小写不敏感子串；标题词不中）', async () => {
    const f = fixture({ rebuild: true })
    const svc = createKnowledgeBrowseService({ db: f.db })
    expect(titles(await svc.listEntries({ projectId: f.projectId, keyword: 'api' })).sort()).toEqual(['API 规范', '网关'])
    expect(titles(await svc.listEntries({ projectId: f.projectId, keyword: 'REACT' }))).toEqual(['框架选型'])
    expect(await svc.listEntries({ projectId: f.projectId, keyword: '规范' })).toHaveLength(0) // 标题词 ≠ keywords 维度
  })

  it('组合过滤：域前缀 × 关键词（前端 ∩ css → 样式令牌）', async () => {
    const f = fixture({ rebuild: true })
    expect(titles(await createKnowledgeBrowseService({ db: f.db }).listEntries({ projectId: f.projectId, domainPrefix: '前端', keyword: 'css' }))).toEqual(['样式令牌'])
  })

  it('域树聚合数据可得：aggregateDomainTree 节点集正确，且逐节点计数与域前缀过滤同口径（含子域）', async () => {
    const f = fixture({ rebuild: true })
    const svc = createKnowledgeBrowseService({ db: f.db })
    const tree = aggregateDomainTree(await svc.listEntries({ projectId: f.projectId }))
    expect(tree).toEqual([
      { domainPath: '前端', label: '前端', depth: 1, entryCount: 2 },
      { domainPath: '后端', label: '后端', depth: 1, entryCount: 3 },
      { domainPath: '编程', label: '编程', depth: 1, entryCount: 1 }, // 含子域（编程/java）
      { domainPath: '编程/java', label: 'java', depth: 2, entryCount: 1 },
    ]) // 根域文件（指南）不生成 depth-0 节点（域树 = 目录树）
    for (const node of tree) {
      const filtered = await svc.listEntries({ projectId: f.projectId, domainPrefix: node.domainPath })
      expect(filtered).toHaveLength(node.entryCount) // 聚合与过滤同口径断言
    }
  })

  it('3.5 browse 聚合法 = listEntries 底表 × aggregateDomainTree（通道 handler 本体；经静默重建路径）', async () => {
    const f = fixture() // 不预建索引 → browse 复用 listEntries 静默重建联动（底表口径不漂移）
    const svc = createKnowledgeBrowseService({ db: f.db })
    const tree = await svc.browse({ projectId: f.projectId })
    expect(tree).toEqual([
      { domainPath: '前端', label: '前端', depth: 1, entryCount: 2 },
      { domainPath: '后端', label: '后端', depth: 1, entryCount: 3 },
      { domainPath: '编程', label: '编程', depth: 1, entryCount: 1 }, // 含子域（编程/java）
      { domainPath: '编程/java', label: 'java', depth: 2, entryCount: 1 },
    ]) // depth 升序再 domainPath 升序（父先于子）
    expect(keyLogsOf(f.db).at(-1)).toMatchObject({ level: 'warn', scope: 'index' }) // 底表走 listEntries 静默重建
  })

  it('热度徽章数据与 heatByEntry 同源（search 后卡片 heat = 事件计数；未召回条目 = 0）', async () => {
    const f = fixture({ rebuild: true })
    const recall = createKnowledgeRecallService({ db: f.db })
    await recall.search({ projectId: f.projectId, domainPrefix: '前端', sessionId: 'sess-1' })
    const heat = await recall.heatByEntry(f.projectId)
    const cards = await createKnowledgeBrowseService({ db: f.db }).listEntries({ projectId: f.projectId })
    for (const c of cards) expect(c.heat).toBe(heat.get(c.entryId) ?? 0)
    expect(cards.find((c) => c.title === '框架选型')!.heat).toBe(1)
  })

  it('updated 口径：显式串直传；缺省取 mtime（ISO）；YAML 日期字面量 ISO 化；源文件删除回退 indexed_at 且卡片仍在', async () => {
    const f = fixture({ rebuild: true })
    const svc = createKnowledgeBrowseService({ db: f.db })
    const cards = await svc.listEntries({ projectId: f.projectId })
    expect(cards.find((c) => c.title === '框架选型')!.updated).toBe('2026-01-15T00:00:00.000Z') // 显式串
    expect(cards.find((c) => c.title === '样式令牌')!.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) // mtime 缺省
    expect(cards.find((c) => c.title === '并发手册')!.updated).toBe('2026-02-01T00:00:00.000Z') // Date 字面量 → ISO
    unlinkSync(join(f.knowledgeDir, '后端', '网关.md')) // 外部删除：浏览面韧性（索引直读）
    const after = await svc.listEntries({ projectId: f.projectId, domainPrefix: '后端' })
    expect(after).toHaveLength(3)
    const gw = after.find((c) => c.title === '网关')!
    const indexedAt = f.db.prepare<unknown[], { indexed_at: string }>(`SELECT indexed_at FROM knowledge_entries WHERE project_id = ? AND title = '网关'`).get(f.projectId)!.indexed_at
    expect(gw.updated).toBe(indexedAt) // 读不到文件 → 回退本次索引时间（最后已知展示位）
  })
})

// ── AC2：getEntryDetail 正文按需 + 元数据/正文分离 ──

describe('getEntryDetail（AC2）', () => {
  it('全字段精确：元数据（索引）+ authors/updated（文件 frontmatter）+ body（按需读取，不含 frontmatter 无导换行）', async () => {
    const f = fixture({ rebuild: true })
    const entryId = entryIdByTitle(f.db, f.projectId).get('API 规范')!
    const detail = await createKnowledgeBrowseService({ db: f.db }).getEntryDetail({ projectId: f.projectId, entryId })
    expect(Object.keys(detail).sort()).toEqual(['authors', 'body', 'domainPath', 'entryId', 'keywords', 'status', 'summary', 'title', 'updated'])
    expect(detail).toMatchObject({
      entryId, title: 'API 规范', summary: '接口设计规范', keywords: ['api', 'backend'],
      status: 'draft', domainPath: '后端', authors: '平台组',
    })
    expect(detail.body).toBe('正文-接口细则') // 正文区不含 frontmatter（数据侧保证）且无前导换行
    expect(detail.body).not.toContain('summary') // 元数据与正文分离
    expect(detail.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) // updated 缺省 mtime
  })

  it('authors 缺省 null（可选字段不虚构）', async () => {
    const f = fixture({ rebuild: true })
    const entryId = entryIdByTitle(f.db, f.projectId).get('样式令牌')!
    const detail = await createKnowledgeBrowseService({ db: f.db }).getEntryDetail({ projectId: f.projectId, entryId })
    expect(detail.authors).toBeNull()
  })

  it('entryId 未命中 → EntryNotFoundError（ERR_ENTRY_NOT_FOUND，ID 漂移语义）', async () => {
    const f = fixture({ rebuild: true })
    const err = await createKnowledgeBrowseService({ db: f.db })
      .getEntryDetail({ projectId: f.projectId, entryId: 99999 })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EntryNotFoundError)
    expect(err).toMatchObject({ code: 'ERR_ENTRY_NOT_FOUND', name: 'EntryNotFoundError' })
  })

  it('源文件在索引后删除 → EntryNotFoundError（详情面无法按需供正文）', async () => {
    const f = fixture({ rebuild: true })
    const entryId = entryIdByTitle(f.db, f.projectId).get('样式令牌')!
    unlinkSync(join(f.knowledgeDir, '前端', '样式令牌.md'))
    const err = await createKnowledgeBrowseService({ db: f.db })
      .getEntryDetail({ projectId: f.projectId, entryId })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EntryNotFoundError)
    expect((err as EntryNotFoundError).data).toMatchObject({ projectId: f.projectId, entryId })
  })

  it('浏览查询面零写召回轨迹（listEntries/getEntryDetail/sessionRecall 不落 recall_logs/app_key_logs）', async () => {
    const f = fixture({ rebuild: true })
    const svc = createKnowledgeBrowseService({ db: f.db })
    await svc.listEntries({ projectId: f.projectId })
    const entryId = entryIdByTitle(f.db, f.projectId).get('框架选型')!
    await svc.getEntryDetail({ projectId: f.projectId, entryId })
    await svc.sessionRecall({ projectId: f.projectId, sessionId: 'sess-1' })
    expect(recallLogsOf(f.db, f.projectId)).toHaveLength(0)
    expect(keyLogsOf(f.db)).toHaveLength(0)
  })
})

// ── AC3/AC4：sessionRecall（统计头口径 + 分组行） ──

/** 召回场景夹具：sess-1 四调用（多命中 search / read-abstract / 零命中 / text search），sess-2 一调用 */
async function recallScenario(db: Database.Database, projectId: string): Promise<void> {
  const recall = createKnowledgeRecallService({ db })
  const ids = entryIdByTitle(db, projectId)
  await recall.search({ projectId, domainPrefix: '前端', sessionId: 'sess-1' }) // call A：框架选型 + 样式令牌
  await recall.readAbstract({ projectId, entryId: ids.get('框架选型')!, sessionId: 'sess-1' }) // call B
  await recall.search({ projectId, keywords: ['不存在的词'], sessionId: 'sess-1' }) // call C：零命中哨兵
  await recall.search({ projectId, domainPrefix: '后端', sessionId: 'sess-2' }) // call D（他会话）
  await recall.search({ projectId, text: 'api', sessionId: 'sess-1' }) // call E：API 规范 + 网关
}

describe('sessionRecall 统计头与分组行（AC3/AC4）', () => {
  it('分组行逐字段：callId/verb/query/hitCount/durationMs/createdAt + hits 快照展开（title_snap/domain_snap/frontmatterId）', async () => {
    const f = fixture({ rebuild: true })
    await recallScenario(f.db, f.projectId)
    const groups = await createKnowledgeBrowseService({ db: f.db }).sessionRecall({ projectId: f.projectId, sessionId: 'sess-1' })
    expect(groups).toHaveLength(4) // A/B/C/E（sess-2 隔离）
    const e = groups.find((g) => g.query?.text === 'api')!
    expect(e).toMatchObject({ verb: 'search', hitCount: 2 })
    expect(e.callId).toMatch(/^[0-9a-f-]{36}$/)
    expect(e.durationMs).toBeGreaterThanOrEqual(0)
    expect(e.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(e.hits.map((h) => h.title).sort()).toEqual(['API 规范', '网关'])
    for (const h of e.hits) expect(h.domainPath).toBe('后端')
    expect(e.hits.find((h) => h.title === 'API 规范')!.frontmatterId).toBe('kb-be-001')

    const b = groups.find((g) => g.verb === 'read-abstract')!
    expect(b.query).toEqual({ entryId: entryIdByTitle(f.db, f.projectId).get('框架选型') })
    expect(b.hitCount).toBe(1)
    expect(b.hits[0]).toMatchObject({ title: '框架选型', domainPath: '前端' })
  })

  it('统计头口径：次数 = COUNT(DISTINCT call_id)（含零命中调用）；覆盖 = 去重命中条目——SQL 对拍', async () => {
    const f = fixture({ rebuild: true })
    await recallScenario(f.db, f.projectId)
    const groups = await createKnowledgeBrowseService({ db: f.db }).sessionRecall({ projectId: f.projectId, sessionId: 'sess-1' })
    const stats = recallStats(groups)
    const raw = f.db.prepare<[string, string], { calls: number; covered: number }>(
      `SELECT COUNT(DISTINCT call_id) AS calls,
              COUNT(DISTINCT CASE WHEN entry_id IS NOT NULL THEN entry_id END) AS covered
       FROM knowledge_recall_logs WHERE project_id = ? AND session_id = ?`,
    ).get(f.projectId, 'sess-1')!
    expect(stats).toEqual({ calls: 4, covered: 4 }) // A 两命中 + B 一命中 + C 零命中（计次数不计覆盖）+ E 两命中 → 去重 4 条目
    expect(stats).toEqual({ calls: raw!.calls, covered: raw!.covered }) // 口径与单表 SQL 完全一致
  })

  it('零命中调用成组（hitCount=0 / hits 空 / query 快照在）；分组按最近时间在前', async () => {
    const f = fixture({ rebuild: true })
    await recallScenario(f.db, f.projectId)
    const groups = await createKnowledgeBrowseService({ db: f.db }).sessionRecall({ projectId: f.projectId, sessionId: 'sess-1' })
    const zero = groups.find((g) => g.hitCount === 0)!
    expect(zero.hits).toEqual([])
    expect(zero.query).toEqual({ keywords: ['不存在的词'] })
    expect(groups[0]!.query?.text).toBe('api') // 最近一次调用（call E）在最前
    expect(groups[0]!.createdAt >= groups[groups.length - 1]!.createdAt).toBe(true)
  })

  it('会话隔离：sess-2 仅见本会话调用', async () => {
    const f = fixture({ rebuild: true })
    await recallScenario(f.db, f.projectId)
    const groups = await createKnowledgeBrowseService({ db: f.db }).sessionRecall({ projectId: f.projectId, sessionId: 'sess-2' })
    expect(groups).toHaveLength(1)
    expect(recallStats(groups)).toEqual({ calls: 1, covered: 3 })
    expect(groups[0]!.hits.map((h) => h.title).sort()).toEqual(['API 规范', '安全编码规范', '网关'])
  })

  it('热度徽章数据：命中条目 heat = 项目级使用事件计数（与 heatByEntry 同源）', async () => {
    const f = fixture({ rebuild: true })
    await recallScenario(f.db, f.projectId)
    const heat = await createKnowledgeRecallService({ db: f.db }).heatByEntry(f.projectId)
    const groups = await createKnowledgeBrowseService({ db: f.db }).sessionRecall({ projectId: f.projectId, sessionId: 'sess-1' })
    const allHits = groups.flatMap((g) => g.hits)
    const fe = allHits.find((h) => h.title === '框架选型')!
    expect(fe.heat).toBe(2) // search 命中 + read-abstract 各一次
    expect(fe.heat).toBe(heat.get(fe.entryId!))
    expect(allHits.find((h) => h.title === '样式令牌')!.heat).toBe(1)
  })

  it('索引重建后行保留（ER entry_id「已重建清除」）：entry_id 置 NULL、快照在、热度按 frontmatter_id 兜底', async () => {
    const f = fixture({ rebuild: true })
    const ids = entryIdByTitle(f.db, f.projectId)
    await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, domainPrefix: '前端', sessionId: 'sess-1' })
    // 重建（召回日志在场）——FK 无 ON DELETE 动作，须先清引用（SPEC：条目已重建清除·行保留）
    const report = await createKnowledgeIndexService({ db: f.db }).rebuildIndex(f.projectId)
    expect(report).toEqual({ indexed: 7, skipped: 0 }) // 不再抛 FOREIGN KEY constraint failed
    const rows = recallLogsOf(f.db, f.projectId)
    expect(rows).toHaveLength(2) // 行保留
    for (const r of rows) expect(r.entry_id).toBeNull() // 引用清除（快照抗重建）
    expect(new Set(rows.map((r) => r.title_snap))).toEqual(new Set(['框架选型', '样式令牌']))
    expect(ids.get('框架选型')).toBeDefined()

    const groups = await createKnowledgeBrowseService({ db: f.db }).sessionRecall({ projectId: f.projectId, sessionId: 'sess-1' })
    expect(groups).toHaveLength(1)
    const feHit = groups[0]!.hits.find((h) => h.title === '框架选型')!
    expect(feHit.entryId).toBeNull() // 索引未命中 → 行级数据仍可展示（UI 失效标注归 3.8）
    expect(feHit.frontmatterId).toBe('kb-fe-001')
    expect(feHit.heat).toBe(1) // 兜底分组键 frontmatter_id 计数（kb-fe-001 全部事件）
    const cssHit = groups[0]!.hits.find((h) => h.title === '样式令牌')!
    expect(cssHit.frontmatterId).toBeNull()
    expect(cssHit.heat).toBe(0) // 无稳定 ID 可兜底 → 热度归零（降级不报错）
  })

  it('无召回会话 → 空数组（tab 空态数据源）', async () => {
    const f = fixture({ rebuild: true })
    expect(await createKnowledgeBrowseService({ db: f.db }).sessionRecall({ projectId: f.projectId, sessionId: 'none' })).toEqual([])
  })
})

// ── listEntries 静默重建联动（ERR_INDEX_STALE 语义，scope=index） ──

describe('listEntries 静默重建联动', () => {
  it('零行索引 + 目录有文件 → 静默重建后返回卡片 + app_key_logs(warn, scope=index) 记自动修复', async () => {
    const f = fixture() // 不预重建
    const cards = await createKnowledgeBrowseService({ db: f.db }).listEntries({ projectId: f.projectId })
    expect(cards).toHaveLength(7)
    const logs = keyLogsOf(f.db)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'warn', scope: 'index' })
  })

  it('零行索引 + 目录不可达 → InvalidKnowledgeDirError + 降级 app_key_logs(error, scope=index)', async () => {
    const f = fixture()
    rmSync(f.knowledgeDir, { recursive: true, force: true })
    const err = await createKnowledgeBrowseService({ db: f.db })
      .listEntries({ projectId: f.projectId })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(InvalidKnowledgeDirError)
    expect(err).toMatchObject({ code: 'ERR_INVALID_KNOWLEDGE_DIR' })
    expect(keyLogsOf(f.db)[0]).toMatchObject({ level: 'error', scope: 'index' })
  })

  it('静默重建失败（非目录异常）→ IndexStaleError + 降级 app_key_logs(error)', async () => {
    const f = fixture()
    const svc = createKnowledgeBrowseService({
      db: f.db,
      indexService: { rebuildIndex: async () => { throw new Error('disk boom') } }, // 注入缝替身
    })
    const err = await svc.listEntries({ projectId: f.projectId }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(IndexStaleError)
    expect(err).toMatchObject({ code: 'ERR_INDEX_STALE', name: 'IndexStaleError' })
    expect(keyLogsOf(f.db)[0]).toMatchObject({ level: 'error', scope: 'index' })
  })
})

// ── fix-31：存在性判定口径——域过滤零行 ≠ 索引缺失（防误判整库重建） ──

describe('索引存在性判定口径（fix-31）', () => {
  it('已有索引 + 不存在的域前缀 → 空卡片零重建：无 key log、entryId 不变', async () => {
    const f = fixture({ rebuild: true })
    const before = entryIdByTitle(f.db, f.projectId)
    const counter = countingIndexService(f.db)
    const cards = await createKnowledgeBrowseService({ db: f.db, indexService: counter.service })
      .listEntries({ projectId: f.projectId, domainPrefix: '不存在的域' })
    expect(cards).toEqual([]) // 域零行 = 合法空结果
    expect(counter.calls()).toBe(0) // 项目级 COUNT>0 → 不触发整库重建
    expect(keyLogsOf(f.db)).toHaveLength(0) // 无 warn 日志
    expect(entryIdByTitle(f.db, f.projectId)).toEqual(before) // entryId 零变动
  })

  it('首建后二次调用零重建：空域 listEntries 首建一次，重复调用（含 browse 聚合）零重建/零记账', async () => {
    const f = fixture() // 不预建索引（项目级零行 = 真缺失）
    const counter = countingIndexService(f.db)
    const svc = createKnowledgeBrowseService({ db: f.db, indexService: counter.service })
    expect(await svc.listEntries({ projectId: f.projectId, domainPrefix: '不存在的域' })).toEqual([])
    expect(counter.calls()).toBe(1) // 真缺失径保持：首建一次
    expect(keyLogsOf(f.db)).toHaveLength(1) // 重建事件单条（warn, scope=index）
    expect(await svc.listEntries({ projectId: f.projectId, domainPrefix: '不存在的域' })).toEqual([])
    expect(await svc.browse({ projectId: f.projectId })).toHaveLength(4) // browse 聚合经同一底表口径
    expect(counter.calls()).toBe(1) // COUNT>0 短路——二次调用零重建
    expect(keyLogsOf(f.db)).toHaveLength(1) // 零新增 warn（不刷屏）
  })
})

// ── 失败口径（fail-loud，同 3.1/3.2 先例） ──

describe('projectId 未命中 fail-loud', () => {
  it('listEntries / getEntryDetail / sessionRecall 未命中 projects 行 → 裸错上抛（非六码）', async () => {
    const f = fixture({ rebuild: true })
    const svc = createKnowledgeBrowseService({ db: f.db })
    await expect(svc.listEntries({ projectId: randomUUID() })).rejects.toThrowError(/项目不存在/)
    await expect(svc.getEntryDetail({ projectId: randomUUID(), entryId: 1 })).rejects.toThrowError(/项目不存在/)
    await expect(svc.sessionRecall({ projectId: randomUUID(), sessionId: 's' })).rejects.toThrowError(/项目不存在/)
  })
})

// ── Hard Rule 佐证：浏览面零写知识目录 ──

describe('浏览面零写知识目录（Hard Rule 佐证）', () => {
  it('三查询后知识目录文件集合不变（SC2 直读，无任何投影回流）', async () => {
    const f = fixture({ rebuild: true })
    const before = new Set(readdirSync(f.knowledgeDir, { recursive: true }).map(String))
    const svc = createKnowledgeBrowseService({ db: f.db })
    await svc.listEntries({ projectId: f.projectId })
    const entryId = entryIdByTitle(f.db, f.projectId).get('框架选型')!
    await svc.getEntryDetail({ projectId: f.projectId, entryId })
    await svc.sessionRecall({ projectId: f.projectId, sessionId: 's' })
    expect(new Set(readdirSync(f.knowledgeDir, { recursive: true }).map(String))).toEqual(before)
  })
})
