// @feature:knowledge
// Journey: knowledge-five-channel-supply（五通道供数切换后浏览零变化）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage1-foundation/testing/contracts/knowledge-five-channel-supply/contract.md
//   （CT-five-channel-1..5 ← journey J2-1..J2-4；SC-8/SC-2）；
//   stage④ golden overlay：.forge/docs/proposals/knowledge-stage4-recall-scope/testing/
//   recall-card-turn-summary/contracts/recall-record-channel.md（§1 S1–S12）+
//   recall-feedback-loop/contracts/feedback-channel.md（§1 S1–S5）。
// Golden 基准：1.3 迁移前录制 fixture（e2e/support/knowledge-golden/fixtures/<channel>.json——
// browse/entryDetail/heat 三通道形状 stage④ 零变化，沿 legacy 录制）+ stage④ overlay
// （fixtures/stage4/listEntries.json + sessionRecall.json + recallFeedback.json——任务 1.2
// 契约先行固化，脚本任务 1.9 实现落地后录制复核锚值回填）；通道分发/语料复用 harness.ts
// （镜像 knowledge-rpc.ts 注册行 1:1）。断言锚定行为语义（DTO 字段/键集/序/null 语义），不锁实现路径。
// stage④ 词面改写：召回场景落账查询词面统一 text（keywords 调用参数退役——tools/search.ts 键级契约）。
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
const STAGE4_FIXTURES_DIR = join(FIXTURES_DIR, 'stage4')

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
  // B 项目注册移入 CT-five-channel-3（SC-1 全域检索并集 = registry 全行枚举——B 行在库会
  // 使 CT-1 的 search 命中集翻倍，golden 对照面须单注册域供数）
  const registry = createKnowledgeRegistry(db)
  registry.upsert(a.wsDir, a.knowledgeDir)
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

/** 召回场景落账（stage④ 词面/身份面：text 词面 + slug 键 read/readAbstract + browseEntries 页内锚） */
async function seedRecallScenario(): Promise<void> {
  await service.rebuildIndex(projectIdA)
  // 弃域重试（domain_prefix 零命中 → 全域重试两命中）
  void service.search({ projectId: projectIdA, domainPrefix: '前端', text: 'api', sessionId: GOLDEN_SESSION_ID })
  void service.readAbstract({ projectId: projectIdA, id: 'kb-fe-001', sessionId: GOLDEN_SESSION_ID })
  // 零命中哨兵（hit_count=0 诚实落账）
  void service.search({ projectId: projectIdA, text: '不存在的词', sessionId: GOLDEN_SESSION_ID })
  void service.search({ projectId: projectIdA, text: 'api', sessionId: GOLDEN_SESSION_ID })
  // browse 入账不计热（domain/offset/limit/order 落 query_json 快照键）
  void service.browseEntries({ projectId: projectIdA, domain: '后端', offset: 0, limit: 20, order: 'status', sessionId: GOLDEN_SESSION_ID })
  // read 全文快照（content_snap 不截断；read=1.0 计热）
  void service.read({ projectId: projectIdA, id: 'kb-fe-001', sessionId: GOLDEN_SESSION_ID })
  // v7 热度终式对齐（判例 293aecba/44bd7579 夹具同步）：heat 通道形状由采纳事件
  //（verb='read'，score 1.0）直插承载——与 golden-plugin 对照面同构（heat Map 仅载正热条目）。
  const insertRead = db.prepare(
    `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, title_snap, hit_count, score, created_at)
     VALUES (?, ?, 'golden-heat-seed', 'read', ?, ?, 1, 1.0, '2026-01-01T00:00:00Z')`,
  )
  for (const [title, count] of [['框架选型', 1], ['样式令牌', 2], ['API 规范', 1], ['网关', 1]] as const) {
    const rowid = entryIdOf(title)
    for (let i = 0; i < count; i += 1) insertRead.run(projectIdA, `golden-read-${title}-${i}`, rowid, title)
  }
}

/** read 调用行 rowid（confirmed 条目——recallFeedback 对照的合法作用行） */
function feedbackTargetRowId(): number {
  const row = db
    .prepare(
      `SELECT rowid AS rid FROM knowledge_recall_logs WHERE project_id = ? AND session_id = ? AND verb = 'read' ORDER BY rowid LIMIT 1`,
    )
    .get(projectIdA, GOLDEN_SESSION_ID) as { rid: number } | undefined
  if (row === undefined) throw new Error('read 调用行未落账')
  return row.rid
}

