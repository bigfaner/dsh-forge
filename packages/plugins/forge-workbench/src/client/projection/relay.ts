// client/projection/relay — 投影 relay 流(任务 3.3;tech-design
// §Interfaces·Interface 2 的 renderer 执行腿)。
//
// 流:订阅 Interface 1 批量事件 `projection_push_required { projectId, plan }`
// (订阅登记同时 = 内核 relayPresence 在场标记)→ 按 plan 执行序跑上游动词
// (经 workspace-channel 的 duck-typed 面)→ **先随行上报执行后快照**再逐项目
// reportProjectionOutcome 回填(3.2 契约注记:内核 ok 腿经 path 命中解析
// workspaceId,陈旧快照会把成功 push 写成占位哨兵 + 瞬时偏差)。
//
// 执行序(AC):ensure(sort_order 升序由内核 plan 生成序承载;本层按类分组
// 规整,组内保持到达序)→ rename → reorder(insertBefore 链,自尾向头逐对
// 前插 —— 锚点先就位,期望块收敛为连续段且不动用户自有 workspace 的相对
// 关系)→ delete。
//
// 单 op 失败不断流:失败收集(首个按执行序胜出)但后续 op 照常执行;回填
// 永不缺席(部分成功语义 = 下轮 diff/幂等重推收敛;禁静默丢弃)。幂等适配:
// vendored delete 对缺席目标拒绝 'workspace/not-found' —— relay 折为成功
// (已不在 = 已达成);vendored create 不收 title —— ensure 的 title 收敛由
// create 后条件 rename 承载。
//
// 生命周期:渲染未装载/启动竞态 = 内核不消费(3.2 pushPlan 探测缺席 → plan
// 保留 + degraded);本 relay 装载后重放 = 等通道就位(有界轮询,启动竞态
// 窗口)→ getProjectionStatus 拉取 degraded(ERR_PROJECTION_CHANNEL_UNAVAILABLE)
// 行逐项目 retryProjection(幂等全量重推;重试策略单源在内核,relay 无本地
// 重试)。op 失败型 degraded 不自动重推(那是 3.5 状态面的用户重试面)。

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  ProjectionOp, ProjectionPlan, ProjectionState, ProjectionStatusRow,
  ReportProjectionOutcomeInput, RetryProjectionInput, WorkbenchEvent,
  WorkspaceSnapshotEntry,
} from '../ipc-types'
import type { WorkbenchIpcBridge } from '../ipc/workbench'
import { getWorkbenchEventSource } from '../ipc/workbench-events'
import type { WorkspaceChannel, WorkspaceOpFailure, WorkspaceRow } from './workspace-channel'
import { workspaceChannelOf } from './workspace-channel'
import type { ProjectionRelayLog } from './snapshot-report'
import { createSnapshotReporter, defaultProjectionRelayLog, workspacesSourceOf } from './snapshot-report'

/** relay 通道缺席码(内核 3.2 词表;boot 重放的筛选前缀)。 */
export const PROJECTION_CHANNEL_UNAVAILABLE = 'ERR_PROJECTION_CHANNEL_UNAVAILABLE'

/** vendored 上游「目标缺席」码 —— delete 幂等折算的判定值。 */
export const WORKSPACE_NOT_FOUND = 'workspace/not-found'

/** boot 重放等待通道的轮询节拍/上限(dispatch-relay 先例:250ms × 240 ≈ 60s)。 */
export const RELAY_ARM_POLL_MS = 250
export const RELAY_ARM_MAX_TRIES = 240

// ---------------------------------------------------------------------------
// 快照合并纯函数(relay 本地视图:op 应答 → entries;下轮 follow 上报纠偏)
// ---------------------------------------------------------------------------

type SnapshotRow = Pick<WorkspaceSnapshotEntry, 'workspaceId' | 'path' | 'title'>

/** entries 不变式:orderIdx = 数组序(宿主注册表序的本地投影)。 */
const reindex = (rows: readonly SnapshotRow[]): WorkspaceSnapshotEntry[] =>
  rows.map((row, index) => ({ ...row, orderIdx: index }))

