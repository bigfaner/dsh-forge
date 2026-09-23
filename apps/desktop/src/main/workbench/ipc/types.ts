// workbench/ipc/types — Interface 1 DTO 与动词服务契约(任务 2.7)。
//
// 本模块是渲染层(preload 桥 + forge-workbench 插件 client 半身)与主进程
// handler 共享的类型面 —— 仅类型再导出与 DTO 声明,零运行时代码(preload 以
// `import type` 消费,不进 bundle)。字段定义以 tech-design §Interface 1 为
// 唯一权威;行形态(snake_case)→ DTO(camelCase)的映射只发生在 repos 层。
//
// 方言适配钉定(任务 2.5 记录,dispatcher 核正):
//   - taskKey = 看板限定地址 `<featureSlug>/<localId>`;TaskSummary.blockers
//     仍为同 feature 命名空间的本地上游 key 原词;
//   - TaskRecord = forge write-once 记录 .md 的适配形态(at = completed 退化
//     started 的原样串 / kind = index.json 任务 type / source = actor 行槽位
//     否则 null / summary = `## Summary` 节原文),不虚构 forge 未写字段。

import type {
  ChangeSource,
  DocKind,
  FeatureStatus,
  Project,
  ProjectPatch,
  RegisterProjectInput,
  SessionLink,
  TaskStatus,
} from '../repos/types.ts'
import type { MigrationPhase, SyncStatusPayload as SyncStatus, WorkbenchEvent } from '../indexer/diff.ts'

// Interface 1 中已由仓储/感知层定义的 DTO,以本模块为共享出口(避免渲染层
// 直接依赖 main 内部模块路径)。SyncStatus = 感知层的 SyncStatusPayload
// (Interface 1 事件载荷形态)。
export type { ChangeSource, DocKind, Project, ProjectPatch, RegisterProjectInput, SessionLink, TaskStatus }
export type { SyncStatus, WorkbenchEvent, MigrationPhase }
export type { FeatureStatus }

// ---------------------------------------------------------------------------
// Interface 1 只在动词面出现的 DTO(仓储层无对应行形态)
// ---------------------------------------------------------------------------

/** Interface 1 TaskSummary(task_snapshot 行的 IPC 投影,剥离仓储侧 projectId)。 */
export interface TaskSummary {
  /** 看板限定地址 `<featureSlug>/<localId>`。 */
  readonly key: string
  readonly title: string
  readonly status: TaskStatus
  readonly featureSlug: string
  /** 直接上游 blocker 的本地上游 key 列表(传递链由 getTaskDetail 另行展开)。 */
  readonly blockers: string[]
  /** 任务执行 git 分支(执行痕迹;方言缺失恒 null)。 */
  readonly branch: string | null
  readonly worktree: boolean
  /** 最近一笔变更来源;无则 null。 */
  readonly source: ChangeSource | null
  readonly updatedAt: string
  /**
   * M3(任务 1.3):权威通道(sqlite)的 actor 审计列投影
   * (`session:<id>`|`external`|`kernel`|派发者);files 分支(task_snapshot
   * 派生投影)不携带 —— `source` 为其 v1 判定序来源。读路由双分支的统一
   * DTO 出口(tech-design §Interface 1 TaskSummary;完整类型随任务分解细化)。
   */
  readonly updatedBy?: string
}

/** Interface 1 TaskBoardData。 */
export interface TaskBoardData {
  readonly tasks: TaskSummary[]
  readonly generatedAt: string
  readonly sync: SyncStatus
}

/** Interface 1 TaskRecord(forge 执行记录;方言适配见模块头)。 */
export interface TaskRecord {
  readonly at: string
  readonly kind: string
  readonly source: ChangeSource | null
  readonly summary: string
}

/** Interface 1 depChain 条目(上游传递链,拓扑序,key 为限定地址)。 */
export interface TaskDepChainEntry {
  readonly key: string
  readonly title: string
  readonly status: TaskStatus
}

