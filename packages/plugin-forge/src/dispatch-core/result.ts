// dispatch-core · 返回面契约（S1a 可拆卸壳分层；Interface 2 四分支 + 失败 DTO）——
// 核心面产出、工具壳渲染/再导出的共享结果词汇。DispatchCoreFailure 与 tools/format
// ForgeToolFailure 同形结构（壳面判别与 render 消费）——核心面零反依赖工具面：
// 共享形状独立声明，结构兼容双向可赋值。
import type { ErrorCode, Mode, TaskRef, TaskType } from '@dsh-forge/contracts'
import type { PoolSnapshot } from './pool.js'

/** spawned 分支（结算 + 池快照；blocked 增 reason——Interface 2 渲染模板「原因行」承载） */
export interface DispatchSpawnedResult {
  readonly kind: 'spawned'
  readonly outcome: 'success' | 'blocked'
  readonly taskRef: TaskRef
  readonly title: string
  readonly type: TaskType
  /** 容器模式快照（NULL = 键缺席） */
  readonly mode?: Mode
  /** claim 简报指纹（task_records.claim 行双记同值） */
  readonly digest: string
  readonly summary?: string
  /** blocked 原因行（blocked submit 必带 reason——core 侧先证） */
  readonly reason?: string
  readonly commitHash?: string
  /** 结算 files 平铺清单（无进展门的第二进展信号——submit record files_json 解码形） */
  readonly files?: readonly string[]
  /** 已建修复任务（blocked 径 worker 经 addTask blockSource 派生链——可继续派发） */
  readonly followUp?: TaskRef
  readonly pool: PoolSnapshot
}

/** 派发核心失败 DTO（= ForgeToolFailure 同形结构；见模块头——零反依赖工具面） */
export interface DispatchCoreFailure {
  readonly ok: false
  readonly code: ErrorCode
  /** 人话原因（首行承重；多段消息整段保留） */
  readonly message: string
  /** 违规清单（自然键/AC 条目/环路径——逐行投影；无结构化载荷 = 空数组） */
  readonly violations: readonly string[]
}

/** dispatchTask 返回面（五分支：四成功形态 + 失败 DTO——ERR_SPAWN_FAILED） */
export type DispatchTaskResult =
  | DispatchSpawnedResult
  | {
      /** dispatched 分支（后台派发回执——async-dispatch §4.4：taskRef/workerSessionId/jobId/pool 四键） */
      kind: 'dispatched'
      taskRef: TaskRef
      title: string
      type: TaskType
      workerSessionId: string
      jobId: string
      pool: PoolSnapshot
      /** 幂等重入标识（claim 返回 reclaimed——同任务已有派发在先；渲染面据此附「等待结算再续派」
       *  指引，防 scoped 循环对在飞任务重复 spawn；新领取零此键） */
      readonly reEntered?: boolean
    }
  | { kind: 'no-task'; pool: PoolSnapshot }
  | { kind: 'halted'; reason: string }
  | DispatchCoreFailure
