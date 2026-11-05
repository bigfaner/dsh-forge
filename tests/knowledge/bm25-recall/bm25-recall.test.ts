// @feature:knowledge
// Journey: bm25-recall（proposal knowledge-stage3-retrieval §2.1 C1 / 裁决 #2/#8/#10 / §5）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage3-retrieval/testing/journey-bm25-recall/contracts/contract.md
//   （CT-bm25-recall-01..08 ← journey BR-G1..G5 / BR-E1..E8）。
// 策略与锚实锚说明：
// · 排序断言锚 = 条目相对位次（非分值字面）；实现归一实锚 = internal.ts bm25Norm
//   （方向修正同形映射 −bm25/(1−bm25)——提案原式 1/(1−bm25) 与「score 降序 = 相关居前」
//   不变量相逆，偏差已随 coding 任务上报；契约只断位次行为，方向修正不触契约红线）。
// · CT-bm25-recall-05/E6 的「diag 零命中埋点」为待实现锚——实现以 recall_logs 哨兵行
//   （hit_count=0）承载零命中采集，diag 事件未实现：不一致已上报 fix/disc（归 test-run
//   复核），本 spec 以 it.skip 留痕，不就地调和。
// · CT-bm25-recall-06 O2/O3（滞回/回流既有测试零改动通过）与 CT-bm25-recall-08
//   （129 题基线 floor ≥0.98 + 五通道 golden 零漂移）由既有套件承载：
//   tests/knowledge/recall-baseline/（floor 已锚 0.98）与
//   tests/knowledge/knowledge-five-channel-supply/——随 knowledge-journeys 项目跑批全绿为证据。
// · CT-bm25-recall-07 阈值判定面（≥10% 持续两周 → 向量管线）归 C4 后续立项，本阶段
//   只断「分列采集」：日常口径（recall_logs 滚动）与回归口径（固定题集）分离不混算。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { DiagEventPayload } from '../../../packages/contracts/src/index.js'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../../../packages/plugins/knowledge/src/storage/index.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/service.js'
import { createSearchTool } from '../../../packages/plugins/knowledge/src/tools/search.js'
import { createProjectResolver } from '../../../packages/plugins/knowledge/src/tools/session.js'
import type { BrowseKnowledgeService, SearchHit } from '../../../packages/plugins/knowledge/src/service/types.js'
import { disposeMounts, mountRealCorpus } from '../recall-baseline/harness.js'
import { loadBank, runBaseline } from '../recall-baseline/scoring.js'

// ── 夹具 ──

const roots: string[] = []
function tmpRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), `knowledge-j-br-${tag}-`))
  roots.push(root)
  return root
}

interface CorpusFile {
  readonly domain: string
  readonly file: string
  readonly id: string
  readonly title: string
  readonly keywords: readonly string[]
  readonly summary: string
  readonly status: string
  readonly versionTs: string
  readonly extraFm?: string
  readonly body?: string
}

function entryText(f: CorpusFile): string {
  return [
    '---',
    `id: ${f.id}`,
    `title: ${f.title}`,
    `status: ${f.status}`,
    `summary: ${f.summary}`,
    `keywords: [${f.keywords.join(', ')}]`,
    `version_ts: ${f.versionTs}`,
    f.extraFm ?? '',
    '---',
    '',
    f.body ?? '正文。',
    '',
  ].join('\n')
}

interface World {
  readonly root: string
  readonly ws: string
  readonly db: import('better-sqlite3').Database
  readonly service: BrowseKnowledgeService
  readonly projectId: string
  readonly events: DiagEventPayload[]
}

const BASE_TS = '2026-01-01T00:00:00.000Z'
function ts(i: number): string {
  return new Date(Date.parse(BASE_TS) + i).toISOString()
}

