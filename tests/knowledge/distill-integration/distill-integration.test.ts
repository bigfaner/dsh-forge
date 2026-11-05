// @feature:knowledge
// Journey: distill-integration（proposal knowledge-stage2-write-gateway §2.6——重复候选→自动归并→redirect+台账→驳回回滚）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage2-write-gateway/testing/contracts/contract-distill-integration.md
//   （CT-DI-01..12 ← journey DI-G1..G7 / DI-E1..E8）。
// 策略：distill 整合执行循环 = agent 技能面（packages/plugins/knowledge/skills/distill/SKILL.md，
// 随包交付——提案 §2.6），循环消费的确定性基元承载于真实服务面（fix 6ca979cf——
// 归并执行四件套经 service/supersede.ts 落码：正本回写 merged_into / 台账 actor=agent /
// 驳回逆向 reinstateEntry / 写前 content_hash 校验中止；CT-DI-02 证据 = 真实实现能力，
// 非夹具直写合成）。候选发现 findMergeSuggestions、redirect rank 派生、confirm CAS、
// rebuild 再生白名单同为本套断言锚。编排语义面（报告四计数、批量部分失败编排）
// = 真机限定面，末尾 skip 留痕归 test-run。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFm } from '../journey-fm.js'
import type { DiagEventPayload } from '../../../packages/contracts/src/index.js'
import { startSelfHostedStorage } from '../../../packages/plugins/knowledge/src/storage/start.js'
import { rebuildKnowledgeIndex } from '../../../packages/plugins/knowledge/src/storage/rebuild.js'
import { createKnowledgeService, findMergeSuggestions } from '../../../packages/plugins/knowledge/src/service/index.js'
import { createWsPathResolver } from '../../../packages/plugins/knowledge/src/tools/session.js'
import type { KnowledgeWriteQuery } from '../../../packages/plugins/knowledge/src/service/index.js'

// ── 夹具 ──

const roots: string[] = []
function tmpRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), `knowledge-j-di-${tag}-`))
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
  const projectId = `p-di-${tag}`
  const service = createKnowledgeService({ db: storage.db, resolveWsPath: createWsPathResolver([{ wsPath: ws, projectId }]), emit })
  return { knowledgeDir, projectId, storage, service, events, db: storage.db }
}

function writeQ(partial: Partial<KnowledgeWriteQuery> = {}): KnowledgeWriteQuery {
  return {
    projectId: 'p-PLACEHOLDER',
    title: 'Integration Corpus Doc',
    summary: '整合语料摘要',
    keywords: ['corpus'],
    body: '# 内容\n\n整合循环消费。',
    necessity: { stable: true, nonTrivial: true, value: true },
    ...partial,
  }
}

const purgeEvents = (events: readonly DiagEventPayload[]): DiagEventPayload[] => events.filter((e) => e.event === 'knowledge-entry-purge')
const mergeEvents = (events: readonly DiagEventPayload[]): DiagEventPayload[] => events.filter((e) => e.event === 'knowledge-merge')

const nRows = (w: World, table: string, where = ''): number =>
  w.db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get()?.n ?? 0

const entryRow = (w: World, id: string) =>
  w.db.prepare<[string], { id: string; status: string; effective_rank: number; merged_into: string | null }>(
    `SELECT id, status, effective_rank, merged_into FROM knowledge_entries WHERE id = ?`,
  ).get(id)

