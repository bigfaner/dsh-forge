// dispatch-core · 组装面（S1a 可拆卸壳分层——implementation-blueprint §3 claim→组装→spawn
// 链的「组装」段）：taskType + 路由档位（WorkerRouteProfile）→ 收窄矩阵 → toolFilter；
// 路由 agentOptions → 兼容收口。纯函数（faces 依赖 type-only——本面运行期零 faces 依赖）——
// 两消费者（工具壳/循环驱动器）同源。
//
// 模块④（code-design）签名收敛注入：deriveWorkerToolFilter(taskType, route, registeredTools?,
// platform?, options?)——路由档位单参承载（expert = experts 在场且档案命中；generic =
// 缺席/未命中兜底档）。expert 档位：allow = 档案 tools ∪ 管线必备用具集（并集公式原样）；
// generic 档位：allow = 管线必备用具集（管线必备宽度）。bug 三动词（recordBug/resolveBug/
// getBug）为跨域条件段：project bugs 服务在场现查（调用期求值，检测结果不缓存——AGENTS 1.6）
// 在场才并入 essentials；缺席 = warn 留痕 + 剔除 + emitDiag。deny 矩阵两档位同构。
import type { TaskType, WorkerToolFamily } from "@dsh-forge/contracts";
import {
  globalToolNamesOfToolsFace as readToolNamesOfToolsFace,
  intersectToolNames,
  probeIsSubdomain,
  WORKER_GLOBAL_DENY_TOOLS,
  WORKER_TASK_FAMILY_BY_TYPE,
  WORKER_TOOL_FAMILIES,
  WORKER_TOOL_MATRIX,
  WORKER_TOOL_NAME_FAMILY,
} from "@dsh-forge/contracts";
import type { ForgeDiagEmitFace, WorkerRouteProfile } from "../faces.js";

/**
 * 全局工具注册名读取（bug 92d642c2 根因层）：装配期 `ctx.tools` 官方面直读——`schemas()`
 * 无参调用 = 全局视图（官方契约 dsh-tools index.d.ts:711「omitted = the global view」），
 * 无 parent 会话的作用域收窄。形状漂移/调用抛错 = undefined（调用方回落 parent 探针）。
 * （bug a5b12254 集中化：unknown 面校验实现单源 = contracts tool-projection.ts，本壳直连。）
 */
export const globalToolNamesOfToolsFace = readToolNamesOfToolsFace;

// 工具注册面投影/求交族单源 re-export（bug a5b12254 集中化——contracts tool-projection.ts；
// 既有消费面 import 路径零变化）：金丝雀守卫 / shell 同族候选 / 探针可信判定。
export { PROBE_CANARY_TOOL, probeIsSubdomain, SHELL_TOOL_CANDIDATES } from "@dsh-forge/contracts";

// agentOptions 折叠族单源 re-export（架构裁决 verification-report §5.1 ⑤ 最小增量——
// contracts subagent-assemble.ts；既有消费面 import 路径零变化，行为逐字等价）：
// workerAgentOptionsOf（三级 first-def 折叠公式）/ reconcileWorkerReasoning（异步纯折叠，
// resolveModelReasoning 注入依赖）/ WorkerRouteLevel（路由级形状）。
export {
  reconcileWorkerReasoning,
  workerAgentOptionsOf,
  type WorkerRouteLevel,
} from "@dsh-forge/contracts";

