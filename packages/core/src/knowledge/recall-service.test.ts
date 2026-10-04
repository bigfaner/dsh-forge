// 任务 3.2 集成测试 —— search / readAbstract 检索面 + knowledge_recall_logs 写入 + 热度聚合。
// 环境口径：每用例独占临时 SQLite（openDatabase，schema v1 迁移即建表）+ 临时知识目录；
// projects 行直插（注册链路归 forge 域 2.2 已测）。夹具/语料（RECALL_CORPUS 六条目）/
// 行读取助手经 testutil/knowledge-corpus 单源（fix-35 收编）。
// AC 对照：AC1 域前缀过滤（场景④）/ AC2 关键词细分 + SearchHit 摘要先行 / AC3 read-abstract
// 不含正文（场景⑤）+ 未命中六码 / AC4 日志行口径（N 命中 N 行同 call_id / 零命中哨兵行）/
// AC5 热度口径（场景⑥数据侧）/ AC6 索引缓存直读（SC2 零文件扫描）+ Description 补充
// （静默重建联动 / 降级 app_key_logs）。
import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { createKnowledgeRecallService } from './recall-service.js'
import { EntryNotFoundError, IndexStaleError, InvalidKnowledgeDirError } from './errors.js'
import {
  RECALL_CORPUS,
  countingIndexService,
  disposeKnowledgeCorpus,
  entryIdByTitle,
  keyLogsOf,
  knowledgeFixture,
  recallLogsOf,
  titles,
} from '../testutil/knowledge-corpus.js'

// ── 测试环境 ──

afterAll(disposeKnowledgeCorpus)

/** 夹具（recall 域口径：RECALL_CORPUS 语料；rebuild = 是否先行重建索引，默认否——静默重建联动需要零行索引） */
const fixture = (options: { rebuild?: boolean } = {}) =>
  knowledgeFixture({ prefix: 'dsh-forge-knrc-', corpus: RECALL_CORPUS, ...options })

// ── AC1：域前缀过滤（场景④） ──

describe('search 域前缀过滤（AC1·场景④）', () => {
  it('选「前端」域只返前端域条目（不返后端域）', async () => {
    const f = fixture({ rebuild: true })
    const hits = await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, domainPrefix: '前端' })
    expect(titles(hits).sort()).toEqual(['样式令牌', '框架选型'])
    for (const h of hits) expect(h.domainPath === '前端' || h.domainPath.startsWith('前端/')).toBe(true)
  })

  it('省略 domainPrefix = 全域', async () => {
    const f = fixture({ rebuild: true })
    const hits = await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId })
    expect(hits).toHaveLength(6)
  })

  it('嵌套域前缀命中子域（编程 → 编程/java）', async () => {
    const f = fixture({ rebuild: true })
    const hits = await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, domainPrefix: '编程' })
    expect(titles(hits)).toEqual(['并发手册'])
    expect(hits[0]).toMatchObject({ domainPath: '编程/java' })
  })

  it('段前缀不做子串误匹配（「前」≠「前端」）', async () => {
    const f = fixture({ rebuild: true })
    const hits = await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, domainPrefix: '前' })
    expect(hits).toHaveLength(0)
  })
})

// ── AC2：关键词细分 + SearchHit 摘要先行 ──