/**
 * One op 应答行并入快照:同 id 原位替换;同 path 异 id 的陈旧行让位并由
 * 新行原位接管(dsh 侧删除重建场景,位序保持);未知 id 追加末位(位序待
 * 下轮 order/follow 纠正)。
 */
export function applyWorkspaceRow(
  entries: readonly WorkspaceSnapshotEntry[],
  row: WorkspaceRow,
): WorkspaceSnapshotEntry[] {
  const staleIds = new Set(
    entries.filter(entry => entry.path === row.path && entry.workspaceId !== row.workspaceId)
      .map(entry => entry.workspaceId),
  )
  const rows: SnapshotRow[] = []
  let placed = false
  for (const entry of entries) {
    if (staleIds.has(entry.workspaceId)) {
      if (!placed) {
        rows.push(row)
        placed = true
      }
      continue
    }
    if (entry.workspaceId === row.workspaceId) {
      if (!placed) {
        rows.push(row)
        placed = true
      }
      continue
    }
    rows.push(entry)
  }
  if (!placed) rows.push(row)
  return reindex(rows)
}

/** insertBefore 应答的完整注册表序重排(未知 id 行保守保留末段,待 follow 纠偏)。 */
export function applyRegistryOrder(
  entries: readonly WorkspaceSnapshotEntry[],
  workspaceIds: readonly string[],
): WorkspaceSnapshotEntry[] {
  const byId = new Map(entries.map(entry => [entry.workspaceId, entry]))
  const ordered: SnapshotRow[] = []
  const seen = new Set<string>()
  for (const id of workspaceIds) {
    const entry = byId.get(id)
    if (entry === undefined) continue
    ordered.push(entry)
    seen.add(id)
  }
  for (const entry of entries) {
    if (!seen.has(entry.workspaceId)) ordered.push(entry)
  }
  return reindex(ordered)
}

/** delete/remove 后剔除行(缺席目标同样剔除 —— 已不在 = 已达成)。 */
export function dropWorkspaceId(
  entries: readonly WorkspaceSnapshotEntry[],
  workspaceId: string,
): WorkspaceSnapshotEntry[] {
  return reindex(entries.filter(entry => entry.workspaceId !== workspaceId))
}

// ---------------------------------------------------------------------------
// plan 执行(纯依赖注入:channel + 先前快照 → 执行结果 + 执行后快照)
// ---------------------------------------------------------------------------

const OP_KIND_ORDER: Readonly<Record<ProjectionOp['kind'], number>> = {
  ensure: 0, rename: 1, reorder: 2, delete: 3,
}

/** 执行序规整:ensure → rename → reorder → delete(组内保持到达序)。 */
export function canonicalOpsOf(ops: readonly ProjectionOp[]): ProjectionOp[] {
  return ops
    .map((op, index) => ({ op, index }))
    .sort((a, b) => OP_KIND_ORDER[a.op.kind] - OP_KIND_ORDER[b.op.kind] || a.index - b.index)
    .map(entry => entry.op)
}

/**
 * reorder 的 insertBefore 链:自尾向头逐对前插(锚点先就位)——
 * orderedIds = [A, B, C] → insertBefore(B, C) 再 insertBefore(A, B),
 * 期望块收敛为连续段;仅 forge 所属子集入链(T1:不动用户自有 workspace)。
 */
export function insertBeforeLinksOf(orderedIds: readonly string[]): Array<{ workspaceId: string; beforeWorkspaceId: string }> {
  const links: Array<{ workspaceId: string; beforeWorkspaceId: string }> = []
  for (let i = orderedIds.length - 2; i >= 0; i -= 1) {
    links.push({ workspaceId: orderedIds[i], beforeWorkspaceId: orderedIds[i + 1] })
  }
  return links
}

/** 单次通道调用的吸收包装:业务失败经判别联合;transport 拒绝折通道失败(下轮 boot 重放可收敛)。 */
type ChannelCall<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: WorkspaceOpFailure }

type ChannelVerbResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WorkspaceOpFailure }

async function callChannel<T>(run: () => Promise<ChannelVerbResult<T>>): Promise<ChannelCall<T>> {
  try {
    const result = await run()
    return result.ok ? { ok: true, value: result.value } : { ok: false, failure: result.error }
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: PROJECTION_CHANNEL_UNAVAILABLE,
        message: `workspace channel transport failure: ${String(error)}`,
      },
    }
  }
}

/** executeProjectionPlan 产物(ok = 全部 op 达成;error = 首个失败,原码透传)。 */
export interface PlanExecutionResult {
  readonly ok: boolean
  readonly error: WorkspaceOpFailure | undefined
  /** 执行后快照(priorEntries 从未建立 = undefined,不可上报)。 */
  readonly entries: readonly WorkspaceSnapshotEntry[] | undefined
  /** priorEntries 在场(= 执行后快照可随行上报)。 */
  readonly submittable: boolean
}

/**
 * 单项目 plan 执行:按执行序跑全部 op(单 op 失败不断流,收集首个失败),
 * 同时本地合并出执行后快照(outcome 随行上报载荷)。幂等:重复执行同一
 * plan 无副作用(create-or-adopt / rename 同值 / reorder 收敛 / delete 容忍
 * not-found)。
 */
export async function executeProjectionPlan(
  channel: WorkspaceChannel,
  plan: ProjectionPlan,
  priorEntries: readonly WorkspaceSnapshotEntry[] | undefined,
): Promise<PlanExecutionResult> {
  let entries: WorkspaceSnapshotEntry[] | undefined
    = priorEntries === undefined ? undefined : [...priorEntries]
  let firstFailure: WorkspaceOpFailure | undefined
  const record = (failure: WorkspaceOpFailure): void => {
    firstFailure ??= failure
  }
  for (const op of canonicalOpsOf(plan.ops)) {
    if (op.kind === 'ensure') {
      const created = await callChannel(() => channel.create({ path: op.canonicalPath }))
      if (!created.ok) {
        record(created.failure)
        continue
      }
      const row = created.value.workspace
      if (entries !== undefined) entries = applyWorkspaceRow(entries, row)
      if (row.title === op.title) continue
      // vendored create 不收 title(结构面对齐):ensure 的 title 收敛 = 条件 rename。
      const renamed = await callChannel(() => channel.rename({ workspaceId: row.workspaceId, title: op.title }))
      if (!renamed.ok) record(renamed.failure)
      else if (entries !== undefined) entries = applyWorkspaceRow(entries, renamed.value.workspace)
      continue
    }
    if (op.kind === 'rename') {
      const renamed = await callChannel(() => channel.rename({ workspaceId: op.workspaceId, title: op.title }))
      if (!renamed.ok) {
        record(renamed.failure)
        continue
      }
      if (entries !== undefined) entries = applyWorkspaceRow(entries, renamed.value.workspace)
      continue
    }
    if (op.kind === 'reorder') {
      for (const link of insertBeforeLinksOf(op.orderedIds)) {
        const moved = await callChannel(() => channel.insertBefore(link))
        if (!moved.ok) {
          record(moved.failure)
          continue
        }
        if (entries !== undefined) entries = applyRegistryOrder(entries, moved.value.workspaceIds)
      }
      continue
    }
    const removed = await callChannel(() => channel.delete({ workspaceId: op.workspaceId }))
    if (entries !== undefined) entries = dropWorkspaceId(entries, op.workspaceId)
    if (!removed.ok && removed.failure.code !== WORKSPACE_NOT_FOUND) record(removed.failure)
  }
  return {
    ok: firstFailure === undefined,
    error: firstFailure,
    entries,
    submittable: entries !== undefined,
  }
}

// ---------------------------------------------------------------------------
// The relay(事件订阅 + 串行执行队列 + 装载后重放)
// ---------------------------------------------------------------------------

