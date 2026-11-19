// loop · 驱动器 seam 单源面（plugin-forge src/loop/driver.ts 类型声明直迁——proposal
// plugin-task-loop 任务 1.11 工具壳/指令壳消费切片；容器语义 slug 化：source 字段 = { slug }，
// TaskSnapshot 用本插件 host/domain/tasks/types.ts 的）。
//
// 本文件只承载类型与接口——接口为工具壳（tools/dispatch-task.ts、tools/stop-task-loop.ts）
// 与指令壳（commands/run-dag-tasks.ts、commands/stop-dag-tasks.ts）的消费 seam 单源；
// createLoopDriver 实装随循环驱动器迁移任务落位（不在本任务范围）。
import type { ContainerRef, TaskSnapshot } from "../domain/tasks/types.js";
import type { LoopInstanceId, LoopRecord, LoopRegistry, LoopSourceRef } from "./registry.js";

/** escalate 升级载荷四节（上浮面——专业且充分的建议，非裸转交） */
export interface TriageEscalationPayload {
  /** 问题归类（能力类别 + 判据） */
  readonly classification?: string;
  /** 建议处置与理由（建模排查/深查/直接修复） */
  readonly disposition?: string;
  /** 建议委派目标（描述性——派谁由主会话自行决定） */
  readonly delegateTarget?: string;
  /** 证据指针（recurrence 链 bug_id、卷宗/报告路径——指针化引用，不搬运全文） */
  readonly evidencePointers?: readonly string[];
}

/**
 * 第三层裁决升级事件（问询不经主会话——userQuestions 面）。载荷纪律：reason 原文与处置
 * 历史全文在载荷内（叙述面仅摘要）；ownerSessionId = 主会话 id。slug 化：source = { slug }。
 */
export type LoopEscalation =
  | {
      readonly kind: "deadlock";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      /** 阻塞清单（taskKey + 任务名注记——叙述同源） */
      readonly blockedItems: readonly { readonly taskKey: string; readonly note: string }[];
    }
  | {
      readonly kind: "blocked-ask-user";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      readonly task: TaskSnapshot;
      /** blocked 原因全文（叙述面摘要的全文落点——问询 detail） */
      readonly reason: string;
      /** 处置历史（处置阶梯逐次记录——含本次决策行） */
      readonly history: readonly string[];
      /** escalate 升级载荷（在场即随问询 detail 上浮，缺席 = 旧无载荷形态兼容） */
      readonly advice?: TriageEscalationPayload;
    }
  | {
      readonly kind: "worker-abort-over-limit";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      readonly taskKey: string;
      readonly attempts: number;
    }
  | {
      readonly kind: "disposition-over-limit";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      readonly task: TaskSnapshot;
      /** blocked 原因全文（问询 detail——裁决全文档） */
      readonly reason: string;
      /** 处置计数（到顶） */
      readonly attempts: number;
      /** 处置历史（逐次记录——无效/越权输出行在其中） */
      readonly history: readonly string[];
    }
  | {
      readonly kind: "fix-chain-over-limit";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      readonly task: TaskSnapshot;
      /** blocked 原因全文（问询 detail——裁决全文档） */
      readonly reason: string;
      /** 到顶深度（缺席 = 数据不可得） */
      readonly depth?: number;
      readonly limit?: number;
      /** 处置历史（含本次「修复任务创建被拒」行） */
      readonly history: readonly string[];
    }
  | {
      readonly kind: "halted";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      /** spawn 连败次数 */
      readonly attempts: number;
      /** halted 原因全文（问询 detail） */
      readonly reason: string;
    }
  | {
      /** 落点核验失败强制处置——错分支提交不得静默接受 */
      readonly kind: "settle-landing-rejected";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      readonly taskKey: string;
      /** 核验结论/故障全文（问询 detail；含 interrupted 真化结果） */
      readonly reason: string;
    }
  | {
      /** 流控挂起——限流零重试，返回主会话择时重派 */
      readonly kind: "rate-limit";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      readonly taskKey: string;
      /** 流控原因全文（问询 detail） */
      readonly reason: string;
    }
  | {
      /** 单任务暂停挂起（pauseTask 写点①的挂起投影载荷） */
      readonly kind: "task-paused";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      readonly taskKey: string;
      /** 暂停原因全文（载荷全文承载） */
      readonly reason: string;
    }
  | {
      /** T3 同缝拦截挂起——盲试 fix 派发被 claim 守卫软拒绝，转升级问询/挂起处置 */
      readonly kind: "recurrence-escalation";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      readonly taskKey: string;
      /** 拒绝原因全文（问询 detail） */
      readonly reason: string;
      /** 命中家族链（bug_id 时间序，链根在前——证据指针） */
      readonly chain: readonly string[];
      /** 同缝计数 */
      readonly count: number;
    }
  | {
      /** 阶段门持有挂起——gated 持续等待达 patience 上限；主动停下问人 */
      readonly kind: "phase-gate";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      /** 持有原因全文（问询 detail） */
      readonly reason: string;
      /** 链上滞留 I 卡清单（suspend 载荷透传——问询侧直接看到链上滞留卡） */
      readonly unsettled: readonly { readonly slug: string; readonly localId: string; readonly taskStatus: string }[];
    }
  | {
      /** done 径承接检查挂起——open bug 无承接修复链不收口 */
      readonly kind: "unclaimed-bugs";
      readonly ownerSessionId: string;
      readonly source: ContainerRef;
      /** 判定全文（问询 detail） */
      readonly reason: string;
      /** 未承接 bug 清单（bug_id + 摘要 + 源任务键） */
      readonly bugs: readonly { readonly bugId: string; readonly summary: string; readonly taskKey: string }[];
    }

