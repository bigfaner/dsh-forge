// dispatch-core · 循环独占守卫（S1c——run-tasks-host-command proposal §1.4 循环独占 +
// Out-of-scope 例外条「活循环任务源独占拒绝守卫落 claim 面」+ SC5）。活循环任务源对派发
// 独占：循环领取/派发/结算全托管期间，外部（含主会话）dispatchTask 触达该任务源被拒并附
// 指引——杜绝第二 dispatcher 与循环双写同一任务源。
//
// 两条拒绝路径（AC：显式 slug 与盲选均被拒）：
// ① 显式 source 径——claimForDispatch 在 claim 前查本表（源即拒，不触池不领任务）；
// ② 盲选径——claimTask 目标解析命中活循环任务源行才可判，守卫回调随 ClaimTaskInput 进核
//    （packages/core claim.ts 在单事务内目标解析后调用；拒绝 = 守卫抛错 → 事务整体回滚，
//    转移/claim 记录/links 零状态残留）。守卫抛错跨面传导：dispatchCore 零捕获 → 工具壳
//    callToolFace 按 code 转失败 DTO（message/violations 承载精确原因与指引）。
//
// 键与生命周期：表键 = 任务源对（kind::slug）；写入 = 循环驱动器 start（decisions #18——
// LoopInstanceId 随行，clear 校验归属防旧实例误清新实例登记）；清除 = stop/终态 finally
// （幂等）。模块级·易失（与 guard.ts SPAWN_FAILURES 同形制）——进程重启即空，v1 单活。
//
// 承载码裁决：拒绝 DTO code 沿用 ERR_SPAWN_FAILED——闭合 ERROR_CODES 联合内 dispatchTask
// 动词的「本次派发未发生」承载码（run_in_background 降级拒绝同先例，core.ts 注释明示），
// message/violations 承载精确原因与指引，零 contracts 扰动。
import type { ContainerRef } from '@dsh-forge/contracts'
import type { ClaimExclusivityTarget } from '@dsh-forge/contracts'

/** 表键（任务源对——kind 可分同 slug 异 kind 撞键） */
function sourceKeyOf(source: ContainerRef): string {
  return `${source.kind}::${source.slug}`
}

interface ExclusiveEntry {
  readonly source: ContainerRef
  readonly loopId: string
}

/** 活循环任务源登记（模块级·易失——进程内唯一，驱动器 start/终态维护） */
const EXCLUSIVE_SOURCES = new Map<string, ExclusiveEntry>()

/** 登记（循环 start——源对独占生效；重复登记同源后写覆盖，v1 单活不达） */
export function setExclusiveLoopSource(source: ContainerRef, loopId: string): void {
  EXCLUSIVE_SOURCES.set(sourceKeyOf(source), { source: { kind: source.kind, slug: source.slug }, loopId })
}

/** 注销（stop/终态——幂等；loopId 归属校验：旧实例的迟到清除不误删新实例登记） */
export function clearExclusiveLoopSource(source: ContainerRef, loopId: string): void {
  const entry = EXCLUSIVE_SOURCES.get(sourceKeyOf(source))
  if (entry !== undefined && entry.loopId === loopId) EXCLUSIVE_SOURCES.delete(sourceKeyOf(source))
}

/** 测试缝（模块级状态复位——跨用例隔离；生产零调用） */
export function resetExclusiveLoopSources(): void {
  EXCLUSIVE_SOURCES.clear()
}

/** 独占读数（命中 = 该源正被活循环独占，附 LoopInstanceId） */
export function exclusiveLoopSourceOf(source: ContainerRef): { readonly loopId: string } | undefined {
  const entry = EXCLUSIVE_SOURCES.get(sourceKeyOf(source))
  return entry !== undefined ? { loopId: entry.loopId } : undefined
}

/** 活跃独占在场判定（冷路径守卫装配门——零独占时外部 claimTask 入参保持逐字节等价） */
export function hasExclusiveLoopSources(): boolean {
  return EXCLUSIVE_SOURCES.size > 0
}

/** 独占拒绝指引（violations 行——wait/接管/观察三向，被拒调用方零猜测） */
export const LOOP_EXCLUSIVE_GUIDANCE: readonly string[] = [
  'this source is owned by an active dispatch loop — do not become a second dispatcher for it (the loop claims, spawns and settles every task of the source itself)',
  'to take over, stop the loop first: stopTaskLoop tool or /stop-dag-tasks in the session that started it (a suspended loop may be stopped by any session)',
  'observation stays available: read the source state (queryTask / GUI task tab) instead of dispatching into it',
]

// ─────────────────────────── 会话级单活门控（3b——用户裁决 2026-10-17） ───────────────────────────

/**
 * 会话单活门控读数（byOwner 身份缝合——结构面：消费方传 registry.byOwner 同形读数，
 * 本面零 import loop 域（依赖方向 loop → dispatch-core 单向）。活循环含挂起中
 * （record.suspended 在场）——挂起也占会话名额（处置是 owner 职责）。
 */