/** createProjectionRelay 装配入参(全依赖注入,测试确定性)。 */
export interface ProjectionRelayDeps {
  /** 每次执行时解析上游通道(懒;缺席 → 通道缺席回填)。 */
  readonly getChannel: () => WorkspaceChannel | undefined
  /** 事件订阅面(Interface 1 单订阅源的多路复写腿;登记 = 内核在场标记)。 */
  readonly subscribeEvents: (listener: (events: readonly WorkbenchEvent[]) => void) => () => void
  /** 最近已知快照(从未建立 = undefined → 执行后快照不可随行上报)。 */
  readonly getEntries: () => readonly WorkspaceSnapshotEntry[] | undefined
  /** 快照上报面(submitWorkspaceSnapshot 腿)。 */
  readonly submitSnapshot: (workspaces: readonly WorkspaceSnapshotEntry[]) => Promise<void>
  /** 逐项目 outcome 回填面(reportProjectionOutcome 腿)。 */
  readonly reportOutcome: (input: ReportProjectionOutcomeInput) => Promise<void>
  /** 全量状态行读取面(boot 重放筛选)。 */
  readonly getProjectionStatus: () => Promise<readonly ProjectionStatusRow[]>
  /** 内核幂等全量重推(装载后重放的唯一重试通道)。 */
  readonly retryProjection: (input: RetryProjectionInput) => Promise<{ readonly state: ProjectionState }>
  /** boot 重放等待轮询节拍 ms(缺省 250)。 */
  readonly armPollMs?: number
  /** boot 重放等待上限次数(缺省 240 ≈ 60s;上限到仍放行一次,状态自愈)。 */
  readonly armMaxTries?: number
  /** 诊断 sink(缺省 console.warn)。 */
  readonly log?: ProjectionRelayLog
}

/**
 * The projection relay:订阅 projection_push_required(plan 串行执行 —— 注册表
 * 序动词天然串行,逐项目回填),follow 快照上报归 snapshot-report(relay 经
 * submitSnapshot 共享其 entries 视图),装载后重放 = 通道就位即对
 * degraded(ERR_PROJECTION_CHANNEL_UNAVAILABLE)行逐项目 retryProjection。
 * fire-and-forget 面:任何回填拒绝仅 log,不上抛。
 */