describe('search 关键词细分与命中形状（AC2）', () => {
  it('keywords 匹配命中（仅返含该关键词的条目）；SearchHit 六字段摘要先行', async () => {
    const f = fixture({ rebuild: true })
    const hits = await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, keywords: ['react'] })
    expect(hits).toHaveLength(1)
    expect(Object.keys(hits[0]!).sort()).toEqual(['domainPath', 'entryId', 'frontmatterId', 'score', 'summary', 'title'])
    expect(hits[0]).toMatchObject({ title: '框架选型', summary: '前端框架选型基线', domainPath: '前端', frontmatterId: 'kb-fe-001' })
    expect(typeof hits[0]!.score).toBe('number')
  })

  it('多关键词 AND 细分（backend ∩ security → 仅安全编码规范）', async () => {
    const f = fixture({ rebuild: true })
    const hits = await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, keywords: ['backend', 'security'] })
    expect(titles(hits)).toEqual(['安全编码规范'])
  })

  it('关键词匹配大小写不敏感（REACT 命中 react）', async () => {
    const f = fixture({ rebuild: true })
    const hits = await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, keywords: ['REACT'] })
    expect(titles(hits)).toEqual(['框架选型'])
  })

  it('text 匹配 title/summary；title 命中分高排前；limit 截断', async () => {
    const f = fixture({ rebuild: true })
    const svc = createKnowledgeRecallService({ db: f.db })
    const hits = await svc.search({ projectId: f.projectId, text: 'api' })
    expect(titles(hits)).toEqual(['API 规范', '网关']) // title 命中（2 分）> summary 命中（1 分）
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score)

    const limited = await svc.search({ projectId: f.projectId, text: 'api', limit: 1 })
    expect(titles(limited)).toEqual(['API 规范'])
  })
})

// ── AC3：readAbstract 不含正文（场景⑤） + 未命中六码 ──

describe('readAbstract（AC3·场景⑤）', () => {
  it('返回摘要不含正文（字段集精确 = 元数据六字段，keywords 解析为数组）', async () => {
    const f = fixture({ rebuild: true })
    const entryId = entryIdByTitle(f.db, f.projectId).get('框架选型')!
    const abstract = await createKnowledgeRecallService({ db: f.db }).readAbstract({ projectId: f.projectId, entryId })
    expect(abstract).toEqual({
      entryId,
      title: '框架选型',
      summary: '前端框架选型基线',
      keywords: ['react', 'frontend'],
      status: 'published',
      domainPath: '前端',
    })
    expect('body' in abstract).toBe(false) // 不含正文（场景⑤）
  })

  it('entryId 未命中 → EntryNotFoundError（ERR_ENTRY_NOT_FOUND）+ app_key_logs(scope=recall) 且不写 recall_logs', async () => {
    const f = fixture({ rebuild: true })
    const err = await createKnowledgeRecallService({ db: f.db })
      .readAbstract({ projectId: f.projectId, entryId: 99999 })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EntryNotFoundError)
    expect(err).toMatchObject({ code: 'ERR_ENTRY_NOT_FOUND', name: 'EntryNotFoundError' })
    expect(recallLogsOf(f.db, f.projectId)).toHaveLength(0) // 失败调用不进召回轨迹
    const logs = keyLogsOf(f.db)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'warn', scope: 'recall' })
    expect(JSON.parse(logs[0]!.data_json!)).toMatchObject({ projectId: f.projectId, entryId: 99999 })
  })
})

// ── AC4：recall_logs 写入口径 ──