/** distill 归并执行（真实服务面——service/merge.ts 四件套；expectedHash 模拟评估期快照） */
async function applyMerge(
  w: World,
  winnerId: string,
  loserId: string,
  reason: string,
  expectedHash?: string,
): Promise<ReturnType<World['service']['supersedeEntry']>> {
  return w.service.supersedeEntry({
    projectId: w.projectId,
    winnerId,
    loserId,
    reason,
    ...(expectedHash !== undefined ? { expectedLoserHash: expectedHash } : {}),
  })
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

// ── CT-DI-01 候选发现（溯源 DI-G2） ──

describe('CT-DI-01 distill 候选发现：三类候选源（DI-G2）', () => {
  it('O1 清单覆盖同义异名（title-norm）/ FTS 近似 / Jaccard 缩围——逐项有判定基标签', async () => {
    const w = makeWorld('g2')
    // 基准条目 D
    const d = await w.service.write(writeQ({ projectId: w.projectId, title: 'Deploy Baseline Policy', keywords: ['ship', 'gate'] }))
    if (d.outcome !== 'written') throw new Error('D 未写入')
    // ① title_norm 精确（同义异名归一重复）
    const exact = findMergeSuggestions(w.db, { title: 'deploy baseline  POLICY', keywords: ['unrelated'] })
    expect(exact.some((s) => s.id === d.id && s.basis === 'title-norm')).toBe(true) // CT-DI-01 O1
    // ② FTS 近似（title 词面重叠，归一分 ≥0.8）
    const approx = findMergeSuggestions(w.db, { title: 'Deploy Baseline Extended Notes', keywords: ['unrelated'] })
    expect(approx.some((s) => s.id === d.id && s.basis === 'fts-approx')).toBe(true) // CT-DI-01 O1
    // ③ keywords Jaccard 缩围（不同 title 同受控词表）
    const jac = findMergeSuggestions(w.db, { title: 'Totally Different Subject Name', keywords: ['ship', 'gate'] })
    expect(jac.some((s) => s.id === d.id && s.basis === 'jaccard')).toBe(true) // CT-DI-01 O1
    w.storage.close()
  })
})

// ── CT-DI-02 归并执行形态（溯源 DI-G3，裁决 #8——真实服务面 supersedeEntry） ──

describe('CT-DI-02 归并执行：winner 新版本 + loser redirect + 台账 actor=agent（DI-G3，裁决 #8）', () => {
  it('O1 成功：winner version_of 产融合新版本（真实 write 路径）+ loser 文件保留写 merged_into + rank 0.2 沉底 + 台账留行', async () => {
    const w = makeWorld('g3')
    const winner = await w.service.write(writeQ({ projectId: w.projectId, title: 'Canonical Winner Doc', keywords: ['winner'] }))
    if (winner.outcome !== 'written') throw new Error('W 未写入')
    await w.service.confirm({ projectId: w.projectId, id: winner.id })
    const loser = await w.service.write(writeQ({ projectId: w.projectId, title: 'Synonym Loser Doc', keywords: ['loser'] }))
    if (loser.outcome !== 'written') throw new Error('L 未写入')
    await w.service.confirm({ projectId: w.projectId, id: loser.id })
    // distill 执行形态组装（SKILL ②）：winner 融合正文新版本走真实 write 版本化
    const fused = await w.service.write(writeQ({
      projectId: w.projectId,
      title: 'Canonical Winner Doc',
      keywords: ['winner'],
      versionOf: winner.id,
      body: '# 融合正文\n\n含 Synonym Loser Doc 有效信息。',
    }))
    if (fused.outcome !== 'written') throw new Error('融合版未写入')
    expect(fused.id).toBe(winner.id) // 同 id 版本化（supersedes 链前进）
    expect(fused.supersedes).toBe(winner.versionTs)
    // 归并执行 = 真实服务面（评估期 hash 快照随调用传入——INV-F 写前校验径）
    const merged = await applyMerge(w, winner.id, loser.id, '同义异名重复对：agent 归并', sha256(readFileSync(loser.filePath, 'utf8')))
    expect(merged).toMatchObject({ outcome: 'merged', winnerId: winner.id, loserId: loser.id, demotedFromConfirmed: true }) // CT-DI-02 O1：服务回执
    // 四锚逐项成立（CT-DI-02 O1）
    expect(existsSync(loser.filePath)).toBe(true) // loser 文件保留（零删除可逆——INV-C）
    expect(parseFm(readFileSync(loser.filePath, 'utf8')).data.merged_into).toBe(winner.id) // frontmatter redirect（生产写径；字段名 merged_into 钉死不改——followups #1 用户裁决 2026-11-05：与版本链 supersedes 异名消歧）
    const lRow = entryRow(w, loser.id)
    expect(lRow?.merged_into).toBe(winner.id) // DB 再生投影
    expect(lRow?.status).toBe('superseded') // 曾 confirmed 同笔降档——终态无 confirmed+redirect 并存（INV-D）
    expect(lRow?.effective_rank).toBe(0.2) // redirect 沉底最高优先档（merged_into 压过 confirmed）
    expect(nRows(w, 'knowledge_supersede_ledger', `WHERE winner_id = '${winner.id}' AND loser_id = '${loser.id}' AND actor = 'agent'`)).toBe(1) // 台账留行（生产写径）
    expect(mergeEvents(w.events).some((e) => e.level === 'info' && e.message.includes(loser.id))).toBe(true) // 归并成功埋点
    w.storage.close()
  })

  // fix-评审2（spec P3）：跨项目归并校验——winner/loser 须同属 projectId
  it('O2 跨项目拒：winner 版本文件落它项目 knowledge_dir → cas-failed/cross-project，零变更零台账', async () => {
    const w = makeWorld('xp')
    const loser = await w.service.write(writeQ({ projectId: w.projectId, title: 'Cross Project Loser', keywords: ['xpl'] }))
    if (loser.outcome !== 'written') throw new Error('L 未写入')
    // 同库第二项目（独立 knowledge_dir）：winner 落在另一项目域
    const root = tmpRoot('xp2')
    const ws2 = join(root, 'ws2')
    const dir2 = join(ws2, '.knowledge')
    mkdirSync(dir2, { recursive: true })
    w.storage.registry.upsert(ws2, dir2)
    const projectId2 = 'p-di-xp2'
    const service2 = createKnowledgeService({ db: w.storage.db, resolveWsPath: createWsPathResolver([{ wsPath: ws2, projectId: projectId2 }]) })
    const winner2 = await service2.write(writeQ({ projectId: projectId2, title: 'Cross Project Winner', keywords: ['xpw'] }))
    if (winner2.outcome !== 'written') throw new Error('W2 未写入')
    const r = await applyMerge(w, winner2.id, loser.id, '跨项目归并')
    expect(r).toMatchObject({ outcome: 'cas-failed', loserId: loser.id, reason: 'cross-project' }) // CT-DI-02 O2
    expect(entryRow(w, loser.id)?.merged_into ?? null).toBeNull() // 零变更
    expect(nRows(w, 'knowledge_supersede_ledger', `WHERE loser_id = '${loser.id}'`)).toBe(0) // 零台账行
    w.storage.close()
  })
})

// ── CT-DI-03 归并：hash 失配中止（溯源 DI-E1——真实服务面） ──

describe('CT-DI-03 归并：hash 失配中止（DI-E1，INV-F）', () => {
  it('O1 中止 + O2 不牵连：失配项零变更零台账；同批其余项照常终态', async () => {
    const w = makeWorld('e1')
    const winnerA = await w.service.write(writeQ({ projectId: w.projectId, title: 'Hash Guard Winner', keywords: ['hg'] }))
    if (winnerA.outcome !== 'written') throw new Error('WA 未写入')
    const stale = await w.service.write(writeQ({ projectId: w.projectId, title: 'Stale Candidate Doc', keywords: ['stale'] }))
    if (stale.outcome !== 'written') throw new Error('S 未写入')
    const winnerB = await w.service.write(writeQ({ projectId: w.projectId, title: 'Fresh Pair Winner', keywords: ['fp'] }))
    if (winnerB.outcome !== 'written') throw new Error('WB 未写入')
    const fresh = await w.service.write(writeQ({ projectId: w.projectId, title: 'Fresh Pair Loser', keywords: ['fp'] }))
    if (fresh.outcome !== 'written') throw new Error('FL 未写入')
    // 评估期快照后、执行写前——手改 S 正本（模拟评估期间外部改动）
    const staleBefore = readFileSync(stale.filePath, 'utf8')
    const snapshot = sha256(staleBefore)
    writeFileSync(stale.filePath, `${staleBefore}\n<!-- 手改 -->`, 'utf8')
    const aborted = await applyMerge(w, winnerA.id, stale.id, '陈旧归并', snapshot)
    expect(aborted).toMatchObject({ outcome: 'aborted', reason: 'hash-mismatch' }) // CT-DI-03 O1：中止回执
    expect(entryRow(w, stale.id)?.merged_into ?? null).toBeNull() // L 零变更（无 merged_into 写入）
    expect(parseFm(readFileSync(stale.filePath, 'utf8')).data.merged_into).toBeUndefined()
    expect(nRows(w, 'knowledge_supersede_ledger', `WHERE loser_id = '${stale.id}'`)).toBe(0) // 无台账行
    expect(mergeEvents(w.events).some((e) => e.level === 'warn' && e.message.includes('中止'))).toBe(true) // 中止埋点
    // 同批其余项照常终态（不牵连）
    const ok = await applyMerge(w, winnerB.id, fresh.id, '同批健康项')
    expect(ok).toMatchObject({ outcome: 'merged', loserId: fresh.id }) // CT-DI-03 O2
    expect(entryRow(w, fresh.id)?.merged_into).toBe(winnerB.id)
    w.storage.close()
  })
})

// ── CT-DI-04 归并与 confirm 交错 CAS（溯源 DI-E2，裁决 #9） ──

describe('CT-DI-04 归并与 confirm 交错 CAS（DI-E2，裁决 #9）', () => {
  it('O2 归并先到：confirm 被 CAS 拒（merged_into≠空）+ 终态无 confirmed+redirect 并存（INV-D）', async () => {
    const w = makeWorld('e2')
    const x = await w.service.write(writeQ({ projectId: w.projectId, title: 'Cas Interleave Doc', keywords: ['cas'] }))
    if (x.outcome !== 'written') throw new Error('X 未写入')
    // 归并先到（真实服务面）：X 被 redirect
    const merged = await applyMerge(w, 'canonical-doc', x.id, '交错场景归并')
    expect(merged).toMatchObject({ outcome: 'cas-failed', loserId: x.id }) // winner 未命中 → cas-failed（同批该项中止）
    // 换合法 winner 重执行归并
    const winner = await w.service.write(writeQ({ projectId: w.projectId, title: 'Cas Winner Doc', keywords: ['casw'] }))
    if (winner.outcome !== 'written') throw new Error('W 未写入')
    const m2 = await applyMerge(w, winner.id, x.id, '交错场景归并')
    expect(m2).toMatchObject({ outcome: 'merged' })
    const r = await w.service.confirm({ projectId: w.projectId, id: x.id })
    expect(r).toMatchObject({ outcome: 'cas-failed', reason: 'merged' }) // CT-DI-04 O2：后到者失败回执
    const both = w.db.prepare<unknown[], { n: number }>(
      `SELECT COUNT(*) AS n FROM knowledge_entries WHERE status = 'confirmed' AND merged_into IS NOT NULL AND merged_into != ''`,
    ).get()?.n
    expect(both).toBe(0) // INV-D 终态断言
    // 重复归并亦被 CAS 拒（merged_into 已在场）
    const again = await applyMerge(w, winner.id, x.id, '重复归并')
    expect(again).toMatchObject({ outcome: 'cas-failed', reason: 'merged' }) // CAS 前置
    w.storage.close()
    // O1（confirm 先到 → 归并执行被 CAS 拒）= distill 技能侧前置检查（agent 面），
    // vitest 等价锚 = confirm 升格后条目 status=confirmed（归并评估在真实正本上可见）
    // ——真机留痕见末尾。
  })
})

// ── CT-DI-05 redirect 沉底可见性（溯源 DI-G4） ──

describe('CT-DI-05 search：redirect 沉底（DI-G4）', () => {
  it('O1 沉底：loser effective_rank=0.2 实查；winner 命中正常 rank', async () => {
    const w = makeWorld('g4')
    const winner = await w.service.write(writeQ({ projectId: w.projectId, title: 'Authority Search Doc', keywords: ['wkey'] }))
    if (winner.outcome !== 'written') throw new Error('W 未写入')
    await w.service.confirm({ projectId: w.projectId, id: winner.id })
    const loser = await w.service.write(writeQ({ projectId: w.projectId, title: 'Redirect Search Doc', keywords: ['lkey'] }))
    if (loser.outcome !== 'written') throw new Error('L 未写入')
    await w.service.confirm({ projectId: w.projectId, id: loser.id })
    const merged = await applyMerge(w, winner.id, loser.id, '沉底可见性场景')
    expect(merged).toMatchObject({ outcome: 'merged' })
    expect(entryRow(w, loser.id)?.effective_rank).toBe(0.2) // CT-DI-05 O1：rank 实查 0.2
    const hits = await w.service.search({ projectId: w.projectId, keywords: ['wkey'] })
    const wHit = hits.find((h) => h.frontmatterId === winner.id)
    expect(wHit).toBeDefined() // W 正常命中
    expect(wHit?.effectiveRank).toBe(1.0)
    w.storage.close()
  })
})

// ── CT-DI-06 驳回回滚（溯源 DI-G5，裁决 #8——真实服务面 reinstateEntry） ──

describe('CT-DI-06 驳回回滚：解除 redirect 恢复检索地位（DI-G5，裁决 #8）', () => {
  it('O1 回滚成功：merged_into 清空 + rank 回自身 status 档 + winner 正文不回退 + 台账逆向行 actor=human', async () => {
    const w = makeWorld('g5')
    const winner = await w.service.write(writeQ({ projectId: w.projectId, title: 'Revert Winner Doc', keywords: ['rvw'] }))
    if (winner.outcome !== 'written') throw new Error('W 未写入')
    const loser = await w.service.write(writeQ({ projectId: w.projectId, title: 'Revert Loser Doc', keywords: ['rvl'] }))
    if (loser.outcome !== 'written') throw new Error('L 未写入')
    await w.service.confirm({ projectId: w.projectId, id: loser.id })
    // 融合新版本（winner 正文演进）+ 归并
    const fused = await w.service.write(writeQ({ projectId: w.projectId, title: 'Revert Winner Doc', keywords: ['rvw'], versionOf: winner.id, body: '# 融合后正文' }))
    if (fused.outcome !== 'written') throw new Error('融合版未写入')
    const merged = await applyMerge(w, winner.id, loser.id, '待驳回归并')
    expect(merged).toMatchObject({ outcome: 'merged', demotedFromConfirmed: true })
    const winnerBodyBefore = readFileSync(fused.filePath, 'utf8')
    // 人工经台账逆向（真实服务面）
    const reverted = await w.service.reinstateEntry({ projectId: w.projectId, loserId: loser.id, reason: '人工复核：非重复对' })
    expect(reverted).toMatchObject({ outcome: 'reverted', loserId: loser.id, winnerId: winner.id, restoredStatus: 'confirmed' }) // CT-DI-06 O1
    const lRow = entryRow(w, loser.id)
    expect(lRow?.merged_into ?? null).toBeNull() // redirect 解除
    expect(lRow?.status).toBe('confirmed') // 曾审标记在场 → 恢复自身 confirmed 档
    expect(lRow?.effective_rank).toBe(1.0) // rank 按自身 status 重算（非 0.2 redirect 档）
    expect(parseFm(readFileSync(loser.filePath, 'utf8')).data.merged_into).toBeUndefined() // 正本同步解除
    expect(readFileSync(fused.filePath, 'utf8')).toBe(winnerBodyBefore) // W 融合正文 diff 为空（不回退）
    expect(nRows(w, 'knowledge_supersede_ledger', `WHERE loser_id = '${loser.id}' AND actor = 'human'`)).toBe(1) // 逆向台账行
    // O3 回滚后再判定：L 可再次入候选再归并（不产生永久免疫，往返逐行可审计）
    const remerged = await applyMerge(w, winner.id, loser.id, '复审后再归并')
    expect(remerged).toMatchObject({ outcome: 'merged' }) // CT-DI-06 O3
    expect(nRows(w, 'knowledge_supersede_ledger', `WHERE loser_id = '${loser.id}' AND actor = 'agent'`)).toBe(2) // 逐行可审计
    w.storage.close()
  })

  it('O2 台账行缺失：拒绝逆向，状态零变更（不可凭空回滚）', async () => {
    const w = makeWorld('g5b')
    const winner = await w.service.write(writeQ({ projectId: w.projectId, title: 'No Ledger Winner', keywords: ['nlw'] }))
    if (winner.outcome !== 'written') throw new Error('W 未写入')
    const loser = await w.service.write(writeQ({ projectId: w.projectId, title: 'No Ledger Loser', keywords: ['nll'] }))
    if (loser.outcome !== 'written') throw new Error('L 未写入')
    expect(await applyMerge(w, winner.id, loser.id, '将清账归并')).toMatchObject({ outcome: 'merged' })
    w.db.prepare(`DELETE FROM knowledge_supersede_ledger`).run() // 夹具侧清账（模拟台账行缺失）
    const rejected = await w.service.reinstateEntry({ projectId: w.projectId, loserId: loser.id, reason: '无账可溯' })
    expect(rejected).toMatchObject({ outcome: 'rejected', reason: 'ledger-missing' }) // CT-DI-06 O2
    expect(entryRow(w, loser.id)?.merged_into).toBe(winner.id) // 状态零变更
    expect(nRows(w, 'knowledge_supersede_ledger')).toBe(0) // 零新行
    w.storage.close()
  })

  // fix-评审2 Minor：逆向 hash 失配回执与 merge 侧对称（aborted/hash-mismatch）
  it('O4 逆向 hash 失配：aborted/hash-mismatch 中止（与正向对称口径），状态零变更', async () => {
    const w = makeWorld('g5c')
    const winner = await w.service.write(writeQ({ projectId: w.projectId, title: 'Revert Hash Winner', keywords: ['rhw'] }))
    if (winner.outcome !== 'written') throw new Error('W 未写入')
    const loser = await w.service.write(writeQ({ projectId: w.projectId, title: 'Revert Hash Loser', keywords: ['rhl'] }))
    if (loser.outcome !== 'written') throw new Error('L 未写入')
    expect(await applyMerge(w, winner.id, loser.id, '待逆向')).toMatchObject({ outcome: 'merged' })
    const before = readFileSync(loser.filePath, 'utf8')
    const snapshot = sha256(before)
    writeFileSync(loser.filePath, `${before}\n<!-- 手改 -->`, 'utf8') // 评估后写前手改
    const aborted = await w.service.reinstateEntry({ projectId: w.projectId, loserId: loser.id, expectedLoserHash: snapshot, reason: '陈旧逆向' })
    expect(aborted).toMatchObject({ outcome: 'aborted', reason: 'hash-mismatch' }) // CT-DI-06 O4：对称口径
    expect(entryRow(w, loser.id)?.merged_into).toBe(winner.id) // 状态零变更
    expect(nRows(w, 'knowledge_supersede_ledger', `WHERE loser_id = '${loser.id}' AND actor = 'human'`)).toBe(0) // 零逆向行
    w.storage.close()
  })
})

// ── CT-DI-07 loser 手删（溯源 DI-E3，裁决 #10） ──

describe('CT-DI-07 loser 手删：文件亡记录亡 + 台账可溯（DI-E3，裁决 #10）', () => {
  it('O1 同删 + warn 埋点 + MERGE_LEDGER 行保留（三断言独立成立）', async () => {
    const w = makeWorld('e3')
    const winner = await w.service.write(writeQ({ projectId: w.projectId, title: 'Ledger Keeper Doc', keywords: ['keep'] }))
    if (winner.outcome !== 'written') throw new Error('W 未写入')
    const loser = await w.service.write(writeQ({ projectId: w.projectId, title: 'Vanishing Loser Doc', keywords: ['vanish'] }))
    if (loser.outcome !== 'written') throw new Error('L 未写入')
    await w.service.confirm({ projectId: w.projectId, id: loser.id }) // Preconditions：CT-DI-02 完成态（曾审）
    expect(await applyMerge(w, winner.id, loser.id, '手删前归并')).toMatchObject({ outcome: 'merged' })
    rmSync(loser.filePath) // 磁盘直删（真实文件系统夹具）
    await w.service.rebuildIndex(w.projectId) // 触发同步检查（对账删除——CT-DI-07 Input）
    const after = await w.service.search({ projectId: w.projectId, keywords: ['keep'] })
    expect(Array.isArray(after)).toBe(true) // 无读取失败路径
    // 断言①：DB 记录同删（版本行/redirect 标记/唯一版本 entries 行）——零残留
    expect(entryRow(w, loser.id)).toBeUndefined()
    expect(nRows(w, 'knowledge_entry_versions', `WHERE id = '${loser.id}'`)).toBe(0)
    // 断言②：warn 级 knowledge-entry-purge（loser 曾 confirmed——已审面意外缺失）
    expect(purgeEvents(w.events).some((e) => e.level === 'warn' && e.message.includes(loser.id))).toBe(true)
    // 断言③：MERGE_LEDGER 行保留（「为什么两个名字一个条目」仍可答）
    expect(nRows(w, 'knowledge_supersede_ledger', `WHERE loser_id = '${loser.id}'`)).toBe(1)
    w.storage.close()
  })
})

// ── CT-DI-08 rebuild：redirect 再生与白名单（溯源 DI-E4） ──

describe('CT-DI-08 rebuild：redirect 再生与业务账白名单（DI-E4）', () => {
  it('O1 再生无损：DELETE 缓存表 + rebuild——merged_into 从 frontmatter 再生 + 缓存语义无损 + 两业务账行数不变', async () => {
    const w = makeWorld('e4')
    const winner = await w.service.write(writeQ({ projectId: w.projectId, title: 'Rebuild Regen Doc', keywords: ['regen'] }))
    if (winner.outcome !== 'written') throw new Error('W 未写入')
    await w.service.confirm({ projectId: w.projectId, id: winner.id })
    const loser = await w.service.write(writeQ({ projectId: w.projectId, title: 'Rebuild Redirect Doc', keywords: ['regen2'] }))
    if (loser.outcome !== 'written') throw new Error('L 未写入')
    await w.service.confirm({ projectId: w.projectId, id: loser.id })
    expect(await applyMerge(w, winner.id, loser.id, '再生场景归并')).toMatchObject({ outcome: 'merged' })
    await w.service.search({ projectId: w.projectId, keywords: ['regen'] }) // 召回账产生非零行
    // 重建前快照（语义级：entries/versions/rank + 业务账行数 n1/n2）
    const beforeEntries = w.db.prepare<unknown[], { id: string; status: string; effective_rank: number; merged_into: string | null }>(
      `SELECT id, status, effective_rank, merged_into FROM knowledge_entries ORDER BY id`,
    ).all()
    const beforeVersions = nRows(w, 'knowledge_entry_versions')
    const n1 = nRows(w, 'knowledge_supersede_ledger')
    const n2 = nRows(w, 'knowledge_recall_logs')
    expect(n2).toBeGreaterThan(0)
    // DELETE 两缓存表 + FTS（白名单作用域）+ rebuild
    w.db.prepare(`DELETE FROM knowledge_fts`).run()
    w.db.prepare(`DELETE FROM knowledge_entry_versions`).run()
    w.db.prepare(`DELETE FROM knowledge_entries`).run()
    rebuildKnowledgeIndex(w.db, {})
    // CT-DI-08 O1：redirect 再生 + 缓存 diff 为空（语义级）+ 业务账行数不变
    const afterEntries = w.db.prepare<unknown[], { id: string; status: string; effective_rank: number; merged_into: string | null }>(
      `SELECT id, status, effective_rank, merged_into FROM knowledge_entries ORDER BY id`,
    ).all()
    expect(afterEntries).toEqual(beforeEntries) // 语义无损（含 L 的 merged_into/0.2 再生）
    expect(nRows(w, 'knowledge_entry_versions')).toBe(beforeVersions)
    expect(nRows(w, 'knowledge_supersede_ledger')).toBe(n1) // INV-E：业务账零波及
    expect(nRows(w, 'knowledge_recall_logs')).toBe(n2) // INV-E
    w.storage.close()
  })
})

// ── CT-DI-09 版本对不当归并（溯源 DI-E6） ──

describe('CT-DI-09 版本对不当归并路由（DI-E6）', () => {
  it('O1 路由正确：同 id supersedes 链版本化复用——不挂 candidate_of、不写 merged_into、查重排除自身', async () => {
    const w = makeWorld('e6')
    const v1 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Version Pair Doc', keywords: ['vp'] }))
    if (v1.outcome !== 'written') throw new Error('v1 未写入')
    const v2 = await w.service.write(writeQ({ projectId: w.projectId, title: 'Version Pair Doc', keywords: ['vp'], versionOf: v1.id }))
    expect(v2.outcome).toBe('written')
    if (v2.outcome !== 'written') return
    expect(v2.candidateOf).toBeUndefined() // 版本化不挂起
    expect(v2.supersedes).toBe(v1.versionTs) // 收敛走版本化（同 id 链前进）
    // 全库无 merged_into 写入（版本化路径零 redirect）
    expect(nRows(w, 'knowledge_entries', `WHERE merged_into IS NOT NULL AND merged_into != ''`)).toBe(0)
    // 查重通道排除 versionOf 自身（同 title 精确命中也不给自身建议）
    const self = findMergeSuggestions(w.db, { title: 'Version Pair Doc', keywords: ['vp'], excludeId: v1.id })
    expect(self.filter((s) => s.id === v1.id)).toHaveLength(0)
    w.storage.close()
  })
})

// ── 真机限定面（distill 执行循环 = agent 技能面；vitest 层不承载，归 test-run 收口） ──
// · CT-DI-04 O1（confirm 先到 → 归并侧 CAS 拒）：归并侧前置检查在技能执行序内。
// · CT-DI-10（多版本收敛/压缩重写执行）/ CT-DI-11（批量部分失败编排 + 报告计数对账）/
//   CT-DI-12（空库报告四计数）：整合循环编排与报告产出 = 技能收尾面；vitest 等价锚 =
//   版本化 write 路径（CT-WG-02/CT-DI-02）、hash 中止与不牵连（CT-DI-03）与
//   候选发现（CT-DI-01）。
describe('真机面留痕（distill 执行循环：CAS 先到序 / 收敛重写 / 报告计数 / 空库）', () => {
  it.skip('distill 技能四步整合循环（候选→评估→执行→报告）端到端：需真机 agent 装载 skills/distill（归 test-run 收口）', () => {
    expect(true).toBe(true)
  })
})