/** Interface 1 TaskDetail(summary + 描述原文 + 依赖链 + 执行记录 + 挂接历史)。 */
export interface TaskDetail {
  readonly summary: TaskSummary
  /** 任务文件原文(渲染层防注入:只读渲染)。 */
  readonly descriptionMarkdown: string
  readonly depChain: TaskDepChainEntry[]
  readonly records: TaskRecord[]
  /** 挂接历史(新→旧)。 */
  readonly links: SessionLink[]
}

/** Interface 1 FeatureSummary(feature_snapshot 行的 IPC 投影)。 */
export interface FeatureSummary {
  readonly slug: string
  readonly status: FeatureStatus
  /** 实际存在的文档类(⊂ 五类;驱动 UF4 tab disabled)。 */
  readonly docKinds: DocKind[]
  readonly taskTotal: number
  readonly taskCompleted: number
  readonly updatedAt: string
}

/** Interface 1 FeatureBoardData。 */
export interface FeatureBoardData {
  readonly features: FeatureSummary[]
  readonly generatedAt: string
}

/** Interface 1 FeatureDoc。 */
export interface FeatureDoc {
  readonly kind: DocKind
  readonly markdown: string
}

/** Interface 1 PluginRow(两级插件模型;mandatory 派生自产品清单)。 */
export interface PluginRow {
  readonly name: string
  readonly mandatory: boolean
  readonly enabled: boolean
}

/** Interface 1 WorkbenchState(getState 装配产物)。 */
export interface WorkbenchState {
  readonly projects: Project[]
  readonly activeProjectId: string | null
  readonly plugins: PluginRow[]
}

/** Interface 1 recordSessionLink 入参形态。 */
export interface RecordSessionLinkInput {
  readonly projectId: string
  readonly taskKey: string
  readonly sessionId: string
}

// ---------------------------------------------------------------------------
// M3 任务动词 DTO(任务 1.3;tech-design §Interface 1 任务权威写集 + 读路由)
// ---------------------------------------------------------------------------

/** 操作主体:session 会话标识 / 外部通道 / 内核 / 派发者(tech-design Actor)。 */
export type TaskActor = string

/** taskAdd 入参(Interface 1;taskKey 缺省 = 内核自动 ID,Go disc-N 惯例)。 */
export interface TaskAddInput {
  readonly projectId: string
  readonly featureSlug: string
  readonly title: string
  /** 看板限定地址;缺省自动合成;显式给定时前缀必须 = featureSlug。 */
  readonly taskKey?: string
  /** 直接上游 blocker 的本地 key 原词(同 feature 命名空间)。 */
  readonly blockers?: readonly string[]
  /** 任务类型(预合成协议选择键);缺省 null。 */
  readonly taskType?: string
  /** 描述 md 相对文档根(features/)路径;缺省 null。 */
  readonly descPath?: string
}

/** taskClaim 入参。 */
export interface TaskClaimInput {
  readonly projectId: string
  readonly taskKey: string
}

/** taskTransition 入参(reason 为语境串;v2 schema 无列,接受不落库)。 */
export interface TaskTransitionInput {
  readonly projectId: string
  readonly taskKey: string
  readonly to: TaskStatus
  readonly reason?: string
}

/** taskSubmit 入参(recordPath 为记录 .md 语境路径;md 留文档树不入库)。 */
export interface TaskSubmitInput {
  readonly projectId: string
  readonly taskKey: string
  readonly recordPath?: string
}

/** taskReopen 入参。 */
export interface TaskReopenInput {
  readonly projectId: string
  readonly taskKey: string
}

/** taskGet 入参(读路由按 projects.data_authority)。 */
export interface TaskGetInput {
  readonly projectId: string
  readonly taskKey: string
}

/** taskQuery 入参(读路由列表;过滤器均可缺省)。 */
export interface TaskQueryInput {
  readonly projectId: string
  readonly featureSlug?: string
  readonly status?: TaskStatus
}

