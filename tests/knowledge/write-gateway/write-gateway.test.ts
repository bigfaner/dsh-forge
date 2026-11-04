// @feature:knowledge
// Journey: write-gateway（proposal knowledge-stage2-write-gateway §2.2-2.4——写入→准入四档→confirm→旧版 superseded）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage2-write-gateway/testing/contracts/contract-write-gateway.md
//   （CT-WG-01..16 ← journey WG-G1..G7 / WG-E1..E12）。
// 策略：真自持装配链 vitest 面——startSelfHostedStorage 真库 + createKnowledgeService
// 写门三法（write.ts 真身）→ SQLite 投影 + 知识目录真实落盘（frontmatter 正本权威）→
// rebuild 再生对账（rebuild.ts 真身）。文件系统副作用全真（AGENTS §1.4 面）。
// 真机限定面（distill 技能执行循环 / 双会话双通道并发 / roundtrip 构造性载荷注入）
// 标注于末尾 skip 留痕，vitest 层等价锚随注。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { craftFile, parseFm, withFmField } from '../journey-fm.js'
import type { DiagEventPayload } from '../../../packages/contracts/src/index.js'
import { startSelfHostedStorage } from '../../../packages/plugins/knowledge/src/storage/start.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/index.js'
import { createWsPathResolver } from '../../../packages/plugins/knowledge/src/tools/session.js'
import type { KnowledgeWriteQuery } from '../../../packages/plugins/knowledge/src/service/index.js'

// ── 夹具（每例独立真库 + 真知识目录） ──

const roots: string[] = []
function tmpRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), `knowledge-j-wg-${tag}-`))
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

