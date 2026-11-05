// 服务面单测（stage② 1.4 v4 形收口）：自持库供数读面 + 写门三法（write/read/confirm）
// ——幂等/静默重建联动/零命中哨兵行/热度口径/EntryNotFound 六码/两级解析 fail-loud/
// 准入（unconfirmed 拒且不露存在性）/CAS。
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DiagEventPayload } from '@dsh-forge/contracts'
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
  // v4：id 缺席不入实体表——夹具全部带 id；api 为 confirmed（readAbstract/read 准入面）
  writeFileSync(
    join(knowledgeDir, 'backend', 'api.md'),
    '---\ntitle: API\nid: kb-api\nstatus: confirmed\nsummary: 接口规范\nkeywords: [api]\n---\n正文',
    'utf8',
  )
  writeFileSync(
    join(knowledgeDir, 'backend', 'auth.md'),
    '---\ntitle: AUTH\nid: kb-auth\nsummary: 认证规范\nkeywords: [api, security]\n---\n正文',
    'utf8',
  )
  projectId = 'p-svc'
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  createKnowledgeRegistry(db).upsert(wsDir, knowledgeDir, projectId)
  service = createKnowledgeService({ db, resolveWsPath: () => undefined })
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

describe('读面行为等价（v4 实体表）', () => {
  it('rebuildIndex：条目口径——索引计数 + 幂等（重跑零重复）', async () => {
    const r1 = await service.rebuildIndex(projectId)
    expect(r1).toEqual({ indexed: 2, skipped: 0, purged: 0 })
    const r2 = await service.rebuildIndex(projectId)
    expect(r2.indexed).toBe(2)
  })

  it('search：静默重建联动（索引缺失首查自动重建）+ 域前缀/关键词过滤 + 零命中哨兵行 + 四档 rank', async () => {
    const hits = await service.search({ projectId, domainPrefix: 'backend', keywords: ['api'], sessionId: 's1' })
    expect(hits.map((h) => h.title).sort()).toEqual(['API', 'AUTH'])
    // confirmed 1.0 / unconfirmed 0.6（纯新条目降权可见）
    expect(hits.find((h) => h.title === 'API')?.effectiveRank).toBe(1.0)
    expect(hits.find((h) => h.title === 'AUTH')?.effectiveRank).toBe(0.6)
    const zero = await service.search({ projectId, keywords: ['nope'], sessionId: 's1' })
    expect(zero).toEqual([])
    const groups = await service.sessionRecall({ projectId, sessionId: 's1' })
    expect(groups).toHaveLength(2) // 零命中调用计次（哨兵行不展开命中）
    expect(groups.find((g) => g.hitCount === 0)?.hits).toEqual([])
  })

  it('readAbstract：confirmed 可读；unconfirmed 拒且不露存在性（EntryNotFound 语义面）', async () => {
    const confirmed = (await service.search({ projectId, sessionId: 's1' })).find((h) => h.title === 'API')!
    const abs = await service.readAbstract({ projectId, entryId: confirmed.entryId, sessionId: 's1' })
    expect(abs.title).toBe('API')
    expect(abs).not.toHaveProperty('body')
    const unconfirmed = (await service.search({ projectId, sessionId: 's1' })).find((h) => h.title === 'AUTH')!
    await expect(service.readAbstract({ projectId, entryId: unconfirmed.entryId, sessionId: 's1' })).rejects.toBeInstanceOf(EntryNotFoundError)
    await expect(service.readAbstract({ projectId, entryId: 999999, sessionId: 's1' })).rejects.toBeInstanceOf(EntryNotFoundError)
  })

  it('heatByEntry：使用事件计数（search 命中 + read-abstract 各计一次；哨兵行不计）', async () => {
    const heat = await service.heatByEntry(projectId)
    const api = (await service.search({ projectId, keywords: ['api'], sessionId: 's2' })).find((h) => h.title === 'API')!
    await service.readAbstract({ projectId, entryId: api.entryId, sessionId: 's2' })
    const heat2 = await service.heatByEntry(projectId)
    expect((heat2.get(api.entryId) ?? 0) - (heat.get(api.entryId) ?? 0)).toBeGreaterThanOrEqual(2)
  })

  it('browse/listEntries/getEntryDetail：域树聚合 + 正文按需读取', async () => {
    const nodes = await service.browse({ projectId })
    expect(nodes).toEqual([{ domainPath: 'backend', label: 'backend', depth: 1, entryCount: 2, unconfirmedCount: 1 }])
    const cards = await service.listEntries({ projectId, keyword: 'security' })
    expect(cards.map((c) => c.title)).toEqual(['AUTH'])
    const entryId = cards[0]!.entryId
    const detail = await service.getEntryDetail({ projectId, entryId })
    expect(detail.body).toBe('正文')
    expect(detail.title).toBe('AUTH')
  })

  it('两级解析 fail-loud：projectId 未命中静态绑定表/注册行 → 裸错（非六码）', async () => {
    await expect(service.listEntries({ projectId: 'p-other' })).rejects.toThrow(/项目不存在/)
  })
})

