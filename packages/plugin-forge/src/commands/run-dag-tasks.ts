// commands · /run-dag-tasks 指令 handler（S2——run-tasks-host-command proposal S2 + SC1 +
// decisions #19/#20/#21）。UI command plane 执行、零模型消息（registry submits nothing）：
// 无参 → forgeTasks.listTasks 单查询派生「尚有非终态任务的任务源」清单（feature + blitz
// 提案双轨——TaskCard.source 判别）→ userQuestions.ask 弹选项（与 ask_user_question 同渲染
// 面）；带参 <source-slug> 直通（同单查询解析 kind）；跑动中再触发 → 查看/停止/替换问询。
// 启动 = loopDriver.start——派发/继续判定与启动模板叙述（①从头/②接续中断/③接续在飞）归
// 循环驱动器（S1b announceStartup，经 S4 notify 模块）；本 handler 只做枚举/问询/启动编排。
//
// 作用域纪律（decisions #20）：停止与替换恒经 driver.stop({ownerSessionId: 敲指令会话})——
// 驱动器按归属拒绝他会话循环（跨会话隔离）；本会话无活循环的停止 = no-op 文本
// 「本会话没有派发任务」，不附归属。
import { TASK_STATUS_LABELS } from '@dsh-forge/contracts'
import type { ContainerRef, ForgeTasksService, TaskCard, TaskStatus } from '@dsh-forge/contracts'
import type { EscalationAskFace, EscalationAskOption, LoopDriver, LoopRecord } from '../loop/index.js'
import type { ForgeCommandInvocation, ForgeCommandResult } from '../faces.js'
import type { ProjectIdResolver } from '../tools/index.js'
import { NO_ACTIVE_LOOP_TEXT } from './stop-dag-tasks.js'

/** 指令名（S5 GUI 派发按钮 `DISPATCH_COMMAND_PREFIX` 换值锚——'/run-dag-tasks '） */
export const RUN_DAG_TASKS_NAME = 'run-dag-tasks'

/** 任务源选择问询 id（userQuestions answers 回读键） */
const SOURCE_QUESTION_ID = 'forge-run-dag-tasks-source'
/** 跑动中再触发的操作问询 id */
const RUNNING_QUESTION_ID = 'forge-run-dag-tasks-running'

/** 终态集（core 相位推导机 TERMINAL_TASK_STATUSES 口径镜像——completed/skipped/rejected；
 *  renderer/plugin 禁 import core 同款本地镜像纪律，值漂移由契约 pin 承接） */
const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['completed', 'skipped', 'rejected'])

/** 非终态呈现序（用户视角：正在执行 → 受阻 → 已中断 → 待处理 → 已挂起） */
const NON_TERMINAL_ORDER: readonly TaskStatus[] = ['in_progress', 'blocked', 'interrupted', 'pending', 'suspended']

/** handler 依赖（装配方注入——driver 单例 + core 读面 + cwd→projectId 解析 + 问询面可缺席） */
export interface RunDagTasksDeps {
  readonly driver: LoopDriver
  readonly tasks: ForgeTasksService
  readonly resolveProjectId: ProjectIdResolver
  /** userQuestions.ask 最小面（可选——缺席 = 无参枚举/跑动中问询降级为指引文本，R3 fail-soft 同源） */
  readonly ask?: EscalationAskFace
}

// ─────────────────────────── 单查询枚举（「尚有非终态任务的任务源」） ───────────────────────────

/** 双轨候选行（label = slug——问询回读键；description = 用户视角余量摘要） */
export interface SourceCandidate {
  readonly source: ContainerRef
  readonly label: string
  readonly description: string
}

/**
 * 单查询派生候选（listTasks 全量卡 → 按 TaskCard.source 分组 → 过滤全终态源）。
 * 无 source 卡（旧读面/异构生产者）= 跳过——枚举面宁缺勿错。排序：未完成多者在前，
 * 同量按 slug 稳定决胜。
 */
export function nonTerminalSourcesOf(cards: readonly TaskCard[]): readonly SourceCandidate[] {
  const groups = new Map<string, { source: ContainerRef; counts: Map<TaskStatus, number> }>()
  for (const card of cards) {
    if (card.source === undefined) continue
    if (TERMINAL_TASK_STATUSES.has(card.taskStatus)) continue // 终态行不入候选计数（守卫显式化）
    const key = `${card.source.kind}/${card.source.slug}`
    let group = groups.get(key)
    if (group === undefined) {
      group = { source: card.source, counts: new Map<TaskStatus, number>() }
      groups.set(key, group)
    }
    group.counts.set(card.taskStatus, (group.counts.get(card.taskStatus) ?? 0) + 1)
  }
  const candidates: (SourceCandidate & { open: number })[] = []
  for (const group of groups.values()) {
    let open = 0
    const parts: string[] = []
    for (const status of NON_TERMINAL_ORDER) {
      const n = group.counts.get(status) ?? 0
      if (n > 0) {
        open += n
        parts.push(`${TASK_STATUS_LABELS[status].zh} ${n}`)
      }
    }
    if (open > 0) {
      candidates.push({
        source: group.source,
        label: group.source.slug,
        description: `${group.source.kind === 'feature' ? 'feature' : '提案'}——未完成 ${open}（${parts.join('，')}）`,
        open,
      })
    }
  }
  return candidates
    .sort((a, b) => (a.open !== b.open ? b.open - a.open : a.label < b.label ? -1 : 1))
    .map(({ source, label, description }) => ({ source, label, description }))
}

