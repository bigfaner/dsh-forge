// dispatch-core · 组装面（S1a 可拆卸壳分层——implementation-blueprint §3 claim→组装→spawn
// 链的「组装」段）：taskType → 收窄矩阵 → toolFilter；forgeSettings → agentOptions
// （含档位兼容收口）。纯函数——两消费者（工具壳/循环驱动器）同源。
import type { TaskType, WorkerToolFamily } from '@dsh-forge/contracts'
import {
  globalToolNamesOfToolsFace as readToolNamesOfToolsFace,
  intersectToolNames,
  probeIsSubdomain,
  WORKER_FORGE_TOOLS,
  WORKER_GLOBAL_DENY_TOOLS,
  WORKER_TASK_FAMILY_BY_TYPE,
  WORKER_TOOL_FAMILIES,
  WORKER_TOOL_MATRIX,
  WORKER_TOOL_NAME_FAMILY,
} from '@dsh-forge/contracts'

// 工具注册面投影/求交族单源 re-export（bug a5b12254 集中化——contracts tool-projection.ts；
// 既有消费面 import 路径零变化）：金丝雀守卫 / shell 同族候选 / 探针可信判定。
export { PROBE_CANARY_TOOL, probeIsSubdomain, SHELL_TOOL_CANDIDATES } from '@dsh-forge/contracts'

// agentOptions 折叠族单源 re-export（架构裁决 verification-report §5.1 ⑤ 最小增量——
// contracts subagent-assemble.ts；既有消费面 import 路径零变化，行为逐字等价）：
// workerAgentOptionsOf（三级 first-def 折叠公式）/ reconcileWorkerReasoning（异步纯折叠，
// resolveModelReasoning 注入依赖）/ WorkerRouteLevel（路由级形状）。
export {
  reconcileWorkerReasoning,
  workerAgentOptionsOf,
  type WorkerRouteLevel,
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
 * 探针可信金丝雀（bug 92d642c2 真机定谳）：全局恒在的官方工具名。Mac/Win 全新构建实测，
 * 循环运行时上下文的 parent.ctx.tools.schemas() 返回**子域投影**（仅 9 个 expert 域工具、
 * 零官方工具）——探针在场 ≠ 投影可信。投影不含金丝雀 = 子域采样，不可作为裁剪/断言依据。
 * （bug a5b12254 集中化：常量与判定单源迁 contracts tool-projection.ts，本包 re-export。）
 */

/**
 * 全局工具注册名读取（bug 92d642c2 根因层）：装配期 `ctx.tools` 官方面直读——`schemas()`
 * 无参调用 = 全局视图（官方契约 dsh-tools index.d.ts:711「omitted = the global view」），
 * 无 parent 会话的作用域收窄。形状漂移/调用抛错 = undefined（调用方回落 parent 探针）。
 * （bug a5b12254 集中化：unknown 面校验实现单源迁 contracts tool-projection.ts，本壳直连。）
 */
export const globalToolNamesOfToolsFace = readToolNamesOfToolsFace

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
 * platform 参数（bug a5b12254 附加要求）：探针不可信（子域投影）/缺席时的 shell 同族
 * 平台确定性兜底——win32 → pwsh、其余 → bash（contracts platformShellToolName）。仅作用
 * 于 shell 同族名，其余未知名仍原样放行；缺省 = 不兜底（行为零变化）。
 * （求交核心单源迁 contracts intersectToolNames——bug a5b12254 集中化。）
 */
export function deriveWorkerToolFilter(
  taskType: TaskType,
  nameFamily: Readonly<Record<string, WorkerToolFamily>> = WORKER_TOOL_NAME_FAMILY,
  profileTools?: readonly string[],
  registeredTools?: readonly string[],
  platform?: string,
): { allow?: string[]; deny: string[] } {
  // 探针可信门（bug 92d642c2 真机定谳）：子域投影（非空但缺官方金丝雀 read）= 循环运行时
  // 上下文的受限采样，不可作为裁剪/断言依据——回落 undefined（不裁剪不断言，e6669a50 前
  // 形态）。真实注册缺损（探针含金丝雀而缺 essentials）仍走下方 fail-loud 断言。
  if (registeredTools !== undefined && probeIsSubdomain(registeredTools)) {
    registeredTools = undefined
  }
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
      // 诊断面（bug 92d642c2 排查衍生）：报文携带探针实测注册名表——真机「投影里到底有
      // 什么」一次运行即可定谳（缺席名表 = 探针命中子域投影，不再是考古题）。
      throw new Error(
        `pipeline essential tools not registered on this machine: [${missingEssentials.join(', ')}] — ` +
          `registered probe: [${(registeredTools ?? []).join(', ')}]`,
      )
    }
  }
  const allow = intersectToolNames(
    [...new Set<string>([...profileTools, ...WORKER_PIPELINE_ESSENTIAL_TOOLS])],
    registeredTools,
    ...(platform !== undefined ? [{ platform }] : []),
  )
  return { allow, deny: intersectedDeny }
}