// ---------------------------------------------------------------------------
// M3 迁移动词 DTO(任务 1.4;tech-design §Interface 1 迁移段 + §Interface 4)
// ---------------------------------------------------------------------------

/** migration_event 行的 IPC 投影(迁移/回收审计,结果可回查;PRD G2)。 */
export interface MigrationEvent {
  readonly id: string
  readonly projectId: string
  /** 7 相词表(schema-v2.sql §9 CHECK 同源;reingest 相 = 外部写回收,1.5)。 */
  readonly phase: MigrationPhase
  readonly result: 'ok' | 'fail'
  /** 相位详情 JSON 原文(对拍报告/备份清单/回滚明细);无 → null。 */
  readonly detailJson: string | null
  readonly at: string
}

/** getMigrationStatus 返回形态(Interface 1:读路由 + 迁移/偏离状态)。 */
export interface MigrationStatus {
  /** 项目任务权威通道(projects.data_authority)。 */
  readonly authority: 'files' | 'sqlite'
  /** 外部写回收偏离标记(projects.deviated;置位归 1.5 重摄入路径)。 */
  readonly deviated: boolean
  /** 迁移完成时间;未迁移 → null。 */
  readonly migratedAt: string | null
  /** 最近一笔迁移审计事件;从未发起 → null。 */
  readonly lastEvent: MigrationEvent | null
  /**
   * 文档树是否仍检出 tasks/index.json(任务 1.7):migratable 判定的
   * 文档侧半边 —— authority 'files' + 本位 true = 卡片「可迁移」;迁移
   * 归档后(或从未有任务态)为 false。
   */
  readonly indexJsonDetected: boolean
}

/**
 * probeCodeRoot 入参(任务 1.7):向导步骤①的 codeRoot + 步骤②定型后的
 * 文档位置(docLocationPath 缺省/null = 仓内,探测点落 codeRoot 自身)。
 * 检出语义对齐注册校验链的 detectForgeCheckout —— 同一 fs 只读判定。
 */
export interface ProbeCodeRootInput {
  readonly codeRoot: string
  readonly docLocationPath?: string | null
}

/**
 * probeCodeRoot 返回形态(任务 1.7):可用性(forge 检出)+ 概览计数 +
 * indexJsonDetected(条件迁移步骤的前提,Interface 4 §8)。
 */
export type ProbeCodeRootResult =
  | {
    readonly available: true
    readonly taskTotal: number
    readonly featureTotal: number
    readonly indexJsonDetected: boolean
  }
  | {
    readonly available: false
    readonly reasonCode: 'ERR_CODE_ROOT_UNREADABLE' | 'ERR_FORGE_NOT_DETECTED'
    readonly detail?: string
  }

/**
 * getWorkbenchPaths 返回形态(任务 1.7):内核管理位置 —— docsRoot = 仓外
 * 文档根默认(应用管理路径,G7/SC9 注册向导默认值翻转的落点),backupsRoot
 * = 迁移备份根(确认对话框的 mono 备份位置)。
 */
export interface WorkbenchPaths {
  readonly docsRoot: string
  readonly backupsRoot: string
}

/** startMigration 返回形态(进度经 migration_progress 事件,Interface 1)。 */
export interface MigrationStarted {
  readonly started: true
}

// ---------------------------------------------------------------------------
// 动词服务契约(handler 只做 参数校验 + 服务调用 + 错误映射,Hard Rule)
// ---------------------------------------------------------------------------

/**
 * 13 个数据动词的服务面(实现 = services.ts 装配 2.2-2.6 各仓储与服务;
 * onEvents 的订阅/退订生命周期归 handler 层的事件订阅登记,不在此面)。
 */
