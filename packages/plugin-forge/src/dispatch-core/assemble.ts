// dispatch-core · 组装面（S1a 可拆卸壳分层——implementation-blueprint §3 claim→组装→spawn
// 链的「组装」段）：taskType → 收窄矩阵 → toolFilter；forgeSettings → agentOptions
// （含档位兼容收口）。纯函数——两消费者（工具壳/循环驱动器）同源。
import type { ForgeSettings, ReasoningEffortLevel, TaskType, WorkerToolFamily } from '@dsh-forge/contracts'
import {
  WORKER_GLOBAL_DENY_TOOLS,
  WORKER_TASK_FAMILY_BY_TYPE,
  WORKER_TOOL_FAMILIES,
  WORKER_TOOL_MATRIX,
  WORKER_TOOL_NAME_FAMILY,
} from '@dsh-forge/contracts'

/**
 * worker 面禁入的 forge 动词（矩阵 forge 族 = WORKER_FORGE_TOOLS 四动词——submitTask +
 * addTask 两既有动词 + recordBug/resolveBug 两 bug 写径（fix-bug coding-fix worker 放行））。
 * 名单 = 本包 FORGE_TOOL_NAMES ∪ dispatchTask − WORKER_FORGE_TOOLS（单测同步守护）——
 * 十一员全集中 worker 可见 = 四动词，其余八员 deny（updateTask/taskStats/listTasks 等仅主
 * agent 面）。validateMermaid = md-mermaid 插件工具单源锚（packages/plugins/md-mermaid/src/
 * tools/validate-mermaid.ts 导出 MERMAID_TOOL_NAME = 'validateMermaid'——工具面仅主 agent，
 * 附录 F deny 约束；本包不反依赖插件包，字面量 + 锚注释对齐）。plugin-forge-spec 三动词不入本 deny：其注册面
 * 预设相依（突击组合物理缺席），driver 的 toolFilter 对未知名 loud 校验会拆 spawn——
 * spec 面收口归 5.1 工具名映射 pin（OQ#2）。
 */
const FORGE_DENY_IN_WORKER: readonly string[] = [
  'queryTask',
  'createProposal',
  'transitionProposal',
  'dispatchTask',
  'updateTask',
  'taskStats',
  'listTasks',
  'validateMermaid', // md-mermaid 插件工具（MERMAID_TOOL_NAME 单源锚，见上注）
]

/**
 * worker 会话 → 来源任务 id 注册表（fix-bug：recordBug 的 source_task_id 派发上下文注入径）。
 * spawnClaimed spawn 成功即登记（workerSessionId → claimed.task.taskId）；结算核终读后注销。
 * 进程内 Map 单例——worker 会话 id 一次性 uuid 不复用，循环/工具壳两派发径（同 spawnClaimed
 * 实现）天然共源；未登记（standalone 主 agent 调用）= undefined（source_task_id 键缺席）。
 */
const workerSourceTasks = new Map<string, string>()

/** spawn 成功即登记 worker 会话的来源任务 id（recordBug 工具面注入源） */
export function rememberWorkerSourceTask(workerSessionId: string, taskId: string): void {
  workerSourceTasks.set(workerSessionId, taskId)
}

/** worker 会话 → 来源任务 id（未登记/standalone = undefined） */
export function workerSourceTaskOf(workerSessionId: string): string | undefined {
  return workerSourceTasks.get(workerSessionId)
}

/** 结算后注销（worker 会话一次性——防表无界增长） */
export function forgetWorkerSourceTask(workerSessionId: string): void {
  workerSourceTasks.delete(workerSessionId)
}

/**
 * taskType → 收窄矩阵 → toolFilter（deny 面）。矩阵 = contracts WORKER_TOOL_MATRIX
 * （族 × 工具族 ✓ 表）：族内拒绝的工具族名下已知工具名入 deny + 全局拒绝集 + forge 闭环。
 * nameFamily 参数化（缺省 = WORKER_TOOL_NAME_FAMILY——5.1 OQ#2 兑现后 = 上游 standard
 * 组合实面全表 17 名，上游族收窄即激活；参数缝保留 = 名表核对 pin 独立可测）。
 */
