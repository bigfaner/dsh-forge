// triage · 处置代理面板（S1c 第二层——LoopTriageHook 实装）。blocked 无 follow-up 时由
// 循环驱动器触发：spawn 一次性处置 subagent（与 worker 同款 in-process 形态——decisions
// #16/#23：同进程、同一 SpawnWorker 真绑定、agentOptions 继承链一致），输入 = 任务简报/
// blocked reason 全文/池快照/最近记录四件套，终态 output 经结构化决策解析交还宿主忠实执行。
//
// 决策权与执行权分离：处置代理只持只读台账两工具（deriveTriageToolFilter——getBug/listBugs
// 只读放开供台账深挖，loop-recurrence-hardening §2.2.1；缺陷写面/任务写面/shell/fs 恒 deny
// ——越权动作结构性不可达），只能以终态文本产出一行 JSON 决策；解析失败/越权动作 →
// TriageDecisionInvalidError（宿主计处置失败入重试上限——R2 模型失误爆炸半径有界）。
//
// 依赖方向：triage → loop（钩子接口/决策类型）/ dispatch-core（spawn 契约与组装面）/
// contracts 单向；驱动器不 import 本面（装配方注入 deps.triage——可拆卸，缺席 = 仅落盘续领）。
import type {
  ForgeSettingsService,
  ForgeTasksService,
  TaskBlockClassification,
  TaskRecordEntry,
} from '@dsh-forge/contracts'
import {
  deriveTriageToolFilter,
  poolOf,
  reconcileWorkerReasoning,
  recurrenceCountOf,
  workerAgentOptionsOf,
} from '../dispatch-core/index.js'
import type { PoolSnapshot, SameSeamRecurrenceFace, SpawnWorker } from '../dispatch-core/index.js'
import type { LoopTriageDecisionResult, LoopTriageHook, LoopTriageInput } from '../loop/index.js'
import { TRIAGE_EXPERT_KEY } from '../loop/index.js'
import type { ExpertProfileResolver, ForgeExpertProfile, ForgeDiagEmitFace } from '../faces.js'
import { emitForgeDiag } from '../faces.js'
import { parseTriageDecision } from './decision.js'
import { composeTriagePrompt } from './prompt.js'
import type { TriageRecurrenceSignal, TriageSignals } from './prompt.js'

/** 档案人格段（与 core claim 链 renderExpertProfileSection 同构——身份头 + personaMd 正文；
 *  本包不依赖 core 包（类型出自 contracts），组装面就地同形承载，persona 单源纪律不变） */
function personaSectionOf(profile: ForgeExpertProfile): string {
  const title = profile.title ?? profile.name
  const gap = /^[A-Za-z]/.test(title) ? ' ' : ''
  return `你是${gap}${title}。\n\n${profile.personaMd}`
}

/**
 * 父会话真机已注册全局工具名读取位（bug 989997bd——triage deny 表与真机工具面求交的
 * 取数缝）：结构化读 parent.ctx.tools.schemas()（官方 dsh-tools 公开投影面，逐 schema
 * 取 name——child restrictableNames 的父域投影）。任一环缺席/形状不符/调用抛错 =
 * undefined（取数失败回落全表 deny——与修复前 loud 行为一致，不静默收窄成空表）。
 */
function registeredToolNamesOf(parent: unknown): readonly string[] | undefined {
  if (typeof parent !== 'object' || parent === null) return undefined
  const ctx = (parent as { ctx?: unknown }).ctx
  if (typeof ctx !== 'object' || ctx === null) return undefined
  const tools = (ctx as { tools?: unknown }).tools
  if (typeof tools !== 'object' || tools === null) return undefined
  const schemas = (tools as { schemas?: unknown }).schemas
  if (typeof schemas !== 'function') return undefined
  let projected: unknown
  try {
    projected = (schemas as (this: unknown) => unknown).call(tools)
  } catch {
    return undefined
  }
  if (!Array.isArray(projected)) return undefined
  const names: string[] = []
  for (const schema of projected) {
    if (typeof schema !== 'object' || schema === null) return undefined
    const name = (schema as { name?: unknown }).name
    if (typeof name !== 'string') return undefined
    names.push(name)
  }
  return names
}

