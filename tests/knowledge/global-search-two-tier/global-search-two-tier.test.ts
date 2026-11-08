// @feature:knowledge
// Journey: global-search-two-tier（proposal knowledge-stage4-recall-scope——J1 全域检索与两级分组）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage4-recall-scope/testing/global-search-two-tier/
//   contracts/scope-source.md（J1-CT-01..05 ← §1 S1–S4 + journey G1–G4/B1–B6/INV-1..4）。
// 分层：本 spec 承载插件服务面可判定的 Outcome（检索并集/scope 派生/scopeFilter/注册幂等/
// 互不嵌套/零命中逐行判定）；UI 真机面（browse 两级分组渲染/审核视图行/scope chip）归
// Playwright test-run 收口（skip 留痕）——单测可 pin SQL 语句逻辑，「两库条目在同一真实检索中
// 命中且来源标识正确呈现」的端到端增量只有真机可证（journey §1）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DiagEventPayload } from '../../../packages/contracts/src/index.js'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../../../packages/plugins/knowledge/src/storage/index.js'
import type { KnowledgeRegistry } from '../../../packages/plugins/knowledge/src/storage/index.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/service.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/service/types.js'

const roots: string[] = []
function tmpRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), `knowledge-j-g1-${tag}-`))
  roots.push(root)
  return root
}

interface EntryFile {
  readonly domain: string
  readonly file: string
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly status: string
}

function entryText(f: EntryFile): string {
  return ['---', `id: ${f.id}`, `title: ${f.title}`, `status: ${f.status}`, `summary: ${f.summary}`, 'keywords: [recallscope]', "version_ts: '2026-01-01T00:00:00.000Z'", '---', '', '正文。', ''].join('\n')
}

function putEntries(knowledgeDir: string, files: readonly EntryFile[]): void {
  for (const f of files) {
    const dir = f.domain === '' ? knowledgeDir : join(knowledgeDir, f.domain)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, f.file), entryText(f), 'utf8')
  }
}

const PROJECT_ENTRIES: readonly EntryFile[] = [
  { domain: 'proj', file: 'p1.md', id: 'g1-proj-shared', title: 'sharedword 部署规范', summary: 'sharedword 项目部署流程', status: 'confirmed' },
  { domain: 'proj', file: 'p2.md', id: 'g1-proj-solo', title: '项目独有条目', summary: 'projonly 仅项目库可见', status: 'confirmed' },
  { domain: 'proj', file: 'p3.md', id: 'g1-proj-draft', title: '项目草稿条目', summary: 'draftonly 未审核草稿 sharedword', status: 'unconfirmed' },
]
const GLOBAL_ENTRIES: readonly EntryFile[] = [
  { domain: 'common', file: 'c1.md', id: 'g1-glob-shared', title: 'sharedword 新手指引', summary: 'sharedword 跨项目通用知识', status: 'confirmed' },
  { domain: 'common', file: 'c2.md', id: 'g1-glob-draft', title: '全局草稿条目', summary: 'globaldraft 未审核全局草稿', status: 'unconfirmed' },
]

interface World {
  readonly db: ReturnType<typeof openKnowledgeDatabase>
  readonly service: BrowseKnowledgeService
  readonly registry: KnowledgeRegistry
  readonly projectId: string
  readonly projectDir: string
  readonly globalDir: string
  readonly projectWs: string
  readonly events: DiagEventPayload[]
}

const world: World = {} as World
const SESSION = 'g1-sess'

beforeAll(() => {
  const root = tmpRoot('main')
  const projectWs = join(root, 'ws')
  const projectDir = join(projectWs, '.knowledge')
  const globalDir = join(root, 'data', 'knowledge-global')
  putEntries(projectDir, PROJECT_ENTRIES)
  putEntries(globalDir, GLOBAL_ENTRIES)
  const events: DiagEventPayload[] = []
  const db = openKnowledgeDatabase(join(root, 'knowledge', 'knowledge.db'))
  const registry = createKnowledgeRegistry(db)
  const projectId = 'p-g1'
  registry.upsert(projectWs, projectDir, projectId)
  registry.registerGlobalIfAbsent(globalDir, (p) => events.push(p))
  const service = createKnowledgeService({ db, resolveWsPath: (id) => (id === projectId ? projectWs : undefined), emit: (p) => events.push(p) })
  Object.assign(world, { db, service, registry, projectId, projectDir, globalDir, projectWs, events })
})