export interface OwnerActiveLoopView {
  readonly slug: string
  readonly sourceKind: 'feature' | 'proposal'
  readonly ownerSessionId: string
  readonly suspended: boolean
}

/** byOwner 结构读数（LoopRegistry.byOwner 同形子集——泛化消费缝） */
export type OwnerLoopReader = (
  ownerSessionId: string,
) => {
  readonly source: { readonly kind: 'feature' | 'proposal'; readonly slug: string }
  readonly ownerSessionId: string
  readonly suspended?: unknown
} | undefined

/** 单活读数（命中 = 该会话已有活循环（含挂起中），附归属视图；无 = undefined） */
export function ownerActiveLoopOf(byOwner: OwnerLoopReader, ownerSessionId: string): OwnerActiveLoopView | undefined {
  const record = byOwner(ownerSessionId)
  if (record === undefined) return undefined
  return {
    slug: record.source.slug,
    sourceKind: record.source.kind,
    ownerSessionId: record.ownerSessionId,
    suspended: record.suspended !== undefined,
  }
}

/** 单活拒绝指引（violations 行——结束/停止/处置/换会话向，被拒调用方零猜测） */
export const OWNER_ACTIVE_GUIDANCE: readonly string[] = [
  'a session runs at most one dispatch loop at a time — finish, dispose or stop the current loop first (stopTaskLoop tool, or /stop-dag-tasks in this session)',
  'if the loop is suspended (awaiting verdict), handle the pending task first, then re-enter with dispatchTask to resume it — or stop it to abandon',
  'to run loops in parallel, start the next one from a different session',
]

/** 会话单活拒绝错误（code 承载 = ERR_SPAWN_FAILED——「本次派发未发生」动词承载码同先例） */
export class OwnerActiveLoopError extends Error {
  readonly code = 'ERR_SPAWN_FAILED' as const
  readonly data: {
    readonly slug: string
    readonly sourceKind: ContainerRef['kind']
    readonly ownerSessionId: string
    readonly suspended: boolean
    readonly guidance: readonly string[]
  }

  constructor(view: OwnerActiveLoopView) {
    super(
      `dispatch rejected: this session already owns an active dispatch loop for ${view.slug}${view.suspended ? ' (suspended — awaiting verdict)' : ''} — one loop per session at a time`,
    )
    this.name = 'OwnerActiveLoopError'
    this.data = {
      slug: view.slug,
      sourceKind: view.sourceKind,
      ownerSessionId: view.ownerSessionId,
      suspended: view.suspended,
      guidance: OWNER_ACTIVE_GUIDANCE,
    }
  }
}

/** 会话单活拒绝（start 前 byOwner 查——活循环（含挂起中）在场即拒，自解释指引随行） */
export function ownerSingleActiveRejection(byOwner: OwnerLoopReader, ownerSessionId: string): OwnerActiveLoopError | undefined {
  const view = ownerActiveLoopOf(byOwner, ownerSessionId)
  return view !== undefined ? new OwnerActiveLoopError(view) : undefined
}

/** 独占拒绝错误（code 承载 = ERR_SPAWN_FAILED——「本次派发未发生」动词承载码，见模块头；
 *  data.guidance = 指引行，工具壳 violationLinesOf 派生 violations） */
export class LoopSourceExclusiveError extends Error {
  readonly code = 'ERR_SPAWN_FAILED' as const
  readonly data: {
    readonly slug: string
    readonly sourceKind: ContainerRef['kind']
    readonly loopId: string
    readonly guidance: readonly string[]
  }

  constructor(source: ContainerRef, loopId: string) {
    super(
      `dispatch rejected: task source ${source.slug} is owned by an active dispatch loop (loop ${loopId}) — exclusive until the loop settles`,
    )
    this.name = 'LoopSourceExclusiveError'
    this.data = { slug: source.slug, sourceKind: source.kind, loopId, guidance: LOOP_EXCLUSIVE_GUIDANCE }
  }
}

/** 显式 source 径拒绝（claim 前——活循环任务源即拒，与池态无关：源本身独占） */
export function exclusiveScopedRejection(source: ContainerRef): LoopSourceExclusiveError | undefined {
  const hit = exclusiveLoopSourceOf(source)
  return hit !== undefined ? new LoopSourceExclusiveError(source, hit.loopId) : undefined
}

/**
 * 盲选径守卫（claimTask exclusivityGuard 形——目标解析命中即判）：命中活循环任务源 → 抛
 * LoopSourceExclusiveError（claim 单事务整体回滚——零状态残留）；其余目标放行。
 * 返回 undefined = 无活跃独占（不携带守卫键——外部 claimTask 入参零变化）。
 */
export function externalExclusivityGuard(): ((target: ClaimExclusivityTarget) => void) | undefined {
  if (!hasExclusiveLoopSources()) return undefined
  return (target: ClaimExclusivityTarget): void => {
    const hit = exclusiveLoopSourceOf({ kind: target.sourceKind, slug: target.slug })
    if (hit !== undefined) throw new LoopSourceExclusiveError({ kind: target.sourceKind, slug: target.slug }, hit.loopId)
  }
}