/**
 * 父会话真机已注册全局工具名读取位（bug 989997bd 起——toolFilter 与真机工具面求交的
 * 取数缝，worker/triage 两面共用）：结构化读 parent.ctx.tools.schemas()（官方 dsh-tools
 * 公开投影面，逐 schema 取 name——child restrictableNames 的父域投影）。任一环缺席/
 * 形状不符/调用抛错 = undefined（取数失败回落不裁剪——与修复前 loud 行为一致，不静默
 * 收窄成空表）。unknown 面校验单源 = contracts globalToolNamesOfToolsFace（bug a5b12254）。
 */
export function registeredToolNamesOf(parent: unknown): readonly string[] | undefined {
  if (typeof parent !== 'object' || parent === null) return undefined
  const ctx = (parent as { ctx?: unknown }).ctx
  if (typeof ctx !== 'object' || ctx === null) return undefined
  const tools = (ctx as { tools?: unknown }).tools
  if (typeof tools !== 'object' || tools === null) return undefined
  return readToolNamesOfToolsFace(tools)
}

/**
 * allow 名表与真机注册面求交（兼容再导出壳——bug a5b12254 集中化：实现单源迁 contracts
 * intersectToolNames；既有消费面 import 路径零变化，语义逐字节等价）。shell 同族名解析为
 * 在场的候选者、其余未知名 fail-soft 剔除、已知名保序保留。registeredTools 缺席/空 =
 * 不裁剪（无探针不收紧）。抛错面：入表非空而解析全空 → Error fail-loud（keep-only 空表
 * = 全拒，必瘫 worker）。
 */
export function intersectAllowNames(
  names: readonly string[],
  registeredTools?: readonly string[],
): string[] {
  return intersectToolNames(names, registeredTools)
}

/**
 * 处置代理面禁入的 forge 动词（worker 名单剔除台账只读两工具与 addTask——loop-recurrence-
 * hardening §2.2.1：getBug/listBugs 只读放开供台账深挖；addTask 放开 = 处置派生径
 * （用户裁决 2026-11-02——triage 分类后建 fix 卡与 execute 面 ERR_WORKER_ADDTASK_DENIED
 * 的身份分流「main session and the loop triage layer 放行」对齐）；写面（recordBug/
 * resolveBug/submitTask）与任务域动词恒 deny）。
 */
const TRIAGE_FORGE_DENY: readonly string[] = FORGE_DENY_IN_WORKER.filter(
  (name) => name !== 'listBugs' && name !== 'addTask',
)

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
  // 只读放开 + 处置派生径（loop-recurrence-hardening §2.2.1 + 用户裁决 2026-11-02）：
  // getBug = 名表 forge 族成员，listBugs = FORGE_DENY_IN_WORKER 成员，addTask = 处置
  // 分类后建 fix 卡派生径。其余写面不可达断言不变（recordBug/resolveBug/submitTask 仍在 deny）。
  deny.delete('getBug')
  deny.delete('listBugs')
  deny.delete('addTask')
  // 目录查询双只读径放开（forge-dirs-query-tool §2.3——零副作用，与 worker 面同为放行面）：
  // 处置代理定位卷宗（dossier）/任务日志（taskLogs）经工具同源解析，不落文档口径。
  deny.delete('forgeDirs')
  deny.delete('forgeResolvePath')
  return { deny: [...deny].filter((name) => registeredTools === undefined || registeredTools.includes(name)) }
}

/**
 * worker agentOptions 组装（单源 contracts subagent-assemble.ts——上方薄壳 re-export；
 * 优先级链与 reasoning 三级合成语义正本见 contracts 同名函数注）。
 */

/**
 * 档位兼容收口（单源 contracts subagent-assemble.ts——上方薄壳 re-export）。
 */