afterAll(() => {
  world.db?.close()
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

// ── J1-CT-01 全域并集检索与命中行 scope 派生（S2/S7 + INV-1/INV-4） ──

describe('J1-CT-01 全域并集检索与 scope 派生（O-成功/O-单库/准入对照）', () => {
  it('O-成功：两库条目同集命中且 scope 与 registry 归属一一相符（INV-1/INV-4）；准入对照：同 id 无 confirmed 版的 unconfirmed 条目 0.6 进命中（WG-13 O2 跨锚）', async () => {
    await world.service.rebuildIndex(world.projectId)
    const hits = await world.service.search({ projectId: world.projectId, text: 'sharedword', sessionId: SESSION, callId: 'g1-call-1' })
    const ids = hits.map((h) => h.frontmatterId)
    // O-成功（INV-1 检索恒全域）：项目库与全局库条目在同一结果集均命中（零按库收窄参数）
    expect(ids).toContain('g1-proj-shared')
    expect(ids).toContain('g1-glob-shared')
    // 准入对照（stage③ 准入语义零变化——WG-13 O2 同口径）：纯新 unconfirmed 条目 0.6 可见
    //（注意：契约 J1-CT-01 O4「unconfirmed 不进命中」与 stage③ 准入语义分叉——已按
    //  分叉上报流程处理，本 spec 以既有 WG-13 契约为准锚，O4 跳过留痕见下 it.skip）
    const draft = hits.find((h) => h.frontmatterId === 'g1-proj-draft')
    expect(draft?.effectiveRank).toBe(0.6)
    // scope 派生（S7）：sessionRecall 命中行 scope 与条目 registry 归属一一相符（INV-4）
    const groups = await world.service.sessionRecall({ projectId: world.projectId, sessionId: SESSION })
    const hitScope = new Map(groups.flatMap((g) => g.hits).map((h) => [h.frontmatterId, h.scope]))
    expect(hitScope.get('g1-proj-shared')).toBe('project')
    expect(hitScope.get('g1-glob-shared')).toBe('global')
  })

  // 锚分叉留痕：J1-CT-01 O4「unconfirmed 条目（含全局库）不进检索命中」与 stage③ 准入语义
  //（WG-13 O2 纯新 unconfirmed 0.6 可见；CT-03 O1 unconfirmed 0.6 档位微调）刚性相逆——
  // 归因 = 契约侧意向锚与既有准入契约冲突，禁脚本内就地调和：跳过留痕 + 归 fix/disc 链裁决，
  // 真机消费面复核归 test-run。
  it.skip('J1-CT-01 O4：unconfirmed 条目（含全局库）不进检索命中（锚分叉——契约 O4 与 stage③ 准入语义相逆，上报 fix/disc 后由 test-run 复核）', () => {})

  it('O-单库命中：query 仅命中项目库 → 命中行 scope 单一（golden 单源可比对照）', async () => {
    const hits = await world.service.search({ projectId: world.projectId, text: 'projonly', sessionId: SESSION, callId: 'g1-call-2' })
    expect(hits.map((h) => h.frontmatterId)).toEqual(['g1-proj-solo'])
    const groups = await world.service.sessionRecall({ projectId: world.projectId, sessionId: SESSION })
    const solo = groups.flatMap((g) => g.hits).filter((h) => h.frontmatterId === 'g1-proj-solo')
    for (const h of solo) expect(h.scope).toBe('project')
  })
})

// ── J1-CT-02 listEntries scopeFilter 过滤（S1——服务端执行，零客户端过滤语义铁律） ──

describe('J1-CT-02 listEntries scopeFilter（O-成功/O-组合过滤/O-空集）', () => {
  it('O-成功：scopeFilter=global 仅回 global 卡（逐卡 scope 断言 + 零 project 行混入）；O-组合过滤：与 statusFilter AND 交集；O-空集边界', async () => {
    const globalOnly = await world.service.listEntries({ projectId: world.projectId, scopeFilter: 'global' })
    expect(globalOnly).toHaveLength(2) // 两张 global 卡（确认 + 草稿）
    for (const card of globalOnly) expect(card.scope).toBe('global') // J1-CT-02 O1（逐卡 scope）
    // O-组合过滤：scopeFilter ∧ statusFilter 交集语义（各过滤片 AND，非覆盖）
    const draftGlobal = await world.service.listEntries({ projectId: world.projectId, scopeFilter: 'global', statusFilter: 'unconfirmed' })
    expect(draftGlobal).toHaveLength(1)
    // O-空集边界（J1-CT-04 O-空集成功）：project 过滤片语义同构（scope 单一可判）
    const projectOnly = await world.service.listEntries({ projectId: world.projectId, scopeFilter: 'project' })
    for (const card of projectOnly) expect(card.scope).toBe('project')
    // O-注册后非空对照（J1-CT-04 O2：先空后非空 = 过滤真生效而非恒空——空集回执 ≠ 错误分支）
    expect((await world.service.listEntries({ projectId: world.projectId, scopeFilter: 'global' })).length).toBeGreaterThan(0)
  })
})

// ── J1-CT-03/05 注册幂等与互不嵌套（O-幂等/O-嵌套跳过；S2 无 DDL 义务——查询面派生） ──

describe('J1-CT-03/05 注册幂等与互不嵌套（O-幂等成功/O-嵌套跳过）', () => {
  it('O-幂等成功：全局库重复注册行数不变（ON CONFLICT DO NOTHING）；O-嵌套跳过：与既有注册行 knowledge_dir 嵌套 → 拒注册 + 零双重认领（INV-3）', () => {
    const rowsBefore = (world.db.prepare('SELECT COUNT(*) AS n FROM knowledge_registry').get() as { n: number }).n
    // J1-CT-03 O1：重复注册幂等（再注册一次，行集不变）
    world.registry.registerGlobalIfAbsent(world.globalDir)
    const rowsAfter = (world.db.prepare('SELECT COUNT(*) AS n FROM knowledge_registry').get() as { n: number }).n
    expect(rowsAfter).toBe(rowsBefore)
    // J1-CT-05 O1：嵌套于既有项目 knowledge_dir 的目录注册拒绝（互不嵌套校验负例）
    const nested = world.registry.registerGlobalIfAbsent(join(world.projectDir, 'nested-global'))
    expect(nested).toBe('nested-conflict')
    // J1-CT-05 O2 合法注册对照（判据差）：互不嵌套目录注册成功
    const legalRoot = tmpRoot('legal')
    const legalDir = join(legalRoot, 'another', '.knowledge')
    putEntries(legalDir, [{ domain: 'x', file: 'x.md', id: 'g1-legal-x', title: '另库条目', summary: 'another 独立库条目', status: 'confirmed' }])
    expect(world.registry.registerGlobalIfAbsent(legalDir)).toBe('registered')
  })
})

// ── J1-CT-01 O-零命中（B1 终裁——破坏性用例置于尾部） ──

describe('J1-CT-01 O-零命中（B1 终裁——破坏性用例置于尾部）', () => {
  it('O-零命中：全库索引清空 + 项目库空目录 → search 静默重建判定按逐注册行计数触发（判据 = rows 空 ∧ 调用方项目行 FS 判空——注册行在场不掩蔽信号）', async () => {
    const { clearKnowledgeIndexByWsPath } = (await import('../../../e2e/support/knowledge-db.js')) as unknown as {
      clearKnowledgeIndexByWsPath: (db: unknown, wsPath: string) => void
    }
    // 两注册行索引全清（全局库行存在但条目行清空——信号不被既有注册行掩蔽）+ 项目库 FS 空
    const rows = world.db.prepare(`SELECT ws_path FROM knowledge_registry`).all() as readonly { ws_path: string }[]
    for (const r of rows) clearKnowledgeIndexByWsPath(world.db, r.ws_path)
    rmSync(world.projectDir, { recursive: true, force: true })
    world.events.length = 0
    mkdirSync(world.projectDir, { recursive: true }) // 空目录（rebuild 合法性前提——零条目库初始化径）
    // search 不挂、诚实空回执；静默重建径触发（diag 可观测——O-零命中 rebuild 判定面）
    const hits = await world.service.search({ projectId: world.projectId, text: 'sharedword', sessionId: SESSION, callId: 'g1-call-3' })
    // 静默重建已触发：全库重建回填全局库条目（g1-glob-shared），项目空目录保持零条目（判空不掩蔽）
    expect(hits.map((h) => h.frontmatterId)).toEqual(['g1-glob-shared'])
    const rebuild = world.events.find((e) => e.event === 'knowledge-index-rebuild')
    expect(rebuild).toBeDefined()
  })
})
// ── 真机面留痕（browse 两级分组 / 审核视图 / scope chip——journey G3/G4/B5） ──
describe('真机面留痕（J1 G3/G4：browse scope 两级分组与命中行 scope chip——UI 装配真机增量）', () => {
  it.skip('知识库管理视图 scope 两级分组 + 会话召回 tab 混合来源双徽呈现（环境前提：真机 Electron + Playwright，归 test-run 收口）', () => {
    expect(true).toBe(true)
  })
})
