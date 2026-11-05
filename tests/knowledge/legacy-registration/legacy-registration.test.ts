// @feature:knowledge
// Journey: legacy-registration（proposal knowledge-stage2-write-gateway §2.5/§2.8——scan 体检→id 台账→register→基线）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage2-write-gateway/testing/contracts/contract-legacy-registration.md
//   （CT-LR-01..10 ← journey LR-G1..G7 / LR-E1..E6）。
// 策略：vitest 层承载服务面确定性面（register 幂等 / scan 只读体检 / 复跑幂等 /
// rebuild 无损白名单）；121 篇真实存量目录夹具、id 台账留档、git 分批提交、人工抽检、
// 判定式回归集与召回基线 = 真机/既有测试资产面（recall-baseline 与 classification
// 回归集已在 knowledge-journeys/knowledge 项目跑批内），留痕于末尾。
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiagEventPayload } from '../../../packages/contracts/src/index.js'
import { startSelfHostedStorage } from '../../../packages/plugins/knowledge/src/storage/start.js'
import { rebuildKnowledgeIndex } from '../../../packages/plugins/knowledge/src/storage/rebuild.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/index.js'
import { createWsPathResolver } from '../../../packages/plugins/knowledge/src/tools/session.js'
import { canonicalWsPath } from '../../../packages/plugins/knowledge/src/storage/registry.js'

// ── 夹具 ──

const roots: string[] = []
function tmpRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), `knowledge-j-lr-${tag}-`))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

function collector(): { emit: (p: DiagEventPayload) => void; events: DiagEventPayload[] } {
  const events: DiagEventPayload[] = []
  return { events, emit: (p) => events.push(p) }
}

interface World {
  ws: string
  knowledgeDir: string
  projectId: string
  storage: NonNullable<ReturnType<typeof startSelfHostedStorage>>
  service: ReturnType<typeof createKnowledgeService>
  events: DiagEventPayload[]
  db: World['storage']['db']
}