describe('recall_logs 写入口径（AC4）', () => {
  it('search 命中 N 条写 N 行：同 call_id（uuid）+ 调用级字段共享 + 逐行快照', async () => {
    const f = fixture({ rebuild: true })
    await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, domainPrefix: '前端', sessionId: 'sess-1' })
    const rows = recallLogsOf(f.db, f.projectId)
    expect(rows).toHaveLength(2)
    const [a, b] = rows
    expect(a!.call_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(b!.call_id).toBe(a!.call_id) // 同调用分组
    for (const r of rows) {
      expect(r).toMatchObject({ project_id: f.projectId, session_id: 'sess-1', verb: 'search', hit_count: 2 })
      expect(JSON.parse(r.query_json!)).toEqual({ domainPrefix: '前端' }) // query_json 同 call 各行重复
      expect(r.duration_ms).toBeGreaterThanOrEqual(0)
      expect(r.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
    expect(a!.duration_ms).toBe(b!.duration_ms)
    const snaps = new Set(rows.map((r) => `${r.entry_id}|${r.title_snap}|${r.domain_snap}|${r.frontmatter_id}`))
    expect(snaps).toEqual(new Set([
      `${entryIdByTitle(f.db, f.projectId).get('框架选型')}|框架选型|前端|kb-fe-001`,
      `${entryIdByTitle(f.db, f.projectId).get('样式令牌')}|样式令牌|前端|null`,
    ]))
  })

  it('零命中写哨兵行（entry_id=NULL / hit_count=0 / 快照 NULL）', async () => {
    const f = fixture({ rebuild: true })
    await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, keywords: ['不存在的词'] })
    const rows = recallLogsOf(f.db, f.projectId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ verb: 'search', entry_id: null, hit_count: 0, title_snap: null, domain_snap: null, frontmatter_id: null })
    expect(JSON.parse(rows[0]!.query_json!)).toEqual({ keywords: ['不存在的词'] })
  })

  it('readAbstract 写 1 行（verb=read-abstract + 条目快照 + query_json 快照 entryId）', async () => {
    const f = fixture({ rebuild: true })
    const entryId = entryIdByTitle(f.db, f.projectId).get('框架选型')!
    await createKnowledgeRecallService({ db: f.db }).readAbstract({ projectId: f.projectId, entryId, sessionId: 'sess-1' })
    const rows = recallLogsOf(f.db, f.projectId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      verb: 'read-abstract', entry_id: entryId, frontmatter_id: 'kb-fe-001',
      title_snap: '框架选型', domain_snap: '前端', hit_count: 1, session_id: 'sess-1',
    })
    expect(JSON.parse(rows[0]!.query_json!)).toEqual({ entryId })
  })

  it('sessionId 缺省空串（无会话上下文不违反 NOT NULL）', async () => {
    const f = fixture({ rebuild: true })
    await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, domainPrefix: '后端' })
    expect(recallLogsOf(f.db, f.projectId).every((r) => r.session_id === '')).toBe(true)
  })
})

// ── AC5：热度聚合（场景⑥数据侧） ──

describe('heatByEntry 热度口径（AC5·场景⑥数据侧）', () => {
  it('search 命中与 read-abstract 各计一次；哨兵行不计；重复查询累计（每次召回记一次）', async () => {
    const f = fixture({ rebuild: true })
    const svc = createKnowledgeRecallService({ db: f.db })
    const ids = entryIdByTitle(f.db, f.projectId)
    const fe = ids.get('框架选型')!
    const css = ids.get('样式令牌')!

    await svc.search({ projectId: f.projectId, domainPrefix: '前端' }) // 2 命中 → 各 +1
    let heat = await svc.heatByEntry(f.projectId)
    expect(heat.get(fe)).toBe(1)
    expect(heat.get(css)).toBe(1)

    await svc.readAbstract({ projectId: f.projectId, entryId: fe }) // read-abstract → fe +1
    heat = await svc.heatByEntry(f.projectId)
    expect(heat.get(fe)).toBe(2)
    expect(heat.get(css)).toBe(1)

    await svc.search({ projectId: f.projectId, keywords: ['不存在的词'] }) // 零命中哨兵行 → 热度不变
    heat = await svc.heatByEntry(f.projectId)
    expect(heat.get(fe)).toBe(2)

    await svc.search({ projectId: f.projectId, domainPrefix: '前端' }) // 同查询再召回 → 再各 +1
    heat = await svc.heatByEntry(f.projectId)
    expect(heat.get(fe)).toBe(3)
    expect(heat.get(css)).toBe(2)

    // 同源断言：热度值 = 按条目 COUNT(*)（哨兵行 entry_id IS NULL 天然排除）
    const raw = f.db.prepare<unknown[], { c: number }>(`SELECT COUNT(*) AS c FROM knowledge_recall_logs WHERE entry_id = ?`).get(fe)
    expect(heat.get(fe)).toBe(raw!.c)
  })

  it('无召回日志的项目 → 空 Map', async () => {
    const f = fixture({ rebuild: true })
    expect(await createKnowledgeRecallService({ db: f.db }).heatByEntry(f.projectId)).toEqual(new Map())
  })
})

// ── AC6：索引缓存直读（SC2 零文件扫描） ──

