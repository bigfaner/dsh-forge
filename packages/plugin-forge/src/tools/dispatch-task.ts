// dispatchTask tool——循环入口壳（3b 契约归一——dispatch-loop-hardening 改进 3b③ 用户裁决：
// dispatchTask 与 /run-dag-tasks 指令同源同一循环核心，无 job 模式；单次派发原语与池级盲选
// 退役）。本壳职责仅三件：
// ① 参数契约：source_kind + source_slug 成对必填（schema 强制，缺失即拒绝——无池级盲选形态，
//    工具只承载循环语义：启动 / 运行中状态摘要 / 挂起 re-entry 续接）；
// ② 守卫与自解释响应：同容器活循环归属拒绝（P2 守卫行——归属 + 正确入口 stopTaskLoop）、
//    owner 运行中重调返回状态摘要（非拒绝）、挂起循环响应必带挂起摘要（P3 丢失兜底——
//    renderP3 模板同源）+ 接管集写点（非 owner 触达挂起循环 → takeoverSessions.add）；
// ③ 委托循环核心：无登记 → driver.start（会话级单活门控/同源独占由驱动器 start 兑现，
//    owner-active / loop-active 拒绝码转失败 DTO）；挂起 → driver.resume（幂等续接不重开）。
// 结算语义：循环后台自动推进，claim/completion/结束/挂起通知走叙述通道进会话——结算内联于
// 事件流，无 run_in_background/job_output/job_kill 通道（去 job 模式，AC 8）。
//
// 依赖方向：本壳 → loop / dispatch-core 单向（loop 零 import 工具壳不变；核心面主链
// dispatchCore 仍属循环驱动器与兼容消费面——本壳不再直接触达）。
// 兼容再导出面：分层前的公共符号（池快照/组装纯函数/spawn 契约/结果类型）经本壳继续
// 可达（tools/index.ts barrel 与 e2e worker-face 单测的既有 import 面零波及）。
import { CONTAINER_KINDS } from '@dsh-forge/contracts'
import type { ContainerRef, ForgeTasksService } from '@dsh-forge/contracts'
import {
  LOOP_EXCLUSIVE_GUIDANCE,
  poolOf,
} from '../dispatch-core/index.js'
import type { PoolSnapshot } from '../dispatch-core/index.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'
import type { ForgeToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import { payloadOf, renderP3 } from '../loop/injection.js'
import type { LoopDriver, LoopRegistry } from '../loop/index.js'
import type { ForgeToolDeps } from './index.js'
import { optionalEnum, optionalString, requireArgsObject } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, requireSessionId, sessionContextOf } from './session.js'

// 兼容再导出（分层前本文件持有、现居核心面的公共符号——消费面 import 路径零变化）
export { classifyPool, deriveWorkerToolFilter, poolOf, reconcileWorkerReasoning, workerAgentOptionsOf } from '../dispatch-core/index.js'
export type {
  DispatchSpawnedResult,
  DispatchTaskResult,
  PoolSnapshot,
  PoolVerdict,
  SpawnWorker,
  SpawnWorkerHandle,
  SpawnWorkerRequest,
} from '../dispatch-core/index.js'

const TOOL = 'dispatchTask'

// ─────────────────────────── 参数面（source 对 = 容器限定——成对必填，无池级盲选） ───────────────────────────

/** agent 面参数：source_kind+source_slug（3b 起成对必填——schema 强制，缺失即拒绝） */
export interface DispatchTaskToolArgs {
  /** 容器引用（source_kind+source_slug 成对解析产物——循环绑定的唯一容器） */
  readonly source: ContainerRef
  /**
   * 显式 re-entry 确认（挂起冻结守卫——fix-17 · bug 8fb77b41）：挂起待裁决期间对 dispatchTask
   * 的触碰零副作用（只回挂起摘要），携 resume=true 才续接循环——被唤醒模型回合的即时触碰
   * 不得绕过裁决冻结窗（worker-abort-over-limit 挂起后第 5 次 claim 重入的根因封口）。
   */
  readonly resume?: boolean
}