/**
 * worker 面禁入的 forge 动词（矩阵 forge 族 = WORKER_FORGE_TOOLS 动词——submitTask +
 * recordBug/resolveBug 两 bug 写径 + getBug 链上下文读径（bug-recurrence-chain——fix-bug
 * coding-fix worker 放行）+ forgeDirs/forgeResolvePath 目录查询双只读径；addTask 不入
 * worker 面（任务派生权限归主会话与循环处置层——execute 面 ERR_WORKER_ADDTASK_DENIED
 * 双保险）。名单 = 本插件 FORGE_TOOL_NAMES ∪ dispatchTask − WORKER_FORGE_TOOLS（单测同步
 * 守护）——其余九员 deny（updateTask/taskStats/listTasks/listBugs 等仅主 agent 面——listBugs
 * 台账查询面分治主 agent；transitionFeature 相位转移入口（implicit-stage-approval §2.3——
 * 仅主 agent，worker 面无代转相位动词））。
 * 官方宿主（DSH harness）迁移判例：工具注册名 = snake_case（tools/submit-task.ts
 * TOOL = "submit_task" 单源）；本表随迁，且只收**真机注册面在场的名**——未注册名
 * （createProposal/transitionProposal/transitionFeature/listBugs/aggregateBugs/
 * validateMermaid 等）入 deny 会在探针缺席时被 driver restrict() 未知名 loud 校验
 * 拆一切 spawn（判例 plugin-task-loop/1.18-a：camelCase 旧名 + 未注册名直落 deny
 * 连续 3 次 spawn 失败停循环）。探针在场时未知 deny 名会被求交剔除（双保险）。
 * batch_add_tasks 与 add_task 同入 deny（任务派生权限归主会话/循环处置层，单/批量
 * 同语义）。knowledge 归并双 tool（knowledge_supersede/knowledge_reinstate）为
 * harness 全局注册名，保留 deny（用户裁决 2026-11-05——唯一放行径 = 专家档案
 * tools 白名单 WORKER_EXPERT_RELEASABLE_DENY 或主会话）。
 */
const FORGE_DENY_IN_WORKER: readonly string[] = [
  "add_task", // 任务派生权限归主会话/循环处置层（worker 面不注入；execute 面拒收双保险）
  "batch_add_tasks", // 同上——批量派生径同语义拒
  "query_task",
  "dispatch_task",
  "stop_task_loop",
  "update_task",
  "task_stats",
  "list_tasks",
  "record_impl_checkpoint", // 实现检查点三工具——仅主 agent 面（记录/查询/跨容器清单）
  "query_impl_checkpoint",
  "list_impl_checkpoints",
  "pause_task", // 单任务暂停入口仅主 agent 面（worker 拒）
  "unblock_task", // blocked→pending 出口仅主 agent 面（worker 拒）
  "knowledge_supersede",
  "knowledge_reinstate",
]

/**
 * 档案可放行 deny 名单（knowledge-stage2-followups #2 用户裁决 2026-11-05）：deny 默认
 * 面中唯一可经专家档案 tools 白名单显式解锁的名——档案（如项目层 distill 专家）tools 含
 * 该名时从 deny 剔除（keep-only allow 本就全量约束，deny 残留只会拆 spawn）。刻意收窄
 * 名单而非通用「档案在即解锁」：addTask/validateMermaid 等其余 deny 名不随档案放行
 * （结构测试钉死），防止任何档案白名单变相扩权。
 */
export const WORKER_EXPERT_RELEASABLE_DENY: readonly string[] = ["knowledge_supersede", "knowledge_reinstate"]

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
 * 管线必备用具集（模块④单点析出——allow=keep-only 语义下的并集保底宽度）：allow=keep-only
 * 会滤除白名单外的全部工具，故结算链必备的 submitTask 与 todo_write（执行骨架清单——全局
 * 拒绝集刻意不拒的同一裁决面，allow 语义下须显式在 allow 内否则 keep-only 滤除）恒并入。
 * bug 三动词（WORKER_BUG_ESSENTIAL_TOOLS）不在此集——它们是跨域条件段（project bugs 服务
 * 在场现查，见 deriveWorkerToolFilter）。派发链组装公式见 deriveWorkerToolFilter；穷举
 * 20 任务类型的保底单测锚定本集。
 */
export const WORKER_PIPELINE_ESSENTIAL_TOOLS: readonly string[] = ["submit_task", "todo_write"]