describe('索引缓存直读（AC6·SC2）', () => {
  it('知识目录删除后检索照常（缓存直读，零文件扫描，不触发重建）', async () => {
    const f = fixture({ rebuild: true })
    rmSync(f.knowledgeDir, { recursive: true, force: true }) // 目录整体递归删除（内部逐文件 unlink，安全）
    const svc = createKnowledgeRecallService({ db: f.db })
    const hits = await svc.search({ projectId: f.projectId, domainPrefix: '前端' })
    expect(titles(hits).sort()).toEqual(['样式令牌', '框架选型'])
    const entryId = entryIdByTitle(f.db, f.projectId).get('框架选型')!
    const abstract = await svc.readAbstract({ projectId: f.projectId, entryId })
    expect(abstract.title).toBe('框架选型')
    expect(keyLogsOf(f.db)).toHaveLength(0) // 索引在——无重建事件、无异常
    expect(recallLogsOf(f.db, f.projectId)).toHaveLength(3) // search 2 行 + read-abstract 1 行照常落
  })
})

// ── Description：索引缺失静默重建联动 + 检索异常降级 ──

describe('索引缺失静默重建联动（ERR_INDEX_STALE 语义）', () => {
  it('零行索引 + 目录有文件 → 静默重建后正常返回 + app_key_logs(warn, scope=recall) 记重建事件', async () => {
    const f = fixture() // 不预重建：knowledge_entries 零行
    const hits = await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId, domainPrefix: '后端' })
    expect(titles(hits).sort()).toEqual(['API 规范', '安全编码规范', '网关'])
    const logs = keyLogsOf(f.db)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'warn', scope: 'recall' })
    expect(JSON.parse(logs[0]!.data_json!)).toMatchObject({ projectId: f.projectId, indexed: 6, skipped: 0 })
  })

  it('零行索引 + 空目录 → 重建后空结果 + 哨兵行（空库可检索不报错）', async () => {
    const f = fixture()
    rmSync(f.knowledgeDir, { recursive: true, force: true })
    mkdirSync(f.knowledgeDir)
    const hits = await createKnowledgeRecallService({ db: f.db }).search({ projectId: f.projectId })
    expect(hits).toHaveLength(0)
    expect(recallLogsOf(f.db, f.projectId)).toHaveLength(1) // 哨兵行
    expect(keyLogsOf(f.db)).toHaveLength(1) // 重建事件照记
  })

  it('零行索引 + 目录不可达 → InvalidKnowledgeDirError（ERR_INVALID_KNOWLEDGE_DIR）+ 降级 app_key_logs(error, scope=recall)', async () => {
    const f = fixture()
    rmSync(f.knowledgeDir, { recursive: true, force: true })
    const err = await createKnowledgeRecallService({ db: f.db })
      .search({ projectId: f.projectId, domainPrefix: '前端' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(InvalidKnowledgeDirError)
    expect(err).toMatchObject({ code: 'ERR_INVALID_KNOWLEDGE_DIR' })
    expect(recallLogsOf(f.db, f.projectId)).toHaveLength(0) // 失败调用不进召回轨迹
    const logs = keyLogsOf(f.db)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'error', scope: 'recall' })
  })

  it('静默重建失败（非目录异常）→ IndexStaleError（ERR_INDEX_STALE）+ 降级 app_key_logs(error)', async () => {
    const f = fixture()
    const svc = createKnowledgeRecallService({
      db: f.db,
      indexService: { rebuildIndex: async () => { throw new Error('disk boom') } }, // 注入缝替身
    })
    const err = await svc.search({ projectId: f.projectId }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(IndexStaleError)
    expect(err).toMatchObject({ code: 'ERR_INDEX_STALE', name: 'IndexStaleError' })
    expect((err as IndexStaleError).cause).toBeInstanceOf(Error)
    expect(keyLogsOf(f.db)).toHaveLength(1)
    expect(keyLogsOf(f.db)[0]).toMatchObject({ level: 'error', scope: 'recall' })
  })
})

// ── fix-31：存在性判定口径——域过滤零行 ≠ 索引缺失（防误判整库重建） ──

