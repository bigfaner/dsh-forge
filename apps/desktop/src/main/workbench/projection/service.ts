// workbench/projection/service — 投影对账 service(任务 3.2;Interface 1
// v3·P3 批四动词 + Interface 2 relay 语义的内核接线)。
//
// 消费 3.1 纯函数内核(plan/diff/expectation-repo/state-machine;3.1 record
// 明示的本任务消费契约),本模块补齐有状态编排:
//   - submitWorkspaceSnapshot:client 上报原生 workspace 快照(follow 流)→
//     主进程结构化 log(T2 缓解:仅形状校验[handler 层]+ log,快照不落库、
//     偏差不写表 —— 零写放大)→ debounce 后对账重算;
//   - 对账重算:diffProjection(expectations ∪ 快照)→ reconcileVerdictEvent
//     桥 → nextProjectionState 迁移(match → healthy / drift → deviation;
//     unprojected/archived 不迁移 —— 收敛走 push 路径)→ 实际迁移才发
//     projection_updated(幂等自旋零噪音,偏差明细随行物化);
//   - retryProjection:幂等全量重推 —— buildProjectionPlan 自包含(单 plan
//     执行即收敛该项目全部期望状态,含 forge 子集相对序)→ 经批量通道发
//     projection_push_required(3.3 relay 消费);归档项目零 op 不推送;
//   - reportProjectionOutcome:relay 回填 —— ok → recordSuccessfulPush
//     (期望 repo 回写 + projects.workspace_id 镜像)+ push_succeeded →
//     healthy;error → 上游错误码映射三码(workspace/invalid-path |
//     name-conflict | move-invalid → ERR_PROJECTION_OP_FAILED detail 携
//     原码;未列举码原样透传)→ recordProjectionDegraded + push_failed →
//     degraded;项目行已不存在(3.4 removeProject 的 delete plan 回填竞态)
//     → 终态 no-op + log(relay fire-and-forget 面,无可回填对象);
//   - pushForRegistration:1.3 registerProject 占位 hook 的真实载荷接线 ——
//     注册成功 → insertExpectationPlaceholder(期望在库)+ 真实 plan push;
//   - pushForRename:3.4 renameProject 接线 —— 自包含 plan push(rename op
//     由 planOpsForExpectation 派生;归档项目零 op 不推送);
//   - buildRemovalPlan:3.4 removeProject 接线 —— delete plan 组装,必须在
//     项目行删除【之前】调用(期望并集随后 FK cascade 消失;行删除后由
//     lifecycle-hooks 发 projection_push_required,relay 执行后回填走终态
//     no-op);
//   - 延迟收敛补推(任务 3.7,收敛前提竞态裁决):两类「plan 组装时收敛前提
//     尚未成事实」的世界,单 plan 不满足「幂等全量重推收敛全部期望状态」的
//     自包含性 —— ① 注册类动词早于 follow 流首报:plan 在实况未知(snapshot
//     =null)下组装,reorder op 恒不可派生 → 首报到达即补推;② 本轮 push
//     自身的 ensure 物化:宿主 create 的最终落位(注册表前插,经 order 帧
//     晚 ~200-300ms 到达)在 plan 组装之后才成事实,plan 的 reorder 腿无从
//     覆盖自家 create 的位置 → 物化 outcome 后静置窗口(materialization
//     SettleMs > 帧滞后 + 上报 debounce)按最新实况幂等补推一次。补推不
//     bypass 通道缺席语义(缺席 → 重试一次 → degraded,plan 保留);归档
//     项目与已消失行跳过(必答⑤/移除竞态);终止性 = ②一次性定时器 + 补推
//     outcome 时 id 已在库(②判据即否);残差呈现为诚实 deviation + 用户
//     重试(BIZ-005/006 兜底)。
//
// relay 不在场语义(Interface 2;禁静默丢弃):push 时 relayPresence 探测
// 为假(渲染未装载/启动竞态)→ 重试一次(竞态窗口:订阅登记可能稍后到位)
// → 仍缺席 → degraded(ERR_PROJECTION_CHANNEL_UNAVAILABLE 落 last_error),
// plan 保留 —— 期望状态在库,任何时刻可 retryProjection 幂等全量重推。
//
// Hard Rules:
//   - T1:reorder 仅 forge 所属子集 —— buildReorderOp 已保证(matched
//     actives,用户自有 workspace 永不入 orderedIds),本层不改写;
//   - T2:snapshot 仅形状校验(handler 层契约错)+ 主进程 log;偏差仅影响
//     提示面(getProjectionStatus 重算物化),无写放大;
//   - 动词不因投影失败 reject(Propagation Strategy):push/对账失败 =
//     degraded 状态行 + log,唯一 reject 面 = ERR_PROJECT_NOT_FOUND(调用方
//     契约错,非投影失败)。
//
// 3.3 relay 契约注记:outcome 回填前应随行上报执行后快照(fresh snapshot
// 先于/伴随 outcome),否则陈旧内存快照会在 outcome-ok 与下次上报的窗口期
// 呈现瞬时偏差(T2:仅提示面,可自愈)。

