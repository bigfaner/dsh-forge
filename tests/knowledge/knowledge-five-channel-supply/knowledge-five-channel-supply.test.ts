// @feature:knowledge
// Journey: knowledge-five-channel-supply（五通道供数切换后浏览零变化）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage1-foundation/testing/contracts/knowledge-five-channel-supply/contract.md
//   （CT-five-channel-1..5 ← journey J2-1..J2-4；SC-8/SC-2）。
// Golden 基准复用：1.3 迁移前录制 fixture（e2e/support/knowledge-golden/fixtures/<channel>.json
// × 5——录制源 core 现役供数，本任务不重复录制）；通道分发/语料复用 harness.ts（镜像
// knowledge-rpc.ts 注册行 1:1）。断言锚定行为语义（DTO 字段/键集/序/null 语义），不锁实现路径。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KNOWLEDGE_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { openKnowledgeDatabase, createKnowledgeRegistry } from '../../../packages/plugins/knowledge/src/storage/index.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/index.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/service/index.js'
import { createWsPathResolver } from '../../../packages/plugins/knowledge/src/tools/session.js'
import { GOLDEN_CORPUS, GOLDEN_SESSION_ID, invokeGoldenChannel } from '../../../e2e/support/knowledge-golden/harness.js'
import type { GoldenChannelRequest } from '../../../e2e/support/knowledge-golden/harness.js'
import { assertSameStructure, loadGoldenFixture } from '../../../e2e/support/knowledge-golden/compare.js'

const FIXTURES_DIR = join(import.meta.dirname, '..', '..', '..', 'e2e', 'support', 'knowledge-golden', 'fixtures')

/** 双项目装配（CT-five-channel-3 串库对照：A = golden 语料项目；B = 他项目独立语料——
 *  stage② v4 全局 slug id：B 语料用独立 id，不复用 A 的 golden 条目 id） */
function buildProject(
  home: string,
  wsName: string,
  projectId: string,
  entries: readonly { relPath: string; frontmatter: string; body?: string }[],
): { wsDir: string; knowledgeDir: string; projectId: string } {
  const wsDir = join(home, wsName)
  const knowledgeDir = join(wsDir, 'knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  for (const entry of entries) {
    const abs = join(knowledgeDir, ...entry.relPath.split('/'))
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, `---\n${entry.frontmatter}\n---\n${entry.body ?? '正文'}`, 'utf8')
  }
  return { wsDir, knowledgeDir, projectId }
}

/** B 项目独立语料（id 与 golden 语料互斥——v4 全局 id 语义下的不串库对照） */
const CORPUS_B: readonly { relPath: string; frontmatter: string }[] = [
  {
    relPath: '后端/API规范.md',
    frontmatter: 'title: API 规范\nid: kb-other-api\nstatus: confirmed\nsummary: 他项目接口规范\nkeywords: [api, backend]\nupdated: "2026-03-01T00:00:00.000Z"',
  },
  {
    relPath: '后端/网关.md',
    frontmatter: 'id: kb-other-gateway\nsummary: 他项目网关路由\nkeywords: [api, backend]\nupdated: "2026-03-05T00:00:00.000Z"',
  },
]

let home: string
let dbFile: string
let db: ReturnType<typeof openKnowledgeDatabase>
let service: BrowseKnowledgeService
let projectIdA: string
let projectIdB: string

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-j5ch-'))
  dbFile = join(home, 'knowledge.db')
  const a = buildProject(home, 'ws-a', 'p-golden-a', GOLDEN_CORPUS)
  const b = buildProject(home, 'ws-b', 'p-other-b', CORPUS_B)
  projectIdA = a.projectId
  projectIdB = b.projectId
  db = openKnowledgeDatabase(dbFile)
  const registry = createKnowledgeRegistry(db)
  registry.upsert(a.wsDir, a.knowledgeDir)
  registry.upsert(b.wsDir, b.knowledgeDir)
  service = createKnowledgeService({
    db,
    resolveWsPath: createWsPathResolver([
      { wsPath: a.wsDir, projectId: a.projectId },
      { wsPath: b.wsDir, projectId: b.projectId },
    ]),
  })
})

