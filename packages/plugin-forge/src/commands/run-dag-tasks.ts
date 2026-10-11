// commands · /run-dag-tasks 指令 handler（S2——run-tasks-host-command proposal S2 + SC1 +
// decisions #19/#20/#21）。UI command plane 执行、零模型消息（registry submits nothing）：
// 无参 → forgeTasks.listTasks 单查询派生「尚有非终态任务的任务源」清单（feature + blitz
// 提案双轨——TaskCard.source 判别）→ userQuestions.ask 弹选项（与 ask_user_question 同渲染
// 面）；带参 <source-slug> 直通（同单查询解析 kind）；跑动中再触发 → 查看/停止/替换问询。
// 启动 = loopDriver.start——派发/继续判定与启动模板叙述（①从头/②接续中断/③接续在飞）归
// 循环驱动器（S1b announceStartup，经 S4 notify 模块）；本 handler 只做枚举/问询/启动编排，
// 外加启动链前段的派发指令单行提交（commitDispatchLine——/plan producer 先例，known command
// 零转录的补位；fix-1 根因定罪 + 1.14 修订「先落实会话，再启动循环」：提交先行 = steer 开
// turn 物化会话（脱离 blank 相位）后循环才启动；提交失败可见回执不零痕迹，详见函数注）。
//
// 作用域纪律（decisions #20）：停止与替换恒经 driver.stop({ownerSessionId: 敲指令会话})——
// 驱动器按归属拒绝他会话循环（跨会话隔离）；本会话无活循环的停止 = no-op 文本
// 「本会话没有派发任务」，不附归属。
import { TASK_STATUS_LABELS } from '@dsh-forge/contracts'
import type { ContainerRef, ForgeTasksService, TaskCard, TaskStatus } from '@dsh-forge/contracts'
import { forgeCommandLineMessage } from '../faces.js'
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
  /** 会话 id → agentsRegistry 活根解析（可选——1.18 指令单行 steer 目标解析；缺席 = 退回
   * ctx.parent fallback，向后兼容。与 escalation/narration 同款装配形态：registry 命中 =
   * 活根，splice 实证可收件） */
  readonly resolveAgent?: (ownerSessionId: string) => unknown
  /** 未进入会话激活面（1.19——host sessionController.resolveAgent 活根进入；可选——缺席 =
   * 激活不可达，保持 1.18 回执指引语义）。返回活根 agent（registry 可 get 命中）或
   * undefined（激活失败/面故障——调用方落入既有 registryMissed 回执路）。 */
  readonly enterAgent?: (ownerSessionId: string) => Promise<unknown>
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
 * 单选问询（userQuestions.ask）。收束三路：选中 label / 用户取消（关闭面板、ASK_ABORTED、
 * 空应答）/ 问询通道故障（NO_PROVIDER、异常、非活根 assertLiveRoot 拒绝）——故障与取消
 * 分值回传，调用方分别收口（1.12 三路收敛文案拆分）。signal 透传官方取消语义。
 *
 * agent 活根定向（1.12 定罪修复，2026-10-11）：无 agent 的 ask 走无主 waterfall，
 * 客户端应答器 scopeOf(owner) 取不到会话即拒接 → NO_PROVIDER「面板从不弹出」。
 * 上游契约：携带 agent 时须为注册表精确活根（CALLER_NOT_LIVE/DELEGATED_CALLER 抛错）——
 * 指令 invocation.agent 即当前会话运行时根，天然满足；非活根异常归故障路明确回执，不静默。
 */
/**
 * 问询收束（1.12 三路收敛文案拆分）：用户取消（ASK_ABORTED/关闭面板/空应答）与问询通道
 * 故障（NO_PROVIDER/异常/非活根）分值——故障回执附「带 slug 直通」指引，取消回执归静默不做。
 * 非活根（CALLER_NOT_LIVE/DELEGATED_CALLER——assertLiveRoot 抛）落在故障路：回执带原因码，
 * 不静默、不降级无 agent 重问（无 agent 问询 = 同一 NO_PROVIDER 静默缺陷，降级无意义）。
 */
type AskOutcome =
  | { readonly kind: 'selected'; readonly label: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly reason: string }

/** 用户取消判别（上游 ASK_ABORTED 错误码 / AbortError 名；子串匹配——结构化最小面无类型缝） */
function isAskAborted(cause: unknown): boolean {
  const text = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause)
  return /ASK_ABORTED|AbortError/i.test(text)
}