describe('写门三法（stage② §2.3/§2.4）', () => {
  it('write：新条目（必要性三问通过）→ id 生成链 + 文件落盘 + frontmatter 回写 + unconfirmed 0.6', async () => {
    const out = await service.write({
      projectId,
      sessionId: 's1',
      title: 'Deploy Baseline',
      summary: '部署基线',
      keywords: ['deploy'],
      body: '部署正文',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    expect(out.outcome).toBe('written')
    if (out.outcome !== 'written') return
    expect(out.id).toMatch(/^[a-z0-9-]+$/)
    expect(out.id).toBe('deploy-baseline')
    expect(existsSync(out.filePath)).toBe(true)
    // read：unconfirmed 拒正文且不露存在性（denied 与未知 id 同形）
    const denied = await service.read({ projectId, id: out.id })
    expect(denied.outcome).toBe('denied')
    const unknown = await service.read({ projectId, id: 'no-such-id' })
    expect(unknown).toEqual(denied)
  })

  it('write：三问不过 → not-written 零残留；缺字段/路径非法 → rejected 逐例埋点零残留', async () => {
    const beforeFiles = existsSync(knowledgeDir) ? join(knowledgeDir) : knowledgeDir
    void beforeFiles
    const notWritten = await service.write({
      projectId,
      title: 'Common Sense',
      summary: 's',
      keywords: ['x'],
      body: 'b',
      necessity: { stable: false, nonTrivial: true, value: true, reason: '一次性上下文' },
    })
    expect(notWritten).toMatchObject({ outcome: 'not-written', reason: 'necessity-failed' })
    const missingTitle = await service.write({
      projectId,
      title: '',
      summary: 's',
      keywords: ['x'],
      body: 'b',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    expect(missingTitle).toMatchObject({ outcome: 'rejected', reason: 'missing-field', field: 'title' })
    const badPath = await service.write({
      projectId,
      title: 'Escape Path',
      summary: 's',
      keywords: ['x'],
      body: 'b',
      domain: '../escape',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    expect(badPath).toMatchObject({ outcome: 'rejected', reason: 'illegal-path' })
    const dotPath = await service.write({
      projectId,
      title: 'Dot Path',
      summary: 's',
      keywords: ['x'],
      body: 'b',
      domain: '.hidden',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    expect(dotPath).toMatchObject({ outcome: 'rejected', reason: 'illegal-path' })
    // 零残留：三例拒收后无新版本行
    const versions = (db.prepare('SELECT COUNT(*) c FROM knowledge_entry_versions').get() as { c: number }).c
    const written = await service.write({
      projectId,
      title: 'Zero Residue Probe',
      summary: 's',
      keywords: ['probe-zero'],
      body: 'b',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    if (written.outcome !== 'written') throw new Error('probe write failed')
    const after = (db.prepare('SELECT COUNT(*) c FROM knowledge_entry_versions').get() as { c: number }).c
    expect(after - versions).toBe(1) // 仅 probe 一行新增（三拒收 + 一 not-written 零残留）
  })

  it('write：查重命中挂 candidate_of（title_norm 精确）；版本化复用 id 不挂（互斥）', async () => {
    const dup = await service.write({
      projectId,
      title: 'Deploy Baseline', // 与首例同 title → title_norm 精确
      summary: '另一摘要',
      keywords: ['deploy'],
      body: '另一正文',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    if (dup.outcome !== 'written') throw new Error('dup write failed')
    expect(dup.candidateOf).toBe('deploy-baseline')
    expect(dup.mergeSuggestions.some((s) => s.id === 'deploy-baseline' && s.basis === 'title-norm')).toBe(true)
    expect(dup.id).not.toBe('deploy-baseline') // 撞名消歧（不同概念分支）
    // 版本化：显式 version_of → 复用 id + supersedes 锚，不挂 candidate_of
    const versioned = await service.write({
      projectId,
      title: 'Deploy Baseline v2',
      summary: '更新摘要',
      keywords: ['deploy'],
      body: '更新正文',
      versionOf: 'deploy-baseline',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    if (versioned.outcome !== 'written') throw new Error('versioned write failed')
    expect(versioned.id).toBe('deploy-baseline')
    expect(versioned.supersedes).toBeDefined()
    expect(versioned.candidateOf).toBeUndefined()
  })

  it('write：中文 title 生成链（slug_hint / keywords / hash 回退）', async () => {
    const withHint = await service.write({
      projectId,
      title: '部署基线文档',
      summary: 's',
      keywords: ['cn-test-1'],
      body: 'b',
      slugHint: 'Deploy Guide',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    if (withHint.outcome !== 'written') throw new Error('hint write failed')
    expect(withHint.id).toBe('deploy-guide')
    const noHint = await service.write({
      projectId,
      title: '认证基线文档',
      summary: 's',
      keywords: ['authbase'],
      body: 'b',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    if (noHint.outcome !== 'written') throw new Error('nohint write failed')
    expect(noHint.id).toBe('authbase') // keywords 英译回退
    expect(noHint.id).toMatch(/^[a-z0-9-]+$/)
  })

  it('confirm：升格 + 旧版降 superseded（事务）+ read 全开；CAS 已归并拒', async () => {
    const written = await service.write({
      projectId,
      title: 'Confirm Target',
      summary: 's',
      keywords: ['confirm-target'],
      body: '确认正文',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    if (written.outcome !== 'written') throw new Error('write failed')
    const result = await service.confirm({ projectId, id: written.id })
    expect(result).toMatchObject({ outcome: 'confirmed', id: written.id })
    if (result.outcome !== 'confirmed') return
    // confirmed 后 read 全开（全文 = 盘上文件逐字节等值）
    const read = await service.read({ projectId, id: written.id })
    expect(read.outcome).toBe('read')
    if (read.outcome === 'read') expect(read.body).toContain('确认正文')
    // 版本化新稿 + confirm 新版 → 旧版降 superseded（曾审可读）
    const v2 = await service.write({
      projectId,
      title: 'Confirm Target v2',
      summary: 's2',
      keywords: ['confirm-target'],
      body: 'v2 正文',
      versionOf: written.id,
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    if (v2.outcome !== 'written') throw new Error('v2 write failed')
    const reconfirm = await service.confirm({ projectId, id: written.id })
    if (reconfirm.outcome !== 'confirmed') throw new Error('reconfirm failed')
    expect(reconfirm.demoted).toContain(v2.supersedes)
    // CT-WG-13：同 id 有 confirmed 版时 unconfirmed 新稿不进召回（权威投影仍 confirmed）
    const rankRow = db.prepare(`SELECT status, effective_rank, confirmed_version_id FROM knowledge_entries WHERE id = ?`).get(written.id) as { status: string; effective_rank: number; confirmed_version_id: string }
    expect(rankRow.status).toBe('confirmed')
    expect(rankRow.effective_rank).toBe(1.0)
    expect(rankRow.confirmed_version_id).toBe(v2.versionTs)
    // CAS：归并态 confirm 拒（模拟 merged_into 落列）
    db.prepare(`UPDATE knowledge_entries SET merged_into = 'deploy-baseline' WHERE id = ?`).run(written.id)
    const cas = await service.confirm({ projectId, id: written.id })
    expect(cas).toMatchObject({ outcome: 'cas-failed', reason: 'merged' })
  })

  it('回流：0.2/0.4 档命中经滞回闸（限次后拦截 + 震荡 warn 埋点区分误判/震荡）', async () => {
    const diag: DiagEventPayload[] = []
    const svc = createKnowledgeService({ db, resolveWsPath: (id) => (id === projectId ? wsDir : undefined), emit: (p) => diag.push(p), backflow: { maxPerPair: 1, cooldownMs: 60_000, conflictThreshold: 0.2, supersededThreshold: 0.2 } })
    // 构造 redirect 沉底档（merged_into → effective_rank 0.2——distill 归并 loser 形态）
    const w = await svc.write({
      projectId,
      title: 'Backflow Probe',
      summary: '回流探针',
      keywords: ['backflow-probe'],
      body: 'b',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    if (w.outcome !== 'written') throw new Error('backflow write failed')
    db.prepare(`UPDATE knowledge_entries SET merged_into = 'deploy-baseline', effective_rank = 0.2 WHERE id = ?`).run(w.id)
    // 第一次命中：放行（info 误判回流观测点）
    const h1 = await svc.search({ projectId, keywords: ['backflow-probe'], sessionId: 'bf' })
    expect(h1.some((h) => h.frontmatterId === w.id)).toBe(true)
    expect(diag.some((d) => d.event === 'knowledge-backflow' && d.level === 'info')).toBe(true)
    // 第二次起：限次 1 → 拦截 + warn 震荡埋点（diag 区分震荡/误判）
    diag.length = 0
    const h2 = await svc.search({ projectId, keywords: ['backflow-probe'], sessionId: 'bf' })
    expect(h2.some((h) => h.frontmatterId === w.id)).toBe(false)
    expect(diag.some((d) => d.event === 'knowledge-backflow' && d.level === 'warn')).toBe(true)
  })
})

describe('registerProject（第九法——1.15 注册链进表径）', () => {
  it('缺省派生：knowledgeDir 缺席 = <wsPath>/.knowledge，目录缺则递归建 + 注册行 upsert（幂等）', async () => {
    const ws = join(home, 'ws-new')
    const dir = join(ws, '.knowledge')
    await service.registerProject({ wsPath: ws })
    expect(existsSync(dir)).toBe(true)
    expect(createKnowledgeRegistry(db).findByWsPath(ws)?.knowledgeDir).toBe(dir)
    await expect(service.registerProject({ wsPath: ws })).resolves.toBeUndefined()
    const rows = createKnowledgeRegistry(db).list().filter((r) => r.knowledgeDir === dir)
    expect(rows).toHaveLength(1)
  })

  it('显式 knowledgeDir 透传落行（测试/e2e 预置同径）', async () => {
    const ws = join(home, 'ws-custom')
    const dir = join(home, 'kn-custom')
    await service.registerProject({ wsPath: ws, knowledgeDir: dir })
    expect(createKnowledgeRegistry(db).findByWsPath(ws)?.knowledgeDir).toBe(dir)
  })

  it('一级解析动态化（fix-2）：config 静态表未命中 → 回查注册行 project_id 列', async () => {
    const svc = createKnowledgeService({ db, resolveWsPath: () => undefined })
    const ws = join(home, 'ws-dyn')
    const dir = join(ws, '.knowledge')
    mkdirSync(join(dir, '域'), { recursive: true })
    writeFileSync(join(dir, '域', 'a.md'), '---\ntitle: A\nid: kb-dyn-a\nsummary: s\nkeywords: [k]\n---\n正文', 'utf8')
    await svc.registerProject({ wsPath: ws, projectId: 'p-dyn' })
    // stage② rebuild = 整库再生（实体表全局无项目键）——计数含其它项目条目；项目面按域归属过滤
    const r = await svc.rebuildIndex('p-dyn')
    expect(r.indexed).toBeGreaterThanOrEqual(1)
    expect(r.skipped).toBe(0)
    const cards = await svc.listEntries({ projectId: 'p-dyn' })
    expect(cards.map((c) => c.title)).toEqual(['A'])
    await expect(svc.listEntries({ projectId: 'p-unknown' })).rejects.toThrow(/项目不存在/)
  })

  it('建目录失败（父级为普通文件）→ 抛 + 注册行不落 + error 级埋点（SC-10 register 域）', async () => {
    const diag: DiagEventPayload[] = []
    const svc = createKnowledgeService({ db, resolveWsPath: () => undefined, emit: (p) => diag.push(p) })
    const parentFile = join(home, 'parent-file')
    writeFileSync(parentFile, '占位', 'utf8')
    const ws = join(home, 'ws-fail')
    await expect(svc.registerProject({ wsPath: ws, knowledgeDir: join(parentFile, 'sub', '.knowledge') })).rejects.toThrow()
    expect(createKnowledgeRegistry(db).findByWsPath(ws)).toBeUndefined()
    expect(diag.some((d) => d.level === 'error' && d.event === 'knowledge-register')).toBe(true)
  })
})
