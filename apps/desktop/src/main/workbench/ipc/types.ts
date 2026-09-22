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
import type { SyncStatusPayload as SyncStatus, WorkbenchEvent } from '../indexer/diff.ts'

// Interface 1 中已由仓储/感知层定义的 DTO,以本模块为共享出口(避免渲染层
// 直接依赖 main 内部模块路径)。SyncStatus = 感知层的 SyncStatusPayload
// (Interface 1 事件载荷形态)。
export type { ChangeSource, DocKind, Project, ProjectPatch, RegisterProjectInput, SessionLink, TaskStatus }
export type { SyncStatus, WorkbenchEvent }
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
