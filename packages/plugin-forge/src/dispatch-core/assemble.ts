// dispatch-core · 组装面（S1a 可拆卸壳分层——implementation-blueprint §3 claim→组装→spawn
// 链的「组装」段）：taskType → 收窄矩阵 → toolFilter；forgeSettings → agentOptions
// （含档位兼容收口）。纯函数——两消费者（工具壳/循环驱动器）同源。
import type { ReasoningEffortLevel, TaskType, WorkerToolFamily } from '@dsh-forge/contracts'
import {
  WORKER_FORGE_TOOLS,
  WORKER_GLOBAL_DENY_TOOLS,
  WORKER_TASK_FAMILY_BY_TYPE,
  WORKER_TOOL_FAMILIES,
  WORKER_TOOL_MATRIX,
  WORKER_TOOL_NAME_FAMILY,
} from '@dsh-forge/contracts'

/**
 * worker 面禁入的 forge 动词（矩阵 forge 族 = WORKER_FORGE_TOOLS 四动词——submitTask +
 * recordBug/resolveBug 两 bug 写径 + getBug 链上下文读径（bug-recurrence-chain——fix-bug
 * coding-fix worker 放行）；addTask 不入 worker 面（任务派生权限归主会话与循环处置层——
 * execute 面 ERR_WORKER_ADDTASK_DENIED 双保险）。名单 = 本包
 * FORGE_TOOL_NAMES ∪ dispatchTask − WORKER_FORGE_TOOLS（单测同步守护）——十六员全集中
 * worker 可见 = 四动词，其余九员 deny（updateTask/taskStats/listTasks/listBugs 等仅主
 * agent 面——listBugs 台账查询面分治主 agent；transitionFeature 相位转移入口
 * （implicit-stage-approval §2.3——仅主 agent，worker 面无代转相位动词））。
 * validateMermaid = md-mermaid 插件工具单源锚（packages/plugins/md-mermaid/src/
 * tools/validate-mermaid.ts 导出 MERMAID_TOOL_NAME = 'validateMermaid'——工具面仅主 agent，
 * 附录 F deny 约束；本包不反依赖插件包，字面量 + 锚注释对齐）。plugin-forge-spec 三动词不入本 deny：其注册面
 * 预设相依（突击组合物理缺席），driver 的 toolFilter 对未知名 loud 校验会拆 spawn——
 * spec 面收口归 5.1 工具名映射 pin（OQ#2）。
 */