/** 参数防御性收窄（成对必填——缺失/半对即拒；退役键 run_in_background/context_slug 落未知键零效应） */
export function parseDispatchTaskArgs(args: unknown): DispatchTaskToolArgs {
  const a = requireArgsObject(args, TOOL)
  const kind = optionalEnum(a, 'source_kind', CONTAINER_KINDS, TOOL)
  const slug = optionalString(a, 'source_slug', TOOL)
  if (kind === undefined || slug === undefined) {
    throw new Error(
      `${TOOL}: source_kind and source_slug are both required ('feature' | 'proposal' + container slug) — dispatchTask has no pool-wide mode; it starts/re-enters the dispatch loop of exactly one container`,
    )
  }
  const resume = typeof a.resume === 'boolean' ? a.resume : undefined
  return { source: { kind, slug }, ...(resume !== undefined ? { resume } : {}) }
}

// ─────────────────────────── 结果与渲染（三态自解释——started/running/suspended + 失败 DTO） ───────────────────────────

/** 工具侧池快照（PoolSnapshot 扩展——readFailed 在场 = taskStats 读数失败，零值为兜底非实况） */
type ToolPoolSnapshot = PoolSnapshot & { readonly readFailed?: boolean }

/** 工具结果三态（3b 契约——started/running/suspended；守卫与单活拒绝走失败 DTO） */
export type DispatchLoopResult =
  | { readonly kind: 'started'; readonly loopId: string; readonly source: ContainerRef; readonly pool: ToolPoolSnapshot }
  | {
      readonly kind: 'running'
      readonly source: ContainerRef
      readonly ownerSessionId: string
      readonly taskKey?: string
      readonly pool: ToolPoolSnapshot
    }
  | {
      readonly kind: 'suspended'
      readonly loopId: string
      readonly source: ContainerRef
      /** 挂起摘要全文（P3 模板同源——挂起通知渲染失败的兜底读径） */
      readonly summary: string
      /** 本次调用是否完成 re-entry（幂等续接；并发竞态 = false，零动作） */
      readonly resumed: boolean
      /** resumed=false 时的拒绝码（驱动器 resume 原码透传——'aborted' = 挂起期循环已被叫停，
       * 与 'not-suspended' 并发续接竞态在工具面可分辨；'resume-not-requested' = 触碰未携
       * resume:true——挂起冻结守卫生效，循环保持挂起） */
      readonly resumeRejectedCode?: 'no-active-loop' | 'not-suspended' | 'aborted' | 'resume-not-requested'
      /** 非 owner 首触 = 已加入接管集 */
      readonly takenOver: boolean
      readonly pool: ToolPoolSnapshot
    }

/** 池行（无状态快照——dispatcher 继续/收工/fix 链观察判据；读数失败零值标注防误判容器已清空） */
function poolLine(pool: ToolPoolSnapshot): string {
  const base = `pending ${pool.pending} · in_progress ${pool.inProgress} · blocked ${pool.blocked} · unmet-pending ${pool.unmetPending}`
  return pool.readFailed === true ? `${base} · ⚠ pool read FAILED (zero fallback — not actual counts)` : base
}

// 三分判词（POOL_VERDICT_TEXT）随池级盲选退役——no-task 收口叙述归循环 driver
// （classifyPool 于 loop/onNoTask 消费）；本壳不再渲染判词。

/** 池快照 schema（started/running/suspended 共用） */
const POOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pending: { type: 'integer' },
    inProgress: { type: 'integer' },
    blocked: { type: 'integer' },
    unmetPending: { type: 'integer' },
    readFailed: { type: 'boolean', description: 'true = pool stats read failed; the zero values are a fallback, not actual counts' },
  },
  required: ['pending', 'inProgress', 'blocked', 'unmetPending'],
} as const

const SOURCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['feature', 'proposal'] },
    slug: { type: 'string' },
  },
  required: ['kind', 'slug'],
} as const

