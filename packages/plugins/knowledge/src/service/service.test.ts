// 服务面单测（1.7 A2 随迁行为等价）：自持库供数八法——rebuild 幂等/静默重建联动/
// 零命中哨兵行/热度口径/EntryNotFound 六码/两级解析 fail-loud。结构性全面对照另由
// e2e/support/knowledge-golden（fixture 结构等价）与 host knowledge-rpc 实层承载。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../storage/index.js'
import { createKnowledgeService } from './service.js'
import { EntryNotFoundError } from './errors.js'
import type { BrowseKnowledgeService } from './types.js'

let home: string
let service: BrowseKnowledgeService
let projectId: string
let wsDir: string
let knowledgeDir: string
let db: import('better-sqlite3').Database

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-svc-'))
  wsDir = join(home, 'ws')
  knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(join(knowledgeDir, 'backend'), { recursive: true })
  writeFileSync(join(knowledgeDir, 'backend', 'api.md'), '---\ntitle: API\nsummary: 接口规范\nkeywords: [api]\n---\n正文', 'utf8')
  writeFileSync(join(knowledgeDir, 'backend', 'auth.md'), '---\ntitle: AUTH\nsummary: 认证规范\nkeywords: [api, security]\n---\n正文', 'utf8')
  projectId = 'p-svc'
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  createKnowledgeRegistry(db).upsert(wsDir, knowledgeDir)
  service = createKnowledgeService({ db, resolveWsPath: (id) => (id === projectId ? wsDir : undefined) })
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

describe('八法行为等价（core 随迁）', () => {
  it('rebuildIndex：六条目口径——索引计数 + 幂等（重跑零重复）', async () => {
    const r1 = await service.rebuildIndex(projectId)
    expect(r1).toEqual({ indexed: 2, skipped: 0 })
    const r2 = await service.rebuildIndex(projectId)
    expect(r2.indexed).toBe(2)
  })

  it('search：静默重建联动（索引缺失首查自动重建）+ 域前缀/关键词过滤 + 零命中哨兵行', async () => {
    const hits = await service.search({ projectId, domainPrefix: 'backend', keywords: ['api'], sessionId: 's1' })
    expect(hits.map((h) => h.title).sort()).toEqual(['API', 'AUTH'])
    const zero = await service.search({ projectId, keywords: ['nope'], sessionId: 's1' })
    expect(zero).toEqual([])
    const groups = await service.sessionRecall({ projectId, sessionId: 's1' })
    expect(groups).toHaveLength(2) // 零命中调用计次（哨兵行不展开命中）
    expect(groups.find((g) => g.hitCount === 0)?.hits).toEqual([])
  })

  it('readAbstract：EntryAbstract（不含正文）；未命中 = ERR_ENTRY_NOT_FOUND 六码', async () => {
    const first = (await service.search({ projectId, sessionId: 's1' })).find((h) => h.title === 'API')!
    const abs = await service.readAbstract({ projectId, entryId: first.entryId, sessionId: 's1' })
    expect(abs.title).toBe('API')
    expect(abs).not.toHaveProperty('body')
    await expect(service.readAbstract({ projectId, entryId: 999999, sessionId: 's1' })).rejects.toBeInstanceOf(EntryNotFoundError)
  })

  it('heatByEntry：使用事件计数（search 命中 + read-abstract 各计一次；哨兵行不计）', async () => {
    const heat = await service.heatByEntry(projectId)
    const first = (await service.search({ projectId, keywords: ['security'], sessionId: 's2' })).find(() => true)!
    void service.readAbstract({ projectId, entryId: first.entryId, sessionId: 's2' })
    const heat2 = await service.heatByEntry(projectId)
    expect((heat2.get(first.entryId) ?? 0) - (heat.get(first.entryId) ?? 0)).toBeGreaterThanOrEqual(2)
  })

  it('browse/listEntries/getEntryDetail：域树聚合 + 正文按需读取', async () => {
    const nodes = await service.browse({ projectId })
    expect(nodes).toEqual([{ domainPath: 'backend', label: 'backend', depth: 1, entryCount: 2 }])
    const cards = await service.listEntries({ projectId, keyword: 'security' })
    expect(cards.map((c) => c.title)).toEqual(['AUTH'])
    const entryId = cards[0]!.entryId
    const detail = await service.getEntryDetail({ projectId, entryId })
    expect(detail.body).toBe('正文')
    expect(detail.title).toBe('AUTH')
  })

  it('两级解析 fail-loud：projectId 未命中静态绑定表 → 裸错（非六码）', async () => {
    await expect(service.listEntries({ projectId: 'p-other' })).rejects.toThrow(/项目不存在/)
  })
})