function makeWorld(tag: string, corpus = true): World {
  const root = tmpRoot(tag)
  const ws = join(root, 'ws')
  const knowledgeDir = join(ws, '.knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  if (corpus) seedCorpus(knowledgeDir)
  const { emit, events } = collector()
  const storage = startSelfHostedStorage({ dbFile: join(root, 'knowledge', 'knowledge.db'), emit })!
  const projectId = `p-lr-${tag}`
  const service = createKnowledgeService({
    db: storage.db,
    resolveWsPath: createWsPathResolver([{ wsPath: ws, projectId }]),
    emit,
  })
  return { ws, knowledgeDir, projectId, storage, service, events, db: storage.db }
}

/** 存量语料夹具（含健康篇 + id 缺席违规篇 + title 重复对 + 正文重复对） */
function seedCorpus(knowledgeDir: string): void {
  const w = (name: string, fm: readonly string[], body: string): string => {
    const file = join(knowledgeDir, name)
    writeFileSync(file, `---\n${fm.join('\n')}\n---\n\n${body}\n`, 'utf8')
    return file
  }
  w('legacy-alpha-20260101T000000000Z.md', [
    'id: legacy-alpha', 'title: Legacy Alpha Doc', 'summary: 健康存量篇摘要', 'keywords: [legacy, alpha]',
    'status: unconfirmed', 'version_ts: "2026-01-01T00:00:00.000Z"', 'updated: "2026-01-01T00:00:00.000Z"',
  ], '健康存量篇正文。')
  w('legacy-beta-20260101T000000001Z.md', [
    'id: legacy-beta', 'title: Legacy Beta Doc', 'summary: 另一篇健康存量篇', 'keywords: [legacy, beta]',
    'status: unconfirmed', 'version_ts: "2026-01-01T00:00:00.001Z"', 'updated: "2026-01-01T00:00:00.001Z"',
  ], '另一篇正文。')
  // id 缺席违规篇（存量典型态——收编任务补发 id 的输入面）
  w('no-id-doc.md', ['title: No Id Doc', 'summary: id 缺席违规篇', 'keywords: [broken]'], '违规篇正文。')
  // title_norm 归一重复对（同义异名——收编消歧输入面）
  w('dup-one-20260101T000000002Z.md', [
    'id: dup-one', 'title: Duplicate Pair Doc', 'summary: 重复对之一', 'keywords: [dup]',
    'status: unconfirmed', 'version_ts: "2026-01-01T00:00:00.002Z"', 'updated: "2026-01-01T00:00:00.002Z"',
  ], '重复对一正文。')
  w('dup-two-20260101T000000003Z.md', [
    'id: dup-two', 'title: duplicate  pair  doc', 'summary: 重复对之二（归一同题）', 'keywords: [dup]',
    'status: unconfirmed', 'version_ts: "2026-01-01T00:00:00.003Z"', 'updated: "2026-01-01T00:00:00.003Z"',
  ], '重复对二正文。')
  // 全文 content_hash 重复对（同正文双处维护）
  w('c-dup-one-20260101T000000004Z.md', [
    'id: c-dup-one', 'title: Content Dup One', 'summary: 同正文一', 'keywords: [cdup]',
    'status: unconfirmed', 'version_ts: "2026-01-01T00:00:00.004Z"', 'updated: "2026-01-01T00:00:00.004Z"',
  ], '一模一样的重复正文内容。')
  w('c-dup-two-20260101T000000005Z.md', [
    'id: c-dup-two', 'title: Content Dup Two', 'summary: 同正文二', 'keywords: [cdup]',
    'status: unconfirmed', 'version_ts: "2026-01-01T00:00:00.005Z"', 'updated: "2026-01-01T00:00:00.005Z"',
  ], '一模一样的重复正文内容。')
}

const nRows = (w: World, table: string, where = ''): number =>
  w.db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get()?.n ?? 0

const registerEvents = (events: readonly DiagEventPayload[]): DiagEventPayload[] => events.filter((e) => e.event === 'knowledge-register')

// ── CT-LR-01 register（溯源 LR-G1/E5） ──

describe('CT-LR-01 register：登记与幂等（LR-G1/E5）', () => {
  it('O1 注册成功：registry 行 wsPath=canonical realpath 主键 + indexed 计数 + knowledge-register 埋点；O2 重复注册幂等（行数不变）', async () => {
    const w = makeWorld('g1')
    const r = await w.service.registerKnowledge({ wsPath: w.ws })
    expect(r.outcome).toBe('registered')
    if (r.outcome !== 'registered') return
    expect(r.wsPath).toBe(canonicalWsPath(w.ws)) // CT-LR-01 O1：canonical realpath 主键
    expect(r.knowledgeDir).toBe(canonicalWsPath(w.knowledgeDir))
    expect(r.indexed).toBe(6) // 7 篇中 6 篇带合法 id 入库（id 缺席违规篇 skipped）
    expect(r.skipped).toBe(1)
    const reg = w.db.prepare<unknown[], { ws_path: string; knowledge_dir: string }>(
      `SELECT ws_path, knowledge_dir FROM knowledge_registry`,
    ).all()
    expect(reg).toHaveLength(1)
    expect(reg[0]!.ws_path).toBe(canonicalWsPath(w.ws))
    expect(registerEvents(w.events).some((e) => e.level === 'info')).toBe(true) // 埋点
    // O2：同参重复调用幂等——行数不变（主键约束生效）
    const again = await w.service.registerKnowledge({ wsPath: w.ws })
    expect(again.outcome).toBe('registered') // CT-LR-01 O2：幂等重入
    expect(w.db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_registry`).get()?.n).toBe(1)
    w.storage.close()
  })
})

// ── CT-LR-02 scan 体检（溯源 LR-G2） ──

describe('CT-LR-02 scan：只读体检（LR-G2）', () => {
  it('O1 全量清单：fileCount 全量 + 违规逐文件指名（id-missing）+ 重复清单（title/content 分组）；零写入——文件零变更', async () => {
    const w = makeWorld('g2')
    await w.service.registerKnowledge({ wsPath: w.ws })
    const before = readdirSync(w.knowledgeDir).map((f) => readFileSync(join(w.knowledgeDir, f), 'utf8'))
    const report = await w.service.scanKnowledge({ projectId: w.projectId })
    expect(report.fileCount).toBe(7) // CT-LR-02 O1：全量清单（含违规篇）
    expect(report.violations.some((v) => v.relPath === 'no-id-doc.md' && v.reasons.includes('id-missing'))).toBe(true) // 逐文件指名
    const titleDup = report.duplicates.find((g) => g.basis === 'title')
    expect(titleDup?.relPaths.slice().sort()).toEqual(['dup-one-20260101T000000002Z.md', 'dup-two-20260101T000000003Z.md'])
    const contentDup = report.duplicates.find((g) => g.basis === 'content')
    expect(contentDup?.relPaths.slice().sort()).toEqual(['c-dup-one-20260101T000000004Z.md', 'c-dup-two-20260101T000000005Z.md'])
    // State：scan 不回写——文件内容零变更
    const after = readdirSync(w.knowledgeDir).map((f) => readFileSync(join(w.knowledgeDir, f), 'utf8'))
    expect(after).toEqual(before)
    w.storage.close()
    // 注：「五句判定式 type 逐篇归类 + 低置信标记」= 判定式回归集面
    // （tests/knowledge/classification/formula-regression.test.ts 承载，O2 低置信
    //  标记随回归集核销）——见末尾留痕。
  })
})

// ── CT-LR-05 幂等复跑（溯源 LR-G5） ──

describe('CT-LR-05 register 复跑幂等（LR-G5）', () => {
  it('O1 复跑零变更：entries/versions/fts 行数与内容不变（INV-A）', async () => {
    const w = makeWorld('g5')
    await w.service.registerKnowledge({ wsPath: w.ws })
    const snap = (): { entries: unknown[]; versions: number; fts: number } => ({
      entries: w.db.prepare(`SELECT id, title, status, effective_rank FROM knowledge_entries ORDER BY id`).all(),
      versions: nRows(w, 'knowledge_entry_versions'),
      fts: nRows(w, 'knowledge_fts'),
    })
    const before = snap()
    await w.service.registerKnowledge({ wsPath: w.ws }) // CT-LR-05 O1：重复执行批量入库
    expect(snap()).toEqual(before) // 零变更（文件 diff 面已由 CT-LR-02 钉死）
    w.storage.close()
  })
})

// ── CT-LR-09 rebuild 无损（溯源 LR-E4） ──

describe('CT-LR-09 rebuild 无损（LR-E4）', () => {
  it('O1 无损：收编终态 DELETE 缓存表 + rebuild——语义一致 + MERGE_LEDGER/RECALL_LOGS 行数不变（INV-B/INV-C）', async () => {
    const w = makeWorld('e4')
    await w.service.registerKnowledge({ wsPath: w.ws })
    // 业务账预置（收编终态联动面——归并台账在册 + 召回账消费）
    w.db.prepare(
      `INSERT INTO knowledge_supersede_ledger (winner_id, loser_id, reason, actor, merged_at) VALUES ('legacy-alpha', 'dup-one', 'dup', 'agent', '2026-01-05T00:00:00Z')`,
    ).run()
    w.db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, frontmatter_id, title_snap, domain_snap, query_json, hit_count, duration_ms, created_at)
       VALUES ('p-lr-e4', 'c1', 's1', 'search', NULL, NULL, NULL, NULL, '{}', 0, 1, '2026-01-06T00:00:00Z')`,
    ).run()
    const beforeEntries = w.db.prepare(`SELECT id, title, status, effective_rank FROM knowledge_entries ORDER BY id`).all()
    const n1 = nRows(w, 'knowledge_supersede_ledger')
    const n2 = nRows(w, 'knowledge_recall_logs')
    // DELETE 缓存表（白名单作用域）+ rebuild
    w.db.prepare(`DELETE FROM knowledge_fts`).run()
    w.db.prepare(`DELETE FROM knowledge_entry_versions`).run()
    w.db.prepare(`DELETE FROM knowledge_entries`).run()
    rebuildKnowledgeIndex(w.db, {})
    expect(w.db.prepare(`SELECT id, title, status, effective_rank FROM knowledge_entries ORDER BY id`).all()).toEqual(beforeEntries) // CT-LR-09 O1：语义无损
    expect(nRows(w, 'knowledge_supersede_ledger')).toBe(n1) // INV-B
    expect(nRows(w, 'knowledge_recall_logs')).toBe(n2) // INV-B
    w.storage.close()
  })
})

// ── 真机限定面 / 既有资产承接（留痕，本 spec 不重复承载） ──
// · CT-LR-03（id 台账 old_path→id→type 留档 .forge/docs）：121 篇真实存量目录夹具 +
//   台账文档产出 = 一次性收编任务真机面；vitest 等价锚 = 占用消歧（CT-WG-08）与
//   id 字符集校验（rebuild id-invalid skip 面，包内 rebuild.test.ts）。
// · CT-LR-04（121 篇 frontmatter 批量回写 + git 分批提交互不牵连）：夹具工作区副本 +
//   git 批次 = 真机迁移序列；vitest 等价锚 = CT-LR-01 入库投影 + CT-LR-05 幂等 +
//   CT-LR-09 再生。
// · CT-LR-06（抽检一致性 <95% 修判定式重跑流程门控）：人工抽检流程，真机面。
// · CT-LR-07（判定式回归集 + 召回基线 ≥70%）：已在 knowledge-journeys/knowledge 项目
//   跑批内——tests/knowledge/classification/formula-regression.test.ts（逐类 ≥5 篇
//   人工定标）与 tests/knowledge/recall-baseline/（≥100 题自动判分），非本 spec 重复断言。
// · CT-LR-08（孤儿旧版清理策略）：版本链保留策略执行 = 收编任务真机面；vitest 等价锚 =
//   「文件亡→记录亡」对账（CT-WG-16 / CT-DI-07）。
// · CT-LR-10（decisions/conventions 拆分判定）：归类语义判定 = 判定式回归集 + 人工抽检面。
describe('真机面留痕（121 篇存量收编 / 台账留档 / git 分批 / 抽检流程 / 拆分判定）', () => {
  it.skip('121 篇真实存量目录批量收编全链（scan→台账→回写→分批提交→抽检）：需真机存量目录与 git 批次（归 test-run 收口）', () => {
    expect(true).toBe(true)
  })
})