/** 第三层裁决升级挂钩（escalation.ts 实装消费——问询投递） */
export interface LoopEscalationHook {
  escalate(escalation: LoopEscalation): Promise<void>;
}

// ─────────────────────────── 生命周期入口（供工具壳/指令壳调用） ───────────────────────────

/** 启动入参（指令 handler 透传：agent = 主会话 Agent——worker spawn parent 与叙述目的地） */
export interface LoopStartInput {
  readonly source: ContainerRef;
  /** 主会话真实 id（claim/links 身份锚 + 叙述目的地 + stop 作用域键） */
  readonly ownerSessionId: string;
  /** 主会话 Agent（结构兼容透传——in-process driver 派生 lineage/工作目录/深度） */
  readonly parent: unknown;
  /** 项目覆盖（指令面按敲指令会话 cwd 解析；缺席回退装配缺省——双缺席 = start 拒绝） */
  readonly projectId?: string;
  /** 发起循环的检出路径（owner 会话 cwd）：登记进 LoopRecord.worktree——worker cwd 钉定源 */
  readonly worktree?: string;
  /** 本项目文档根绝对路径（纯文档跨分支特例的归属判据锚；缺席 = 前缀判据 fail-soft） */
  readonly docsRoot?: string;
}

/** 启动返回（loop-active = 该容器已有活循环；owner-active = 会话级单活门控——循环间串行） */
export type LoopStartResult =
  | { readonly ok: true; readonly loopId: LoopInstanceId }
  | {
      readonly ok: false;
      readonly code: "loop-active" | "owner-active";
      readonly activeSource: LoopSourceRef;
      readonly activeOwnerSessionId: string;
      /** owner-active 径专用——命中会话的活循环是否挂起中（挂起也占会话名额） */
      readonly suspended: boolean;
      /** 自解释人话 + 指引行（工具/指令渲染面直接投影——零二次拼装） */
      readonly message: string;
      readonly guidance: readonly string[];
    }

/** 停止返回（本会话无活循环 = no-active-loop——指令面据此回「本会话没有派发任务」） */
export type LoopStopResult =
  | { readonly ok: true; readonly stopped: true; readonly hadInFlight: boolean }
  | { readonly ok: false; readonly code: "no-active-loop" }

/**
 * 定向停止返回（stop_task_loop——作用域裁决：运行中仅 owner 可停；挂起态任意会话可停——
 * 支撑接管。越权/无活循环拒绝，suspended/ownerSessionId 随行供自解释文案。
 */
