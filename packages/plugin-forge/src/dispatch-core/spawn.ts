// dispatch-core · spawn 契约（S1a 可拆卸壳分层——implementation-blueprint §3「spawn 契约」）。
// worker spawn 请求/句柄/绑定类型的结构化最小面：核心面、工具壳、in-process driver 真绑定
// 三方共享。真绑定 = spawn/in-process-driver.ts（装配注入 deps.spawn；单测注入桩）。
import type { ReasoningEffortLevel } from '@dsh-forge/contracts'

/** worker spawn 请求（dispatchPrompt 全文 = worker 首条用户消息——零进本会话上下文） */
export interface SpawnWorkerRequest {
  /** 派发简报全文（人格段 + 三标签块——worker 角色唯一来源） */
  readonly prompt: string
  /** 派发 agent（exec.agent 透传——真 Agent 结构兼容；驱动面派生 lineage/depth） */
  readonly parent: unknown
  /** 取消信号（exec.signal 透传；缺省 = 新建——驱动面要求必填） */
  readonly signal: AbortSignal
  /** 收窄面（矩阵派生 deny——childCtx.tools.restrict 同义） */
  readonly toolFilter: { readonly deny: readonly string[] }
  /** 默认 LLM（forgeSettings 已配置才携带；缺省 = 回退父会话继承；effort 缺席 = default 档/兼容剥离） */
  readonly agentOptions?: {
    readonly provider: string
    readonly model: string
    readonly reasoningEffort?: ReasoningEffortLevel
  }
  /** 子会话标签（任务键 · 任务名——worker 子会话标题；用户裁决 2026-10-10：编号+名称） */
  readonly label?: string
  /**
   * worker persona（S2 分层承载——core composePersona 产出，经上游
   * SubagentStartRequest.persona 落子会话 scoped 'deployment:persona-prefix' 段遮蔽部署
   * 人格；缺席 = 不携带键回退父会话人格。不进 dispatchPrompt——任务面/人格面分层保持）
   */
  readonly persona?: string
  /**
   * worker 会话 cwd 钉定检出（1.14 判例修复——worker 会话未钉定 worktree、提交落 main）：
   * loopSourced 派发携带发起循环的检出路径（LoopRecord.worktree），spawn 实现侧机械核销
   * 「worker 会话工作目录 = 发起循环的检出」——不依赖 spawn 时点环境 cwd。缺席（工具壳
   * 非 loopSourced 径）= 不携带键，行为零变化。
   */
  readonly workspaceCwd?: string
}

/** spawn 句柄（两段：start 发布即回——task-spawned 事件先于 worker 执行；result 阻塞至终态） */
export interface SpawnWorkerHandle {
  /** worker 子会话 id（对账锚——追溯三键闭环） */
  readonly workerSessionId: string
  /** 终态（stopReason 非必要——结算以任务终态为准）；拒绝 = 基建故障（spawn 失败径） */
  readonly result: Promise<{ readonly stopReason: string; readonly output: string }>
  /** 收尾（幂等——取消剩余工作 + 静默） */
  dispose(): Promise<void>
}

/** spawn 面（真绑定 = spawn/in-process-driver.ts；单测注入桩） */
export type SpawnWorker = (request: SpawnWorkerRequest) => Promise<SpawnWorkerHandle>