import { shellLog } from '../../log.ts'
import type { WorkbenchEvent } from '../indexer/diff.ts'
import { listProjects, setProjectProjectionState } from '../repos/projects.ts'
import { WorkbenchRepoError, type ProjectionState, type RepoDb } from '../repos/types.ts'
import { diffProjection, type DeviationRow } from './diff.ts'
import {
  insertExpectationPlaceholder,
  listProjectionExpectations,
  recordProjectionDegraded,
  recordSuccessfulPush,
} from './expectation-repo.ts'
import {
  buildProjectionPlan,
  buildRemovalPlan as buildRemovalPlanOf,
  matchByPath,
  type ProjectionPlan,
  type WorkspaceSnapshotEntry,
  type WorkspaceSnapshotInput,
} from './plan.ts'
import { nextProjectionState, reconcileVerdictEvent, type ProjectionEvent } from './state-machine.ts'

/**
 * Interface 2 的上游错误码映射词表(→ ERR_PROJECTION_OP_FAILED detail 携原码)。
 * 3.3 对齐 vendored(c36ba648 workspace-controller types.ts):实况码全带
 * `workspace/` 前缀('workspace/name-conflict' / 'workspace/move-invalid'),
 * 词表同时收录设计字面短形与 vendored 前缀形(relay 原码透传,不裁剪)。
 */
const UPSTREAM_OP_ERROR_CODES: ReadonlySet<string> = new Set([
  'workspace/invalid-path', 'name-conflict', 'move-invalid',
  'workspace/name-conflict', 'workspace/move-invalid',
])

/** 上游错误码映射:三码 → ERR_PROJECTION_OP_FAILED(原码入 detail);未列举码原样透传。 */
export function mapUpstreamProjectionError(code: string, message: string): string {
  return UPSTREAM_OP_ERROR_CODES.has(code)
    ? `ERR_PROJECTION_OP_FAILED (upstream ${code}): ${message}`
    : `${code}: ${message}`
}