export type LoopStopLoopResult =
  | { readonly ok: true; readonly stopped: true; readonly hadInFlight: boolean }
  | { readonly ok: false; readonly code: "no-active-loop" | "forbidden"; readonly suspended: boolean; readonly ownerSessionId: string }

/**
 * 单任务暂停返回（pause_task 消费面——typed 拒绝四径：no-active-loop / forbidden /
 * reason-required / no-in-progress-task）；suspended/ownerSessionId 随行供自解释文案。
 */
export type LoopPauseResult =
  | { readonly ok: true; readonly paused: true; readonly taskKey: string }
  | {
      readonly ok: false;
      readonly code: "no-active-loop" | "forbidden" | "reason-required" | "no-in-progress-task";
      readonly suspended: boolean;
      readonly ownerSessionId: string;
    }

/** 处置回流返回（re-entry——无活登记 / 非挂起态拒绝；aborted = 挂起期循环已被叫停） */
export type LoopResumeResult =
  | { readonly ok: true; readonly loopId: LoopInstanceId }
  | { readonly ok: false; readonly code: "no-active-loop" | "not-suspended" | "aborted" }

/** 驱动器公开面（工具壳/指令壳消费：启动/停止/定向停止/暂停/活循环查询/续接/卸载收口） */
export interface LoopDriver {
  start(input: LoopStartInput): Promise<LoopStartResult>;
  stop(input: { readonly ownerSessionId: string }): Promise<LoopStopResult>;
  /**
   * 定向停止（stop_task_loop 消费面——与 /stop-dag-tasks 双入口同 registry 判活）：按
   * LoopInstanceId 定位，统一结束处理（在途 worker 取消、孤儿任务真化 interrupted、收口
   * 叙述、终态注销）与 stop() 同径单源。
   */
  stopLoop(input: { readonly loopId: LoopInstanceId; readonly requesterSessionId: string }): Promise<LoopStopLoopResult>;
  /**
   * 单任务暂停（pause_task 消费面）：硬中断在飞 worker → 任务真化 suspended（reason 必带）
   * → 循环置 LoopRecord.suspended 挂起（dispatch_task re-entry resume 续跑）。归属守卫与
   * stopLoop 同权限面：运行中仅 owner 会话可 pause；挂起态任意会话可接管。
   */
  pause(input: { readonly loopId: LoopInstanceId; readonly requesterSessionId: string; readonly reason: string }): Promise<LoopPauseResult>;
  /** 本会话活循环（指令「跑动中再触发」的查询面；无 = undefined） */
  activeOf(ownerSessionId: string): LoopRecord | undefined;
  /** 进程内全量活循环读数（多会话并行——指令层同源占用判定/候选过滤观察面） */
  activeAll(): readonly LoopRecord[];
  /**
   * 处置回流（re-entry）：清 `record.suspended` 回落 active 并从留存点续跑。返回：无活登记 =
   * no-active-loop；未挂起 = not-suspended；已叫停 = aborted（拒绝，不误报 ok:true）。
   */
  resume(input: { readonly loopId: LoopInstanceId }): LoopResumeResult;
  /**
   * fiber 卸载收口（装配 disposer 消费）：全部活循环同步终态注销——控制器 abort + 登记表
   * 注销。静默径：不真化 in-flight、零叙述；遗留 in_progress 由下次装配 reconcileInterrupted
   * 对账。缺此收口时循环存活越过 fiber 卸载，DB 句柄关闭后循环异常终止。
   */
  dispose(): void;
}

/** 循环工具共享 deps（dispatch_task / stop_task_loop 共用——驱动器 + 登记表单例注入；seam 单源随本文件） */
export type LoopToolDeps = {
  /** 循环驱动器（装配单例——与 /run-dag-tasks 指令同源同一循环核心） */
  readonly driver: LoopDriver;
  /** 活循环登记表（装配单例——守卫判活/接管集写点读面） */
  readonly registry: LoopRegistry;
};