export function createProjectionRelay(deps: ProjectionRelayDeps): { dispose(): void } {
  const armPollMs = deps.armPollMs ?? RELAY_ARM_POLL_MS
  const armMaxTries = deps.armMaxTries ?? RELAY_ARM_MAX_TRIES
  const log = deps.log ?? defaultProjectionRelayLog

  let disposed = false
  let armTimer: ReturnType<typeof setInterval> | undefined
  let armTries = 0
  /** 串行队列:plan 逐个执行(执行序矩阵的跨 plan 承载 = 到达序)。 */
  let tail: Promise<void> = Promise.resolve()
  const enqueue = (run: () => Promise<void>): void => {
    tail = tail.then(run, run)
  }

  const runPlan = async (plan: ProjectionPlan): Promise<void> => {
    const channel = deps.getChannel()
    if (channel === undefined) {
      // 通道缺席 = 未消费:显式回填通道缺席码(内核 degraded + plan 保留;
      // 下次装载重放/用户重试均可收敛),禁静默。
      await deps.reportOutcome({
        projectId: plan.projectId,
        ok: false,
        error: {
          code: PROJECTION_CHANNEL_UNAVAILABLE,
          message: 'workspace remote namespace unavailable at plan execution (plan preserved — retryProjection re-pushes)',
        },
      }).catch((error: unknown) => { log('outcome report failed (channel-absent leg)', { reason: String(error) }) })
      return
    }
    const result = await executeProjectionPlan(channel, plan, deps.getEntries())
    if (result.submittable) {
      // 随行上报执行后快照 —— 先于 outcome(内核 ok 腿经 path 命中解析
      // workspaceId;3.2 模块头契约注记)。快照从未建立(prior undefined)
      // 时跳过:局部快照会被读作「注册表仅此」,不可上报。
      await deps.submitSnapshot(result.entries ?? []).catch((error: unknown) => { log('post-execution snapshot submit rejected', { reason: String(error) }) })
    }
    const failure = result.error
    const input: ReportProjectionOutcomeInput = failure === undefined
      ? { projectId: plan.projectId, ok: true }
      : { projectId: plan.projectId, ok: false, error: { code: failure.code, message: failure.message } }
    await deps.reportOutcome(input).catch((error: unknown) => { log('projection outcome report failed', { reason: String(error) }) })
  }

  // ① 订阅先行 —— 登记即内核 relayPresence 在场标记(顺序敏感:先在场,
  // 重放推流才有消费端)。
  const unsubscribe = deps.subscribeEvents((events) => {
    for (const event of events) {
      if (event.type !== 'projection_push_required') continue
      const plan = event.plan
      enqueue(() => runPlan(plan))
    }
  })

  // ② 装载后重放:通道就位(有界等待)→ degraded(通道缺席)行逐项目重推。
  const replayOnce = (): void => {
    void deps.getProjectionStatus()
      .then((rows) => {
        if (disposed) return
        for (const row of rows) {
          if (row.state !== 'degraded' || row.archived) continue
          if (!(row.lastError ?? '').startsWith(PROJECTION_CHANNEL_UNAVAILABLE)) continue
          void deps.retryProjection({ projectId: row.projectId })
            .catch((error: unknown) => { log('boot replay retryProjection rejected', { projectId: row.projectId, reason: String(error) }) })
        }
      })
      .catch((error: unknown) => { log('boot replay status read failed', { reason: String(error) }) })
  }
  const tryArm = (): boolean => deps.getChannel() !== undefined
  if (tryArm()) {
    replayOnce()
  } else {
    armTimer = setInterval(() => {
      if (disposed) return
      armTries += 1
      if (tryArm() || armTries >= armMaxTries) {
        clearInterval(armTimer)
        armTimer = undefined
        // 上限到仍放行一次(通道永缺席世界:状态读自身失败即 log 终止)。
        replayOnce()
      }
    }, armPollMs)
  }

  return {
    dispose(): void {
      disposed = true
      if (armTimer !== undefined) {
        clearInterval(armTimer)
        armTimer = undefined
      }
      unsubscribe()
    },
  }
}

// ---------------------------------------------------------------------------
// The installer(client apply 消费;bridge-gated)
// ---------------------------------------------------------------------------

/**
 * 安装投影 relay(client apply 调用;plugin lifetime):follow 快照上报腿 +
 * plan 执行/回填腿 + 装载后重放腿,共享一份本地快照视图(上报/执行后合并
 * 双向喂入)。hostless(无 preload 桥)世界由调用方跳过;上游服务缺席 =
 * 各腿守卫降级(不上报/通道缺席回填/等待),不抛错不阻断。
 */
export function installProjectionRelay(ctx: ClientContext, bridge: WorkbenchIpcBridge): () => void {
  let entries: readonly WorkspaceSnapshotEntry[] | undefined
  const submitEntries = (workspaces: readonly WorkspaceSnapshotEntry[]): Promise<void> => {
    entries = [...workspaces]
    return bridge.submitWorkspaceSnapshot({ workspaces: [...workspaces] })
  }
  const reporter = createSnapshotReporter({
    resolveSource: () => workspacesSourceOf(ctx),
    submit: submitEntries,
  })
  const relay = createProjectionRelay({
    getChannel: () => workspaceChannelOf(ctx),
    subscribeEvents: listener => getWorkbenchEventSource(bridge).subscribe(listener),
    getEntries: () => entries,
    submitSnapshot: submitEntries,
    reportOutcome: input => bridge.reportProjectionOutcome(input),
    getProjectionStatus: () => bridge.getProjectionStatus(),
    retryProjection: input => bridge.retryProjection(input),
  })
  return () => {
    relay.dispose()
    reporter.dispose()
  }
}