describe('索引存在性判定口径（fix-31）', () => {
  it('已有索引 + 不存在的域前缀 → 空结果零重建：无 warn、entryId 不变、哨兵行照写', async () => {
    const f = fixture({ rebuild: true })
    const before = entryIdByTitle(f.db, f.projectId)
    const counter = countingIndexService(f.db)
    const hits = await createKnowledgeRecallService({ db: f.db, indexService: counter.service })
      .search({ projectId: f.projectId, domainPrefix: '不存在的域' })
    expect(hits).toHaveLength(0) // 域零行 = 合法空结果
    expect(counter.calls()).toBe(0) // 项目级 COUNT>0 → 不触发整库重建
    expect(keyLogsOf(f.db)).toHaveLength(0) // 无 warn 日志
    expect(entryIdByTitle(f.db, f.projectId)).toEqual(before) // entryId 零变动（不换发）
    const rows = recallLogsOf(f.db, f.projectId)
    expect(rows).toHaveLength(1) // 零命中哨兵行照写
    expect(rows[0]).toMatchObject({ verb: 'search', entry_id: null, hit_count: 0 })
  })

  it('首建后二次调用零重建：空域查询首建一次，重复空域查询零重建/零记账', async () => {
    const f = fixture() // 不预建索引（项目级零行 = 真缺失）
    const counter = countingIndexService(f.db)
    const svc = createKnowledgeRecallService({ db: f.db, indexService: counter.service })
    const first = await svc.search({ projectId: f.projectId, domainPrefix: '不存在的域' })
    expect(first).toHaveLength(0)
    expect(counter.calls()).toBe(1) // 真缺失径保持：首建一次
    expect(keyLogsOf(f.db)).toHaveLength(1) // 重建事件单条（warn）
    const second = await svc.search({ projectId: f.projectId, domainPrefix: '不存在的域' })
    expect(second).toHaveLength(0)
    expect(counter.calls()).toBe(1) // COUNT>0 短路——二次调用零重建
    expect(keyLogsOf(f.db)).toHaveLength(1) // 零新增 warn（不刷屏）
  })

  it('search → read_abstract 链不被无关域查询打断（entryId 稳定 + 热度链引用保持）', async () => {
    const f = fixture({ rebuild: true })
    const svc = createKnowledgeRecallService({ db: f.db })
    const hits = await svc.search({ projectId: f.projectId, domainPrefix: '后端' })
    const api = hits.find((h) => h.title === 'API 规范')!
    await svc.search({ projectId: f.projectId, domainPrefix: '不存在的域' }) // 无关域零行查询
    const abstract = await svc.readAbstract({ projectId: f.projectId, entryId: api.entryId })
    expect(abstract.title).toBe('API 规范') // 上一次 search 返回的 entryId 仍有效
    expect(await svc.heatByEntry(f.projectId).then((m) => m.get(api.entryId))).toBe(2) // search + read-abstract 各一次，entry_id 引用稳定
    expect(keyLogsOf(f.db)).toHaveLength(0)
  })
})

// ── 失败口径（fail-loud，同 3.1 先例） ──

describe('projectId 未命中 fail-loud', () => {
  it('search / readAbstract 未命中 projects 行 → 裸错上抛（非六码）', async () => {
    const f = fixture({ rebuild: true })
    const svc = createKnowledgeRecallService({ db: f.db })
    await expect(svc.search({ projectId: randomUUID() })).rejects.toThrowError(/项目不存在/)
    await expect(svc.readAbstract({ projectId: randomUUID(), entryId: 1 })).rejects.toThrowError(/项目不存在/)
  })
})

// ── Hard Rule 佐证：缓存零落知识目录 ──

describe('检索零落知识目录（Hard Rule 佐证）', () => {
  it('search/readAbstract 后知识目录文件集合不变（recall_logs 只落应用库）', async () => {
    const f = fixture({ rebuild: true })
    const before = new Set(readdirSync(f.knowledgeDir, { recursive: true }).map(String))
    const svc = createKnowledgeRecallService({ db: f.db })
    await svc.search({ projectId: f.projectId, domainPrefix: '前端' })
    const entryId = entryIdByTitle(f.db, f.projectId).get('框架选型')!
    await svc.readAbstract({ projectId: f.projectId, entryId })
    expect(new Set(readdirSync(f.knowledgeDir, { recursive: true }).map(String))).toEqual(before)
  })
})