/** slug → 任务源解析（同一单查询读面；命中任一轨即直通——成链撞键取首见） */
async function resolveSourceBySlug(tasks: ForgeTasksService, projectId: string, slug: string): Promise<ContainerRef | undefined> {
  const cards = await tasks.listTasks({ projectId })
  return cards.find((card) => card.source !== undefined && card.source.slug === slug)?.source
}

// ─────────────────────────── 问询（与 ask_user_question 同渲染面） ───────────────────────────

/**
 * 单选问询（userQuestions.ask）。回执取 answers 中本问询 id 的首个选中 label；
 * 关闭面板/取消（ASK_ABORTED）/服务故障 = undefined——调用方按「未选择」收口（fail-soft，
 * 指令面零外抛）。signal 透传官方取消语义（invocation.signal 随载）。
 */
async function askOption(
  ask: EscalationAskFace,
  question: { readonly id: string; readonly header: string; readonly question: string; readonly detail?: string; readonly options: readonly EscalationAskOption[] },
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    const answer = await ask.ask({
      questions: [
        {
          id: question.id,
          header: question.header,
          question: question.question,
          ...(question.detail !== undefined ? { detail: question.detail } : {}),
          options: question.options,
        },
      ],
      ...(signal !== undefined ? { signal } : {}),
    })
    const item = (answer as { answers?: readonly { id?: unknown; selected?: unknown }[] } | undefined)?.answers?.find(
      (entry) => entry?.id === question.id,
    )
    const selected = Array.isArray(item?.selected) ? item.selected.filter((s): s is string => typeof s === 'string') : []
    return selected[0]
  } catch {
    return undefined
  }
}

// ─────────────────────────── handler ───────────────────────────

/** 启动编排上下文（会话身份 + 项目解析产物） */
interface InvokeContext {
  readonly projectId: string
  readonly sessionId: string
  readonly parent: unknown
  readonly signal?: AbortSignal
}

/** handler（ForgeCommandDefinition.handler 形状——UI command plane 直执行，零模型消息） */
export function createRunDagTasksHandler(
  deps: RunDagTasksDeps,
): (invocation: ForgeCommandInvocation) => Promise<ForgeCommandResult> {
  return async ({ agent, rawInput, signal }: ForgeCommandInvocation): Promise<ForgeCommandResult> => {
    // 会话身份与工作区解析（cwd 绑定表未命中 = 未注册——指令面错误回执，零状态触达）
    const cwd = agent.session.header?.cwd ?? agent.session.cwd
    const projectId = cwd !== undefined ? deps.resolveProjectId(cwd) : undefined
    if (projectId === undefined) {
      return { kind: 'error', text: '当前工作区未注册项目，无法派发任务' }
    }
    const ctx: InvokeContext = { projectId, sessionId: agent.session.id, parent: agent, ...(signal !== undefined ? { signal } : {}) }
    const slug = rawInput.trim()
    try {
      // 跑动中再触发（v1 单活——任意归属活循环在场即问询，decisions #19/#20）
      const running = deps.driver.active()
      if (running !== undefined) {
        return await handleRunning(deps, ctx, running, slug)
      }
      if (slug !== '') {
        return await startWithSlug(deps, ctx, slug) // 带参直通
      }
      return await pickAndStart(deps, ctx) // 无参枚举 + 问询
    } catch (cause) {
      return { kind: 'error', text: `派发启动失败：${cause instanceof Error ? cause.message : String(cause)}` }
    }
  }
}

/** 带参直通：解析 slug → 启动（未知 slug = 错误回执 + 无参指引） */
async function startWithSlug(deps: RunDagTasksDeps, ctx: InvokeContext, slug: string): Promise<ForgeCommandResult> {
  const source = await resolveSourceBySlug(deps.tasks, ctx.projectId, slug)
  if (source === undefined) {
    return { kind: 'error', text: `没有找到任务源 ${slug}——可执行无参 /run-dag-tasks 查看可派发的任务源` }
  }
  return startSource(deps, ctx, source)
}