export interface WorkbenchVerbServices {
  getState(): WorkbenchState
  registerProject(input: RegisterProjectInput): Project
  updateProject(id: string, patch: ProjectPatch): Project
  removeProject(id: string): void
  activateProject(id: string): void
  getTaskBoard(projectId: string): TaskBoardData
  getTaskDetail(projectId: string, taskKey: string): TaskDetail
  getFeatureBoard(projectId: string): FeatureBoardData
  readFeatureDoc(projectId: string, featureSlug: string, kind: DocKind): FeatureDoc
  listPlugins(): PluginRow[]
  /** mandatory 禁用请求经守卫拒绝(ERR_PLUGIN_MANDATORY);成功只写 userData 覆盖文件。 */
  setPluginEnabled(name: string, enabled: boolean): PluginRow[]
  recordSessionLink(input: RecordSessionLinkInput): SessionLink
  endSessionLink(linkId: string): void
  /**
   * 仓外路径显式授权登记(6.4):向导步骤②确认的唯一落库通道 ——
   * registry/authorize.ts 的持久化记录(校验链只读;零 fs 探测)。
   */
  authorizeExternalDocPath(path: string): void
  // —— M3 任务动词(任务 1.3;实现 = tasks/task-service.ts,经 services.ts 装配)——
  /** 插入权威行(默认 pending;唯一写入口 = task-repo 内核事务)。 */
  taskAdd(input: TaskAddInput, actor: TaskActor): TaskSummary
  /** → in_progress;依赖终态前置 → ERR_TASK_DEPS_UNSATISFIED。 */
  taskClaim(input: TaskClaimInput, actor: TaskActor): TaskSummary
  /** 显式迁移(role=manual);非法边 → ERR_TASK_STATE_INVALID。 */
  taskTransition(input: TaskTransitionInput, actor: TaskActor): TaskSummary
  /** → completed(role=submit)。 */
  taskSubmit(input: TaskSubmitInput, actor: TaskActor): TaskSummary
  /** rejected/skipped → pending(role=reopen)。 */
  taskReopen(input: TaskReopenInput, actor: TaskActor): TaskSummary
  /** 读路由:files → task_snapshot 派生投影(M2 行为不变);sqlite → task 权威表。 */
  taskGet(input: TaskGetInput): TaskDetail
  /** 读路由列表(过滤 featureSlug/status,双分支同口径)。 */
  taskQuery(input: TaskQueryInput): TaskSummary[]
  // —— M3 迁移动词(任务 1.4;实现 = migration/pipeline.ts,经 services.ts 装配)——
  /** 迁移状态读取(authority/deviated/migratedAt/lastEvent/indexJsonDetected)。 */
  getMigrationStatus(projectId: string): MigrationStatus
  /**
   * 一次性显式迁移(Interface 4 第 1-6 步):在跑编排 → ERR_MIGRATION_GUARD;
   * 迁移中重复发起 → ERR_MIGRATION_IN_PROGRESS;对拍差异 → ERR_MIGRATION_VERIFY
   * (整体回滚后可重试)。相位进度经 migration_progress 事件推送。
   */
  startMigration(projectId: string): Promise<MigrationStarted>
  // —— M3 UF3 集成读(任务 1.7;向导真实探测 + 默认值翻转的内核位置)——
  /** 注册向导 step-①/② 探测(forge 检出 + 计数 + index.json 检出;只读)。 */
  probeCodeRoot(input: ProbeCodeRootInput): ProbeCodeRootResult
  /** 内核管理位置(docsRoot = 仓外文档根默认;backupsRoot = 迁移备份根)。 */
  getWorkbenchPaths(): WorkbenchPaths
}

// ---------------------------------------------------------------------------
// IPC 错误封装(tech-design §Error Handling:reject 序列化形态 {code,...})
// ---------------------------------------------------------------------------

/** 域错误沿动词面回传的封装形态;code 对齐 §Error Types & Codes 错误表。 */
export interface WorkbenchErrorEnvelope {
  readonly code: string
  readonly message: string
  readonly detail?: string
}