/** 注册面输出 schema（三成功分支 oneOf + 失败 DTO——registry 双态可校验） */
const DISPATCH_LOOP_OUTPUT_SCHEMA = withFailureVariant({
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['started'] },
        loopId: { type: 'string' },
        source: SOURCE_SCHEMA,
        pool: POOL_SCHEMA,
      },
      required: ['kind', 'loopId', 'source', 'pool'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['running'] },
        source: SOURCE_SCHEMA,
        ownerSessionId: { type: 'string' },
        taskKey: { type: 'string' },
        pool: POOL_SCHEMA,
      },
      required: ['kind', 'source', 'ownerSessionId', 'pool'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['suspended'] },
        loopId: { type: 'string' },
        source: SOURCE_SCHEMA,
        summary: { type: 'string' },
        resumed: { type: 'boolean' },
        resumeRejectedCode: { type: 'string', enum: ['no-active-loop', 'not-suspended', 'aborted', 'resume-not-requested'] },
        takenOver: { type: 'boolean' },
        pool: POOL_SCHEMA,
      },
      required: ['kind', 'loopId', 'source', 'summary', 'resumed', 'takenOver', 'pool'],
    },
  ],
})

/** 三态渲染（Interface 2 场景渲染——响应自解释：守卫/拒绝走 formatFailure，其余语义在文本内） */
function renderDispatchLoopResult(_args: unknown, value: unknown): readonly TextContentBlock[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as DispatchLoopResult
  if (v.kind === 'started') {
    return formatOk(`dispatch loop started for ${v.source.slug} (loop ${v.loopId.slice(0, 8)})`, [
      '- the loop claims ready tasks of this container, spawns in-process workers, settles them and keeps going automatically until no-task — claim/completion/end/suspension notices arrive in this session (no polling needed)',
      `- pool: ${poolLine(v.pool)}`,
      `- stop the loop when needed: stopTaskLoop (source_kind='${v.source.kind}', source_slug='${v.source.slug}')`,
    ])
  }
  if (v.kind === 'running') {
    const lines = [
      `▸ dispatch loop already running for ${v.source.slug} (owner ${v.ownerSessionId} — this session) — status summary, no new loop started`,
      `- current task: ${v.taskKey ?? 'between rounds (claim/spawn/settle cycle)'}`,
      `- pool: ${poolLine(v.pool)}`,
      '- do not start a second loop for this container; end/suspension notices arrive automatically — stop with stopTaskLoop if needed',
    ]
    return [{ type: 'text', text: lines.join('\n') }]
  }
  // suspended——响应必带挂起摘要（P3 兜底）；re-entry 需显式 resume:true（挂起冻结守卫——fix-17）
  const lines = [
    v.summary,
    v.resumed
      ? `- re-entry accepted — the loop resumes from where it suspended (completed tasks are not re-run); pool: ${poolLine(v.pool)}`
      : v.resumeRejectedCode === 'aborted'
        ? `- resume rejected (code 'aborted') — the loop was terminated while suspended and is gone (this is NOT a concurrent re-entry race); start a fresh loop with dispatchTask if needed; pool: ${poolLine(v.pool)}`
        : v.resumeRejectedCode === 'resume-not-requested'
          ? `- re-entry NOT requested — the loop stays suspended (frozen, awaiting verdict); handle the task first, then re-enter with dispatchTask(source_kind, source_slug, resume: true), or stop it with stopTaskLoop; pool: ${poolLine(v.pool)}`
          : `- the loop already resumed (concurrent re-entry) — no action taken; pool: ${poolLine(v.pool)}`,
    ...(v.takenOver ? ['- you have joined the takeover set for this suspended loop — handle the task (addTask/updateTask/user verdict), then re-enter with dispatchTask(resume: true), or stop it with stopTaskLoop'] : []),
  ]
  return [{ type: 'text', text: lines.join('\n') }]
}

// ─────────────────────────── tool 定义（循环入口壳：守卫 + 委托循环核心） ───────────────────────────