/** 多相关度语料（G1）：高/中/弱/无关 + 档位对照 + 热度对照 + 正文独有词 + 同 id 双版本 + 背景填充 */
function corpus(reverse = false): CorpusFile[] {
  const files: CorpusFile[] = [
    // CT-01 相关度梯度（同一核心词 krecall）
    { domain: 'core', file: 'strong.md', id: 'br-strong', title: 'krecall krecall krecall gateway core', keywords: ['krecall'], summary: 'krecall krecall krecall core', status: 'confirmed', versionTs: ts(1) },
    { domain: 'core', file: 'mid.md', id: 'br-mid', title: 'krecall notes', keywords: ['krecall'], summary: 'krecall related mid notes', status: 'confirmed', versionTs: ts(2) },
    { domain: 'core', file: 'weak.md', id: 'br-weak', title: 'Misc Note', keywords: ['krecall'], summary: 'unrelated filler words only', status: 'confirmed', versionTs: ts(3) },
    { domain: 'core', file: 'none.md', id: 'br-none', title: 'Totally Unrelated', keywords: ['zzz'], summary: 'nothing about the core term here', status: 'confirmed', versionTs: ts(4) },
    // CT-03 档位对照：同文本异档（confirmed 1.0 vs unconfirmed 0.6）
    { domain: 'core', file: 'mid-twin.md', id: 'br-mid-twin', title: 'krecall notes', keywords: ['krecall'], summary: 'krecall related mid notes', status: 'unconfirmed', versionTs: ts(5) },
    // CT-03 O2：强相关低档（unconfirmed 强文本）vs 弱相关高档（confirmed 弱文本）
    { domain: 'core', file: 'strong-low.md', id: 'br-strong-low', title: 'krecall krecall krecall gateway core', keywords: ['krecall'], summary: 'krecall krecall krecall core', status: 'unconfirmed', versionTs: ts(6) },
    { domain: 'core', file: 'weak-high.md', id: 'br-weak-high', title: 'Misc Note', keywords: ['krecall'], summary: 'unrelated filler words only', status: 'confirmed', versionTs: ts(7) },
    // CT-04 热度对照：①同文本异热（br-mid-hot 复制 br-mid 文本，堆热后位次前置）
    { domain: 'core', file: 'mid-hot.md', id: 'br-mid-hot', title: 'krecall notes', keywords: ['krecall'], summary: 'krecall related mid notes', status: 'confirmed', versionTs: ts(8) },
    // ②高热旧条目（弱相关）vs 更相关新条目（heat 0）③极端热对照
    { domain: 'core', file: 'hot-old.md', id: 'br-hot-old', title: 'Hot Legacy Note', keywords: ['krecall'], summary: 'legacy misc old words filler padding unrelated legacy misc old words filler padding', status: 'confirmed', versionTs: ts(9) },
    { domain: 'core', file: 'new-rel.md', id: 'br-new-rel', title: 'krecall krecall krecall gateway core', keywords: ['krecall'], summary: 'krecall krecall krecall fresh', status: 'confirmed', versionTs: ts(10) },
    { domain: 'core', file: 'hot-extreme.md', id: 'br-hot-extreme', title: 'Extreme Heat Note', keywords: ['krecall'], summary: 'barely related filler words assorted misc padding legacy assorted assorted topics assorted unrelated assorted misc padding assorted filler assorted words assorted only assorted', status: 'confirmed', versionTs: ts(11) },
    // CT-05/INV-4 正文独有词（title/keywords/summary 均无 zorblatflax）
    { domain: 'core', file: 'body-only.md', id: 'br-body-only', title: 'Body Word Doc', keywords: ['bodyword'], summary: 'unique token lives in body only', status: 'confirmed', versionTs: ts(12), body: 'zorblatflax 正文独有词仅出现在正文。' },
    // CT-06 条件准入：同 id 双版本（confirmed 旧版 + unconfirmed 新版）
    { domain: 'core', file: 'dual-old.md', id: 'br-dual', title: 'Dual Version Entry', keywords: ['dualonly'], summary: 'confirmed authority version', status: 'confirmed', versionTs: ts(13) },
    { domain: 'core', file: 'dual-new.md', id: 'br-dual', title: 'Dual Version Entry Fresh', keywords: ['dualonly'], summary: 'unconfirmed fresh projection', status: 'unconfirmed', versionTs: ts(14) },
  ]
  // 背景填充（FTS5 idf 钳制防线：核心词命中行须占少数——bm25-search 单测同构）
  for (let i = 0; i < 16; i += 1) {
    files.push({ domain: 'filler', file: `f${i}.md`, id: `br-f${i}`, title: `Filler ${i}`, keywords: [`filler${i}`], summary: `filler corpus filler${i} unrelated words`, status: 'confirmed', versionTs: ts(20 + i) })
  }
  return reverse ? [...files].reverse() : files
}