/**
 * bug 三动词必备集（模块④跨域条件段——WORKER_FORGE_TOOLS bug 域子集锚，字面量对齐）：
 * recordBug/resolveBug 两 bug 写径 + getBug 链上下文读径。bug 域服务归拢 plugins/project
 * host/bugs——本插件不依赖该包，三动词是否入 allow = project bugs 服务在场现查
 * （调用期求值，检测结果不缓存）裁定。
 */
export const WORKER_BUG_ESSENTIAL_TOOLS: readonly string[] = ["record_bug", "resolve_bug", "get_bug"]

/**
 * deriveWorkerToolFilter 现查/留痕选项（模块④——跨域条件段的取数与诊断缝）：
 * bugsPresent = project bugs 服务在场现查缝（调用期求值——检测结果禁止缓存，AGENTS 1.6）；
 * diag = 诊断发射缝（bug 三动词剔除留痕 warn 级）。
 */
export interface DeriveWorkerToolFilterOptions {
  /** project bugs 服务在场现查（true = bug 三动词并入管线必备；false/undefined = 剔除 + warn） */
  readonly bugsPresent?: () => boolean
  /** 诊断发射缝（剔除留痕——diag-face-consolidation 配方；缺席 = 零留痕静默剔除） */
  readonly diag?: ForgeDiagEmitFace
  /** 诊断归属项目 id（可选透传） */
  readonly projectId?: string
}

/**
 * taskType + 路由档位 → 收窄矩阵 → toolFilter（模块④签名收敛注入终态）。
 * 矩阵 = contracts WORKER_TOOL_MATRIX（族 × 工具族 ✓ 表）：族内拒绝的工具族名下已知工具名
 * 入 deny + 全局拒绝集 + forge 闭环（nameFamily 缺省 = WORKER_TOOL_NAME_FAMILY——名表核对
 * pin 独立可测缝收拢为常量直读）。
 * 路由档位（WorkerRouteProfile）：
 * - expert：allow = 档案 tools（route.toolFilter.allow）∪ 管线必备用具集（并集保底公式
 *   原样——管线必备恒可见）；档案可放行面（followups #2）随档案 tools 白名单兑现。
 * - generic：allow = 管线必备用具集（管线必备宽度——keep-only 启用，杜绝旧「纯 deny 面」
 *   形态把结算链必备滤除）。
 * bug 三动词跨域条件段：project bugs 服务在场现查（options.bugsPresent 调用期求值）——
 * 在场 = 三动词并入管线必备；缺席 = 三动词剔除 + diag warn 留痕（fix 链写径对本次派发
 * 不可用，可观测不静默）。
 * registeredTools 参数（bug 3cb118cf——989997bd 的 worker 面同族缺口）：真机已注册全局
 * 工具名在场 = allow/deny 双面与其求交——官方 restrict 未知名 fail-closed loud 校验语义
 * 正确，错在滤器产出真机不存在的名：deny 真机未知名不入；allow shell 同族名解析为在场
 * 候选者，其余未知名 fail-soft 剔除（g-473 同口径），解析空集 fail-loud；缺席 = 双面不裁剪。
 * platform 参数（bug a5b12254）：探针不可信/缺席时 shell 同族平台确定性兜底——win32 → pwsh、
 * 其余 → bash；仅作用于 shell 同族名；缺省 = 不兜底。
 * （求交核心单源 = contracts intersectToolNames——bug a5b12254 集中化。）
 */