/** 循环工具共享 deps（dispatchTask / stopTaskLoop 共用——驱动器 + 登记表单例注入） */
export type LoopToolDeps = {
  /** 循环驱动器（装配单例——与 /run-dag-tasks 指令同源同一循环核心） */
  readonly driver: LoopDriver
  /** 活循环登记表（装配单例——守卫判活/接管集写点读面） */
  readonly registry: LoopRegistry
}

/** dispatchTask 专用 deps（ForgeToolDeps 扩展面——loop 必给） */
export type DispatchTaskToolDeps = ForgeToolDeps & {
  readonly loop: LoopToolDeps
}

/** 池快照现读（fail-soft——读面故障零值兜底 + readFailed 标注：非全零误导模型判容器已清空） */
async function poolSnapshotOf(tasks: ForgeTasksService, projectId: string, source: ContainerRef): Promise<ToolPoolSnapshot> {
  try {
    return poolOf(await tasks.taskStats({ projectId, source }))
  } catch {
    return { pending: 0, inProgress: 0, blocked: 0, unmetPending: 0, readFailed: true }
  }
}

/** 失败 DTO（typed 错误抛出形——callToolFace 统一转失败 DTO + tool-error 留档；
 *  「本次派发未发生」承载码 ERR_SPAWN_FAILED 同先例，data.guidance → violations 派生） */
function rejectionOf(message: string, guidance: readonly string[]): never {
  throw Object.assign(new Error(message), { code: 'ERR_SPAWN_FAILED', data: { guidance } })
}

