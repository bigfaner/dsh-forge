// bugs 域 recurrence 面（plugin-project 1.11 归拢——code-design §5；算法自 core
// small-domains/bugs.ts 逐字承袭，零语义改动）。纯函数零 IO——SQL 归 repositories：
// · parseBugRef：bug_id 弱引用格式校验（非法 → null 不抛——弱引用降级配方）；
// · projectBug：BugRow → BugCard 投影降级（NULL 列键缺席；source_task_id/container_slug
//   缺席留空——两表制无 tasks 表，登记径反查缺席即列留空，standalone 同语义）；
// · 链算法：前驱回溯 + 后继收齐全链投影（getBug 行为保持）、fullEdgeCount 最长祖先径
//   全边计数（fixed/unresolved 段也计，分叉兄弟径不计）、hasOpen 链级分量、
//   container_slug 列直比候选归属（链任一成员落本缝即整链入选——双向语义）；
// · parseBugCoverageDeclaration：T4 覆盖声明协议行解析（前缀常量单源 = lib/api dto/bugs）；
// · parseTaskContainerSlug：退役兼容层——harness `t-` 形制纯函数边界保留。
import type { BugCard, BugChainContext, BugRecurrenceScope, GetBugResponse } from '@dsh-forge/lib-api/dto/bugs'
import type { BugRecurrenceCandidate } from '@dsh-forge/lib-api/dto/forge'
import { BUG_COVERAGE_ANCHOR_PREFIX, BUG_COVERAGE_DECLARATION_PREFIX } from '@dsh-forge/lib-api/dto/bugs'
import { BugNotFoundError } from './errors.js'
import type { BugRow } from '../db/row-types.js'

// ── bug_id 弱引用格式校验（journey J3 I3：非法引用拒绝登记；解析非法 → null 不抛）──

/** bug_id 形制（生产 = randomUUID 小写；大小写不敏感接受） */
const BUG_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * bug_id 弱引用解析：格式合法返回 trim 后原值，非法/缺席返回 null（不抛——弱引用：
 * 校验拒绝决策归调用方，本函数只给格式判定）。
 */
export function parseBugRef(s: string | undefined): string | null {
  const t = (s ?? '').trim()
  return BUG_ID_RE.test(t) ? t : null
}

// ── 投影降级（BugRow → BugCard）──

/**
 * BugRow → BugCard 投影（NULL 列条件展开 = 键缺席——lossless JSON 合规；
 * source_task_id/container_slug 缺席留空 = 键缺席，tool 返回面同口径）。
 */