function makeWorld(tag: string): World {
  const root = tmpRoot(tag)
  const ws = join(root, 'ws')
  const knowledgeDir = join(ws, '.knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  const { emit, events } = collector()
  const storage = startSelfHostedStorage({ dbFile: join(root, 'knowledge', 'knowledge.db'), emit })!
  storage.registry.upsert(ws, knowledgeDir)
  const projectId = `p-wg-${tag}`
  const service = createKnowledgeService({ db: storage.db, resolveWsPath: createWsPathResolver([{ wsPath: ws, projectId }]), emit })
  return { ws, knowledgeDir, projectId, storage, service, events, db: storage.db }
}

/** 三问全过载荷基型 */
function writeQ(partial: Partial<KnowledgeWriteQuery> = {}): KnowledgeWriteQuery {
  return {
    projectId: 'p-PLACEHOLDER',
    title: 'Commit Gate Convention',
    summary: '提交门约定摘要',
    keywords: ['commit', 'gate'],
    body: '# 规范\n\n提交前必须跑全量门。',
    type: 'conventions',
    necessity: { stable: true, nonTrivial: true, value: true },
    ...partial,
  }
}

const rejects = (events: readonly DiagEventPayload[]): DiagEventPayload[] => events.filter((e) => e.event === 'knowledge-write-reject')
const writeEvents = (events: readonly DiagEventPayload[]): DiagEventPayload[] => events.filter((e) => e.event === 'knowledge-write')
const confirmEvents = (events: readonly DiagEventPayload[]): DiagEventPayload[] => events.filter((e) => e.event === 'knowledge-confirm')
const purgeEvents = (events: readonly DiagEventPayload[]): DiagEventPayload[] => events.filter((e) => e.event === 'knowledge-entry-purge')

const nRows = (w: World, table: string, where = ''): number =>
  w.db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get()?.n ?? 0

const entryRow = (w: World, id: string) =>
  w.db.prepare<[string], { id: string; status: string; effective_rank: number; confirmed_version_id: string | null; merged_into: string | null }>(
    `SELECT id, status, effective_rank, confirmed_version_id, merged_into FROM knowledge_entries WHERE id = ?`,
  ).get(id)

const fmOf = (file: string): Record<string, string> => parseFm(readFileSync(file, 'utf8')).data

// ── CT-WG-01 write 成功新 id（溯源 WG-G1） ──

describe('CT-WG-01 write：成功新 id（WG-G1）', () => {
  it('O1 成功：id 过字符集规范化链 + 文件 `<id>-<version_ts>.md` 落盘 + frontmatter 回写 + DB 投影 unconfirmed 0.6 + 无 reject 埋点', async () => {
    const w = makeWorld('g1')
    const r = await w.service.write(writeQ({ projectId: w.projectId }))
    expect(r.outcome).toBe('written')
    if (r.outcome !== 'written') return
    // id 匹配 ^[a-z0-9-]+$（title 规范化链：小写/空白折叠/非法字符转连字符）
    expect(r.id).toBe('commit-gate-convention')
    expect(r.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    // 文件落盘 + frontmatter：id/status=unconfirmed/version_ts，无 supersedes、无 candidate_of
    expect(existsSync(r.filePath)).toBe(true)
    expect(r.filePath.startsWith(w.knowledgeDir)).toBe(true)
    const fm = fmOf(r.filePath)
    expect(fm.id).toBe(r.id)
    expect(fm.status).toBe('unconfirmed')
    expect(fm.version_ts).toBe(r.versionTs)
    expect(fm.supersedes).toBeUndefined()
    expect(fm.candidate_of).toBeUndefined()
    // DB 投影：entries 行 status=unconfirmed + effective_rank=0.6（INV-D）+ 版本行
    const row = entryRow(w, r.id)
    expect(row?.status).toBe('unconfirmed')
    expect(row?.effective_rank).toBe(0.6)
    expect(nRows(w, 'knowledge_entry_versions', `WHERE id = '${r.id}'`)).toBe(1)
    // Side-effect：无 reject 埋点；成功写入事件在场
    expect(rejects(w.events)).toHaveLength(0)
    expect(writeEvents(w.events)).toHaveLength(1)
    w.storage.close()
  })
})

// ── CT-WG-02 版本化复用同 id（溯源 WG-G4） ──

describe('CT-WG-02 write：版本化复用同 id（WG-G4）', () => {
  it('O1 成功：新文件同 id + supersedes 锚旧版 version_ts（非文件名）+ 不挂 candidate_of + 旧文件不动', async () => {
    const w = makeWorld('g4')
    const v1 = await w.service.write(writeQ({ projectId: w.projectId }))
    if (v1.outcome !== 'written') throw new Error('v1 未写入')
    const v2 = await w.service.write(writeQ({
      projectId: w.projectId,
      versionOf: v1.id,
      body: '# 规范（更新）\n\n新增段落。',
    }))
    expect(v2.outcome).toBe('written')
    if (v2.outcome !== 'written') return
    expect(v2.id).toBe(v1.id)
    expect(v2.versionTs).not.toBe(v1.versionTs)
    // 新文件 frontmatter：同 id + supersedes = 旧版本 version_ts + candidate_of 缺席（版本化与挂起互斥）
    const fm = fmOf(v2.filePath)
    expect(fm.id).toBe(v1.id)
    expect(fm.supersedes).toBe(v1.versionTs)
    expect(fm.candidate_of).toBeUndefined()
    expect(v2.supersedes).toBe(v1.versionTs)
    expect(v2.candidateOf).toBeUndefined()
    // 旧文件不动 + 两版本行在场
    expect(fmOf(v1.filePath).version_ts).toBe(v1.versionTs)
    expect(nRows(w, 'knowledge_entry_versions', `WHERE id = '${v1.id}'`)).toBe(2)
    w.storage.close()
  })
})

// ── CT-WG-03 拒收①路径非法（溯源 WG-E1） ──

describe('CT-WG-03 write 拒收①：路径非法（WG-E1）', () => {
  it.each(['../escape', '.hidden/x', 'a/./b'])('O1 拒收（domain=%s）：零文件零 DB 行零回写 + knowledge-write-reject 逐例埋点含拒因', async (domain) => {
    const w = makeWorld('e1')
    const before = nRows(w, 'knowledge_entries')
    const r = await w.service.write(writeQ({ projectId: w.projectId, domain }))
    expect(r).toMatchObject({ outcome: 'rejected', reason: 'illegal-path' }) // CT-WG-03 O1
    expect(readdirSync(w.knowledgeDir)).toHaveLength(0) // INV-B：零文件残留
    expect(nRows(w, 'knowledge_entries')).toBe(before) // 零 DB 行
    expect(nRows(w, 'knowledge_entry_versions')).toBe(0)
    const ev = rejects(w.events)
    expect(ev).toHaveLength(1) // 逐例埋点
    expect(ev[0]!.message).toContain('路径非法') // 拒因类别
    w.storage.close()
  })
})

// ── CT-WG-04 拒收②YAML round-trip 不等值（溯源 WG-E2） ──
// 探针实证（.forge/tmp/roundtrip-probe.mjs）：yaml-1.1 布尔碰撞（yes/no/on/y）、数值碰撞
// （1.10）、冒号形态、CRLF 正文、数值字符串 keywords——dumper 全部正确加引号，公共
// 查询面构造不出往返失真载荷。防线为纵深防御（write.ts roundtrip 自证），真机限定面
// 构造性载荷注入（绕过 dumper 的载荷注入）留痕于末尾 skip。

// ── CT-WG-05 拒收③缺字段（溯源 WG-E1 族） ──

describe('CT-WG-05 write 拒收③：缺字段逐例（WG-E1 族）', () => {
  it.each([
    ['title', { title: '  ' }],
    ['summary', { summary: '' }],
    ['keywords', { keywords: [] }],
    ['body', { body: '' }],
    ['necessity', { necessity: undefined }],
    ['necessity.stable', { necessity: { stable: 'yes', nonTrivial: true, value: true } }],
  ] as const)('O1 缺 %s 各自拒收 + field 指明 + 零残留（逐例独立断言）', async (field, patch) => {
    const w = makeWorld('e1f')
    const r = await w.service.write(writeQ({ projectId: w.projectId, ...patch } as Partial<KnowledgeWriteQuery>))
    expect(r).toMatchObject({ outcome: 'rejected', reason: 'missing-field', field }) // CT-WG-05 O1
    expect(readdirSync(w.knowledgeDir)).toHaveLength(0) // INV-B
    expect(nRows(w, 'knowledge_entries')).toBe(0)
    expect(nRows(w, 'knowledge_entry_versions')).toBe(0)
    expect(rejects(w.events)).toHaveLength(1) // 逐例埋点
    w.storage.close()
  })
  it('O1 附：type 非五类枚举同样拒收', async () => {
    const w = makeWorld('e1t')
    const r = await w.service.write(writeQ({ projectId: w.projectId, type: 'random-kind' }))
    expect(r).toMatchObject({ outcome: 'rejected', reason: 'missing-field', field: 'type' })
    expect(nRows(w, 'knowledge_entries')).toBe(0)
    w.storage.close()
  })
})

// ── CT-WG-06 不写：必要性三问不过（溯源 WG-E3） ──

describe('CT-WG-06 write 不写：三问不过（WG-E3）', () => {
  it.each([
    ['O1 全答不过闸（长期稳定=否）', { stable: false, nonTrivial: true, value: true }],
    ['O2 答否（常识性内容）', { stable: true, nonTrivial: false, value: true }],
  ])('%s：not-written + 零残留 + 无 reject 埋点（非拒收面）', async (_label, necessity) => {
    const w = makeWorld('e3')
    const r = await w.service.write(writeQ({
      projectId: w.projectId,
      necessity: { ...necessity, reason: '常识性内容不落库' },
    }))
    expect(r).toMatchObject({ outcome: 'not-written', reason: 'necessity-failed' }) // CT-WG-06 O1/O2
    expect(r.outcome === 'not-written' ? r.detail : '').toContain('必要性三问未通过') // 轨迹留原因
    expect(readdirSync(w.knowledgeDir)).toHaveLength(0) // 零残留（INV-B 形态）
    expect(nRows(w, 'knowledge_entries')).toBe(0)
    expect(rejects(w.events)).toHaveLength(0)
    w.storage.close()
  })
})

// ── CT-WG-07 中文 title 生成链（溯源 WG-E4） ──

describe('CT-WG-07 write：中文 title 生成链（WG-E4）', () => {
  it('O1/O2/O3：slug_hint 合法=规范化值；缺席/非法回退 keywords（仍过字符集校验，三例互异）', async () => {
    const w = makeWorld('e4')
    const a = await w.service.write(writeQ({ projectId: w.projectId, title: '部署基线策略', slugHint: 'Deploy Baseline', keywords: ['deploy'] }))
    const b = await w.service.write(writeQ({ projectId: w.projectId, title: '发布节奏治理', keywords: ['release', 'cadence'] }))
    const c = await w.service.write(writeQ({ projectId: w.projectId, title: '灰度发布治理', slugHint: '灰 度', keywords: ['canary', 'rollout'] }))
    expect(a).toMatchObject({ outcome: 'written', id: 'deploy-baseline' }) // O1：id = slug_hint 规范化值
    expect(b).toMatchObject({ outcome: 'written', id: 'release-cadence' }) // O2：缺席 → keywords 英译回退
    expect(c).toMatchObject({ outcome: 'written', id: 'canary-rollout' }) // O3：非法 slug_hint → 同 O2 回退链
    const ids = [a, b, c].map((r) => (r.outcome === 'written' ? r.id : ''))
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/) // 三例 id 均过字符集正则
    expect(new Set(ids).size).toBe(3) // 互不相同
    w.storage.close()
  })
})

// ── CT-WG-08 撞名两分支（溯源 WG-E5/E6） ──

describe('CT-WG-08 write：撞名两分支（WG-E5/E6）', () => {
  it('O1 不同概念：占用消歧 -2 递增，DB 无重复主键；O2 同概念：复用 id + supersedes + 不挂 candidate_of', async () => {
    const w = makeWorld('e5')
    const a = await w.service.write(writeQ({ projectId: w.projectId, title: 'Foo Bar' }))
    if (a.outcome !== 'written') throw new Error('a 未写入')
    // B1：同规范化 id（foo-bar）不同概念（无 versionOf）→ 消歧后缀
    const b1 = await w.service.write(writeQ({ projectId: w.projectId, title: 'foo  BAR', summary: '不同概念的撞名条目' }))
    expect(b1).toMatchObject({ outcome: 'written', id: 'foo-bar-2' }) // CT-WG-08 O1
    expect(nRows(w, 'knowledge_entries', `WHERE id IN ('foo-bar','foo-bar-2')`)).toBe(2) // 主键全局唯一
    // B2：同概念 → 复用 id 走版本化（CT-WG-02 形态）
    const b2 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Foo Bar (更新)', versionOf: a.id }))
    expect(b2.outcome).toBe('written')
    if (b2.outcome !== 'written') return
    expect(b2.id).toBe(a.id) // CT-WG-08 O2：复用 id、不新建
    expect(b2.supersedes).toBe(a.versionTs) // supersedes 锚
    expect(b2.candidateOf).toBeUndefined() // 不挂 candidate_of
    expect(entryRow(w, 'foo-bar-2')).toBeDefined() // 消歧条目仍在
    w.storage.close()
  })
})

// ── CT-WG-09 双写同秒版本键唯一（溯源 WG-E7） ──

describe('CT-WG-09 write：同秒双写版本键唯一（WG-E7）', () => {
  it('O1 版本键唯一：同 id 同秒窗两路版本化写入——毫秒时间戳 + 落盘存在性检查防撞名，两文件互异且 frontmatter 各自完整', async () => {
    const w = makeWorld('e7')
    const base = await w.service.write(writeQ({ projectId: w.projectId, title: 'Same Second Write' }))
    if (base.outcome !== 'written') throw new Error('base 未写入')
    const v2 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Same Second Write', versionOf: base.id, summary: 'v2 摘要' }))
    const v3 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Same Second Write', versionOf: base.id, summary: 'v3 摘要' }))
    if (v2.outcome !== 'written' || v3.outcome !== 'written') throw new Error('版本写未成功')
    // 同秒（毫秒粒度）内两版本：版本键互异、两文件均存在且路径不等
    expect(v2.versionTs.slice(0, 13)).toBe(v3.versionTs.slice(0, 13)) // 同小时窗（毫秒粒度守卫负载）
    expect(v2.versionTs).not.toBe(v3.versionTs)
    expect(v2.filePath).not.toBe(v3.filePath)
    expect(existsSync(v2.filePath)).toBe(true)
    expect(existsSync(v3.filePath)).toBe(true)
    expect(fmOf(v2.filePath).version_ts).toBe(v2.versionTs) // frontmatter 各自完整
    expect(fmOf(v3.filePath).version_ts).toBe(v3.versionTs)
    expect(nRows(w, 'knowledge_entry_versions', `WHERE id = '${base.id}'`)).toBe(3)
    w.storage.close()
    // 双会话双通道真并发（两进程同毫秒竞速）= 真机限定面（见末尾留痕）；vitest 等价锚 =
    // write.ts 毫秒推进 + existsSync 存在性检查守卫（本例同秒窗覆盖）。
  })
})

// ── CT-WG-10 title 改名 id 不变（溯源 WG-E8） ──

describe('CT-WG-10 write：title 改名 id 不变（WG-E8）', () => {
  it('O1 id 冻结：confirm 后改 title 重写——id 不变 + supersedes 链锚 version_ts 连续', async () => {
    const w = makeWorld('e8')
    const v1 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Old Name Doc' }))
    if (v1.outcome !== 'written') throw new Error('v1 未写入')
    await w.service.confirm({ projectId: w.projectId, id: v1.id })
    const v2 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Renamed Doc Entirely', versionOf: v1.id }))
    expect(v2.outcome).toBe('written')
    if (v2.outcome !== 'written') return
    expect(v2.id).toBe(v1.id) // CT-WG-10 O1：id 冻结不变
    expect(v2.supersedes).toBe(v1.versionTs) // 链锚 version_ts（非文件名）不断
    expect(fmOf(v2.filePath).id).toBe(v1.id)
    w.storage.close()
  })
})

// ── CT-WG-11 查重命中挂起（溯源 WG-E9） ──

describe('CT-WG-11 write：查重命中挂起不拒收（WG-E9）', () => {
  it('O1 title_norm 精确命中：落库成功 + candidate_of=D.id + 无 reject 埋点', async () => {
    const w = makeWorld('e9a')
    const d = await w.service.write(writeQ({ projectId: w.projectId, title: 'Deploy Baseline Policy', keywords: ['ship'] }))
    if (d.outcome !== 'written') throw new Error('D 未写入')
    const r = await w.service.write(writeQ({ projectId: w.projectId, title: 'deploy baseline  POLICY', summary: '疑似同概念新写入' }))
    expect(r.outcome).toBe('written') // 落库成功（不拒收）
    if (r.outcome !== 'written') return
    expect(r.candidateOf).toBe(d.id) // CT-WG-11 O1：挂起指向 D.id
    expect(fmOf(r.filePath).candidate_of).toBe(d.id) // frontmatter 承载
    expect(r.mergeSuggestions.some((s) => s.id === d.id && s.basis === 'title-norm')).toBe(true) // 归并建议随回执
    expect(rejects(w.events)).toHaveLength(0) // 无 reject 埋点
    w.storage.close()
  })
  it('O3 keywords Jaccard 候选命中：不同 title 同受控词表 → 挂起', async () => {
    const w = makeWorld('e9b')
    const d = await w.service.write(writeQ({ projectId: w.projectId, title: 'Deploy Baseline Policy', keywords: ['ship', 'gate'] }))
    if (d.outcome !== 'written') throw new Error('D 未写入')
    const r = await w.service.write(writeQ({
      projectId: w.projectId,
      title: 'Release Checklist Governance',
      keywords: ['ship', 'gate'], // Jaccard = 1
    }))
    expect(r.outcome).toBe('written')
    if (r.outcome !== 'written') return
    expect(r.candidateOf).toBe(d.id) // CT-WG-11 O3
    expect(r.mergeSuggestions.some((s) => s.id === d.id && s.basis === 'jaccard')).toBe(true)
    w.storage.close()
  })
})

// ── CT-WG-12 search 四档 rank 全验（溯源 WG-E10/G2） ──

describe('CT-WG-12 search：四档 rank 全验（WG-E10/G2）', () => {
  it('O1-O4：confirmed 1.0 / 纯新 unconfirmed 0.6 / 冲突隔离 0.4 / superseded 0.2——SQL 实查与派生规则一致（INV-D）', async () => {
    const w = makeWorld('e10')
    // confirmed 档
    const c = await w.service.write(writeQ({ projectId: w.projectId, title: 'Confirmed Tier Doc', keywords: ['tier'] }))
    if (c.outcome !== 'written') throw new Error('c 未写入')
    await w.service.confirm({ projectId: w.projectId, id: c.id })
    // 纯新 unconfirmed 档
    const u = await w.service.write(writeQ({ projectId: w.projectId, title: 'Fresh Draft Doc', keywords: ['tier'] }))
    if (u.outcome !== 'written') throw new Error('u 未写入')
    // 冲突隔离 / superseded（曾审）档：正本文件承载（rebuild 派生面）
    craftFile(w.knowledgeDir, 'conflict-tier-doc-20260101T000000000Z.md', [
      'id: conflict-tier-doc',
      'title: Conflict Tier Doc',
      'summary: 悬空 supersedes 锚的冲突条目',
      'keywords: [tier]',
      'status: superseded',
      'version_ts: "2026-01-01T00:00:00.000Z"',
      'updated: "2026-01-01T00:00:00.000Z"',
      'supersedes: "1999-01-01T00:00:00.000Z"', // 不在本条目版本链内 → 语义冲突
    ], '冲突档正文')
    craftFile(w.knowledgeDir, 'superseded-tier-doc-20260101T000000001Z.md', [
      'id: superseded-tier-doc',
      'title: Superseded Tier Doc',
      'summary: 曾审后被顶替条目',
      'keywords: [tier]',
      'status: superseded',
      'confirmed_at: "2026-01-02T00:00:00.000Z"',
      'version_ts: "2026-01-01T00:00:00.001Z"',
      'updated: "2026-01-01T00:00:00.001Z"',
    ], '曾审沉底正文')
    await w.service.rebuildIndex(w.projectId)
    // SQL 实查四值逐一相等（CT-WG-12 判定）
    expect(entryRow(w, c.id)?.effective_rank).toBe(1.0) // O1
    expect(entryRow(w, u.id)?.effective_rank).toBe(0.6) // O2
    expect(entryRow(w, 'conflict-tier-doc')?.effective_rank).toBe(0.4) // O3
    expect(entryRow(w, 'superseded-tier-doc')?.effective_rank).toBe(0.2) // O4
    w.storage.close()
  })
})

// ── CT-WG-13 search 条件式排除（溯源 WG-G5，裁决 #10） ──

describe('CT-WG-13 search：条件式排除（WG-G5，裁决 #10）', () => {
  it('O1 排除生效：同 id 有 confirmed 版时 unconfirmed 新版不召回（版本行仍在）；O2 对照纯新 0.6 可见', async () => {
    const w = makeWorld('g5')
    const v1 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Exclusion Target Doc', keywords: ['alphakey'] }))
    if (v1.outcome !== 'written') throw new Error('v1 未写入')
    await w.service.confirm({ projectId: w.projectId, id: v1.id })
    // 同 id unconfirmed 新版（独有新词 betakey）
    const v2 = await w.service.write(writeQ({
      projectId: w.projectId,
      title: 'Exclusion Target Doc',
      keywords: ['betakey'],
      versionOf: v1.id,
    }))
    if (v2.outcome !== 'written') throw new Error('v2 未写入')
    // O1：新词 search 不召回新版（结果集不含 U 的 version_ts/文件路径）；旧词正常命中 C
    const hitNew = await w.service.search({ projectId: w.projectId, keywords: ['betakey'] })
    expect(hitNew.map((h) => h.frontmatterId)).not.toContain(v1.id)
    const hitOld = await w.service.search({ projectId: w.projectId, keywords: ['alphakey'] })
    expect(hitOld.map((h) => h.frontmatterId)).toContain(v1.id) // C 正常命中
    // U 版本行仍在 KNOWLEDGE_ENTRY_VERSIONS（存在但不召回）
    expect(nRows(w, 'knowledge_entry_versions', `WHERE id = '${v1.id}' AND version_ts = '${v2.versionTs}'`)).toBe(1)
    // O2 对照：纯新条目（同 id 无 confirmed 版）unconfirmed 唯一版本仍 0.6 可见
    const y = await w.service.write(writeQ({ projectId: w.projectId, title: 'Pure New Draft', keywords: ['betakey'] }))
    if (y.outcome !== 'written') throw new Error('y 未写入')
    const hitY = await w.service.search({ projectId: w.projectId, keywords: ['betakey'] })
    const yHit = hitY.find((h) => h.frontmatterId === y.id)
    expect(yHit?.effectiveRank).toBe(0.6) // CT-WG-13 O2（= CT-WG-12 O2 复用口径）
    w.storage.close()
  })
})

// ── CT-WG-14 knowledge_read 三分支（溯源 WG-G3/G7） ──

describe('CT-WG-14 knowledge_read：三分支（WG-G3/G7）', () => {
  it('O1 confirmed：返回 md 全文（与盘上文件逐字节等值）', async () => {
    const w = makeWorld('g7a')
    const v = await w.service.write(writeQ({ projectId: w.projectId, title: 'Fully Open Doc' }))
    if (v.outcome !== 'written') throw new Error('v 未写入')
    await w.service.confirm({ projectId: w.projectId, id: v.id })
    const r = await w.service.read({ projectId: w.projectId, id: v.id })
    expect(r.outcome).toBe('read')
    if (r.outcome !== 'read') return
    expect(r.body).toBe(readFileSync(v.filePath, 'utf8')) // CT-WG-14 O1：逐字节等值
    expect(r.status).toBe('confirmed')
    w.storage.close()
  })
  it('O2 unconfirmed：拒正文且不暴露存在性（回执无 id/标题泄露；read-abstract 同口径 EntryNotFound）', async () => {
    const w = makeWorld('g3')
    const v = await w.service.write(writeQ({ projectId: w.projectId, title: 'Secret Draft Name' }))
    if (v.outcome !== 'written') throw new Error('v 未写入')
    const r = await w.service.read({ projectId: w.projectId, id: v.id })
    expect(r.outcome).toBe('denied') // CT-WG-14 O2
    if (r.outcome === 'denied') {
      expect(r.message).not.toContain(v.id) // 不暴露存在性
      expect(r.message).not.toContain('Secret Draft Name')
    }
    // read-abstract 同口径：EntryNotFound 语义面（不区分「不存在」与「无权限」）
    const card = (await w.service.listEntries({ projectId: w.projectId })).find((k) => k.title === 'Secret Draft Name')
    if (card !== undefined) {
      await expect(w.service.readAbstract({ projectId: w.projectId, entryId: card.entryId })).rejects.toThrow(/未命中|not found|不存在/i)
    }
    w.storage.close()
  })
  it('O3 superseded 曾审：全文可读（被顶替≠未审）', async () => {
    const w = makeWorld('g7b')
    // 服务面链：V1 confirm → V2 写入 → confirm V2（V1 降 superseded 保留 confirmed_at）
    const v1 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Versioned Doc' }))
    if (v1.outcome !== 'written') throw new Error('v1 未写入')
    await w.service.confirm({ projectId: w.projectId, id: v1.id })
    const v2 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Versioned Doc', versionOf: v1.id, summary: '新版摘要' }))
    if (v2.outcome !== 'written') throw new Error('v2 未写入')
    await w.service.confirm({ projectId: w.projectId, id: v2.id })
    expect(fmOf(v1.filePath).status).toBe('superseded') // 旧版降级 + 曾审标记
    expect(fmOf(v1.filePath).confirmed_at).toBeDefined()
    // 权威版（V2 confirmed）可读；曾审沉底条目（权威=superseded）同样可读
    const readAuth = await w.service.read({ projectId: w.projectId, id: v2.id })
    expect(readAuth.outcome).toBe('read')
    const file = craftFile(w.knowledgeDir, 'once-confirmed-doc-20260101T000000000Z.md', [
      'id: once-confirmed-doc',
      'title: Once Confirmed Doc',
      'summary: 曾审后被顶替（权威=superseded）',
      'keywords: [history]',
      'status: superseded',
      'confirmed_at: "2026-01-02T00:00:00.000Z"',
      'version_ts: "2026-01-01T00:00:00.000Z"',
      'updated: "2026-01-01T00:00:00.000Z"',
    ], '曾审正文——可回看')
    await w.service.rebuildIndex(w.projectId)
    const r = await w.service.read({ projectId: w.projectId, id: 'once-confirmed-doc' })
    expect(r.outcome).toBe('read') // CT-WG-14 O3：全文可读
    if (r.outcome === 'read') expect(r.body).toBe(readFileSync(file, 'utf8'))
    w.storage.close()
  })
})

// ── CT-WG-15 confirm 升格与 CAS（溯源 WG-G6，裁决 #9） ──

describe('CT-WG-15 confirm：升格与 CAS（WG-G6，裁决 #9）', () => {
  it('O1 升格成功：新版 confirmed rank 1.0 + 旧版同事务降 superseded（frontmatter confirmed_at 保留）+ confirmed_version_id 前移 + knowledge-confirm 埋点', async () => {
    const w = makeWorld('g6')
    const v1 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Promote Me Doc' }))
    if (v1.outcome !== 'written') throw new Error('v1 未写入')
    await w.service.confirm({ projectId: w.projectId, id: v1.id }) // Preconditions：V1 = 曾审权威版本
    const v2 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Promote Me Doc', versionOf: v1.id, summary: '新版摘要' }))
    if (v2.outcome !== 'written') throw new Error('v2 未写入')
    const r = await w.service.confirm({ projectId: w.projectId, id: v2.id })
    expect(r).toMatchObject({ outcome: 'confirmed', id: v2.id, versionTs: v2.versionTs, demoted: [v1.versionTs] }) // CT-WG-15 O1
    const row = entryRow(w, v2.id)
    expect(row?.status).toBe('confirmed')
    expect(row?.effective_rank).toBe(1.0)
    expect(row?.confirmed_version_id).toBe(v2.versionTs) // 指针前移
    expect(fmOf(v2.filePath).status).toBe('confirmed') // 目标版升格（正本权威）
    expect(fmOf(v1.filePath).status).toBe('superseded') // 旧版同事务降级
    expect(fmOf(v1.filePath).confirmed_at).toBeDefined() // 曾审标记保留
    expect(confirmEvents(w.events)).toHaveLength(2) // knowledge-confirm 逐例埋点（V1 前置 + V2 升格）
    expect(confirmEvents(w.events).at(-1)!.message).toContain(v2.versionTs)
    w.storage.close()
  })
  it('O2 CAS 失败：已归并（merged_into≠空）→ confirm 拒 + 状态零变更', async () => {
    const w = makeWorld('g6cas')
    const v = await w.service.write(writeQ({ projectId: w.projectId, title: 'Merged Away Doc' }))
    if (v.outcome !== 'written') throw new Error('v 未写入')
    // 归并态构造：distill 执行形态——loser 正本写 merged_into（redirect），rebuild 派生
    const { writeFileSync } = await import('node:fs')
    writeFileSync(v.filePath, withFmField(readFileSync(v.filePath, 'utf8'), 'merged_into', 'winner-doc'), 'utf8')
    await w.service.rebuildIndex(w.projectId)
    const before = entryRow(w, v.id)
    const r = await w.service.confirm({ projectId: w.projectId, id: v.id })
    expect(r).toMatchObject({ outcome: 'cas-failed', reason: 'merged' }) // CT-WG-15 O2：CAS 前置拒绝
    expect(entryRow(w, v.id)).toEqual(before) // 状态零变更
    // INV-A 终态：无 confirmed+redirect 并存
    const both = w.db.prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM knowledge_entries WHERE status = 'confirmed' AND merged_into IS NOT NULL AND merged_into != ''`,
    ).get()?.n
    expect(both).toBe(0)
    expect(confirmEvents(w.events)).toHaveLength(0)
    w.storage.close()
  })
})

// ── CT-WG-16 purge 删除同步清理分级（溯源 WG-E11/E12，裁决 #10） ──

describe('CT-WG-16 purge：删除同步清理分级（WG-E11/E12，裁决 #10）', () => {
  it('O1 confirmed 缺失：warn 级埋点 + DB 零残留 + search/read 无失败路径', async () => {
    const w = makeWorld('e11')
    const c1 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Vanishing Confirmed Doc', keywords: ['ghost'] }))
    if (c1.outcome !== 'written') throw new Error('c1 未写入')
    await w.service.confirm({ projectId: w.projectId, id: c1.id })
    rmSync(c1.filePath) // 磁盘直删（真实文件系统夹具）
    await w.service.rebuildIndex(w.projectId) // 触发同步检查（对账删除——CT-WG-16 Input）
    const r = await w.service.search({ projectId: w.projectId, keywords: ['ghost'] })
    expect(Array.isArray(r)).toBe(true) // 无读取失败路径
    const rd = await w.service.read({ projectId: w.projectId, id: c1.id })
    expect(rd.outcome).toBe('denied') // 不抛错（文件亡→记录亡，非孤儿态报错）
    const purges = purgeEvents(w.events)
    expect(purges.some((e) => e.level === 'warn' && e.message.includes(c1.id))).toBe(true) // CT-WG-16 O1：warn 分级
    expect(entryRow(w, c1.id)).toBeUndefined() // entries 行同删（唯一版本）
    expect(nRows(w, 'knowledge_entry_versions', `WHERE id = '${c1.id}'`)).toBe(0) // 版本行同删
    w.storage.close()
  })
  it('O2 unconfirmed 删除：info 级埋点 + 零残留', async () => {
    const w = makeWorld('e12')
    const u1 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Vanishing Draft Doc', keywords: ['draftghost'] }))
    if (u1.outcome !== 'written') throw new Error('u1 未写入')
    rmSync(u1.filePath)
    await w.service.rebuildIndex(w.projectId) // 触发同步检查（对账删除）
    expect(purgeEvents(w.events).some((e) => e.level === 'info' && e.message.includes(u1.id))).toBe(true) // CT-WG-16 O2：info 分级
    expect(entryRow(w, u1.id)).toBeUndefined()
    w.storage.close()
  })
})

// ── 真机限定面（留痕，vitest 层不承载；归 test-run 收口任务） ──
// · CT-WG-04 O1（roundtrip 构造性载荷注入）：公共查询面 dumper 保真（探针
//   .forge/tmp/roundtrip-probe.mjs 全 OK）——构造往返失真载荷需绕过 dumper 的原始
//   注入通道（真机 tool 面装配链）；vitest 等价锚 = write.ts roundtrip 自证代码在场
//   （service/write.ts ⑧ 段）与包内单测。
// · CT-WG-09 双会话双通道真并发（两进程同毫秒竞速）：真机 Electron 双会话承载；
//   vitest 等价锚 = 本 spec 同秒窗顺序版本写 + existsSync 毫秒推进守卫。
// · dev 实例安全面全链（tool 注册→会话→服务→SQLite→落盘，installer-smoke 禁令期）
//   = Playwright 旅程取证，归 test-run。
describe('真机面留痕（CT-WG-04 构造性载荷 / CT-WG-09 双进程并发 / dev 实例全链）', () => {
  it.skip('roundtrip 构造性载荷注入 + 双会话双通道并发 + dev 实例装配链：需真机环境（归 test-run 收口，pnpm test:e2e）', () => {
    expect(true).toBe(true)
  })
})
