// stopTaskLoop tool（3b 新工具——dispatch-loop-hardening 改进 3b③ 用户裁决：停止入口 =
// 指令 + 独立新工具）。语义 = 请求停止该容器/本会话的派发循环：与 /stop-dag-tasks 双入口
// 同 registry 判活（同一驱动器 stopLoop——统一结束处理单源：在途 worker 取消、孤儿任务真化
// interrupted、收口叙述 + 结束通知、终态注销）。
// 作用域裁决（2026-10-17）：运行中仅 owner 可停（decisions #20 隔离纪律）；挂起态
// （awaiting-verdict）任意会话可停——支撑其它会话接管。越权/无活循环拒绝并自解释
// （归属会话 + 正确入口；source 对缺席 = 停本会话自己的活循环）。
import { CONTAINER_KINDS } from '@dsh-forge/contracts'
import type { ContainerRef } from '@dsh-forge/contracts'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'
import type { ForgeToolDefinition, TextContentBlock, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalEnum, optionalString, requireArgsObject } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireSessionId, sessionContextOf } from './session.js'
import type { LoopToolDeps } from './dispatch-task.js'

const TOOL = 'stopTaskLoop'

/** 拒绝（typed 错误抛出形——callToolFace 统一转失败 DTO + tool-error 留档；承载码同先例） */
function stopRejection(message: string, guidance: readonly string[] = []): never {
  throw Object.assign(new Error(message), { code: 'ERR_SPAWN_FAILED', data: { guidance } })
}

// ─────────────────────────── 参数面（source 对可选——缺席 = 停本会话自己的活循环） ───────────────────────────

export interface StopTaskLoopToolArgs {
  /** 目标容器（成对解析；缺席 = byOwner(本会话)——停自己发起的活循环） */
  readonly source?: ContainerRef
}

/** 参数防御性收窄（成对可选——半对即拒） */
export function parseStopTaskLoopArgs(args: unknown): StopTaskLoopToolArgs {
  const a = requireArgsObject(args, TOOL)
  const kind = optionalEnum(a, 'source_kind', CONTAINER_KINDS, TOOL)
  const slug = optionalString(a, 'source_slug', TOOL)
  if (kind === undefined && slug === undefined) return {}
  if (kind === undefined || slug === undefined) {
    throw new Error(`${TOOL}: source_kind and source_slug must be given together (both or neither)`)
  }
  return { source: { kind, slug } }
}

// ─────────────────────────── 结果与渲染（stopped + 失败 DTO） ───────────────────────────

export type StopTaskLoopResult =
  | { readonly kind: 'stopped'; readonly source: ContainerRef; readonly hadInFlight: boolean }

// 成功支仅 'stopped' 一种——直接作为 withFailureVariant 的成功 schema（不嵌 oneOf：
// 宿主子集校验要求 oneOf ≥2 元素，单支嵌套 = 注册即拒炸会话 resume，见 plugin.test 宿主镜像）
const STOP_TASK_LOOP_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['stopped'] },
    source: {
      type: 'object',
      additionalProperties: false,
      properties: { kind: { type: 'string', enum: ['feature', 'proposal'] }, slug: { type: 'string' } },
      required: ['kind', 'slug'],
    },
    hadInFlight: { type: 'boolean' },
  },
  required: ['kind', 'source', 'hadInFlight'],
})

function renderStopTaskLoopResult(_args: unknown, value: unknown): readonly TextContentBlock[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as StopTaskLoopResult
  return formatOk(`dispatch loop stopped for ${v.source.slug}`, [
    v.hadInFlight
      ? '- the in-flight task was cancelled and marked interrupted (it will be recovered by a later loop run)'
      : '- no task was in flight',
    '- the loop is terminated (final state) — restart anytime with dispatchTask(source_kind, source_slug)',
  ])
}

// ─────────────────────────── tool 定义（判活 + 作用域裁决 + 委托 driver.stopLoop） ───────────────────────────

/** stopTaskLoop 专用 deps（ForgeToolDeps 扩展面——loop 必给） */
export type StopTaskLoopToolDeps = ForgeToolDeps & {
  readonly loop: LoopToolDeps
}

export function createStopTaskLoopTool(deps: StopTaskLoopToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      "Stop a dispatch loop: cancels the in-flight worker (the task is marked interrupted and recovered by a later loop run), runs the unified end handling and delivers the end notice — the same registry-based liveness and termination path as the /stop-dag-tasks instruction. Args: give source_kind + source_slug (both) to target that container's loop; give neither to stop the loop owned by THIS session. Scope: a RUNNING loop may only be stopped by its owner session; a SUSPENDED loop (awaiting verdict) may be stopped by ANY session (takeover support). A stop request from a non-owner on a running loop is rejected naming the owner session; with no active loop at all the call is rejected with guidance on how to start one.",
    parameters: {
      type: 'object',
      properties: {
        source_kind: {
          type: 'string',
          description: "Container kind — required together with source_slug to target that container's loop; one of 'feature' | 'proposal'. Omit both to stop this session's own active loop.",
        },
        source_slug: {
          type: 'string',
          description: 'Container slug (feature directory name or proposal slug) — required together with source_kind; omit both to stop this session\'s own active loop.',
        },
      },
    },
    output: { schema: STOP_TASK_LOOP_OUTPUT_SCHEMA, render: renderStopTaskLoopResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<StopTaskLoopResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      const attribution: { slug?: string } = {}
      return callToolFace(
        async (): Promise<StopTaskLoopResult> => {
          const parsed = parseStopTaskLoopArgs(args)
          const sessionId = requireSessionId(session)
          await deps.events?.prepare(session)
          const { driver, registry } = deps.loop
          const record =
            parsed.source !== undefined
              ? registry.bySource({ kind: parsed.source.kind, slug: parsed.source.slug })
              : registry.byOwner(sessionId)
          attribution.slug = record?.source.slug ?? parsed.source?.slug ?? '_owner'
          if (record === undefined) {
            // 无活循环：自解释拒绝（含启动入口）
            stopRejection(
              'stop rejected: there is no active dispatch loop' +
                (parsed.source !== undefined ? ` for ${parsed.source.slug}` : ' owned by this session') +
                ' — loops end on their own when the container settles; start one with dispatchTask(source_kind, source_slug) or /run-dag-tasks <slug>',
            )
          }
          const source: ContainerRef = { kind: record.source.kind, slug: record.source.slug }
          const stopped = await driver.stopLoop({ loopId: record.id, requesterSessionId: sessionId })
          if (!stopped.ok) {
            if (stopped.code === 'forbidden') {
              // 越权拒绝（运行中非 owner）：自解释——归属会话 + 作用域规则 + 可行入口
              stopRejection(
                `stop rejected: the dispatch loop for ${source.slug} is RUNNING and owned by session ${stopped.ownerSessionId} — only the owner session may stop a running loop`,
                [
                  'a SUSPENDED loop (awaiting verdict) may be stopped by any session — this one is running; observe it with queryTask/taskStats instead',
                  'have the owner session stop it (stopTaskLoop or /stop-dag-tasks), or wait for it to settle',
                ],
              )
            }
            stopRejection('stop rejected: the loop already reached a final state (concurrent stop/settle) — no action taken')
          }
          return { kind: 'stopped', source, hadInFlight: stopped.hadInFlight }
        },
        (failure) =>
          emitToolError(deps.events, session.sessionId, attribution.slug ?? slugOfToolArgs(args), TOOL, failure),
      )
    },
  }
}