export function projectBug(row: BugRow): BugCard {
  return {
    bugId: row.id,
    summary: row.summary,
    bugDesc: row.bugDesc,
    triggerDesc: row.triggerDesc,
    expected: row.expected,
    actual: row.actual,
    ...(row.suspected !== null ? { suspected: row.suspected } : {}),
    ...(row.errorType !== null ? { errorType: row.errorType } : {}),
    bugStatus: row.bugStatus,
    ...(row.commitHash !== null ? { commitHash: row.commitHash } : {}),
    ...(row.worktree !== null ? { worktree: row.worktree } : {}),
    ...(row.branch !== null ? { branch: row.branch } : {}),
    ...(row.unresolvedReason !== null ? { unresolvedReason: row.unresolvedReason } : {}),
    ...(row.fixApproach !== null ? { fixApproach: row.fixApproach } : {}),
    ...(row.sourceTaskId !== null ? { sourceTaskId: row.sourceTaskId } : {}),
    ...(row.reportSessionId !== null ? { reportSessionId: row.reportSessionId } : {}),
    ...(row.fixSessionId !== null ? { fixSessionId: row.fixSessionId } : {}),
    reporter: row.reporter,
    ...(row.fixer !== null ? { fixer: row.fixer } : {}),
    ...(row.recurrenceOf !== null ? { recurrenceOf: row.recurrenceOf } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ── 链算法（getBug 投影 + findRecurrenceCandidates 计数双口径）──

/** 链成员映射（前驱回溯至链根 + 后继正向收齐——getBug 同口径提取；孤条不入） */
export function recurrenceChainsOf(rows: readonly BugRow[]): Map<string, string[]> {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const childrenByParent = new Map<string, string[]>()
  for (const r of rows) {
    if (r.recurrenceOf === null) continue
    const bucket = childrenByParent.get(r.recurrenceOf) ?? []
    bucket.push(r.id)
    childrenByParent.set(r.recurrenceOf, bucket)
  }
  const chains = new Map<string, string[]>()
  for (const r of rows) {
    const chainIds: string[] = []
    for (let cursor: BugRow | undefined = r; cursor !== undefined; ) {
      chainIds.unshift(cursor.id) // 反向回溯——链根推到队首
      cursor = cursor.recurrenceOf !== null ? byId.get(cursor.recurrenceOf) : undefined
    }
    for (let frontier = childrenByParent.get(chainIds[chainIds.length - 1]!) ?? []; frontier.length > 0; ) {
      chainIds.push(...frontier)
      frontier = frontier.flatMap((id) => childrenByParent.get(id) ?? [])
    }
    const unique = [...new Set(chainIds)]
    if (unique.length > 1) chains.set(r.id, unique)
  }
  return chains
}

/** 本条最长祖先径全边数（前驱链逐级计数——fixed/unresolved 段也计，分叉兄弟径不计） */
export function fullEdgeCountOf(rows: readonly BugRow[], id: string): number {
  const byId = new Map(rows.map((r) => [r.id, r]))
  let depth = 0
  let cursor = byId.get(byId.get(id)?.recurrenceOf ?? '')
  while (cursor !== undefined) {
    depth += 1
    cursor = byId.get(cursor.recurrenceOf ?? '')
  }
  return depth
}

/**
 * getBug 全卡 + 链上下文（行为保持承袭）：沿前驱指针反向回溯至链根，再沿引用正向收齐
 * 后继，entries 时间正序（链根在前）；孤条（无前驱无后继）chain 缺席。bugId 未命中抛
 * ERR_BUG_NOT_FOUND。
 */
export function buildBugChainContext(
  rows: readonly BugRow[],
  q: { readonly projectId: string; readonly bugId: string },
): GetBugResponse {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const current = byId.get(q.bugId)
  if (current === undefined) {
    throw new BugNotFoundError({ projectId: q.projectId, bugId: q.bugId })
  }
  const chainIds: string[] = []
  for (let cursor: BugRow | undefined = current; cursor !== undefined; ) {
    chainIds.unshift(cursor.id) // 反向回溯——链根推到队首
    cursor = cursor.recurrenceOf !== null ? byId.get(cursor.recurrenceOf) : undefined
  }
  const childrenByParent = new Map<string, string[]>()
  for (const r of rows) {
    if (r.recurrenceOf === null) continue
    const bucket = childrenByParent.get(r.recurrenceOf) ?? []
    bucket.push(r.id)
    childrenByParent.set(r.recurrenceOf, bucket)
  }
  for (let frontier = childrenByParent.get(chainIds[chainIds.length - 1]!) ?? []; frontier.length > 0; ) {
    chainIds.push(...frontier)
    frontier = frontier.flatMap((id) => childrenByParent.get(id) ?? [])
  }
  const unique = [...new Set(chainIds)]
  if (unique.length <= 1) {
    return { card: projectBug(current) } // 孤条不入投影
  }
  const entries = unique
    .map((id) => byId.get(id)!)
    .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1))
    .map(projectBug)
  const chain: BugChainContext = {
    entries,
    currentIndex: unique.indexOf(q.bugId),
    length: entries.length,
    rootBugId: unique[0]!,
  }
  return { card: projectBug(current), chain }
}

/**
 * 台账 recurrence 候选只读聚合（recurrence-signal-tiering 口径逐字承袭）：
 * ① 归属过滤——链内任一成员 container_slug 列值 = scope 容器锚（project.db 直比口径——
 *   两表制无 tasks 表，source_task_id 反查径退役；列精确相等，双向语义：链任一成员落本缝
 *   即整链入选）；
 * ② 终态过滤移除——全 fixed 链也产出候选（软动作全史视野），「链内有 open」以 hasOpen
 *   分量交消费侧裁决；
 * ③ 计数语义——fullEdgeCount = 本条沿 recurrence_of 前驱回溯的最长祖先径全边数；
 *   chain 保持呈现口径（getBug 同构全链），两口径分离。
 */
export function findRecurrenceCandidatesOf(
  rows: readonly BugRow[],
  scope: BugRecurrenceScope,
): readonly BugRecurrenceCandidate[] {
  const chains = recurrenceChainsOf(rows)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const files = scope.files.map((f) => f.trim()).filter((f) => f !== '')
  const candidates: BugRecurrenceCandidate[] = []
  for (const [bugId, chain] of chains) {
    const members = chain
      .map((id) => byId.get(id))
      .filter((m): m is BugRow => m !== undefined)
    // ① 归属过滤：链内任一成员 container_slug 列值与 scope 容器锚精确相等（双向语义）
    if (!members.some((m) => m.containerSlug === scope.slug)) continue
    const row = byId.get(bugId)
    if (row === undefined) continue
    if (files.length > 0) {
      const suspected = row.suspected ?? ''
      if (!files.some((f) => suspected.includes(f))) continue
    }
    // ② hasOpen 独立分量（终态过滤已移除——全 fixed 链照产候选，硬动作判据归消费侧）
    const hasOpen = members.some((m) => m.bugStatus === 'open')
    // ③ 计数 = 全边口径 + 八字段渐进式披露
    candidates.push({
      bugId,
      summary: row.summary,
      chain,
      fullEdgeCount: fullEdgeCountOf(rows, bugId),
      hasOpen,
      status: row.bugStatus,
      ...(row.errorType !== null ? { errorType: row.errorType } : {}),
      ...(row.containerSlug !== null ? { containerSlug: row.containerSlug } : {}),
      ...(row.suspected !== null ? { suspectedLocation: row.suspected } : {}),
      lastSeenAt: row.updatedAt,
      ...(row.recurrenceOf !== null ? { recurrenceOf: row.recurrenceOf } : {}),
    })
  }
  return candidates
}

// ── T4 覆盖声明协议（行前缀常量单源 = lib/api dto/bugs——本注释为协议语义正本）──
// 存储载体 = fix_approach 既有字段。行式协议（大小写不敏感前缀 + 冒号 + 值；值 trim 后
// 非空才算在场；首个命中行生效）：
//   coverage: <为何本修复覆盖整条复发链共同根因的覆盖声明>
//   anchor: <排查报告卷宗正本文件路径（相对项目根或绝对）>
// 分层判定：域服务纯 DB 面只判两段 presence + 锚字符串登记（零文件 IO、零语义）；锚有效性
// 预检（文件 IO）归 tool 旁挂侧。非复发家族（recurrence_of 缺席）协议可选。

/** fix_approach 协议解析产物（段值 trim 后非空；缺席段键缺席） */
export interface BugCoverageDeclaration {
  readonly declaration?: string
  readonly anchor?: string
}

/** fix_approach 覆盖声明协议解析（纯函数零 IO——域服务 presence 门与 tool 锚预检共享语义） */
export function parseBugCoverageDeclaration(fixApproach: string | undefined): BugCoverageDeclaration {
  let declaration: string | undefined
  let anchor: string | undefined
  for (const line of (fixApproach ?? '').split(/\r?\n/)) {
    const t = line.trim()
    const lower = t.toLowerCase()
    if (declaration === undefined && lower.startsWith(BUG_COVERAGE_DECLARATION_PREFIX)) {
      const v = t.slice(BUG_COVERAGE_DECLARATION_PREFIX.length).trim()
      if (v !== '') declaration = v
    } else if (anchor === undefined && lower.startsWith(BUG_COVERAGE_ANCHOR_PREFIX)) {
      const v = t.slice(BUG_COVERAGE_ANCHOR_PREFIX.length).trim()
      if (v !== '') anchor = v
    }
  }
  return {
    ...(declaration !== undefined ? { declaration } : {}),
    ...(anchor !== undefined ? { anchor } : {}),
  }
}

// ── parseTaskContainerSlug（退役兼容层——recurrence-signal-tiering 归属改 container_slug
// 列直比后，本函数退出生产消费面，仅保留测试 harness `t-` 形制纯函数边界）：形制
// `t-<slug>-<localId>`。localId 两族：① 数字点字面（`1.2`）；② 派生链词汇 `fix-N` / `disc-N`。
// 解析 = 剥末段数字点段后，若新末段 ∈ 派生词汇再剥一段，余段拼回容器 slug。非该形制 → null。

const DERIVED_LOCAL_ID_HEADS = ['fix', 'disc'] as const

export function parseTaskContainerSlug(sourceTaskId: string): string | null {
  const parts = sourceTaskId.split('-')
  if (parts[0] !== 't' || parts.length < 3) return null // 非管线任务 id 形制 → 不归属
  const localId = parts[parts.length - 1] ?? ''
  if (localId === '' || !/^[0-9.]+$/.test(localId)) return null
  const stripped = parts.slice(0, -1)
  const head = stripped[stripped.length - 1] ?? ''
  if ((DERIVED_LOCAL_ID_HEADS as readonly string[]).includes(head) && stripped.length > 2) {
    stripped.pop()
  }
  const slug = stripped.slice(1).join('-')
  return slug === '' ? null : slug
}