export function deriveWorkerToolFilter(
  taskType: TaskType,
  route: WorkerRouteProfile,
  registeredTools?: readonly string[],
  platform?: string,
  options?: DeriveWorkerToolFilterOptions,
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
  for (const [name, f] of Object.entries(WORKER_TOOL_NAME_FAMILY)) {
    if (deniedFamilies.has(f)) deny.add(name)
  }
  for (const name of FORGE_DENY_IN_WORKER) deny.add(name)
  // 档案工具白名单（expert 档位——generic 档零档案面）。档案可放行面（followups #2）：专家
  // 档案 tools 白名单显式携带 knowledge 双 tool 时从 deny 剔除——普通 worker 默认 deny。
  const routeTools = route.kind === "expert" ? route.toolFilter?.allow : undefined
  if (routeTools !== undefined) {
    for (const name of WORKER_EXPERT_RELEASABLE_DENY) {
      if (routeTools.includes(name)) deny.delete(name)
    }
  }
  const intersectedDeny = [...deny].filter(
    (name) => registeredTools === undefined || registeredTools.length === 0 || registeredTools.includes(name),
  )
  // bug 三动词跨域条件段（模块④）：project bugs 服务在场现查——调用期求值，检测结果
  // 不缓存（AGENTS 1.6）；缺席 = 三动词剔除 + warn 留痕（emitDiag——诊断不静默）。
  const bugsPresent = options?.bugsPresent?.() === true
  if (!bugsPresent) {
    options?.diag?.({
      level: "warn",
      event: "worker-route",
      message: `bug 三动词（record_bug/resolve_bug/get_bug）从 worker allow 剔除：project bugs 服务缺席现查未命中（${taskType}）——fix 链写径对本次派发不可用（核销装配面接线）`,
      ...(options.projectId !== undefined ? { projectId: options.projectId } : {}),
    })
  }
  const essentials = [...WORKER_PIPELINE_ESSENTIAL_TOOLS, ...(bugsPresent ? WORKER_BUG_ESSENTIAL_TOOLS : [])]
  // essentials 在场断言（bug e6669a50-G2）：注册面探针在场但管线必备未注册时，求交会把
  // 管线必备静默剔除——keep-only allow 缺 submitTask = worker 结算链静默瘫（比 loud 拆
  // spawn 更劣）。探针在即断言，缺一即 fail-loud。
  if (registeredTools !== undefined && registeredTools.length > 0) {
    const missingEssentials = essentials.filter((name) => !registeredTools.includes(name))
    if (missingEssentials.length > 0) {
      // 诊断面（bug 92d642c2 排查衍生）：报文携带探针实测注册名表——真机「投影里到底有
      // 什么」一次运行即可定谳（缺席名表 = 探针命中子域投影，不再是考古题）。
      throw new Error(
        `pipeline essential tools not registered on this machine: [${missingEssentials.join(", ")}] — ` +
          `registered probe: [${(registeredTools ?? []).join(", ")}]`,
      )
    }
  }
  // allow 并集公式（两档位同构——宽度差 = 档案 tools 键在缺席）：expert = 档案 tools ∪
  // 管线必备；generic = 管线必备。
  const allow = intersectToolNames(
    [...new Set<string>([...(routeTools ?? []), ...essentials])],
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
  if (typeof parent !== "object" || parent === null) return undefined
  const ctx = (parent as { ctx?: unknown }).ctx
  if (typeof ctx !== "object" || ctx === null) return undefined
  const tools = (ctx as { tools?: unknown }).tools
  if (typeof tools !== "object" || tools === null) return undefined
  return readToolNamesOfToolsFace(tools)
}

/**
 * allow 名表与真机注册面求交（兼容再导出壳——bug a5b12254 集中化：实现单源 = contracts
 * intersectToolNames；既有消费面 import 路径零变化，语义逐字节等价）。shell 同族名解析为
 * 在场的候选者、其余未知名 fail-soft 剔除、已知名保序保留。registeredTools 缺席/空 =
 * 不裁剪（无探针不收紧）。抛错面：入表非空而解析全空 → Error fail-loud（keep-only 空表
 * = 全拒，必瘫 worker）。
 */
export function intersectAllowNames(names: readonly string[], registeredTools?: readonly string[]): string[] {
  return intersectToolNames(names, registeredTools)
}

/**
 * 处置代理面禁入的 forge 动词（worker 名单剔除台账只读工具与 add_task——loop-recurrence-
 * hardening §2.2.1：get_bug 放开供台账深挖（在场面）；add_task 放开 = 处置派生径
 * （用户裁决 2026-11-02——triage 分类后建 fix 卡与 execute 面 worker 拒收的身份分流
 * 「main session and the loop triage layer 放行」对齐）；写面（record_bug/resolve_bug/
 * submit_task）与任务域动词恒 deny。
 */
const TRIAGE_FORGE_DENY: readonly string[] = FORGE_DENY_IN_WORKER.filter(
  (name) => name !== "add_task",
)

/**
 * triage 额外写面 deny（plugin-task-loop/1.18-a 判例）：contracts 名表 forge 族键仍为旧宿主
 * camelCase 名（plugin-forge legacy 在册——不可单方随迁），triage deny 不再全量收编名表键，
 * forge 写面（结算/缺陷写径）改在此显式列名（本宿主注册名）。
 */
const TRIAGE_EXTRA_DENY: readonly string[] = ["submit_task", "record_bug", "resolve_bug"]

/**
 * 处置代理 toolFilter（S1c 第二层——「收窄工具面」的只读放开形，loop-recurrence-hardening
 * §2.2.1）：一次性处置代理只做决策与台账深挖不执行——已知工具名 deny，唯 get_bug
 * 只读台账工具放行（问题分类器自主深挖缺陷背景与 errorType 语义归类；缺陷写面/任务域
 * 写动词/shell/fs 恒 deny——越权动作结构性不可达；输出契约 = 终态 output 文本内的 JSON
 * 决策，由宿主解析忠实执行）。deny 全集 = worker 名表 − get_bug + add_task 放行
 * （forge 动词）+ 全局拒绝集 − {get_bug}。
 * registeredTools 参数（bug 989997bd）：真机已注册全局工具名在场 = deny 与其求交；缺席
 * （取数缝失败/极简 profile）= 全表（与既有 loud 行为逐字节等价）。
 */
export function deriveTriageToolFilter(registeredTools?: readonly string[]): { deny: string[] } {
  const deny = new Set<string>(WORKER_GLOBAL_DENY_TOOLS)
  // 名表按族收编、forge 族除外（键为旧宿主 camelCase 名——未注册名入 deny 会被 restrict
  // loud 校验拆 spawn；forge 面写径由 TRIAGE_EXTRA_DENY 显式承载，判例 plugin-task-loop/1.18-a）
  for (const [name, fam] of Object.entries(WORKER_TOOL_NAME_FAMILY)) {
    if (fam !== "forge") deny.add(name)
  }
  for (const name of TRIAGE_FORGE_DENY) deny.add(name)
  for (const name of TRIAGE_EXTRA_DENY) deny.add(name)
  // 只读放开 + 处置派生径（loop-recurrence-hardening §2.2.1 + 用户裁决 2026-11-02）：
  // get_bug = bug 台账单条全卡/链上下文只读径（在场面）；add_task = 处置分类后建 fix 卡
  // 派生径。其余写面不可达断言不变（record_bug/resolve_bug/submit_task 仍在 deny）。
  deny.delete("get_bug")
  deny.delete("add_task")
  return { deny: [...deny].filter((name) => registeredTools === undefined || registeredTools.includes(name)) }
}

/**
 * worker agentOptions 组装（单源 contracts subagent-assemble.ts——上方薄壳 re-export；
 * 优先级链与 reasoning 三级合成语义正本见 contracts 同名函数注。模块④：路由档位的
 * agentOptions（generic = 父会话继承折叠应答）经 reconcileWorkerReasoning 兼容收口消费。
 */

/**
 * 档位兼容收口（单源 contracts subagent-assemble.ts——上方薄壳 re-export）。
 */
