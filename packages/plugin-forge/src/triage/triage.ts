// triage · 处置代理面板（S1c 第二层——LoopTriageHook 实装）。blocked 无 follow-up 时由
// 循环驱动器触发：spawn 一次性处置 subagent（与 worker 同款 in-process 形态——decisions
// #16/#23：同进程、同一 SpawnWorker 真绑定、agentOptions 继承链一致），输入 = 任务简报/
// blocked reason 全文/池快照/最近记录四件套，终态 output 经结构化决策解析交还宿主忠实执行。
//
// 决策权与执行权分离：处置代理零工具（deriveTriageToolFilter 全收窄——越权动作结构性
// 不可达），只能以终态文本产出一行 JSON 决策；解析失败/越权动作 → TriageDecisionInvalidError
// （宿主计处置失败入重试上限——R2 模型失误爆炸半径有界）。
//
// 依赖方向：triage → loop（钩子接口/决策类型）/ dispatch-core（spawn 契约与组装面）/
// contracts 单向；驱动器不 import 本面（装配方注入 deps.triage——可拆卸，缺席 = 仅落盘续领）。
import type { ForgeSettingsService, ForgeTasksService, TaskRecordEntry } from '@dsh-forge/contracts'
import {
  deriveTriageToolFilter,
  poolOf,
  reconcileWorkerReasoning,
  workerAgentOptionsOf,
} from '../dispatch-core/index.js'
import type { PoolSnapshot, SpawnWorker } from '../dispatch-core/index.js'
import type { LoopTriageDecision, LoopTriageHook, LoopTriageInput } from '../loop/index.js'
import type { ExpertProfileResolver, ForgeExpertProfile } from '../faces.js'
import { parseTriageDecision } from './decision.js'
import { composeTriagePrompt } from './prompt.js'

/** triage 专家键预设（expert-squad-forge-2 纳入 2——settings experts.mapping.triage 可覆盖） */
const TRIAGE_EXPERT_KEY_DEFAULT = 'triage-analyst'

/** 档案人格段（与 core claim 链 renderExpertProfileSection 同构——身份头 + personaMd 正文；
 *  本包不依赖 @dsh-forge/core，组装面就地同形承载，persona 单源纪律不变） */
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
}

/**
 * 建处置代理钩子（LoopTriageHook 实装——装配方注入循环驱动器 deps.triage）：
 * run = 输入四件套现读（池 taskStats + 任务 queryTask records）→ 类型化提示词组装 →
 * in-process spawn（一次性、全收窄工具面）→ await handle.result → dispose → 决策解析。
 * 任何一步失败（读面/spawn/解析）原样上抛——驱动器按处置失败计入重试上限。
 */
export function createTriageHook(deps: TriageHookDeps): LoopTriageHook {
  return {
    async run(input: LoopTriageInput): Promise<LoopTriageDecision> {
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
      // ② 类型化提示词（任务简报 + reason 全文 + 池快照 + 最近记录 + 改进 6 增补件：
      //    上次失败回灌摘要 / fix 链深余量——输入面在场才注入，缺席 = 退化现状提示词）
      const prompt = composeTriagePrompt({
        task: input.task,
        reason: input.reason,
        pool,
        records,
        ...(input.lastFailure !== undefined ? { lastFailure: input.lastFailure } : {}),
        ...(input.fixChain !== undefined ? { fixChain: input.fixChain } : {}),
        ...(input.noProgress === true ? { noProgress: true } : {}),
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
        const key = settings?.experts?.mapping?.triage ?? TRIAGE_EXPERT_KEY_DEFAULT
        profile = await deps.resolveExpertProfile('triage', key)
        // 键恒在场（预设兜底）→ profile 恒定义；undefined 仅为类型面收窄，防御性跳过
        persona = profile !== undefined ? personaSectionOf(profile) : undefined
      }
      // Root cause（bug 14984d4f 同族——处置代理与 worker 同一丢失面）：档案 provider+model
      // 成对在场 = 自带完整路由对，必须与 worker 同径进入 agentOptions 组装；此前仅 persona
      // 消费档案、路由对被丢弃回落父继承（task-spawned 审计 model='inherit' 同位证）。
      const agentOptions = await reconcileWorkerReasoning(
        workerAgentOptionsOf(settings, profile),
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
      // ④ 终态 output → 结构化决策（dispose 幂等收尾——成功失败同径）
      let output: string
      try {
        ;({ output } = await handle.result)
      } finally {
        await handle.dispose()
      }
      return parseTriageDecision(output)
    },
  }
}
