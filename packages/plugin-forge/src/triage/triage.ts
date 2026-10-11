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
import { parseTriageDecision } from './decision.js'
import { composeTriagePrompt } from './prompt.js'

/** 处置代理依赖（装配注入——与 worker spawn 同款面的结构子集） */
export interface TriageHookDeps {
  /** core 任务域服务读面（池快照 taskStats + 最近记录 queryTask——输入四件套之③④） */
  readonly tasks: Pick<ForgeTasksService, 'taskStats' | 'queryTask'>
  /** in-process driver spawn 真绑定（与 worker 同一装配单例） */
  readonly spawn: SpawnWorker
  /** 主会话 Agent（与 worker 同 parent——lineage/工作目录/深度派生同源） */
  readonly parent: unknown
  /** 取消信号（循环控制器——stop 即取消在途处置） */
  readonly signal?: AbortSignal
  /** forgeSettings 服务面（可选——与 worker 同款 agentOptions 组装，缺席回退父继承） */
  readonly settings?: Pick<ForgeSettingsService, 'get'>
  /** 模型推理档位目录解析（可选——组装面兼容收口同 worker） */
  readonly resolveModelReasoning?: (provider: string, model: string) => Promise<readonly string[] | undefined>
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
      // ② 类型化提示词（任务简报 + reason 全文 + 池快照 + 最近记录）
      const prompt = composeTriagePrompt({ task: input.task, reason: input.reason, pool, records })
      // ③ in-process spawn（与 worker 同款形态；agentOptions 继承链一致）
      const settings = deps.settings !== undefined ? await deps.settings.get() : undefined
      const agentOptions = await reconcileWorkerReasoning(workerAgentOptionsOf(settings), deps.resolveModelReasoning)
      const handle = await deps.spawn({
        prompt,
        parent: deps.parent,
        signal: deps.signal ?? new AbortController().signal,
        toolFilter: deriveTriageToolFilter(),
        ...(agentOptions !== undefined ? { agentOptions } : {}),
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