async function askOption(
  ask: EscalationAskFace,
  question: { readonly id: string; readonly header: string; readonly question: string; readonly detail?: string; readonly options: readonly EscalationAskOption[] },
  signal?: AbortSignal,
  agent?: unknown,
): Promise<AskOutcome> {
  let answer: unknown
  try {
    answer = await ask.ask({
      questions: [
        {
          id: question.id,
          header: question.header,
          question: question.question,
          ...(question.detail !== undefined ? { detail: question.detail } : {}),
          options: question.options,
        },
      ],
      ...(agent !== undefined ? { agent } : {}),
      ...(signal !== undefined ? { signal } : {}),
    })
  } catch (cause) {
    if (isAskAborted(cause)) return { kind: 'cancelled' }
    const reason = cause instanceof Error ? cause.message : String(cause)
    return { kind: 'failed', reason: reason === '' ? '问询通道异常' : reason }
  }
  const item = (answer as { answers?: readonly { id?: unknown; selected?: unknown }[] } | undefined)?.answers?.find(
    (entry) => entry?.id === question.id,
  )
  const selected = Array.isArray(item?.selected) ? item.selected.filter((s): s is string => typeof s === 'string') : []
  return selected.length > 0 ? { kind: 'selected', label: selected[0] as string } : { kind: 'cancelled' }
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
      // 跑动中再触发（v1 单活——decisions #19/#20）：先判归属——他会话活循环不进
      // 查看/停止/替换问询（decisions #20 作用域下那些操作对本会话全是 no-op，
      // 问询面板是假所有权），改出明确回执；仅本会话自己的活循环才弹问询。
      const running = deps.driver.active()
      if (running !== undefined) {
        if (deps.driver.activeOf(ctx.sessionId) === undefined) {
          return foreignLoopNotice(running, slug)
        }
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
  const outcome = await askOption(
    deps.ask,
    {
      id: SOURCE_QUESTION_ID,
      header: '派发任务',
      question: '选择要派发的任务源',
      detail: '选中后自动开始派发循环，任务逐一执行直到该任务源全部完成。',
      options: candidates.map((candidate) => ({ label: candidate.label, description: candidate.description })),
    },
    ctx.signal,
    ctx.parent, // ask 活根定向（无 agent 无应答器接受——NO_PROVIDER 面板不弹）
  )
  if (outcome.kind === 'selected') {
    const selected = candidates.find((candidate) => candidate.label === outcome.label)
    if (selected !== undefined) {
      return startSource(deps, ctx, selected.source)
    }
  }
  if (outcome.kind === 'failed') {
    // 问询通道故障（NO_PROVIDER/异常/非活根）≠ 用户取消——error 回执 + slug 直通指引，不静默
    return { kind: 'error', text: `任务源问询通道故障（${outcome.reason}）——可带任务源 slug 直通：/run-dag-tasks <source-slug>` }
  }
  return { kind: 'success', text: '未选择任务源，未启动派发循环——可带 slug 直通：/run-dag-tasks <source-slug>' }
}

/** 跑动中再触发：查看/停止/替换问询（停止/替换恒经本会话作用域——decisions #20）
 *  1.18 核验：本径零 commitDispatchLine/steer 触达——仅 driver.activeOf/stop + ask 面投递；
 *  ask 的 agent 活根解析归上游 escalation/answerer（resolveAgent 同源），无 undefined.send 同类面。 */
async function handleRunning(deps: RunDagTasksDeps, ctx: InvokeContext, running: LoopRecord, slug: string): Promise<ForgeCommandResult> {
  if (deps.ask === undefined) {
    return runningView(running) // 问询面缺席 = 降级为查看文本（fail-soft 同源）
  }
  const outcome = await askOption(
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
    ctx.parent, // ask 活根定向（无 agent 无应答器接受——NO_PROVIDER 面板不弹）
  )
  if (outcome.kind === 'selected') {
    if (outcome.label === '查看') return runningView(running)
    if (outcome.label === '停止') return stopOwn(deps, ctx)
    if (outcome.label === '替换') {
      await deps.driver.stop({ ownerSessionId: ctx.sessionId }) // 本会话作用域；他会话循环原样（隔离）
      return slug !== '' ? startWithSlug(deps, ctx, slug) : pickAndStart(deps, ctx)
    }
  }
  if (outcome.kind === 'failed') {
    // 问询通道故障 ≠ 用户取消——error 回执不静默（循环保持原状），附替代指引
    return {
      kind: 'error',
      text: `派发问询通道故障（${outcome.reason}）——停止可执行 /stop-dag-tasks，或带任务源 slug 直通：/run-dag-tasks <source-slug>`,
    }
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

/**
 * 他会话活循环回执（归属判序前置）：本会话无活循环而全局有——停止/替换对本会话恒 no-op
 * （decisions #20 跨会话隔离），不弹问询、零归属 id 泄露；单活模型下带参直通也无法启动，
 * 明示接管路径（到启动会话执行 /stop-dag-tasks 或等待完成）。
 */
function foreignLoopNotice(running: LoopRecord, requestedSlug: string): ForgeCommandResult {
  const requested = requestedSlug !== '' ? `；本次请求的任务源 ${requestedSlug} 未启动` : ''
  return {
    kind: 'success',
    text: `任务源 ${running.source.slug} 的派发循环正由其它会话运行——本会话没有可操作的派发循环${requested}。单活模型下无法并行派发；如需接管，请到启动它的会话执行 /stop-dag-tasks，或等待其完成。`,
  }
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

/**
 * 启动（loopDriver.start——派发/继续判定与启动叙述归驱动器）；单活竞态兜底 = 「已在运行」。
 *
 * 1.14 修复序（用户裁决 2026-10-11「先创建会话，再启动循环」）：派发指令单行提交先行——
 * agent.steer 收件 = idle 驱动开 turn（上游契约），turn/start 落地即会话物化（脱离
 * hero/blank 相位）；物化后的主会话再走 driver.start 启动链（worker spawn 的 owner
 * 依赖与启动叙述/领取结果 notice 的投影前提均落在真实对话面上）。提交失败不回滚启动
 * （fail-soft 纪律不变），但产出可见回执（防零痕迹——案发：blank 相位零消息事件，
 * 静默失败 = 用户「没有任何反应」）。
 */
async function startSource(deps: RunDagTasksDeps, ctx: InvokeContext, source: ContainerRef): Promise<ForgeCommandResult> {
  // 1.19 修复序（深层根因：owner 会话 agent 未进入运行时 → steer 内件 undefined.send）：
  // 先进入再提交再启动——registry 未命中且激活面在场时，经 host sessionController.resolveAgent
  // 进入/恢复会话 agent（上游 prompt 同径），进入成功后才提交指令单行、才 driver.start。
  await ensureAgentEntered(deps, ctx.sessionId)
  // 先落实会话（转录承载 + 非 blank 化）——1.18 起 steer 目标恒先经 agentsRegistry 解析活根
  // （ctx.parent 仅 registry 未命中时的 fallback，向后兼容）
  const commit = commitDispatchLine(deps.resolveAgent, ctx.sessionId, ctx.parent, source)
  const result = await deps.driver.start({
    source,
    ownerSessionId: ctx.sessionId,
    parent: ctx.parent,
    projectId: ctx.projectId,
  })
  if (!result.ok) {
    // loop-active（active() 读数与 start 之间的竞态窗口；含他会话刚启动的循环）——不重复启动
    return { kind: 'success', text: `任务源 ${result.activeSource.slug} 的派发循环已在运行，本次未重复启动` }
  }
  const base = `任务源 ${source.slug} 的派发循环已启动`
  if (commit.committed) return { kind: 'success', text: base }
  // registry 未命中（会话运行时确实不存在/agent 缺席）→ 明确 error 回执指引激活，不静默
  // 不 wedge、不回滚已启动的循环（1.14 语义保持——循环照常，仅单行提交面可见失败）
  if (commit.registryMissed) {
    return {
      kind: 'error',
      text: `${base}，但指令单行提交失败（${commit.reason}）——会话运行时未就绪。请先在会话中发送任意消息激活会话，或经任务面板派发按钮新建会话后重试；已启动的循环不受影响`,
    }
  }
  return { kind: 'success', text: `${base}——注意：指令单行提交失败（${commit.reason}），会话可能仍处空相位，启动叙述或不可见` }
}

/**
 * 未进入态激活（1.19——「先进入再提交」前置步）：agentsRegistry.get 未命中 = owner 会话
 * agent 未进入运行时（un-entered——上游生命周期：创建 → 进入后 inbox/driver 内件才存在，
 * runtime-types 'agent/created' "newly registered agent with its live session"）。激活面
 * （host sessionController.resolveAgent——上游 prompt 径同款进入机制）在场即进入：成功返回
 * 活根；失败/缺席/抛错 = fail-soft false（不外抛、console.warn 留痕），调用方落入 1.18
 * registryMissed 回执路（指引激活，不静默）。resolveAgent 缺席（旧装配形态）= 不激活——
 * 向后兼容语义原样（ctx.parent fallback 承接）。
 */
async function ensureAgentEntered(deps: RunDagTasksDeps, sessionId: string): Promise<boolean> {
  if (deps.resolveAgent === undefined) return false
  if (deps.resolveAgent(sessionId) !== undefined) return true // 已进入（活根在场）
  if (deps.enterAgent === undefined) return false
  try {
    const entered = await deps.enterAgent(sessionId)
    if (entered !== undefined) return true
    console.warn(`forge dispatch line activation failed (${sessionId}): sessionController 返回非活根（error 路或会话不存在）`)
    return false
  } catch (cause) {
    console.warn(`forge dispatch line activation failed (${sessionId}): ${cause instanceof Error ? cause.message : String(cause)}`)
    return false
  }
}

/**
 * 派发指令单行提交（S2 producer 显式提交——/plan 先例；1.14 起兼会话物化步）：known
 * command 经上游 slash 仲裁路由 command plane 执行，注册表本身零转录（"the registry
 * itself submits nothing"）——若 producer 不提交，S5 指令单行永不落会话转录，且会话零
 * turn/start 恒 blank（hero 不退场、会话头预设投影标签不挂载——S6 e2e uf3/sc5/dogfood
 * 三旅程断言面）。agent.steer 收件 = idle 驱动开 turn（上游契约），转录承载与转录面切
 * 换同径兑现。
 *
 * fail-soft 纪律（R3 防御读取同源 + 1.14 可见性修订 + 1.18 活根定罪修复）：steer 面
 * 缺席/非函数/投递抛错 = 不回滚启动、不外抛，但不再零痕迹——返回失败态（调用方产出可见
 * 回执）并保留 console.warn 告警日志（SC7「注入失败循环照常结束」同源）。
 *
 * 1.18 steer 目标活根化（真机定罪：两容器同症状 `undefined.send`）：1.14 直用 ctx.parent
 * （command invocation agent 把手）——对从未开启过回合的会话，该把手的运行时内件未初始化，
 * steer 内部 undefined.send 抛错。对照实证：notice/escalation 均经 agentsRegistry.get
 * (sessionId) 解析活根且收件正常——本函数同款：resolveAgent 命中 = 活根（splice 实证可
 * 收件）；未命中 = 会话运行时确实不存在 → fallback ctx.parent（向后兼容——registry 注入
 * 缺席的旧装配形态）；fallback 亦无 steer 面 = registryMissed 败态（调用方 error 回执
 * 指引激活）。
 */
interface CommitOutcome {
  committed: boolean
  /** resolveAgent 在场但未解析到活根（fallback 亦未能提交时 = 会话运行时未就绪信号） */
  registryMissed: boolean
  reason?: string
}

function commitDispatchLine(
  resolveAgent: ((ownerSessionId: string) => unknown) | undefined,
  sessionId: string,
  fallback: unknown,
  source: ContainerRef,
): CommitOutcome {
  const registryAgent = resolveAgent?.(sessionId)
  const viaRegistry = registryAgent !== undefined
  const target = viaRegistry ? registryAgent : fallback
  const steer = (target as { steer?: (message: unknown) => void } | undefined)?.steer
  if (typeof steer !== 'function') {
    const reason = viaRegistry ? 'registry 活根 steer 面缺席' : 'steer 面缺席'
    console.warn(`forge dispatch line commit failed (${source.slug}): ${reason}`)
    return { committed: false, registryMissed: !viaRegistry && resolveAgent !== undefined, reason }
  }
  try {
    steer(forgeCommandLineMessage(`/${RUN_DAG_TASKS_NAME} ${source.slug}`))
    return { committed: true, registryMissed: !viaRegistry && resolveAgent !== undefined }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    console.warn(`forge dispatch line commit failed (${source.slug}): ${reason}`)
    return { committed: false, registryMissed: !viaRegistry && resolveAgent !== undefined, reason }
  }
}