/** 无参：单查询枚举 → 问询选择 → 启动（零候选/未选/问询缺席 = 不启动 fail-soft 收口） */
async function pickAndStart(deps: RunDagTasksDeps, ctx: InvokeContext): Promise<ForgeCommandResult> {
  const candidates = nonTerminalSourcesOf(await deps.tasks.listTasks({ projectId: ctx.projectId })) // 单查询
  if (candidates.length === 0) {
    return { kind: 'success', text: '没有未完成的任务，无需派发' }
  }
  if (deps.ask === undefined) {
    return { kind: 'success', text: '当前没有可用的问询通道——请带任务源 slug 执行 /run-dag-tasks <source-slug>' }
  }
  const picked = await askOption(
    deps.ask,
    {
      id: SOURCE_QUESTION_ID,
      header: '派发任务',
      question: '选择要派发的任务源',
      detail: '选中后自动开始派发循环，任务逐一执行直到该任务源全部完成。',
      options: candidates.map((candidate) => ({ label: candidate.label, description: candidate.description })),
    },
    ctx.signal,
  )
  const selected = candidates.find((candidate) => candidate.label === picked)
  if (picked === undefined || selected === undefined) {
    return { kind: 'success', text: '未选择任务源，未启动派发循环' }
  }
  return startSource(deps, ctx, selected.source)
}

/** 跑动中再触发：查看/停止/替换问询（停止/替换恒经本会话作用域——decisions #20） */
async function handleRunning(deps: RunDagTasksDeps, ctx: InvokeContext, running: LoopRecord, slug: string): Promise<ForgeCommandResult> {
  if (deps.ask === undefined) {
    return runningView(running) // 问询面缺席 = 降级为查看文本（fail-soft 同源）
  }
  const picked = await askOption(
    deps.ask,
    {
      id: RUNNING_QUESTION_ID,
      header: '派发循环进行中',
      question: `任务源 ${running.source.slug} 已有派发循环在运行，要做什么？`,
      detail:
        running.inFlight !== undefined
          ? `正在执行：${running.inFlight.taskKey} ${running.inFlight.title}`
          : '当前没有正在执行的任务',
      options: [
        { label: '查看', description: '看看当前进行到哪了' },
        { label: '停止', description: '停止本会话启动的派发循环' },
        { label: '替换', description: '停止本会话的循环，改为派发其它任务源' },
      ],
    },
    ctx.signal,
  )
  if (picked === '查看') return runningView(running)
  if (picked === '停止') return stopOwn(deps, ctx)
  if (picked === '替换') {
    await deps.driver.stop({ ownerSessionId: ctx.sessionId }) // 本会话作用域；他会话循环原样（隔离）
    return slug !== '' ? startWithSlug(deps, ctx, slug) : pickAndStart(deps, ctx)
  }
  return { kind: 'success', text: '未选择操作，派发循环保持不变' }
}

/** 查看回执（任务源 + 在飞事实；零归属 id 泄露——会话 id 不进指令面文本） */
function runningView(running: LoopRecord): ForgeCommandResult {
  const fact =
    running.inFlight !== undefined
      ? `正在执行 ${running.inFlight.taskKey} ${running.inFlight.title}`
      : '当前没有正在执行的任务'
  return { kind: 'success', text: `任务源 ${running.source.slug} 的派发循环进行中，${fact}。停止请执行 /stop-dag-tasks。` }
}

/** 停止本会话循环（收口叙述由驱动器发向 owner 会话——⑰ stopped-by-command；此处仅回执） */
async function stopOwn(deps: RunDagTasksDeps, ctx: InvokeContext): Promise<ForgeCommandResult> {
  const record = deps.driver.activeOf(ctx.sessionId)
  const result = await deps.driver.stop({ ownerSessionId: ctx.sessionId })
  if (!result.ok) {
    return { kind: 'success', text: NO_ACTIVE_LOOP_TEXT } // 他会话循环被驱动器作用域拒绝——no-op 零归属
  }
  const slug = record?.source.slug
  const inflight = result.hadInFlight ? '，正在执行的任务已暂停，下次派发会继续' : ''
  return { kind: 'success', text: `已停止${slug !== undefined ? `任务源 ${slug} 的` : ''}派发循环${inflight}` }
}

/** 启动（loopDriver.start——派发/继续判定与启动叙述归驱动器）；单活竞态兜底 = 「已在运行」 */
async function startSource(deps: RunDagTasksDeps, ctx: InvokeContext, source: ContainerRef): Promise<ForgeCommandResult> {
  const result = await deps.driver.start({
    source,
    ownerSessionId: ctx.sessionId,
    parent: ctx.parent,
    projectId: ctx.projectId,
  })
  if (result.ok) {
    return { kind: 'success', text: `任务源 ${source.slug} 的派发循环已启动` }
  }
  // loop-active（active() 读数与 start 之间的竞态窗口；含他会话刚启动的循环）——不重复启动
  return { kind: 'success', text: `任务源 ${result.activeSource.slug} 的派发循环已在运行，本次未重复启动` }
}
