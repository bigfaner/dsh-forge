// dispatch-core · 返回面契约（S1a 可拆卸壳分层；Interface 2 四分支 + 失败 DTO）——
// 核心面产出、工具壳渲染/再导出的共享结果词汇。DispatchCoreFailure 与 tools/format
// ForgeToolFailure 同形结构（壳面判别与 render 消费）——核心面零反依赖工具面：
// 共享形状独立声明，结构兼容双向可赋值。
// 容器语义 slug 化：TaskRef/TaskType 用本插件域层（host/domain/tasks/types.ts）；
// mode 快照随容器双轨退役（slug 化终态——键退役）。
import type { ErrorCode } from "@dsh-forge/contracts";
import type { TaskRef, TaskType } from "../domain/tasks/types.js";
import type { PoolSnapshot } from "./pool.js";

/** spawned 分支（结算 + 池快照；blocked 增 reason——Interface 2 渲染模板「原因行」承载） */
export interface DispatchSpawnedResult {
  readonly kind: "spawned";
  readonly outcome: "success" | "blocked";
  readonly taskRef: TaskRef;
  readonly title: string;
  readonly type: TaskType;
  /** claim 简报指纹（task_records.claim 行双记同值） */
  readonly digest: string;
  readonly summary?: string;
  /** blocked 原因行（blocked submit 必带 reason——core 侧先证） */
  readonly reason?: string;
  readonly commitHash?: string;
  /** 结算 files 平铺清单（无进展门的第二进展信号——settlement evidence files 解码形） */
  readonly files?: readonly string[];
  /** 已建修复任务（blocked 径 worker 经 addTask blockSource 派生链——可继续派发） */
  readonly followUp?: TaskRef;
  /** e2e 取证债（改进7——success 径 submit 携带 evidenceDebt 时自动生成的欠账 test-run 任务） */
  readonly evidenceDebt?: { taskRef: TaskRef; suite: string; specs: readonly string[] };
  readonly pool: PoolSnapshot;
}

/** 派发核心失败 DTO（= ForgeToolFailure 同形结构；见模块头——零反依赖工具面） */
export interface DispatchCoreFailure {
  readonly ok: false;
  readonly code: ErrorCode;
  /** 人话原因（首行承重；多段消息整段保留） */
  readonly message: string;
  /**
   * 失败分桶（spawn-false-alarm——缺席 = spawn-failed 缺省桶）：ended-without-settlement =
   * worker 跑完未调 submitTask（协议违约，非 spawn/进程故障）——报文措辞与诊断 warn 按桶分流，
   * 消除「跑完未结算被冠以 spawn failed」的误报类别词。
   */
  readonly category?: "ended-without-settlement";
  /** 违规清单（自然键/AC 条目/环路径——逐行投影；无结构化载荷 = 空数组） */
  readonly violations: readonly string[];
}

/** dispatchTask 返回面（五分支：四成功形态 + 失败 DTO——ERR_SPAWN_FAILED） */
export type DispatchTaskResult =
  | DispatchSpawnedResult
  | {
      /** dispatched 分支（后台派发回执——async-dispatch §4.4：taskRef/workerSessionId/jobId/pool 四键） */
      kind: "dispatched";
      taskRef: TaskRef;
      title: string;
      type: TaskType;
      workerSessionId: string;
      jobId: string;
      pool: PoolSnapshot;
      /** 幂等重入标识（claim 返回 reclaimed——同任务已有派发在先；渲染面据此附「等待结算再续派」
       *  指引，防 scoped 循环对在飞任务重复 spawn；新领取零此键） */
      readonly reEntered?: boolean;
    }
  | { kind: "no-task"; pool: PoolSnapshot }
  | { kind: "halted"; reason: string }
  | DispatchCoreFailure;