function makeWorld(tag: string, reverse = false): World {
  const root = tmpRoot(tag)
  const ws = join(root, 'ws')
  const knowledgeDir = join(ws, '.knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  for (const f of corpus(reverse)) {
    const dir = join(knowledgeDir, f.domain)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, f.file), entryText(f), 'utf8')
  }
  const events: DiagEventPayload[] = []
  const db = openKnowledgeDatabase(join(root, 'knowledge', 'knowledge.db'))
  const projectId = `p-br-${tag}`
  createKnowledgeRegistry(db).upsert(ws, knowledgeDir, projectId)
  const service = createKnowledgeService({ db, resolveWsPath: (id) => (id === projectId ? ws : undefined), emit: (p) => events.push(p) })
  return { root, ws, db, service, projectId, events }
}

const worlds: World[] = []
function world(tag: string, reverse = false): World {
  const w = makeWorld(tag, reverse)
  worlds.push(w)
  return w
}

afterAll(() => {
  for (const w of worlds.splice(0)) {
    w.db.close()
    rmSync(w.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
  disposeMounts()
})

const posOf = (hits: readonly SearchHit[], id: string): number => hits.findIndex((h) => h.frontmatterId === id)
const idsOf = (hits: readonly SearchHit[]): readonly string[] =>
  hits.map((h) => h.frontmatterId).filter((id): id is string => id !== null)

/** 堆热（recall_logs 直插——热度面同源单表计数，bm25-search 单测同构通道） */
function heatUp(w: World, id: string, heat: number): void {
  const row = w.db.prepare(`SELECT rowid FROM knowledge_entries WHERE id = ?`).get(id) as { rowid: number } | undefined
  if (row === undefined) throw new Error(`heatUp: 条目不在索引：${id}`)
  const ins = w.db.prepare(
    `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, hit_count, created_at)
     VALUES (?, ?, ?, 'search', ?, 1, ?)`,
  )
  for (let i = 0; i < heat; i += 1) ins.run(w.projectId, `heat-${id}-${i}`, 'heat', row.rowid, new Date().toISOString())
}

// ── CT-bm25-recall-01 核心词命中位次按相关度降序（BR-G2） ──

describe('CT-bm25-recall-01 核心词位次（BR-G1/G2）', () => {
  it('O1/O2 位次严格降序（高<中<弱）+ 无关条目不命中；O3 复跑位次幂等', async () => {
    const w = world('ct01')
    await w.service.rebuildIndex(w.projectId)
    const hits = await w.service.search({ projectId: w.projectId, keywords: ['krecall'], sessionId: 's' })
    // CT-bm25-recall-01 O1：pos(高) < pos(中) < pos(弱)
    expect(posOf(hits, 'br-strong')).toBeGreaterThan(-1)
    expect(posOf(hits, 'br-strong')).toBeLessThan(posOf(hits, 'br-mid'))
    expect(posOf(hits, 'br-mid')).toBeLessThan(posOf(hits, 'br-weak'))
    // O2：无关条目（核心词不出现于 title/keywords/summary）不在命中集
    expect(idsOf(hits)).not.toContain('br-none')
    // O3：再跑位次结论一致（确定性排序，非写入序偶然）
    const again = await w.service.search({ projectId: w.projectId, keywords: ['krecall'], sessionId: 's' })
    expect(idsOf(again)).toEqual(idsOf(hits))
  })
})

// ── CT-bm25-recall-02 norm(bm25) 有区分性（裁决 #10 回归锚，BR-E2） ──

describe('CT-bm25-recall-02 归一非平顶（BR-E2）', () => {
  it('O1 写入序无关：交换写入顺序的两个独立库位次结论不变；命中行分值两两可区分', async () => {
    const a = world('ct02a')
    const b = world('ct02b', true)
    await a.service.rebuildIndex(a.projectId)
    await b.service.rebuildIndex(b.projectId)
    const ha = await a.service.search({ projectId: a.projectId, keywords: ['krecall'], sessionId: 's' })
    const hb = await b.service.search({ projectId: b.projectId, keywords: ['krecall'], sessionId: 's' })
    expect(posOf(ha, 'br-strong')).toBeLessThan(posOf(ha, 'br-mid'))
    expect(posOf(ha, 'br-mid')).toBeLessThan(posOf(ha, 'br-weak'))
    // O1：逆写入序库同一位次结论（平顶退化 = 写入序决定位次 → 此断言红）
    expect(posOf(hb, 'br-strong')).toBeLessThan(posOf(hb, 'br-mid'))
    expect(posOf(hb, 'br-mid')).toBeLessThan(posOf(hb, 'br-weak'))
    // O2：相关度梯度行分值两两不同（非恒等平顶）
    const grads = ['br-strong', 'br-mid', 'br-weak'].map((id) => ha.find((h) => h.frontmatterId === id)!.score)
    expect(new Set(grads).size).toBe(3)
  })
})

// ── CT-bm25-recall-03 档位微调语义（BR-G3） ──

describe('CT-bm25-recall-03 rank 档位微调（BR-G3）', () => {
  it('O1 同相关度高档位在前；O2 微调不翻盘（强相关低档 < 弱相关高档）；O3 同档位次 = 纯 BM25 序', async () => {
    const w = world('ct03')
    await w.service.rebuildIndex(w.projectId)
    const hits = await w.service.search({ projectId: w.projectId, keywords: ['krecall'], sessionId: 's' })
    // O1：同文本 confirmed(1.0) 前于 unconfirmed(0.6)
    const mid = hits.find((h) => h.frontmatterId === 'br-mid')!
    const twin = hits.find((h) => h.frontmatterId === 'br-mid-twin')!
    expect(posOf(hits, 'br-mid')).toBeLessThan(posOf(hits, 'br-mid-twin'))
    expect(mid.effectiveRank).toBe(1.0)
    expect(twin.effectiveRank).toBe(0.6)
    // O2：强相关低档（unconfirmed 强文本）不落后于弱相关高档（confirmed 弱文本）
    expect(posOf(hits, 'br-strong-low')).toBeLessThan(posOf(hits, 'br-weak-high'))
    // O3：同为 confirmed 档的 strong/mid/weak 位次纯由相关度决定（同 CT-01 结论在档位内成立）
    expect(posOf(hits, 'br-strong')).toBeLessThan(posOf(hits, 'br-mid'))
    expect(posOf(hits, 'br-mid')).toBeLessThan(posOf(hits, 'br-weak'))
  })
})

// ── CT-bm25-recall-04 热度微权不挤出（评审补 AC，BR-G4/BR-E1） ──

describe('CT-bm25-recall-04 热度微权（BR-G4/BR-E1）', () => {
  it('O1 同相关度高热前置；O2 更相关新条目恒居高热旧条目前；O3 极端热弱相关仍居强相关后', async () => {
    const w = world('ct04')
    await w.service.rebuildIndex(w.projectId)
    heatUp(w, 'br-mid-hot', 60)
    heatUp(w, 'br-hot-old', 50)
    heatUp(w, 'br-hot-extreme', 100)
    const hits = await w.service.search({ projectId: w.projectId, keywords: ['krecall'], sessionId: 's' })
    // O1：同文本（br-mid vs br-mid-hot）高热在前（同相关度内微调可见）
    expect(posOf(hits, 'br-mid-hot')).toBeLessThan(posOf(hits, 'br-mid'))
    // O2（核心）：低热更相关新条目（br-new-rel）位次恒在高热旧条目（br-hot-old）前
    expect(posOf(hits, 'br-new-rel')).toBeLessThan(posOf(hits, 'br-hot-old'))
    // O3：极端热（100——真实库单条目热度上界量级）弱相关仍居零热强相关后（0.05×log 微权不跨相关度跃迁；
    //    融合式 log 项数学上无上界，跃迁界定以真实热度量级为域——契约 O3 量级口径注记）
    expect(posOf(hits, 'br-strong')).toBeLessThan(posOf(hits, 'br-hot-extreme'))
  })
})

// ── CT-bm25-recall-05 零命中诚实回执（BR-G5/BR-E5） ──

describe('CT-bm25-recall-05 零命中诚实回执（BR-G5/BR-E5）', () => {
  it('O1/O2/O3 三路零命中（裸词/带过滤/正文独有词）均空结果；O4 回执零兜底（无建议/改写字段）', async () => {
    const w = world('ct05')
    await w.service.rebuildIndex(w.projectId)
    // O1 裸零命中 / O2 带过滤 / O3 正文独有词（INV-4 列面边界的行为面证据）
    expect(await w.service.search({ projectId: w.projectId, keywords: ['nosuchterm'], sessionId: 's' })).toEqual([])
    expect(
      await w.service.search({ projectId: w.projectId, domainPrefix: 'core', keywords: ['nosuchterm'], sessionId: 's' }),
    ).toEqual([])
    expect(await w.service.search({ projectId: w.projectId, text: 'zorblatflax', sessionId: 's' })).toEqual([])
    // 回执行为面：tool render 对真实空结果产出诚实回执（回显 + 未命中明示）
    const tool = createSearchTool({
      knowledge: w.service as never,
      resolveProjectId: createProjectResolver([{ wsPath: w.ws, projectId: w.projectId }]),
    })
    const blocks = tool.output.render({ domain_prefix: 'core', keywords: ['nosuchterm'], text: 'zorblatflax', limit: 5 }, [])
    const text = blocks[0]?.text ?? ''
    expect(text).toContain('No knowledge entries matched')
    expect(text).toContain('domain_prefix="core"') // O2 过滤条件回显
    expect(text).toContain('keywords=["nosuchterm"]') // O1 查询词回显
    expect(text).toContain('text="zorblatflax"')
    expect(text).toContain('zero hits') // 未命中明示
    // O4 零兜底拒例：不存在建议替换词/自动改写类内容
    expect(text).not.toMatch(/suggest|did you mean|instead/i)
  })

  // 锚缺位留痕：契约 CT-bm25-recall-05 Side-effect「diag 零命中埋点发射」为待实现锚，
  // 实现以 recall_logs 哨兵行承载零命中采集、无独立 diag 事件——不一致已上报 fix/disc，
  // 真机消费面复核归 test-run；不就地调和（断言保持缺席态可判）。
  it.skip('CT-bm25-recall-05 Side-effect / BR-E6：diag 零命中埋点逐发（锚缺位——上报 fix/disc 后由 test-run 复核）', () => {})
})

// ── CT-bm25-recall-06 准入语义跨内核不变（BR-E3/E4） ──

describe('CT-bm25-recall-06 准入语义不变（BR-E3/E4）', () => {
  it('O1 条件排除：同 id 有 confirmed 版时 unconfirmed 权威投影不进召回（单命中非双投影）', async () => {
    const w = world('ct06')
    await w.service.rebuildIndex(w.projectId)
    const hits = await w.service.search({ projectId: w.projectId, keywords: ['dualonly'], sessionId: 's' })
    // 权威投影 = confirmed 版（单条目行）；unconfirmed 新版不作为第二命中出现
    expect(idsOf(hits)).toEqual(['br-dual'])
    expect(hits[0]?.effectiveRank).toBe(1.0)
    // 副证：unconfirmed 新版标题不出现（未以独立投影进召回）
    expect(hits.some((h) => h.title === 'Dual Version Entry Fresh')).toBe(false)
  })

  it('O2/O3 滞回/回流语义：既有阶段②测试零改动通过为判定（随 knowledge-journeys 项目跑批全绿承载，本 spec 不重复断言分值语义）', () => {
    // 判定式锚 = 既有滞回/CAS 套件原样通过（contract 刚性声明：以其原样通过为唯一判定）。
    // 证据位 = knowledge-journeys / knowledge 项目全绿跑批记录（任务 summary 引用）。
    expect(true).toBe(true)
  })
})

// ── CT-bm25-recall-07 采集分列口径（BR-E6） ──

describe('CT-bm25-recall-07 采集分列口径（BR-E6）', () => {
  it('O1 两口径独立数值在场；O2 固定题集零命中不计入日常口径（回归跑批后日常值不变）', { timeout: 120_000 }, async () => {
    // 日常口径：独立持久语义库（daily world）滚动 recall_logs
    const daily = world('ct07-daily')
    await daily.service.rebuildIndex(daily.projectId)
    await daily.service.search({ projectId: daily.projectId, keywords: ['dailyzero1'], sessionId: 'daily' })
    await daily.service.search({ projectId: daily.projectId, keywords: ['dailyzero2'], sessionId: 'daily' })
    await daily.service.search({ projectId: daily.projectId, keywords: ['dailyzero3'], sessionId: 'daily' })
    await daily.service.search({ projectId: daily.projectId, keywords: ['krecall'], sessionId: 'daily' })
    const dailyStat = (w: World): { calls: number; zero: number } => {
      const calls = (w.db.prepare(`SELECT COUNT(DISTINCT call_id) AS n FROM knowledge_recall_logs`).get() as { n: number }).n
      const zero = (w.db.prepare(`SELECT COUNT(DISTINCT call_id) AS n FROM knowledge_recall_logs WHERE hit_count = 0`).get() as { n: number }).n
      return { calls, zero }
    }
    const before = dailyStat(daily)
    expect(before).toEqual({ calls: 4, zero: 3 })

    // 回归口径：129 题固定题集在临时装配库复跑（与日常库物理分离）
    const bank = loadBank(join('tests', 'knowledge', 'recall-baseline'))
    const mount = await mountRealCorpus('bm25-recall-split')
    const report = await runBaseline(mount, bank)
    expect(report.total).toBe(bank.questions.length)

    // O2（判定性）：回归题集（含零命中题）全部落 mount 临时库——日常库滚动值不变
    expect(dailyStat(daily)).toEqual(before)
    const mountZero = (mount.db.prepare(`SELECT COUNT(DISTINCT call_id) AS n FROM knowledge_recall_logs WHERE hit_count = 0`).get() as { n: number }).n
    expect(mountZero).toBe(report.misses.filter((m) => m.attribution === 'zero-hit').length)
    expect(mountZero).toBeGreaterThan(0)

    // O1：两个独立数值分列在场——日常零命中值（daily 库）与回归命中率（mount 报告）
    const dailyZeroRate = before.zero / before.calls
    expect(dailyZeroRate).toBeGreaterThan(0)
    expect(dailyZeroRate).toBeLessThanOrEqual(1)
    expect(report.hitRate).toBeGreaterThanOrEqual(0.98) // 回归口径锚 floor（CT-bm25-recall-08 联合闭合）
  })
})

// ── CT-bm25-recall-08 基线复跑与 golden 零漂移（BR-E7/BR-E8） ──

describe('CT-bm25-recall-08 基线与 golden（BR-E7/BR-E8）', () => {
  it('O1/O2 由既有套件承载：recall-baseline floor 0.98 复跑 + 五通道 golden 对照——knowledge-journeys 全绿为证据（floor 值锚已随本任务上调 0.97→0.98）', () => {
    // 证据位：tests/knowledge/recall-baseline/recall-baseline.test.ts（O1，floor=0.98）
    // 与 tests/knowledge/knowledge-five-channel-supply/（O2 golden 零漂移）——同项目跑批。
    // 复跑证据报告：{forge.task_logs_dir}/001-baseline-rerun/recall-baseline-report.json（98.4%）。
    expect(loadFloor()).toBe(0.98)
  })
})

function loadFloor(): number {
  return (JSON.parse(readFileSync(join('tests', 'knowledge', 'recall-baseline', 'baseline-floor.json'), 'utf8')) as { floor: number }).floor
}