describe('CT-five-channel-1（J2-1：同一 fixture 通道 golden 零变化）', () => {
  it('success：逐通道结构等价（类型/键集/数组序/null 语义零漂移）+ 确定性字段逐值等价', async () => {
    await seedRecallScenario()

    // 通道对照面：legacy fixture（browse/entryDetail/heat——stage④ 形状零变化）
    // + stage④ overlay（listEntries/sessionRecall/recallFeedback——契约正本 J1/J2/J3 §1）。
    // recallFeedback 对照请求 = read 调用行（confirmed 条目）行级 👍 成功回执（J3 §1 S3）。
    const requests: Record<string, GoldenChannelRequest> = {
      [KNOWLEDGE_CHANNELS.browse]: { projectId: projectIdA },
      [KNOWLEDGE_CHANNELS.listEntries]: { projectId: projectIdA, domainPrefix: '后端' },
      [KNOWLEDGE_CHANNELS.entryDetail]: { projectId: projectIdA, entryId: entryIdOf('框架选型') },
      [KNOWLEDGE_CHANNELS.heat]: { projectId: projectIdA },
      [KNOWLEDGE_CHANNELS.sessionRecall]: { projectId: projectIdA, sessionId: GOLDEN_SESSION_ID },
      [KNOWLEDGE_CHANNELS.recallFeedback]: { projectId: projectIdA, action: 'row', rowId: feedbackTargetRowId(), feedback: 1 },
    }
    const fixtureOf = (channel: string): ReturnType<typeof loadGoldenFixture> =>
      channel === KNOWLEDGE_CHANNELS.listEntries ||
      channel === KNOWLEDGE_CHANNELS.sessionRecall ||
      channel === KNOWLEDGE_CHANNELS.recallFeedback
        ? loadGoldenFixture(STAGE4_FIXTURES_DIR, channel)
        : loadGoldenFixture(FIXTURES_DIR, channel)
    for (const channel of [
      KNOWLEDGE_CHANNELS.browse,
      KNOWLEDGE_CHANNELS.listEntries,
      KNOWLEDGE_CHANNELS.entryDetail,
      KNOWLEDGE_CHANNELS.heat,
      KNOWLEDGE_CHANNELS.sessionRecall,
      KNOWLEDGE_CHANNELS.recallFeedback,
    ]) {
      const fixture = fixtureOf(channel)
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
    expect(recall.map((g) => [g.verb, g.hitCount])).toContainEqual(['search', 2]) // api 词面两命中（弃域重试径同值）
    expect(recall.every((g) => g.createdAt === new Date(g.createdAt).toISOString())).toBe(true) // ISO-8601
  })
})

describe('CT-five-channel-2（J2-2：插件缺席 → 通道不挂、缺席语义可判定）', () => {
  it('success-缺席：projectId 未命中绑定/注册行 → 各通道 fail-loud 可判定错误（非裸 undefined/崩溃）', async () => {
    // 插件缺席时 host 侧通道整体不注册（main.ts 在场判定键 knowledge——缺席 = 通道不挂，
    // host 侧零崩溃面已由 apps/host knowledge-rpc 在场/缺席双态测试钉住）；vitest 旅程面
    // 断言消费点语义：未注册项目 → 统一可判定错误（「项目不存在」——错误即缺席信号）。
    // stage④ 第七通道（recallFeedback）缺席语义 = 请求级拒绝回执（rejected-request 信封——
    // 沿 entryAction 先例：动作通道不抛，回执承载拒绝事实，J3 §1 S3）。
    for (const channel of Object.values(KNOWLEDGE_CHANNELS)) {
      const req = { projectId: 'p-not-registered', entryId: 1, rowId: 1, sessionId: 's' }
      if (channel === KNOWLEDGE_CHANNELS.recallFeedback) {
        await expect(invokeGoldenChannel(channel, service, req as GoldenChannelRequest), channel).resolves.toMatchObject({
          outcome: 'rejected-request',
        })
        continue
      }
      await expect(invokeGoldenChannel(channel, service, req as GoldenChannelRequest), channel).rejects.toThrow(/项目不存在/)
    }
  })
})

describe('CT-five-channel-3（J2-3：两级解析命中/未命中——不串项目库）', () => {
  it('success-命中 + 不串库：A 项目命中结果全部属于 A 语料；B 项目独立（条目集互斥）', async () => {
    createKnowledgeRegistry(db).upsert(
      join(home, 'ws-b'),
      join(home, 'ws-b', 'knowledge'),
      projectIdB,
    ) // B 注册行落库（本用例内——CT-1 golden 对照面单注册域）
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