afterAll(() => {
  db.close() // 服务句柄持库——先关再清（Windows 下打开句柄阻塞删除）
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

/** entryId 经 title 确定性解析（harness 同法——不锁 rowid 分配实现；v4 主键 = slug id，浏览面 entryId = rowid） */
function entryIdOf(title: string): number {
  const probe = openKnowledgeDatabase(dbFile)
  const row = probe
    .prepare(`SELECT rowid AS rid FROM knowledge_entries WHERE title = ? ORDER BY rid LIMIT 1`)
    .get(title) as { rid: number } | undefined
  probe.close()
  if (row === undefined) throw new Error(`条目不在索引：${title}`)
  return row.rid
}

describe('CT-five-channel-1（J2-1：同一 fixture 五通道 golden 零变化）', () => {
  it('success：五通道逐通道结构等价（类型/键集/数组序/null 语义零漂移）+ 确定性字段逐值等价', async () => {
    // 召回场景落账（与 fixture 录制 harness 同序——heat/sessionRecall 数据面）
    await service.rebuildIndex(projectIdA)
    void service.search({ projectId: projectIdA, domainPrefix: '前端', sessionId: GOLDEN_SESSION_ID })
    void service.readAbstract({ projectId: projectIdA, entryId: entryIdOf('框架选型'), sessionId: GOLDEN_SESSION_ID })
    void service.search({ projectId: projectIdA, keywords: ['不存在的词'], sessionId: GOLDEN_SESSION_ID })
    void service.search({ projectId: projectIdA, text: 'api', sessionId: GOLDEN_SESSION_ID })

    const requests: Record<string, GoldenChannelRequest> = {
      [KNOWLEDGE_CHANNELS.browse]: { projectId: projectIdA },
      [KNOWLEDGE_CHANNELS.listEntries]: { projectId: projectIdA, domainPrefix: '后端' },
      [KNOWLEDGE_CHANNELS.entryDetail]: { projectId: projectIdA, entryId: entryIdOf('框架选型') },
      [KNOWLEDGE_CHANNELS.heat]: { projectId: projectIdA },
      [KNOWLEDGE_CHANNELS.sessionRecall]: { projectId: projectIdA, sessionId: GOLDEN_SESSION_ID },
    }
    for (const channel of Object.values(KNOWLEDGE_CHANNELS)) {
      const fixture = loadGoldenFixture(FIXTURES_DIR, channel)
      const raw = await invokeGoldenChannel(channel, service, requests[channel]!)
      // heat 通道：Map → 排序键值对数组（IPC 结构化克隆保真面，与 fixture 录制形制对齐）
      const response = channel === KNOWLEDGE_CHANNELS.heat
        ? [...(raw as Map<number, number>).entries()].sort((x, y) => x[0] - y[0])
        : raw
      // 结构等价（golden 之外只验语义不锁实现路径）：任一字段类型/键集漂移即红并指认通道
      expect(() => assertSameStructure(fixture.response, response), `${channel} 结构比对`).not.toThrow()
    }

    // 确定性字段逐值等价（fail：任一字段漂移即红并指认通道与字段）
    const browse = await service.browse({ projectId: projectIdA })
    const browseGolden = loadGoldenFixture(FIXTURES_DIR, KNOWLEDGE_CHANNELS.browse)
      .response as { label: string; entryCount: number }[]
    expect(browse.map((n) => [n.label, n.entryCount])).toEqual(
      browseGolden.map((n: { label: string; entryCount: number }) => [n.label, n.entryCount]),
    )
    const detail = await service.getEntryDetail({ projectId: projectIdA, entryId: entryIdOf('API 规范') })
    expect([detail.title, detail.summary, detail.status, detail.authors, detail.body, detail.domainPath]).toEqual([
      'API 规范', '接口设计规范', 'unconfirmed', '平台组', '正文-接口细则', '后端',
    ])
    const heat = await service.heatByEntry(projectIdA)
    expect(heat.size).toBeGreaterThan(0)
    for (const v of heat.values()) expect(Number.isInteger(v)).toBe(true) // IPC 结构化克隆保真（整数计数）
    const recall = await service.sessionRecall({ projectId: projectIdA, sessionId: GOLDEN_SESSION_ID })
    expect(recall.map((g) => [g.verb, g.hitCount])).toContainEqual(['search', 2]) // 前端域检索两命中
    expect(recall.every((g) => g.createdAt === new Date(g.createdAt).toISOString())).toBe(true) // ISO-8601
  })
})

describe('CT-five-channel-2（J2-2：插件缺席 → 通道不挂、缺席语义可判定）', () => {
  it('success-缺席：projectId 未命中绑定/注册行 → 五通道面 fail-loud 可判定错误（非裸 undefined/崩溃）', async () => {
    // 插件缺席时 host 侧通道整体不注册（main.ts 在场判定键 knowledge——缺席 = 通道不挂，
    // host 侧零崩溃面已由 apps/host knowledge-rpc 在场/缺席双态测试钉住）；vitest 旅程面
    // 断言消费点语义：未注册项目 → 统一可判定错误（「项目不存在」——错误即缺席信号）
    for (const channel of Object.values(KNOWLEDGE_CHANNELS)) {
      const req = { projectId: 'p-not-registered', entryId: 1, sessionId: 's' }
      const call = invokeGoldenChannel(channel, service, req as GoldenChannelRequest)
      await expect(call, channel).rejects.toThrow(/项目不存在/) // 每通道缺席语义一致可判定
    }
  })
})

describe('CT-five-channel-3（J2-3：两级解析命中/未命中——不串项目库）', () => {
  it('success-命中 + 不串库：A 项目命中结果全部属于 A 语料；B 项目独立（条目集互斥）', async () => {
    await service.rebuildIndex(projectIdB)
    const a = await service.listEntries({ projectId: projectIdA })
    const b = await service.listEntries({ projectId: projectIdB })
    expect(a).toHaveLength(6) // golden corpus 全集
    expect(b).toHaveLength(2) // B 独立语料
    // 不串库：B 命中条目 entryId 与 A 完全互斥（两库独立索引行），且 B 标题集 ⊆ B 语料
    const aIds = new Set(a.map((c) => c.entryId))
    for (const c of b) {
      expect(aIds.has(c.entryId)).toBe(false) // 命中条目不混入他项目（不串库）
      expect(['API 规范', '网关']).toContain(c.title)
    }
    const recallA = await service.sessionRecall({ projectId: projectIdA, sessionId: GOLDEN_SESSION_ID })
    for (const g of recallA) for (const h of g.hits) expect(h.heat).toBeGreaterThanOrEqual(0)
  })

  it('boundary-未命中：注册行不含当前 wsPath → 可判定缺失，不挂、不误连他项目库', async () => {
    const unknownDb = openKnowledgeDatabase(dbFile)
    const unknown = createKnowledgeService({
      db: unknownDb,
      resolveWsPath: () => undefined, // config 未注入该映射（两级解析第一级未命中）
    })
    // 未命中 = 可判定错误语义，绝不回落到 A/B 任一项目库（不返回他项目条目）
    await expect(unknown.listEntries({ projectId: 'p-unmapped' })).rejects.toThrow(/项目不存在/)
    await expect(unknown.browse({ projectId: 'p-unmapped' })).rejects.toThrow(/项目不存在/)
    unknownDb.close()
  })
})

describe('CT-five-channel-4（J2-4：expert-squad 装卸行为独立——SC-2 伴生）', () => {
  it('success：knowledge 供数零 expert-squad 依赖（结构独立 ⇒ 行为独立，vitest 面机械锚）', () => {
    // 依赖面机械锚：knowledge 包零 expert-squad（与零 core）依赖——装卸 expert-squad 不可能
    // 改变五通道行为（供数路径上不存在 expert-squad 代码面）
    const pkg = JSON.parse(readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'packages', 'plugins', 'knowledge', 'package.json'),
      'utf8',
    )) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
    const deps = { ...pkg.dependencies, ...pkg.peerDependencies }
    expect(deps['@dsh-forge/core']).toBeUndefined() // SC-2：零 core
    expect(deps['@dsh-forge/expert-squad']).toBeUndefined() // SC-2 伴生：零 expert-squad
    // 行为等价面：包内 boundaries.test.ts 三面断言承接（零 import 结构钉死）
    const boundaries = readFileSync(
      join(import.meta.dirname, '..', '..', '..', 'packages', 'plugins', 'knowledge', 'src', 'boundaries.test.ts'),
      'utf8',
    )
    expect(boundaries).toMatch(/expert-squad/)
  })
})

// CT-five-channel-5（J2-4b：D9 走查四步实机形态一致——亮/暗双主题 R1/R2/R7 截图对照）
// 真机限定面：需 Electron 宿主 + 实机渲染截图对照，归 Playwright test-run 收口任务
// （pnpm test:e2e -- e2e/specs/p1mvp/knowledge-browsing.spec.ts 等）；走查取证截图归档
// proposals/<slug>/walkthrough/（不进 git）。vitest 层无实机渲染面，skip 留痕。
describe('CT-five-channel-5（J2-4b：D9 走查四步实机形态一致）', () => {
  it.skip('亮/暗双主题浏览路径实机形态与走查基线一致（环境前提：真机 Electron + Playwright，归 test-run 收口）', () => {
    expect(true).toBe(true)
  })
})