/** tool 定义工厂（循环入口壳——循环逻辑零保留，主链全在 loop 驱动器） */
export function createDispatchTaskTool(deps: DispatchTaskToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Start or re-enter the dispatch loop for exactly ONE container — source_kind and source_slug are BOTH required (there is no pool-wide mode). This tool is the same loop core as the /run-dag-tasks instruction: the loop claims ready tasks of that container, spawns in-process workers, settles them, and keeps going automatically until no-task; claim/completion/end/suspension notices arrive as session messages — there is no job channel (no run_in_background/job_output/job_kill). Outcomes: (1) no active loop for the container → a new loop starts (inline started receipt; the collaboration-protocol section is injected into your system prompt next turn). (2) the container has an active loop owned by ANOTHER session → rejected: the response names the loop owner and the correct entries (stopTaskLoop to stop it, queryTask to observe). (3) the container loop is running and owned by you → a running status summary (not a rejection). (4) the container loop is SUSPENDED (awaiting verdict on a blocked task) → the response always carries the suspension summary; a plain touch does NOT resume anything (suspension freeze guard — the loop stays frozen until an explicit dispatchTask(..., resume: true)); resume: true re-enters the loop from where it suspended (idempotent re-entry — completed tasks are not re-run; a non-owner first touch joins the takeover set and gets the same summary). (5) session single-active gate: a session runs at most one loop at a time — starting while you already own a loop (running or suspended) is rejected with guidance to finish/stop/dispose it first. A no-task verdict ends the loop (end notice follows). Stop the loop with the stopTaskLoop tool.',
    parameters: {
      type: 'object',
      properties: {
        source_kind: {
          type: 'string',
          description: "Container kind — REQUIRED together with source_slug; one of 'feature' | 'proposal' (anything else is rejected at parse). The dispatch loop is bound to exactly one container.",
        },
        source_slug: {
          type: 'string',
          description: 'Container slug — REQUIRED together with source_kind: the feature directory name or proposal slug whose ready tasks the loop claims, dispatches and settles.',
        },
        resume: {
          type: 'boolean',
          description: 'Set true ONLY to explicitly re-enter a SUSPENDED loop after handling its blocked task (suspension freeze guard — a plain touch never resumes; running/new loops ignore this flag).',
        },
      },
      required: ['source_kind', 'source_slug'],
    },
    output: { schema: DISPATCH_LOOP_OUTPUT_SCHEMA, render: renderDispatchLoopResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<DispatchLoopResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      /** tool-error 归属共享槽（解析前 _pool 兜底；解析后 = 容器） */
      const attribution: { slug?: string } = {}
      return callToolFace(
        async (): Promise<DispatchLoopResult> => {
          const parsed = parseDispatchTaskArgs(args)
          const projectId = requireProjectId(deps.resolveProjectId, session)
          const sessionId = requireSessionId(session)
          await deps.events?.prepare(session)
          const source = parsed.source
          attribution.slug = source.slug
          const { driver, registry } = deps.loop
          const pool = await poolSnapshotOf(deps.tasks, projectId, source)

          // 容器活循环分流（守卫/摘要/re-entry——三态自解释）
          const record = registry.bySource({ kind: source.kind, slug: source.slug })
          if (record !== undefined) {
            if (record.suspended !== undefined) {
              // 挂起态：响应必带挂起摘要（P3 模板同源——丢失兜底读径）；非 owner 首触 = 接管集
              // 唯一工具侧写点。挂起冻结守卫（fix-17 · bug 8fb77b41）：触碰零副作用——仅携
              // resume:true 的显式 re-entry 才续接（幂等续接不重开；未处置的挂起续接后在同任务
              // 再挂起，响应再次携带摘要，零死锁零重开）。被唤醒模型回合的即时触碰不得绕过
              // 裁决冻结窗——否则挂起投影「零第 5 次重入」被模型自主 re-entry 击穿。
              const isOwner = record.ownerSessionId === sessionId
              if (!isOwner) record.takeoverSessions.add(sessionId)
              // 摘要先取（P3 同源挂起摘要）——resume 清 record.suspended 后载荷投影即失真
              const payload = payloadOf(record)
              if (parsed.resume !== true) {
                // 冻结守卫生效：循环保持挂起，仅回摘要 + 续跑指引
                return {
                  kind: 'suspended',
                  loopId: record.id,
                  source,
                  summary: renderP3(payload),
                  resumed: false,
                  resumeRejectedCode: 'resume-not-requested',
                  takenOver: !isOwner,
                  pool,
                }
              }
              const resumed = driver.resume({ loopId: record.id })
              return {
                kind: 'suspended',
                loopId: record.id,
                source,
                summary: renderP3(payload),
                resumed: resumed.ok,
                ...(resumed.ok ? {} : { resumeRejectedCode: resumed.code }),
                takenOver: !isOwner,
                pool,
              }
            }
            if (record.ownerSessionId === sessionId) {
              // owner 运行中重调：状态摘要（非拒绝——无第二循环产生）
              return {
                kind: 'running',
                source,
                ownerSessionId: record.ownerSessionId,
                ...(record.inFlight !== undefined ? { taskKey: record.inFlight.taskKey } : {}),
                pool,
              }
            }
            // 守卫拒绝（他人循环）：失败 DTO——活循环归属 + 正确入口（stopTaskLoop/观察）
            return rejectionOf(
              `dispatch rejected: task source ${source.slug} is owned by an active dispatch loop (loop ${record.id}, owner session ${record.ownerSessionId}) — exclusive until the loop settles`,
              LOOP_EXCLUSIVE_GUIDANCE,
            )
          }

          // 无登记 → 启动循环（会话单活/同源独占门控在 driver.start 兑现——双入口同源）；
          // worktree = 发起会话检出（1.14 cwd 钉定归属——worker 会话 cwd 钉定源）
          const started = await driver.start({
            source,
            ownerSessionId: sessionId,
            parent: exec.agent,
            projectId,
            ...(session.cwd !== undefined ? { worktree: session.cwd } : {}),
          })
          if (!started.ok) {
            if (started.code === 'owner-active') {
              return rejectionOf(started.message, started.guidance)
            }
            // loop-active（守卫读数与 start 之间的竞态窗口）——同守卫拒绝径
            return rejectionOf(started.message, LOOP_EXCLUSIVE_GUIDANCE)
          }
          return { kind: 'started', loopId: started.loopId, source, pool }
        },
        (failure) =>
          emitToolError(deps.events, session.sessionId, attribution.slug ?? slugOfToolArgs(args), TOOL, failure),
      )
    },
  }
}