/** 处置代理依赖（装配注入——服务面一次性绑定；循环身份不经此，每循环载体走 LoopTriageInput） */
export interface TriageHookDeps {
  /** core 任务域服务读面（池快照 taskStats + 最近记录 queryTask——输入四件套之③④） */
  readonly tasks: Pick<ForgeTasksService, 'taskStats' | 'queryTask'>
  /** in-process driver spawn 真绑定（与 worker 同一装配单例） */
  readonly spawn: SpawnWorker
  /** forgeSettings 服务面（可选——与 worker 同款 agentOptions 组装，缺席回退父继承） */
  readonly settings?: Pick<ForgeSettingsService, 'get'>
  /** 模型推理档位目录解析（可选——组装面兼容收口同 worker） */
  readonly resolveModelReasoning?: (provider: string, model: string) => Promise<readonly string[] | undefined>
  /** 专家档案取用缝（可选——expert-squad-forge-2 纳入 2：triage persona 档案合成；
   *  缺席 = 形态兼容不携带 persona，与 worker 取用面降级同径） */
  readonly resolveExpertProfile?: ExpertProfileResolver
  /** 台账 recurrence 候选只读检索面（loop-recurrence-hardening §2.2.1 两信号之一——结构兼容
   *  claim 守卫 T3 注入形；缺席/故障 = 信号退化，fail-soft 不阻处置主链） */
  readonly findRecurrenceCandidates?: SameSeamRecurrenceFace
  /** 诊断发射缝（AGENTS §7——降级径留痕：face 缺席 info / 台账读故障 warn；缺席 = console 兜底） */
  readonly diag?: ForgeDiagEmitFace
}

/**
 * 建处置代理钩子（LoopTriageHook 实装——装配方注入循环驱动器 deps.triage）：
 * run = 输入四件套现读（池 taskStats + 任务 queryTask records）→ 类型化提示词组装 →
 * in-process spawn（一次性、全收窄工具面）→ await handle.result → dispose → 决策解析。
 * 任何一步失败（读面/spawn/解析）原样上抛——驱动器按处置失败计入重试上限。
 */
