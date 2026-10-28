// dispatch-core · 组装面（S1a 可拆卸壳分层——implementation-blueprint §3 claim→组装→spawn
// 链的「组装」段）：taskType → 收窄矩阵 → toolFilter；forgeSettings → agentOptions
// （含档位兼容收口）。纯函数——两消费者（工具壳/循环驱动器）同源。
import type { ForgeSettings, ReasoningEffortLevel, TaskType, WorkerToolFamily } from '@dsh-forge/contracts'
import {
  WORKER_FORGE_TOOLS,
  WORKER_GLOBAL_DENY_TOOLS,
  WORKER_TASK_FAMILY_BY_TYPE,
  WORKER_TOOL_FAMILIES,
  WORKER_TOOL_MATRIX,
  WORKER_TOOL_NAME_FAMILY,
} from '@dsh-forge/contracts'

/**
 * worker 面禁入的 forge 动词（矩阵 forge 族 = WORKER_FORGE_TOOLS 五动词——submitTask +
 * addTask 两既有动词 + recordBug/resolveBug 两 bug 写径 + getBug 链上下文读径
 * （bug-recurrence-chain——fix-bug coding-fix worker 放行）。名单 = 本包
 * FORGE_TOOL_NAMES ∪ dispatchTask − WORKER_FORGE_TOOLS（单测同步守护）——十六员全集中
 * worker 可见 = 五动词，其余八员 deny（updateTask/taskStats/listTasks/listBugs 等仅主
 * agent 面——listBugs 台账查询面分治主 agent）。validateMermaid = md-mermaid 插件工具单源锚（packages/plugins/md-mermaid/src/
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
  'stopTaskLoop',
  'updateTask',
  'taskStats',
  'listTasks',
  'listBugs',
  'recordImplCheckpoint', // 机械⑥实现检查点三工具——仅主 agent 面（记录/查询/跨容器清单）
  'queryImplCheckpoint',
  'listImplCheckpoints',
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
 * 管线必备用具集（expert-squad-forge 1.4——allow=keep-only 语义下的并集保底单源）：
 * allow=keep-only 会滤除白名单外的全部工具，故结算链/fix 链必备的 forge 五动词
 * （contracts WORKER_FORGE_TOOLS 单源——submitTask/addTask/recordBug/resolveBug/getBug）
 * 与 todo_write（执行骨架清单——全局拒绝集刻意不拒的同一裁决面，allow 语义下须显式在
 * allow 内否则 keep-only 滤除）恒并入档案 tools 白名单。派发链组装公式见
 * deriveWorkerToolFilter；穷举 20 任务类型的保底单测锚定本集。
 */
export const WORKER_PIPELINE_ESSENTIAL_TOOLS: readonly string[] = [...WORKER_FORGE_TOOLS, 'todo_write']

/**
 * taskType → 收窄矩阵 → toolFilter（deny 面；expert-squad-forge 1.4 起 allow 面可选）。
 * 矩阵 = contracts WORKER_TOOL_MATRIX（族 × 工具族 ✓ 表）：族内拒绝的工具族名下已知工具名
 * 入 deny + 全局拒绝集 + forge 闭环。nameFamily 参数化（缺省 = WORKER_TOOL_NAME_FAMILY——
 * 5.1 OQ#2 兑现后 = 上游 standard 组合实面全表 17 名，上游族收窄即激活；参数缝保留 =
 * 名表核对 pin 独立可测）。
 * profileTools 参数化（1.4 组装公式）：档案 tools 白名单在场 → allow = 档案 tools ∪
 * 管线必备用具集（WORKER_PIPELINE_ESSENTIAL_TOOLS 并集保底——管线必备恒可见）；缺席
 * （experts 未装配/档案无 tools 键）= 不携带 allow（keep-only 不启用，行为与 1.4 前逐
 * 字节等价）。档案白名单含未知名不在本面过滤——上游 child 创建窗口 fail-closed loud
 * 校验兜底（提案 §2.7 核销）。
 */
export function deriveWorkerToolFilter(
  taskType: TaskType,
  nameFamily: Readonly<Record<string, WorkerToolFamily>> = WORKER_TOOL_NAME_FAMILY,
  profileTools?: readonly string[],
): { allow?: string[]; deny: string[] } {
  const family = WORKER_TASK_FAMILY_BY_TYPE[taskType]
  const deniedFamilies = new Set<WorkerToolFamily>(WORKER_TOOL_FAMILIES.filter((f) => !WORKER_TOOL_MATRIX[family][f]))
  const deny = new Set<string>(WORKER_GLOBAL_DENY_TOOLS)
  for (const [name, f] of Object.entries(nameFamily)) {
    if (deniedFamilies.has(f)) deny.add(name)
  }
  for (const name of FORGE_DENY_IN_WORKER) deny.add(name)
  const allow =
    profileTools === undefined
      ? undefined
      : [...new Set<string>([...profileTools, ...WORKER_PIPELINE_ESSENTIAL_TOOLS])]
  return { ...(allow !== undefined ? { allow } : {}), deny: [...deny] }
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

/** 设置 + 档案 model → agentOptions（expert-squad-forge 1.4 model 消费——triage 同径基座
 * 上档案 model 在场覆盖 model，缺席回落 forgeSettings 默认；settings 未配置/服务缺席 =
 * undefined 不携带（无 provider 基座，回落父会话继承）；reasoning='default' = 不下发
 * effort——落 provider/模型默认档；其余 → reasoningEffort 直映射）
 * 取舍标注（expert-squad-forge 1.10）：档案 model 生效以 forgeSettings 配置了 worker 段为
 * 前提——worker 段缺席 = 无 provider/model 基座，档案 model 不被消费（回父会话继承）。
 * provider 成对语义（expert-squad-forge-2 纳入 6）：档案 provider+model 两字段成对在场 =
 * 整组覆盖 settings 基座（官方 AgentOptions 同给同缺——「A 家模型 X」路由）；任一缺席 =
 * 回落 settings 基座（仅 model 在场仍按既有语义覆盖 model 位；仅 provider 在场不落位）。
 */
export function workerAgentOptionsOf(
  settings: ForgeSettings | undefined,
  profile?: { readonly model?: string; readonly provider?: string },
): { provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined {
  if (settings === undefined || settings.worker === undefined) return undefined
  const { provider, model, reasoning } = settings.worker
  const base =
    profile?.provider !== undefined && profile.model !== undefined
      ? { provider: profile.provider, model: profile.model }
      : { provider, model: profile?.model ?? model }
  if (reasoning === 'default') return base
  return { ...base, reasoningEffort: reasoning }
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