const FORGE_DENY_IN_WORKER: readonly string[] = [
  'addTask', // dispatch-loop-hardening 改进 5——任务派生权限归主会话/循环处置层（worker 面不注入）
  'queryTask',
  'createProposal',
  'transitionProposal',
  'transitionFeature', // implicit-stage-approval §2.3——相位转移仅主 agent（worker 拒）
  'dispatchTask',
  'stopTaskLoop',
  'updateTask',
  'taskStats',
  'listTasks',
  'listBugs',
  'recordImplCheckpoint', // 机械⑥实现检查点三工具——仅主 agent 面（记录/查询/跨容器清单）
  'queryImplCheckpoint',
  'listImplCheckpoints',
  'pauseTask', // task-pause-primitive——单任务暂停入口仅主 agent 面（worker 拒）
  'unblockTask', // blocked-verdict-restore-primitive——blocked→pending 出口仅主 agent 面（worker 拒）
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
 * allow=keep-only 会滤除白名单外的全部工具，故结算链/fix 链必备的 forge 四动词
 * （contracts WORKER_FORGE_TOOLS 单源——submitTask/recordBug/resolveBug/getBug；addTask
 * 派生权限归主会话，不保底）
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
 * 字节等价）。
 * registeredTools 参数（bug 3cb118cf——989997bd 的 worker 面同族缺口）：真机已注册全局
 * 工具名在场 = allow/deny 双面与其求交——官方 restrict 未知名 fail-closed loud 校验语义
 * 正确，错在滤器产出真机不存在的名（Mac 域 dsh-tool-pwsh 平台 disabled，档案 allow 携带
 * 'pwsh' 拆 worker spawn；此前本面对未知名原样放行给上游「兜底」，该兜底即炸点）：
 * - deny：真机未知名不入（与 deriveTriageToolFilter 同法纯过滤——deny 不做 shell 同族
 *   替换，win 域 deny pwsh 不得异化为 deny bash）；
 * - allow：shell 同族名（SHELL_TOOL_CANDIDATES bash/pwsh）解析为在场候选者（档案写任一
 *   名两平台互通），其余未知名 fail-soft 剔除（g-473 同口径）；解析空集 fail-loud（keep-only
 *   空表 = 全拒，静默派发必瘫结算链——档案配置错误应显式炸）；
 * - 缺席（取数缝失败/极简 profile）= 双面不裁剪（与既有 loud 行为逐字节等价）。
 */
export function deriveWorkerToolFilter(
  taskType: TaskType,
  nameFamily: Readonly<Record<string, WorkerToolFamily>> = WORKER_TOOL_NAME_FAMILY,
  profileTools?: readonly string[],
  registeredTools?: readonly string[],
): { allow?: string[]; deny: string[] } {
  const family = WORKER_TASK_FAMILY_BY_TYPE[taskType]
  const deniedFamilies = new Set<WorkerToolFamily>(WORKER_TOOL_FAMILIES.filter((f) => !WORKER_TOOL_MATRIX[family][f]))
  const deny = new Set<string>(WORKER_GLOBAL_DENY_TOOLS)
  for (const [name, f] of Object.entries(nameFamily)) {
    if (deniedFamilies.has(f)) deny.add(name)
  }
  for (const name of FORGE_DENY_IN_WORKER) deny.add(name)
  const intersectedDeny = [...deny].filter(
    (name) => registeredTools === undefined || registeredTools.length === 0 || registeredTools.includes(name),
  )
  if (profileTools === undefined) return { deny: intersectedDeny }
  // essentials 在场断言（bug e6669a50-G2）：注册面探针在场但 forge 动词/todo_write 未注册
  // 时，求交会把管线必备静默剔除——keep-only allow 缺 submitTask = worker 结算链静默瘫
  // （比 loud 拆 spawn 更劣）。探针在即断言，缺一即 fail-loud。
  if (registeredTools !== undefined && registeredTools.length > 0) {
    const missingEssentials = WORKER_PIPELINE_ESSENTIAL_TOOLS.filter(
      (name) => !registeredTools.includes(name),
    )
    if (missingEssentials.length > 0) {
      throw new Error(
        `pipeline essential tools not registered on this machine: [${missingEssentials.join(', ')}]`,
      )
    }
  }
  const allow = intersectAllowNames(
    [...new Set<string>([...profileTools, ...WORKER_PIPELINE_ESSENTIAL_TOOLS])],
    registeredTools,
  )
  return { allow, deny: intersectedDeny }
}

/** shell 工具名候选（跨平台同族：win32 注册 pwsh、其余平台注册 bash——dsh-tool-pwsh /
 *  dsh-tool-bash 平台 disabled 装配面；dsh-graph g-473 / expert-squad resolveToolAllow 同口径）。 */
export const SHELL_TOOL_CANDIDATES = ['bash', 'pwsh'] as const

/**
 * 父会话真机已注册全局工具名读取位（bug 989997bd 起——toolFilter 与真机工具面求交的
 * 取数缝，worker/triage 两面共用）：结构化读 parent.ctx.tools.schemas()（官方 dsh-tools
 * 公开投影面，逐 schema 取 name——child restrictableNames 的父域投影）。任一环缺席/
 * 形状不符/调用抛错 = undefined（取数失败回落不裁剪——与修复前 loud 行为一致，不静默
 * 收窄成空表）。
 */
export function registeredToolNamesOf(parent: unknown): readonly string[] | undefined {
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

/**
 * allow 名表与真机注册面求交（bug 3cb118cf）：shell 同族名解析为在场的候选者、其余
 * 未知名 fail-soft 剔除、已知名保序保留。registeredTools 缺席/空 = 不裁剪（无探针不收紧）。
 * 抛错面：入表非空而解析全空 → Error fail-loud（keep-only 空表 = 全拒，必瘫 worker）。
 */
export function intersectAllowNames(
  names: readonly string[],
  registeredTools?: readonly string[],
): string[] {
  if (registeredTools === undefined || registeredTools.length === 0) return [...names]
  const present = new Set(registeredTools)
  const resolved: string[] = []
  for (const name of names) {
    if (present.has(name)) {
      resolved.push(name)
      continue
    }
    if ((SHELL_TOOL_CANDIDATES as readonly string[]).includes(name)) {
      const sibling = SHELL_TOOL_CANDIDATES.find((c) => c !== name && present.has(c))
      if (sibling !== undefined) resolved.push(sibling)
    }
  }
  if (names.length > 0 && resolved.length === 0) {
    throw new Error(
      `worker allow-list resolves to empty against registered tools [${registeredTools.join(', ')}]; ` +
        `filter input: [${names.join(', ')}]`,
    )
  }
  return resolved
}

/**
 * 处置代理面禁入的 forge 动词（worker 名单剔除台账只读两工具——loop-recurrence-hardening
 * §2.2.1：getBug/listBugs 只读放开供台账深挖；写面（recordBug/resolveBug/submitTask/
 * addTask）与任务域动词恒 deny）。
 */
const TRIAGE_FORGE_DENY: readonly string[] = FORGE_DENY_IN_WORKER.filter((name) => name !== 'listBugs')

/**
 * 处置代理 toolFilter（S1c 第二层——「收窄工具面」的只读放开形，loop-recurrence-hardening
 * §2.2.1）：一次性处置代理只做决策与台账深挖不执行——已知工具名 deny，唯 getBug/listBugs
 * 两只读台账工具放行（问题分类器自主深挖缺陷背景与 errorType 语义归类；缺陷写面/任务域
 * 写动词/shell/fs 恒 deny——越权动作结构性不可达；输出契约 = 终态 output 文本内的 JSON
 * 决策，由宿主解析忠实执行）。deny 全集 = worker 名表 17 名 − getBug + forge 动词
 * （含 validateMermaid，listBugs 已剔除）+ 全局拒绝集 − {getBug, listBugs}。
 * registeredTools 参数（bug 989997bd）：真机已注册全局工具名在场 = deny 与其求交——官方
 * restrict 未知名 fail-closed loud 校验语义正确，错在滤器产出真机不存在的名（win 域
 * dsh-tool-bash 平台 disabled，名表照收 'bash' 拆 spawn）；缺席（取数缝失败/极简 profile）
 * = 全表（修复前形态，与既有 loud 行为逐字节等价）。
 */
export function deriveTriageToolFilter(registeredTools?: readonly string[]): { deny: string[] } {
  const deny = new Set<string>(WORKER_GLOBAL_DENY_TOOLS)
  for (const name of Object.keys(WORKER_TOOL_NAME_FAMILY)) deny.add(name)
  for (const name of TRIAGE_FORGE_DENY) deny.add(name)
  // 只读放开（loop-recurrence-hardening §2.2.1）：getBug = 名表 forge 族成员，listBugs =
  // FORGE_DENY_IN_WORKER 成员——两处剔除后写面恒不可达断言不变（recordBug/resolveBug/
  // submitTask/addTask 仍在 deny）。
  deny.delete('getBug')
  deny.delete('listBugs')
  return { deny: [...deny].filter((name) => registeredTools === undefined || registeredTools.includes(name)) }
}

/**
 * 路由级形状（expert-squad-default-routing——四级链各级同形）：provider/model 整组同给
 * 同缺（官方 AgentOptions 成对语义）；reasoning 缺省 = 该级不下发档位。
 */
export interface WorkerRouteLevel {
  readonly provider?: string
  readonly model?: string
  readonly reasoning?: ReasoningEffortLevel
}

/**
 * worker agentOptions 组装（expert-squad-default-routing——配置主权归 expert-squad，
 * forgeSettings.worker 机械读取径退役）：
 *
 * 优先级链（proposal「优先级链」/verification.md §0.3 first-def fold）：
 *   ① experts 条目 agentOptions（experts 服务 get 应答——条目叠加 + 档案 + defaults 已由
 *     expert-squad 侧折叠；本面按整组语义消费）
 *   > ② 档案 provider+model 成对（a599db30 语义：成对即自带完整路由对）
 *   > ③ defaultAgentOptions（全局默认基座；② 单边位与③基座逐位合成——V1-EX1 收口）
 *   > ④ 父会话继承（返回 undefined——spawn 请求零 agentOptions 键）。
 *
 * reasoning 三级合成（同构 first-def）：① entry.reasoning > ② profile.reasoning
 * （档案 frontmatter 出厂值）> ③ defaults.reasoning > 不下发 effort；档位兼容收口
 * 由 reconcileWorkerReasoning 在组装后统一承担（本面零目录知识）。
 *
 * 生产径取数：①②③ 的现值经既有 experts 服务取用面（resolver → experts.get）每次派发
 * 现查（AGENTS 1.6 检测永不缓存——消费点惰性求值，volatile 配置变更即派发即生效）；
 * expert-squad 缺席 = 三级全空 → undefined 回落父继承（语义完整，可移植性）。
 */
export function workerAgentOptionsOf(levels: {
  /** ① experts 条目 agentOptions（含 expert-squad 侧折叠应答时即最终路由级） */
  readonly entry?: WorkerRouteLevel
  /** ② 档案级（provider+model 成对整组；reasoning = frontmatter 出厂值） */
  readonly profile?: WorkerRouteLevel
  /** ③ defaultAgentOptions 全局默认基座 */
  readonly defaults?: WorkerRouteLevel
}): { provider: string; model: string; reasoningEffort?: ReasoningEffortLevel } | undefined {
  // 基座 = ② 成对整组（自带完整路由对，a599db30），不成对回落 ③；② 单边位与 ③ 逐位
  // 合成（仅 model 并入③基座——V1-EX1；仅 provider 不落位回落基座——既有语义）。
  const profilePaired = levels.profile?.provider !== undefined && levels.profile?.model !== undefined
  const base = {
    provider: profilePaired ? levels.profile?.provider : (levels.defaults?.provider ?? levels.profile?.provider),
    model: profilePaired ? levels.profile?.model : (levels.defaults?.model ?? levels.profile?.model),
  }
  const provider = levels.entry?.provider ?? base.provider
  const model = levels.entry?.model ?? base.model
  // 成对判据：provider+model 皆在场才有路由——任一缺席 = ④ 父会话继承（undefined）。
  if (provider === undefined || model === undefined) return undefined
  const route = { provider, model }
  const reasoning = levels.entry?.reasoning ?? levels.profile?.reasoning ?? levels.defaults?.reasoning
  if (reasoning === undefined) return route
  return { ...route, reasoningEffort: reasoning }
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