export function createTriageHook(deps: TriageHookDeps): LoopTriageHook {
  return {
    async run(input: LoopTriageInput): Promise<LoopTriageDecisionResult> {
      // ① 输入四件套之③④：池快照 + 最近记录（现读——处置瞬间取数）
      const [stats, detail] = await Promise.all([
        deps.tasks.taskStats({ projectId: input.projectId, source: input.source }),
        deps.tasks.queryTask({
          projectId: input.projectId,
          taskRef: { slug: input.task.slug, localId: input.task.localId },
          include: { records: true },
        }),
      ])
      const pool: PoolSnapshot = poolOf(stats)
      const records: readonly TaskRecordEntry[] = detail.records ?? []
      // ② 两信号（loop-recurrence-hardening §2.2.1——程序面现读结构化事实，语义判断留 agent）：
      //    blocked 归类 = 最近 blocked submit 记录的结构化键；recurrence 链 = 只读 face 现查
      //    （fail-soft 同 claim 守卫——数据源不洁不阻断处置主链）。
      const classification: TaskBlockClassification | undefined = [...records]
        .reverse()
        .find((entry) => entry.verb === 'submit' && entry.toStatus === 'blocked' && entry.blockClassification !== undefined)
        ?.blockClassification
      let recurrence: TriageRecurrenceSignal | undefined
      if (deps.findRecurrenceCandidates === undefined) {
        // AGENTS §7 降级留痕：face 缺席 = 处置两信号之一生产静默关停（bug 0db72bcb 教训）
        emitForgeDiag(deps.diag, {
          level: 'info',
          event: 'recurrence-face-absent',
          message: `triage 处置信号降级：findRecurrenceCandidates face 缺席（${input.task.slug}/${input.task.localId}）——recurrence 链信号缺席（核销装配面接线）`,
          projectId: input.projectId,
        })
      } else {
        try {
          const candidates = await deps.findRecurrenceCandidates(input.projectId, {
            slug: input.task.slug,
            localId: input.task.localId,
            sourceTaskId: input.task.sourceTaskId,
          })
          if (candidates.length > 0) {
            const top = candidates.reduce((a, b) => (recurrenceCountOf(b.chain) > recurrenceCountOf(a.chain) ? b : a))
            recurrence = { chain: top.chain, count: recurrenceCountOf(top.chain) }
          }
        } catch (cause) {
          // fail-soft：台账读故障降级——两信号缺席，提示词照常组装 + warn 留痕
          emitForgeDiag(deps.diag, {
            level: 'warn',
            event: 'recurrence-face-error',
            message: `triage 处置信号降级：台账候选检索故障（${input.task.slug}/${input.task.localId}）——${cause instanceof Error ? cause.message : String(cause)}`,
            projectId: input.projectId,
          })
        }
      }
      const signals: TriageSignals | undefined =
        classification !== undefined || recurrence !== undefined ? { ...(classification !== undefined ? { classification } : {}), ...(recurrence !== undefined ? { recurrence } : {}) } : undefined
      // ③ 类型化提示词（任务简报 + reason 全文 + 池快照 + 最近记录 + 改进 6 增补件 +
      //    两信号：输入面在场才注入，缺席 = 退化现状提示词）
      const prompt = composeTriagePrompt({
        task: input.task,
        reason: input.reason,
        pool,
        records,
        ...(input.lastFailure !== undefined ? { lastFailure: input.lastFailure } : {}),
        ...(input.fixChain !== undefined ? { fixChain: input.fixChain } : {}),
        ...(input.noProgress === true ? { noProgress: true } : {}),
        ...(signals !== undefined ? { signals } : {}),
      })
      // ③ in-process spawn（与 worker 同款形态；agentOptions 继承链一致；parent/signal =
      //    每循环身份载体——输入面逐调用绑定，装配期烘焙无效）
      const settings = deps.settings !== undefined ? await deps.settings.get() : undefined
      // persona 档案合成（expert-squad-forge-2 纳入 2）：键 = settings experts.mapping.triage
      // 覆盖 > 预设 'triage-analyst'；resolver 在场即取（缺档/禁用 = experts.get 错误原样
      // 上抛——fail-loud 同 worker 语义，消息含键名，宿主计处置失败入重试上限）；
      // 取用缝缺席 = 形态兼容不携带 persona（spawn 请求零键——直传 undefined 会被上游
      // 视为显式覆盖，与 worker 同纪律）。
      let persona: string | undefined
      let profile: ForgeExpertProfile | undefined
      if (deps.resolveExpertProfile !== undefined) {
        const key = settings?.experts?.mapping?.triage ?? TRIAGE_EXPERT_KEY
        profile = await deps.resolveExpertProfile('triage', key)
        // 键恒在场（预设兜底）→ profile 恒定义；undefined 仅为类型面收窄，防御性跳过
        persona = profile !== undefined ? personaSectionOf(profile) : undefined
      }
      // Root cause（bug 14984d4f 同族——处置代理与 worker 同一丢失面）：档案 provider+model
      // 成对在场 = 自带完整路由对，必须与 worker 同径进入 agentOptions 组装；此前仅 persona
      // 消费档案、路由对被丢弃回落父继承（task-spawned 审计 model='inherit' 同位证）。
      // expert-squad-default-routing：路由源 = experts 服务折叠应答（profile）——与 worker
      // 同一取用面，forgeSettings.worker 机械读取径退役（settings 仅存 experts.mapping 键）。
      const agentOptions = await reconcileWorkerReasoning(
        workerAgentOptionsOf({ entry: profile }),
        deps.resolveModelReasoning,
      )
      const handle = await deps.spawn({
        prompt,
        parent: input.parent,
        signal: input.signal,
        toolFilter: deriveTriageToolFilter(registeredToolNamesOf(input.parent)),
        ...(agentOptions !== undefined ? { agentOptions } : {}),
        ...(persona !== undefined ? { persona } : {}),
        label: `${input.task.slug}/${input.task.localId} · 处置分析`,
      })
      // ④ 终态 output → 结构化决策 + 处置子会话 id 上浮（triage-progress-row 契约定形——
      //    spawn 产物 handle 直取 workerSessionId；dispose 幂等收尾——成功失败同径）
      let output: string
      try {
        ;({ output } = await handle.result)
      } finally {
        await handle.dispose()
      }
      return { decision: parseTriageDecision(output), workerSessionId: handle.workerSessionId }
    },
  }
}