export function deriveWorkerToolFilter(
  taskType: TaskType,
  nameFamily: Readonly<Record<string, WorkerToolFamily>> = WORKER_TOOL_NAME_FAMILY,
): { deny: string[] } {
  const family = WORKER_TASK_FAMILY_BY_TYPE[taskType]
  const deniedFamilies = new Set<WorkerToolFamily>(WORKER_TOOL_FAMILIES.filter((f) => !WORKER_TOOL_MATRIX[family][f]))
  const deny = new Set<string>(WORKER_GLOBAL_DENY_TOOLS)
  for (const [name, f] of Object.entries(nameFamily)) {
    if (deniedFamilies.has(f)) deny.add(name)
  }
  for (const name of FORGE_DENY_IN_WORKER) deny.add(name)
  return { deny: [...deny] }
}

/**
 * 处置代理面禁入的 forge 动词（与 worker 同名单——S1c 第二层）。
 */
const TRIAGE_FORGE_DENY: readonly string[] = [...FORGE_DENY_IN_WORKER]

/**
 * 处置代理 toolFilter（S1c 第二层——「收窄工具面」的全收窄形）：一次性处置代理只做决策
 * 不执行——已知工具名全数 deny（决策权与执行权分离，越权动作结构性不可达；输出契约 =
 * 终态 output 文本内的 JSON 决策，由宿主解析忠实执行）。deny 全集 = worker 名表 17 名
 * （fs/shell/jobs/read-image/web/forge 六族）+ forge 动词八员（含 validateMermaid）+ 全局拒绝集——全部已知名
 * （driver tools.restrict loud 校验安全，与 worker 同理）。
 */
export function deriveTriageToolFilter(): { deny: string[] } {
  const deny = new Set<string>(WORKER_GLOBAL_DENY_TOOLS)
  for (const name of Object.keys(WORKER_TOOL_NAME_FAMILY)) deny.add(name)
  for (const name of TRIAGE_FORGE_DENY) deny.add(name)
  return { deny: [...deny] }
}

/** 设置 → agentOptions（未配置/服务缺席 = undefined——不携带，回退父会话继承；
 * reasoning='default' = 不下发 effort——落 provider/模型默认档；其余 → reasoningEffort 直映射） */
export function workerAgentOptionsOf(
  settings: ForgeSettings | undefined,
): { provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined {
  if (settings === undefined || settings.worker === undefined) return undefined
  const { provider, model, reasoning } = settings.worker
  if (reasoning === 'default') return { provider, model }
  return { provider, model, reasoningEffort: reasoning }
}

/**
 * 档位兼容收口（不同 provider/model 支持集不同——「无法兼容就不设置」）：
 * 目录已知（efforts 非 undefined）且配置档位不在支持集 → 剥离 reasoningEffort（回落
 * provider/模型默认档），杜绝 UNSUPPORTED_REASONING_EFFORT 级 worker 启动即崩；
 * 目录不可知（解析器缺席/模型不可解析）= 不判，原样携带。
 */
export async function reconcileWorkerReasoning(
  options: { provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined,
  resolveModelReasoning: ((provider: string, model: string) => Promise<readonly string[] | undefined>) | undefined,
): Promise<{ provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined> {
  if (options === undefined || options.reasoningEffort === undefined) return options
  if (resolveModelReasoning === undefined) return options
  let efforts: readonly string[] | undefined
  try {
    efforts = await resolveModelReasoning(options.provider, options.model)
  } catch {
    return options // 解析失败 = 目录不可知——不判
  }
  if (efforts === undefined) return options
  if (efforts.includes(options.reasoningEffort)) return options
  return { provider: options.provider, model: options.model } // 不支持 → 不设置
}