/** reportProjectionOutcome 入参(Interface 1 v3)。 */
export type ReportProjectionOutcomeInput =
  | { readonly projectId: string; readonly ok: true }
  | { readonly projectId: string; readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/** getProjectionStatus 行(状态行 + 偏差明细;偏差对账重算物化不落表)。 */
export interface ProjectionStatusRow {
  readonly projectId: string
  /** 期望名(= projects.display_name)。 */
  readonly displayName: string
  /** 期望投影路径(anchor canonical;ensure 定位键)。 */
  readonly path: string
  /** 期望序(= projects.sort_order 注册序权威)。 */
  readonly orderIdx: number
  /** 归档位(归档不对账;workspace 保留语义)。 */
  readonly archived: boolean
  /** 状态机现值(projects.projection_state)。 */
  readonly state: ProjectionState
  /** 最近成功投影的 dsh WorkspaceId(未推送 = null)。 */
  readonly workspaceId: string | null
  /** 最近成功 push 时间(ISO 8601;未推送 = null)。 */
  readonly pushedAt: string | null
  /** degraded 原因(上游映射串;健康 = null)。 */
  readonly lastError: string | null
  /** 偏差明细(renamed/deleted/reordered;drift 时非空)。 */
  readonly deviations: readonly DeviationRow[]
}

/** 对账 service 装配入参。 */
export interface ProjectionReconcileDeps {
  readonly db: RepoDb
  /** 事件批推送端(单批直发形态,≤500ms 合并在批量通道侧)。 */
  readonly onEvents: (events: readonly WorkbenchEvent[]) => void
  /**
   * relay 在场探测(事件订阅登记非空 = 渲染已装载)。缺省恒真 = 乐观直发
   * (1.3 占位事件同款行为;生产装配注入订阅登记探测)。
   */
  readonly relayPresence?: () => boolean
  /** snapshot 上报对账 debounce 窗口 ms(默认 250,≤500ms 批量通道预算)。 */
  readonly debounceMs?: number
  /** 通道缺席重试延迟 ms(默认 500;「重试一次后」的竞态窗口)。 */
  readonly channelRetryMs?: number
  /**
   * ②类物化静置窗口 ms(默认 600;> follow 流 order 帧滞后 + 上报 debounce
   * ~300ms):自家 ensure 物化后等实况序落定再补推。
   */
  readonly materializationSettleMs?: number
  /** 时钟(默认 real;测试注入确定性)。 */
  readonly now?: () => string
}

export function createProjectionReconcileService(deps: ProjectionReconcileDeps): {
  /** submitWorkspaceSnapshot 动词芯(形状校验在 handler;log + debounce 对账)。 */
  submitSnapshot(workspaces: readonly WorkspaceSnapshotEntry[]): void
  /** retryProjection 动词芯(幂等全量重推;归档零 op 不推送)。 */
  retryProjection(input: { readonly projectId: string }): { readonly state: ProjectionState }
  /** getProjectionStatus 动词芯(全量 / 单项目;偏差重算物化)。 */
  getProjectionStatus(input: { readonly projectId?: string }): ProjectionStatusRow[]
  /** reportProjectionOutcome 动词芯(relay 回填 ok/error)。 */
  reportOutcome(input: ReportProjectionOutcomeInput): void
  /** 注册成功 hook(1.3 接线:期望占位 + 真实 plan push;不因投影失败抛错)。 */
  pushForRegistration(projectId: string): void
  /** 改名 hook(3.4 接线:自包含 plan push 含 rename op;归档零 op 不推送)。 */
  pushForRename(projectId: string): void
  /**
   * 移除 plan 组装(3.4 接线):必须在项目行删除之前调用(期望并集随后
   * FK cascade 消失);行删除后的事件推送归 lifecycle-hooks/调用方。
   */
  buildRemovalPlan(projectId: string): ProjectionPlan
  /** 收尾:冲刷 pending 对账(同步末次重算,不丢状态迁移)。 */
  dispose(): void
} {
  const { db } = deps
  const relayPresent = deps.relayPresence ?? (() => true)
  const debounceMs = deps.debounceMs ?? 250
  const channelRetryMs = deps.channelRetryMs ?? 500
  const materializationSettleMs = deps.materializationSettleMs ?? 600
  const now = deps.now ?? (() => new Date().toISOString())

  /** 最近上报实况(null = 收数前;follow 流只读输入,永不落库)。 */
  let snapshot: WorkspaceSnapshotInput = null
  /**
   * 延迟收敛登记集(任务 3.7)——「plan 组装时收敛前提尚未成事实」的两类
   * 世界,补推后 plan 才恢复「单 plan 收敛全部期望状态」的自包含性
   * (tech-design §Interface 1/2):
   *   ① 实况未知(snapshot=null)期间实际发出过 plan(reorder 无从派生)
   *      → 首报到达即补推(此刻实况序已知);
   *   ② 本轮 push 自身的 ensure 刚物化(outcome-ok 时 match 的 workspaceId
   *      ≠ 库内 pushed id):宿主 create 的最终落位(实测 = 注册表前插,经
   *      follow 流 order 帧晚 ~200-300ms 到达)在 plan 组装之后才成事实,
   *      该 plan 的 reorder 腿不可能覆盖自家 create 的位置 → 静置窗口后按
   *      最新实况补推(首份执行后快照是 relay 本地视图,落位未反映 ——
   *      即补即消费会被滞后视图空转一次)。
   * 补推走 pushPlan 全语义(通道缺席 → 重试一次 → degraded,禁静默丢弃);
   * 终止性 = ②一次性定时器 + 补推 outcome 时 id 已在库(②判据即否)。
   * 不补推的残差呈现为诚实的 deviation + 用户重试(BIZ-005/006 兜底)。
   */
  const pendingConvergencePushes = new Set<string>()
  /** ②类静置定时器(projectId → timer;dispose 冲刷清理)。 */
  const materializationTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let reconcileTimer: ReturnType<typeof setTimeout> | null = null

  const emitUpdated = (projectId: string, state: ProjectionState, deviations?: readonly DeviationRow[]): void => {
    deps.onEvents([
      deviations === undefined || deviations.length === 0
        ? { type: 'projection_updated', projectId, state }
        : { type: 'projection_updated', projectId, state, deviations: [...deviations] },
    ])
  }

  /** 逐项目状态迁移 + 变更事件(对账与 outcome 回填共用;仅实际迁移发事件)。 */
  const transition = (projectId: string, event: ProjectionEvent, deviations?: readonly DeviationRow[]): ProjectionState | null => {
    const project = listProjects(db).find(row => row.id === projectId)
    if (project === undefined) return null
    const next = nextProjectionState(project.projectionState, event)
    if (next === project.projectionState) return next
    setProjectProjectionState(db, projectId, next)
    emitUpdated(projectId, next, deviations)
    return next
  }

  /** 对账重算:diff → 状态迁移 → projection_updated(仅实际变更;失败 log 不放大)。 */
  const reconcile = (): void => {
    try {
      const expectations = listProjectionExpectations(db)
      const states = new Map(listProjects(db).map(project => [project.id, project.projectionState]))
      const { rows } = diffProjection(expectations, snapshot)
      for (const row of rows) {
        const event = reconcileVerdictEvent(row.verdict)
        if (event === null) continue
        const current = states.get(row.projectId)
        if (current === undefined) continue
        const next = nextProjectionState(current, event)
        if (next !== current) {
          setProjectProjectionState(db, row.projectId, next)
          emitUpdated(row.projectId, next, row.deviations)
        }
      }
    } catch (error) {
      // BIZ-resilience-001:对账为非致命面 —— 结构化 log + 保持现态,不弹错。
      shellLog.error({
        code: 'ERR_WORKBENCH_DB',
        message: 'projection reconcile pass failed (state preserved; next snapshot re-runs it)',
        data: { detail: error instanceof Error ? error.message : String(error) },
      })
    }
  }

  const scheduleReconcile = (): void => {
    if (reconcileTimer !== null) return
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null
      reconcile()
    }, debounceMs)
  }

  /**
   * plan push(注册 hook 与 retryProjection 共用):在场直发;缺席重试一次
   * (启动竞态窗口)→ 仍缺席 → degraded(ERR_PROJECTION_CHANNEL_UNAVAILABLE
   * 落 last_error),plan 保留(期望在库;禁静默丢弃)。
   * Hard Rule(动词不因投影失败 reject):push 面任何异常仅 log + 降级
   * 落库,不上抛 —— 调用方语义(注册/重试)不受投影失败影响。
   */
  const pushPlan = (projectId: string): void => {
    const attempt = (retried: boolean): void => {
      if (relayPresent()) {
        const plan = buildProjectionPlan(listProjectionExpectations(db), snapshot, projectId)
        // 审计面(3.7 诊断纪律,快照 log 同款):plan 发出即结构化 log ——
        // push 事件不落 stdout,排障(谁在何时推了什么)唯一可观测面。
        shellLog.info({
          code: 'WORKBENCH_PROJECTION_PUSH',
          message: `projection plan pushed for ${projectId} (${String(plan.ops.length)} ops)`,
          data: {
            projectId,
            ops: plan.ops.map(op => op.kind),
            snapshotKnown: snapshot !== null,
            retried,
          },
        })
        deps.onEvents([{ type: 'projection_push_required', projectId, plan }])
        // 延迟收敛登记(任务 3.7):实况未知下发出的 plan 缺 reorder 腿,
        // 首报到达时补推才恢复自包含性。
        if (snapshot === null) pendingConvergencePushes.add(projectId)
        return
      }
      if (!retried) {
        setTimeout(() => safe(() => attempt(true)), channelRetryMs)
        return
      }
      recordProjectionDegraded(
        db,
        projectId,
        'ERR_PROJECTION_CHANNEL_UNAVAILABLE: projection relay absent after one retry (plan preserved — retryProjection re-pushes)',
      )
      transition(projectId, 'push_failed')
    }
    safe(() => attempt(false))
  }

  /** push/回填面的防御包装(定时器上下文同样不丢异常):log + 不上抛。 */
  const safe = (run: () => void): void => {
    try {
      run()
    } catch (error) {
      shellLog.error({
        code: 'ERR_PROJECTION_OP_FAILED',
        message: 'projection push path failed (verb semantics unaffected)',
        data: { detail: error instanceof Error ? error.message : String(error) },
      })
    }
  }

  const requireExpectation = (projectId: string) => {
    const exp = listProjectionExpectations(db).find(row => row.projectId === projectId)
    if (exp === undefined) {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
    }
    return exp
  }

  /** 宽容读:期望并集内的项目行(3.4 removeProject 回填竞态 = null)。 */
  const findExpectation = (projectId: string) => listProjectionExpectations(db).find(row => row.projectId === projectId) ?? null

  return {
    submitSnapshot(workspaces: readonly WorkspaceSnapshotEntry[]): void {
      snapshot = [...workspaces]
      // T2:主进程结构化 log(审计面;快照本体不落库 —— 偏差仅影响提示面)。
      shellLog.info({
        code: 'WORKBENCH_PROJECTION_SNAPSHOT',
        message: `native workspace snapshot reported (${String(workspaces.length)} workspaces)`,
        data: { count: workspaces.length, workspaceIds: workspaces.map(entry => entry.workspaceId) },
      })
      // 延迟收敛补推①(任务 3.7):上报到达即冲刷登记集 —— 此刻实况序已知,
      // 补推 plan 携 reorder op,单 plan 即收敛全部期望状态。归档项目(必答⑤
      // 零 op)与已消失行(移除竞态)跳过;补推走 pushPlan 全语义(通道缺席
      // → 重试一次 → degraded,禁静默丢弃)。②类(自家 create 落位)走
      // materializationTimers 的静置定时腿,不入本集。
      if (pendingConvergencePushes.size > 0) {
        const projectIds = [...pendingConvergencePushes]
        pendingConvergencePushes.clear()
        for (const projectId of projectIds) {
          const exp = findExpectation(projectId)
          if (exp === null || exp.archived) continue
          pushPlan(projectId)
        }
      }
      scheduleReconcile()
    },

    retryProjection(input: { readonly projectId: string }): { readonly state: ProjectionState } {
      const exp = requireExpectation(input.projectId)
      const current = listProjects(db).find(row => row.id === input.projectId)?.projectionState ?? 'pending'
      // 归档零 op(必答⑤:期望不变,dsh 侧不动)—— 不推送,现态原样返回。
      if (exp.archived) return { state: current }
      pushPlan(input.projectId)
      return { state: current }
    },

    getProjectionStatus(input: { readonly projectId?: string }): ProjectionStatusRow[] {
      const expectations = listProjectionExpectations(db)
      if (input.projectId !== undefined) {
        if (!expectations.some(exp => exp.projectId === input.projectId)) {
          throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${String(input.projectId)} does not exist`)
        }
      }
      const states = new Map(listProjects(db).map(project => [project.id, project.projectionState]))
      const deviations = new Map(diffProjection(expectations, snapshot).rows.map(row => [row.projectId, row.deviations]))
      return expectations
        .filter(exp => input.projectId === undefined || exp.projectId === input.projectId)
        .map(exp => ({
          projectId: exp.projectId,
          displayName: exp.expectedTitle,
          path: exp.path,
          orderIdx: exp.orderIdx,
          archived: exp.archived,
          state: states.get(exp.projectId) ?? 'pending',
          workspaceId: exp.pushedWorkspaceId,
          pushedAt: exp.pushedAt,
          lastError: exp.lastError,
          deviations: [...(deviations.get(exp.projectId) ?? [])],
        }))
    },

    reportOutcome(input: ReportProjectionOutcomeInput): void {
      // 3.4 removeProject 竞态:delete plan 由 relay 异步执行,回填到达时项目
      // 行(及期望并集行)可能已随 FK cascade 消失 —— 终态 no-op + log(relay
      // fire-and-forget 面;计划已执行,无可回填对象,不构成降级信号)。
      const exp = findExpectation(input.projectId)
      if (exp === null) {
        shellLog.info({
          code: 'WORKBENCH_PROJECTION_OUTCOME_TERMINAL',
          message: `projection outcome for ${input.projectId} arrived after project removal (terminal no-op)`,
          data: { projectId: input.projectId, ok: input.ok },
        })
        return
      }
      if (input.ok) {
        // 期望 repo 回写:workspaceId 解析 = 实况 path 命中 → 既有 pushed id →
        // 占位哨兵(3.3 relay 随行快照使命中恒有真值;哨兵仅启动竞态窗口)。
        const match = matchByPath(exp, snapshot)
        // 延迟收敛②(任务 3.7):本轮 push 的 ensure 刚物化(或复连换 id)
        // = match 真值 ≠ 库内 pushed id —— 宿主 create 的最终落位(前插,经
        // order 帧晚到)在 plan 组装之后才成事实,plan 的 reorder 腿无从覆盖
        // 自家 create 的位置。静置窗口(> order 帧滞后 + 上报 debounce)后按
        // 最新实况补推一次;首份执行后快照是 relay 本地视图(落位未反映),
        // 即报即补会被它空转消费 —— 故走定时腿而非上报冲刷。
        if (match !== null && match.workspaceId !== (exp.pushedWorkspaceId ?? '')) {
          const existing = materializationTimers.get(input.projectId)
          if (existing !== undefined) clearTimeout(existing)
          materializationTimers.set(input.projectId, setTimeout(() => {
            materializationTimers.delete(input.projectId)
            safe(() => {
              const current = findExpectation(input.projectId)
              if (current === null || current.archived) return
              const plan = buildProjectionPlan(listProjectionExpectations(db), snapshot, input.projectId)
              // 仍有收敛 op(此刻含真落位的 reorder)→ 幂等补推;ops 空 =
              // 已收敛,零事件零噪音。
              if (plan.ops.length > 0) pushPlan(input.projectId)
            })
          }, materializationSettleMs))
        }
        recordSuccessfulPush(db, {
          projectId: input.projectId,
          workspaceId: match?.workspaceId ?? exp.pushedWorkspaceId ?? '',
          path: exp.path,
          title: exp.expectedTitle,
          orderIdx: exp.orderIdx,
          pushedAt: now(),
        })
        transition(input.projectId, 'push_succeeded')
        return
      }
      recordProjectionDegraded(db, input.projectId, mapUpstreamProjectionError(input.error.code, input.error.message))
      transition(input.projectId, 'push_failed')
    },

    pushForRegistration(projectId: string): void {
      // 注册即占位(er-diagram「1:1 期望快照,注册即占位」)→ 真实 plan push。
      insertExpectationPlaceholder(db, projectId)
      pushPlan(projectId)
    },

    pushForRename(projectId: string): void {
      // 改名同步 = 自包含 plan push(planOpsForExpectation 依实况派生 rename
      // op;实况未知 = ensure 兜底,relay 的 create-后条件 rename 收敛 title)。
      // 归档项目零 op(必答⑤:workspace 保留,dsh 侧不动)—— 不推送。
      const exp = requireExpectation(projectId)
      if (exp.archived) return
      pushPlan(projectId)
    },

    buildRemovalPlan(projectId: string): ProjectionPlan {
      // 3.4 removeProject:delete plan 组装(3.1 buildRemovalPlan:实况 path
      // 命中 → pushedWorkspaceId 回退;皆无 = 空 ops = dsh 侧本无物可删)。
      // 调用时序契约:必须在项目行删除之前(期望并集随后 FK cascade 消失)。
      return buildRemovalPlanOf(requireExpectation(projectId), snapshot)
    },

    dispose(): void {
      for (const timer of materializationTimers.values()) clearTimeout(timer)
      materializationTimers.clear()
      if (reconcileTimer === null) return
      clearTimeout(reconcileTimer)
      reconcileTimer = null
      reconcile()
    },
  }
}
