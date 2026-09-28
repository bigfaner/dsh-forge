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
  ApprovalState,
  ChangeSource,
  DispatchState,
  DocKind,
  DocsPlacement,
  FeatureStatus,
  Project,
  ProjectPatch,
  ProjectionState,
  RegisterProjectInput as RegisterProjectV1Input,
  SessionLink,
  TaskStatus,
} from '../repos/types.ts'
import type {
  ProjectionOp,
  ProjectionPlan,
  MigrationPhase,
  SyncStatusPayload as SyncStatus,
  WorkbenchEvent,
} from '../indexer/diff.ts'
import type { DetectReport } from '../projects-identity/detect.ts'
import type {
  ProjectRefInput,
  RegisterProjectV2Input,
  RenameProjectInput,
} from '../projects/lifecycle-service.ts'

// Interface 1 中已由仓储/感知层定义的 DTO,以本模块为共享出口(避免渲染层
// 直接依赖 main 内部模块路径)。SyncStatus = 感知层的 SyncStatusPayload
// (Interface 1 事件载荷形态)。
export type { ChangeSource, DocKind, Project, ProjectPatch, SessionLink, TaskStatus, DocsPlacement, ProjectionState }
export type { ApprovalState, DispatchState }
export type { SyncStatus, WorkbenchEvent, MigrationPhase, ProjectionOp, ProjectionPlan, DetectReport }
export type { FeatureStatus }
export type { RegisterProjectV2Input, RenameProjectInput, ProjectRefInput }
// M4 v3(任务 1.3):registerProject 入参 = v1(M2/M3 向导,冻结面)| v2
// (P1 批新面,anchor / docsPlacement 四值 / customAuthorized)。同一动词
// 通道收双形态 —— 既有 v1 调用方零改动,v2 由 C7 卡接线(2.x)。
export type RegisterProjectInput = RegisterProjectV1Input | RegisterProjectV2Input

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
  /**
   * feature 级偏离标记(任务 4.4,Integration #2 数据源 = feature_snapshot.
   * deviated;4.2 watcher 置位 / 内核合法推进清除)。板动词与 advanceStage
   * 返回恒投影;呈现层(偏离徽标)判定 === true。
   */
  readonly deviated: boolean
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

/**
 * customSkillDirs boot 同步失败告警条目(任务 5.7;tech-design §Error Types
 * & Codes 的 ERR_SKILL_DIR_SYNC 行)。形态与 host-profile/skill-dirs.ts 的
 * 同名结构一致(boot 接线侧注入,经 getState 供设置面呈现;空/缺省 = 健康)。
 */
export interface SkillDirSyncAlert {
  readonly code: 'ERR_SKILL_DIR_SYNC'
  readonly plugin: string
  readonly message: string
  readonly detail?: string | undefined
}

/** Interface 1 WorkbenchState(getState 装配产物)。 */
export interface WorkbenchState {
  readonly projects: Project[]
  readonly activeProjectId: string | null
  readonly plugins: PluginRow[]
  /** boot 同步告警(5.7;缺省 = 无告警 —— 既有消费方零影响)。 */
  readonly skillDirSyncAlerts?: readonly SkillDirSyncAlert[] | undefined
}

/** Interface 1 recordSessionLink 入参形态。 */
export interface RecordSessionLinkInput {
  readonly projectId: string
  readonly taskKey: string
  readonly sessionId: string
}

// ---------------------------------------------------------------------------
// M4 v3 项目中心动词 DTO(任务 1.3;tech-design §Interface 1 v3·P1 批)
// ---------------------------------------------------------------------------

/** probeProjectPath 入参(C7 侦测;裸盘符/相对路径在归一化入口即拒)。 */
export interface ProbeProjectPathInput {
  readonly path: string
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
   * 最近一次成功备份的目录(migration_event backup-ok 行;从未 → null)。
   * 稳定面:完成态呈现备份位置不依赖 lastEvent 恰好停在 backup 相位
   * (快速迁移下读回时 lastEvent 已前移 —— 备份锚点仍须在场)。
   */
  readonly backupPath: string | null
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
// M3 知识系 + feature 读动词 DTO(任务 2.2;tech-design §Interface 2 D4 段
// + PRD 归宿表 fact/lesson/research/forensic/feature list/status 行;数据面
// 移植基准 = forge-cli pkg/facttable · pkg/infocmd · internal/cmd/{forensic,
// feature},条目形态逐字段对齐)
// ---------------------------------------------------------------------------

/** fact 条目(Go FactEntry 同形;value = 任意 JSON 值)。 */
export interface KnowledgeFactEntry {
  readonly factId: string
  readonly source: 'static' | 'runtime' | 'manual'
  readonly subject: string
  readonly kind: 'signature' | 'output_format' | 'error_code' | 'side_effect' | 'precondition' | 'compilation_error' | 'runtime_crash'
  readonly value: unknown
  readonly confidence: 'confirmed' | 'inferred' | 'assumed'
  readonly updatedAt: string
}

/** fact add 入参草稿(factId 缺省自动铸;source 缺省 manual;confidence 缺省 inferred)。 */
export interface KnowledgeFactDraft {
  readonly factId?: string
  readonly source?: 'static' | 'runtime' | 'manual'
  readonly subject: string
  readonly kind: 'signature' | 'output_format' | 'error_code' | 'side_effect' | 'precondition' | 'compilation_error' | 'runtime_crash'
  readonly value: unknown
  readonly confidence?: 'confirmed' | 'inferred' | 'assumed'
}

/** knowledgeFact 入参(动作分派:list/get/summary 读 + add 写)。 */
export interface KnowledgeFactInput {
  readonly projectId: string
  readonly action: 'list' | 'get' | 'summary' | 'add'
  /** list 过滤器(Go fact list --source/--confidence;空 = 不过滤)。 */
  readonly source?: 'static' | 'runtime' | 'manual'
  readonly confidence?: 'confirmed' | 'inferred' | 'assumed'
  /** get 的目标 fact_id。 */
  readonly factId?: string
  /** add 的条目草稿。 */
  readonly entry?: KnowledgeFactDraft
}

/** fact list 产物(fact_id 升序,Go SortedEntries 同律)。 */
export interface KnowledgeFactListResult {
  readonly total: number
  readonly facts: readonly KnowledgeFactEntry[]
}

/** fact summary 产物(Go Summary 统计面 + runtime-confirmed 覆盖率)。 */
export interface KnowledgeFactSummaryResult {
  readonly total: number
  readonly bySource: Readonly<Record<string, number>>
  readonly byConfidence: Readonly<Record<string, number>>
  readonly byKind: Readonly<Record<string, number>>
  readonly runtimeConfirmed: number
  readonly coveragePercent: number
}

/** lesson 条目(Go Lesson 同形;filePath = docBase 相对路径)。 */
export interface KnowledgeLesson {
  readonly name: string
  readonly title: string
  readonly created: string
  readonly tags: readonly string[]
  readonly severity: string
  readonly category: string
  readonly filePath: string
}

/** knowledgeLesson 入参(list/get 读 + add 写;created 缺省当日)。 */
export interface KnowledgeLessonInput {
  readonly projectId: string
  readonly action: 'list' | 'get' | 'add'
  readonly name?: string
  readonly title?: string
  readonly tags?: readonly string[]
  readonly severity?: string
  readonly created?: string
  /** add 正文(markdown,frontmatter 之后)。 */
  readonly body?: string
}

/** lesson list 产物(created 降序,mtime 降级)。 */
export interface KnowledgeLessonListResult {
  readonly total: number
  readonly lessons: readonly KnowledgeLesson[]
}

/** research 条目(Go Report 同形)。 */
export interface KnowledgeResearchReport {
  readonly slug: string
  readonly created: string
  readonly topic: string
  readonly mode: string
  readonly dimensions: readonly string[]
  readonly candidates: readonly string[]
  readonly filePath: string
}

/** knowledgeResearch 入参(list/get 读 + add 写)。 */
export interface KnowledgeResearchInput {
  readonly projectId: string
  readonly action: 'list' | 'get' | 'add'
  readonly slug?: string
  readonly topic?: string
  readonly mode?: string
  readonly dimensions?: readonly string[]
  readonly candidates?: readonly string[]
  readonly created?: string
  readonly body?: string
}

/** research list 产物。 */
export interface KnowledgeResearchListResult {
  readonly total: number
  readonly reports: readonly KnowledgeResearchReport[]
}

/** forensic search 条目(Go sessionSummary 同形)。 */
export interface ForensicSessionSummary {
  readonly sessionId: string
  readonly project: string
  readonly dateTime: string
  readonly msgCount: number
  readonly firstMsg: string
}

/** forensic extract 产物(Go extractResult 同形;只读,证据以值返回不落盘)。 */
export interface ForensicEvidence {
  readonly file: string
  readonly lines: number
  readonly model?: string
  readonly gitBranch?: string
  readonly thinking: readonly { line: number; thinking: string; stopReason?: string; model?: string; msgId?: string }[]
  readonly toolCalls: readonly { line: number; tool: string; input: string; stopReason?: string; msgId?: string }[]
  readonly toolResults: readonly { line: number; toolUseId: string; resultType?: string; filePath?: string }[]
  readonly userMsgs: readonly { line: number; content: string; isMeta: boolean }[]
  readonly skillsUsed: readonly string[]
  readonly hooks: readonly { line: number; hookName: string; hookEvent: string; durationMs: number; exitCode: number; command: string }[]
  readonly filesEdited: readonly string[]
  readonly summary: {
    readonly totalThinking: number
    readonly totalToolCalls: number
    readonly totalToolResults: number
    readonly totalUserMsgs: number
    readonly toolBreakdown: Readonly<Record<string, number>>
    readonly filesRead: readonly string[]
    readonly filesWritten: readonly string[]
    readonly grepPatterns: readonly string[]
    readonly agentsSpawned: readonly { name: string; count: number }[]
    readonly commands: readonly string[]
    readonly hookBreakdown: readonly { name: string; count: number }[]
    readonly hookFailures: number
    readonly compactCount: number
    readonly planModeCount: number
    readonly stopReasons: Readonly<Record<string, number>>
    readonly skillInvocations: readonly { name: string; count: number }[]
    readonly subagentCount: number
    readonly startTime: string
    readonly endTime: string
    readonly duration: string
    readonly topSlowest: readonly { tool: string; line: number; seconds: number; detail?: string }[]
    readonly timingByTool: readonly { tool: string; count: number; total: number; average: number; max: number }[]
    readonly totalToolMs: number
    readonly thinkingTurns: readonly { line: number; seconds: number; stopReason?: string; detail?: string }[]
    readonly totalThinkingMs: number
  }
}

/** forensic subagents 条目(Go subagentInfo 同形)。 */
export interface ForensicSubagent {
  readonly agentId: string
  readonly agentType: string
  readonly transcript: string
}

/** knowledgeForensic 入参(search/extract/subagents 三只读动作;无 projectId——机器全局只读源)。 */
export interface KnowledgeForensicInput {
  readonly action: 'search' | 'extract' | 'subagents'
  /** search 过滤器(Go --keyword/--session/--skill/--last;projectPath 子串)。 */
  readonly projectPath?: string
  readonly keyword?: string
  readonly session?: string
  readonly skill?: string
  readonly last?: number
  /** extract 的会话 JSONL 路径。 */
  readonly transcriptPath?: string
  /** subagents 的会话目录路径。 */
  readonly sessionDir?: string
}

/** forensic 动作判别产物。 */
export type KnowledgeForensicResult =
  | { readonly action: 'search'; readonly sessions: readonly ForensicSessionSummary[] }
  | { readonly action: 'extract'; readonly evidence: ForensicEvidence }
  | { readonly action: 'subagents'; readonly subagents: readonly ForensicSubagent[] }

/** feature list 条目(Go featureInfo 同形投影;进度 = tasks/index.json 全量计数)。 */
export interface FeatureListEntry {
  readonly slug: string
  readonly status: string
  readonly created: string
  readonly completed: number
  readonly total: number
  readonly scores: { readonly prd: string; readonly design: string; readonly ui: string; readonly tests: string }
}

/** feature status 产物(manifest status + 任务聚合 + 评分)。 */
export interface FeatureStatusReport {
  readonly slug: string
  readonly status: string
  readonly tasks: {
    readonly byStatus: Readonly<Record<string, number>>
    readonly total: number
    readonly indexPresent: boolean
  }
  readonly scores: { readonly prd: string; readonly design: string; readonly ui: string }
}

// ---------------------------------------------------------------------------
// M3 偏好动词 DTO(任务 3.1;tech-design §Interface 1 偏好段 + §Data Models
// prefs 行:单表 scope 化;键集 = 应用层注册表,forge config 键定义权威)
// ---------------------------------------------------------------------------

/**
 * 偏好 scope 入参(Interface 1:global | { project } | { feature });
 * feature 字段 = 限定地址 `<projectId>/<featureSlug>`(scope_id 约定,
 * 防跨项目同 slug 键碰撞)。
 */
export type PrefScope = 'global' | { readonly project: string } | { readonly feature: string }

/** setPrefs 条目(键 + 任意 JSON 值;键集/类型校验在内核服务面)。 */
export interface PrefEntry {
  readonly key: string
  readonly value: unknown
}

/** 生效值来源层级(三级解析产物;'default' = 注册表权威默认;null = 无值)。 */
export type PrefSource = 'feature' | 'project' | 'global' | 'default' | null

/** getPrefs 行(Interface 1 PrefRow:生效值 + 来源 + 类型元数据 + 覆盖位)。 */
export interface PrefRow {
  readonly key: string
  /** 键分组(auto/worktree/coverage/eval;UI 折叠区,不硬编码键清单)。 */
  readonly group: 'auto' | 'worktree' | 'coverage' | 'eval'
  /** 值类型元数据(布尔/数值/文本/列表/覆盖策略)。 */
  readonly type: 'boolean' | 'number' | 'text' | 'list' | 'coverage'
  /** 控件提示(forge config 键定义的消费面)。 */
  readonly control: 'toggle' | 'number-input' | 'text-input' | 'coverage-input'
  /** 最终生效值(feature > project > global > 注册表默认;无值键 = null)。 */
  readonly value: unknown
  /** 生效值来源层级;无值 = null。 */
  readonly source: PrefSource
  /** 查询 scope 本级是否有显式覆盖行。 */
  readonly override: boolean
  /** 本级覆盖值(override=false → null)。 */
  readonly localValue: unknown
  /** 注册表权威默认值(三级皆未设置时的生效候选;无默认 → null)。 */
  readonly defaultValue: unknown
}

// ---------------------------------------------------------------------------
// M3 stages 读侧 DTO(任务 3.2;tech-design §Interface 1 编排段
// checkStageArtifacts + 阶段段 getStageGate/listStageAssets;期望清单权威 =
// PRD §各阶段期望产物清单 —— 应用仅消费机器可校验定义,不新增语义)
// ---------------------------------------------------------------------------

/**
 * 机器可校验规则词表(PRD 各阶段期望产物清单右列的规则面投影;
 * dispatch 层据 MissingItem 呈现警告,acknowledgeMissing 后可派发)。
 */
export type StageCheckRule =
  | 'file-missing'             // 期望文件/目录不存在(存在性)
  | 'manifest-status-mismatch' // manifest frontmatter status 缺失/越界(status 一致)
  | 'task-set-empty'           // SQLite 任务集为空(任务集非空)
  | 'dep-dangling'             // 依赖引用悬空(依赖引用可解析且无悬空)
  | 'no-dispatched-task'       // 无 in_progress/completed 任务(状态查询)
  | 'task-md-empty'            // 被派发任务 md 描述为空/缺失(任务 md 内容解析)
  | 'task-not-terminal'        // completed 聚合:任务未终态(聚合查询)
  | 'stage-asset-missing'      // 阶段资产文件缺失(资产齐全)

/** 单条缺失项(结构化警告清单元素;缺失 = 警告不阻断,G4)。 */
export interface MissingItem {
  /** 产生该期望的阶段行(PRD 清单行)。 */
  readonly stage: FeatureStatus
  /** 命中的机器规则。 */
  readonly rule: StageCheckRule
  /** 缺失对象:相对路径(tasks/ 方言)/ 任务看板地址 / 聚合面名。 */
  readonly artifact: string
  /** 机器可读解释(稳定文案,UI/会话直接呈现)。 */
  readonly detail: string
}

/** checkStageArtifacts 产物(Interface 1 UF1 编排段)。 */
export interface StageArtifactsReport {
  /** feature 当前阶段(manifest 权威;损坏时快照/管线头降级,见实现注记)。 */
  readonly stage: FeatureStatus
  /** 期望清单全过(= missing 为空);false 仍可派发(acknowledgeMissing)。 */
  readonly satisfied: boolean
  readonly missing: readonly MissingItem[]
}

/**
 * stage_asset 行的 IPC 投影(派生索引;内容留文档根 stages/<stage>.md)。
 * 任务 4.3 UF2 裁决:动词行(getStageGate/listStageAssets)在索引行上活性
 * 拼接资产内容(`goal` = frontmatter goal,`summary` = 正文摘要)—— 第六
 * 「阶段资产」tab 的目标/摘要只读渲染数据源(page-map「listStageAssets 只读
 * 渲染」);可选性 = 内核内部索引读(预合成 stageAssets 腿、行集同步)仍为
 * 纯元数据三字段,呈现层缺省内容按空串降级。
 */
export interface StageAssetRow {
  readonly stage: FeatureStatus
  /** features 根相对路径(`<slug>/stages/<stage>.md`;与 task.desc_path 同方言)。 */
  readonly path: string
  /** frontmatter generated 原词;缺失 → null。 */
  readonly generatedAt: string | null
  /** 资产内容(动词行活性拼接;索引内部读不携带):frontmatter goal。 */
  readonly goal?: string
  /** 资产内容(动词行活性拼接;索引内部读不携带):正文摘要。 */
  readonly summary?: string
}

/** getStageGate 产物(Interface 1 UF2 阶段段:门态 + 资产列表)。 */
export interface StageGateInfo {
  readonly featureSlug: string
  readonly stage: FeatureStatus
  /** 门态:当前阶段总结资产(stages/<stage>.md)已生成(存在性,活性 fs 判定)。 */
  readonly summaryGenerated: boolean
  /** 门资产路径(features 根相对);未生成 → null。 */
  readonly gateAssetPath: string | null
  /** 阶段资产列表(stage_asset 索引,管线序)。 */
  readonly assets: readonly StageAssetRow[]
}

// ———— M3 stages 写侧 DTO(任务 4.1;tech-design §Interface 5 推进/资产写腿)————

/** stageSummarize 入参(Interface 2 forge.stage.summarize 的内核写面)。 */
export interface StageSummarizeInput {
  readonly projectId: string
  readonly featureSlug: string
  /** 资产阶段(词表 = forge 管线;决定文件名 stages/<stage>.md)。 */
  readonly stage: FeatureStatus
  /** 阶段目标(frontmatter goal;非空)。 */
  readonly goal: string
  /** 摘要正文(frontmatter 之后;非空)。 */
  readonly summary: string
}

/** stageSummarize 产物(写/覆盖结果 + 写后门态)。 */
export interface StageSummarizeResult {
  /** 资产阶段(= 入参 stage)。 */
  readonly stage: FeatureStatus
  /** features 根相对路径(`<slug>/stages/<stage>.md`)。 */
  readonly path: string
  /** 内核铸造的生成时戳(frontmatter generated)。 */
  readonly generatedAt: string
  /** feature 当前阶段(活性解析,manifest SoT)。 */
  readonly featureStage: FeatureStatus
  /** 写后门态:当前阶段总结已生成(= 本次写入即开门的直接判定)。 */
  readonly gateOpen: boolean
}

// ---------------------------------------------------------------------------
// M3 提案域 DTO(任务 5.3;tech-design §Interface 1 提案段 getProposalBoard/
// readProposalDoc + schema-v2.sql §8 proposal_snapshot;只读数据面,DF007)
// ---------------------------------------------------------------------------

/** 提案状态词表(proposal_snapshot.status CHECK 同源;4 态小写规范形)。 */
export type ProposalStatus = 'draft' | 'accepted' | 'rejected' | 'superseded'

/** proposal_snapshot 行的板投影(UF5 列表行;hasEval = 活性 fs 拼接腿)。 */
export interface ProposalSummary {
  readonly slug: string
  readonly status: ProposalStatus
  /** frontmatter author 原词;缺失 → null。 */
  readonly author: string | null
  /** frontmatter created 原词;缺失 → mtime 本地日期(forge 数据面回退)。 */
  readonly created: string | null
  /** 关联 feature(slug 同一性 + manifest 在场);NULL = 无关联(不渲染徽标)。 */
  readonly featureSlug: string | null
  /** eval 报告存在性(活性 fs:eval/ 下 ≥1 .md;schema 无列)。 */
  readonly hasEval: boolean
  /** proposal.md mtime(ISO)。 */
  readonly updatedAt: string
}

/** getProposalBoard 产物(全量列表 + 排序基线 = created 降序,平局 slug 升序)。 */
export interface ProposalBoardData {
  readonly proposals: readonly ProposalSummary[]
  readonly generatedAt: string
  /** proposals 根绝对路径(UF5 空态卡的文档根路径说明数据源)。 */
  readonly proposalsRoot: string
}

/** readProposalDoc 产物(markdown 原文只读;渲染层白名单归 UI 任务)。 */
export interface ProposalDoc {
  readonly kind: 'proposal' | 'eval'
  readonly markdown: string
}

// ---------------------------------------------------------------------------
// M3 编排域 DTO(任务 3.3;tech-design §Interface 1 编排段 dispatchTasks/
// redispatch/getDispatches/listApprovals/decideApproval + §Data Models
// dispatch/approval_request 行;schema-v2.sql §4/§5)
// ---------------------------------------------------------------------------

/** dispatch 行的 IPC 投影(Interface 1 DispatchRow;camelCase)。 */
export interface DispatchRow {
  readonly id: string
  /** 同批多任务聚合 id(单次 dispatchTasks 一个)。 */
  readonly batchId: string
  readonly projectId: string
  readonly featureSlug: string
  /** 看板限定地址 `<featureSlug>/<localId>`。 */
  readonly taskKey: string
  /** 5 态(starting/running/awaiting/failed/done;done/failed 为终态)。 */
  readonly state: DispatchState
  /** subagent 会话 id;NULL = 尚未启动(host 回填)。 */
  readonly sessionId: string | null
  /** 注入内容 sha256(SC3 断言锚点;口径 = sha256(注入串))。 */
  readonly promptHash: string
  /** 派发发起者(人;actor 审计)。 */
  readonly actor: string
  readonly dispatchedAt: string
  /** 终态时刻;在跑(starting/running/awaiting)恒 null。 */
  readonly endedAt: string | null
  /** 失败原因(failed 态);无 → null。 */
  readonly error: string | null
}

/** approval_request 行的 IPC 投影(Interface 1 ApprovalRow;camelCase)。 */
export interface ApprovalRow {
  readonly id: string
  readonly dispatchId: string
  readonly projectId: string
  readonly taskKey: string
  /** 来源 subagent 会话。 */
  readonly sessionId: string
  /** 请求正文 + 类别(payload_json 防御解码值;损坏行 = null)。 */
  readonly payload: unknown
  /** 3 态(pending/approved/rejected)。 */
  readonly state: ApprovalState
  readonly createdAt: string
  /** 决策时刻;pending → null。 */
  readonly decidedAt: string | null
  /** 审批审计(人;Hard Rule T5:仅显式动词决策)。 */
  readonly decidedBy: string | null
}

/** dispatchTasks 入参(Interface 1 编排段;acknowledgeMissing = 缺失确认面)。 */
export interface DispatchTasksInput {
  readonly projectId: string
  /** 看板限定地址集(单/多选;去重校验在内核)。 */
  readonly taskKeys: readonly string[]
  /** 产物缺失确认(确认后可派发,warn 不阻断;G4/SC4)。 */
  readonly acknowledgeMissing?: boolean
}

/**
 * dispatchTasks / redispatch 联合返回(Interface 1:dispatched = 已落库行
 * 集,≤3s 启动预算内;blocked = 产物缺失未确认,missing = 结构化清单)。
 * redispatch 的 Interface 1 草图为 DispatchRow[],因「重走检查」可 blocked,
 * 统一为本联合(类型随任务分解细化的既定惯例)。
 *
 * 任务 3.5:dispatched 行 = DispatchedRow(行 + launch payload)—— 预合成
 * 组合首条消息内核不落库(仅 prompt_hash),经派发应答交 renderer relay 转
 * host dispatch-launch(M2 promptText 过 renderer 先例);getDispatches 仍回
 * 素 DispatchRow(prompt 不随看板刷新回流)。
 */
export type DispatchTasksResult =
  | { readonly dispatched: readonly DispatchedRow[] }
  | { readonly blocked: 'artifacts-missing'; readonly missing: readonly MissingItem[] }

/**
 * 派发应答行的启动载荷(host dispatch-launch 的输入面;tech-design §I3
 * subagent 创建)。prompt = 组合首条消息原文(含追加行;host 零改写交付)。
 */
export interface DispatchLaunchPayload {
  /** 预合成组合首条消息(sha256(prompt) = 行 prompt_hash;SC3 断言锚点)。 */
  readonly prompt: string
  readonly promptHash: string
  /** 预铸 sessionId(spike-3 §4;create({sessionId}) 幂等 adopt)。 */
  readonly sessionId: string | null
  /** subagent cwd(项目 codeRoot,内核解析)。 */
  readonly cwd: string
  /** 任务类型(协议选择键);未落 = null。 */
  readonly taskType: string | null
}

/** 派发应答行(dispatch 行 + 启动载荷)。 */
export type DispatchedRow = DispatchRow & { readonly launch: DispatchLaunchPayload }

/** receiveApproval 动词入参(任务 3.5:host approval-bridge → 内核的 relay 形态)。 */
export interface ReceiveApprovalVerbInput {
  readonly dispatchId: string
  /** 来源 subagent 会话(与 dispatch.session_id 同键;缺省用行回填值)。 */
  readonly sessionId?: string
  /** 请求正文 + 类别(任意 JSON 值,原样落 payload_json)。 */
  readonly payload: unknown
}

/** decideApproval 入参(Interface 1:显式点击,无自动批准)。 */
export interface DecideApprovalInput {
  readonly approvalId: string
  readonly approve: boolean
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
  /** v1 入参走 M2 registry 链(冻结面);v2 入参(anchor/docsPlacement)走 D11 生命周期链。 */
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
  // —— M3 知识系 + feature 读动词(任务 2.2;实现 = knowledge/knowledge-service.ts
  // 经 services.ts 装配;D4 数据面:fact/lesson/research 读+必要写、forensic
  // 只读、feature list/status 只读)——
  /** fact 表动作分派(list/get/summary/add;写仅落 codeRoot/.forge)。 */
  knowledgeFact(input: KnowledgeFactInput): KnowledgeFactListResult | KnowledgeFactEntry | KnowledgeFactSummaryResult
  /** lesson 动作分派(list/get/add;写仅落文档根 lessons/)。 */
  knowledgeLesson(input: KnowledgeLessonInput): KnowledgeLessonListResult | KnowledgeLesson
  /** research 动作分派(list/get/add;写仅落文档根 research/)。 */
  knowledgeResearch(input: KnowledgeResearchInput): KnowledgeResearchListResult | KnowledgeResearchReport
  /** forensic 只读动作(search/extract/subagents;机器全局源,无注册门)。 */
  knowledgeForensic(input: KnowledgeForensicInput): KnowledgeForensicResult
  /** forge feature list 同口径读(文档树直读;created 降序)。 */
  featureList(projectId: string): FeatureListEntry[]
  /** forge feature status <slug> 同口径读(manifest + 任务聚合 + 评分)。 */
  featureStatus(input: { projectId: string; featureSlug: string }): FeatureStatusReport
  // —— M3 偏好动词(任务 3.1;实现 = prefs/prefs-service.ts 经 services.ts
  // 装配;键集封闭 + 三级解析 + 事务原子写)——
  /** 注册表全键投影:生效值 + 来源层级 + 类型元数据 + 本级覆盖位。 */
  getPrefs(scope: PrefScope): PrefRow[]
  /** 事务原子批量写(键集/类型校验前置;键集外 → ERR_PREF_KEY_UNKNOWN,
   * 类型越界 → ERR_PREF_VALUE_INVALID);完成 → prefs_updated 事件。 */
  setPrefs(scope: PrefScope, entries: readonly PrefEntry[]): void
  /** 删本级覆盖行(幂等);生效值回落下一级;实际删除 → prefs_updated。 */
  clearPrefOverride(scope: PrefScope, key: string): void
  // —— M3 stages 读动词(任务 3.2;实现 = stages/stages-service.ts 经
  // services.ts 装配;检查为确定性代码 —— 文件 + SQLite 查询,零模型调用)——
  /**
   * 派发前产物齐全性检查(PRD 各阶段期望产物清单逐规则判定;缺失 =
   * 警告 + MissingItem 清单,warn 不阻断 —— 阻断逻辑在 dispatch 层以
   * acknowledgeMissing 表达)。项目不存在 → ERR_PROJECT_NOT_FOUND;
   * feature 目录缺失 → ERR_FEATURE_NOT_FOUND。
   */
  checkStageArtifacts(input: { readonly projectId: string; readonly featureSlug: string }): StageArtifactsReport
  /** 门态(当前阶段总结已/未生成)+ 资产列表(stage_asset 索引,管线序)。 */
  getStageGate(projectId: string, featureSlug: string): StageGateInfo
  /** 按阶段(管线序)返回 stage_asset 行;空集 = 无资产(合法状态)。 */
  listStageAssets(projectId: string, featureSlug: string): StageAssetRow[]
  // —— M3 stages 写动词(任务 4.1;实现 = stages/advance-service.ts 经
  // services.ts 装配;manifest 写入仅经 advanceStage 内核路径)——
  /**
   * 推进门:当前阶段总结未生成 → ERR_STAGE_GATE_UNSATISFIED(缺失引导);
   * 已生成 → 内核写 manifest status(阶段推进内化)→ feature_snapshot 同步
   * → stage_advanced 事件,返回推进后 FeatureSummary。终态 'completed' 的
   * 重复推进 = 幂等 no-op(零写入、零事件)。manifest frontmatter 损坏 →
   * ERR_STAGE_MANIFEST_UNREADABLE。
   */
  advanceStage(projectId: string, featureSlug: string): FeatureSummary
  /**
   * 写/覆盖阶段资产 stages/<stage>.md(frontmatter { stage, generated, goal }
   * + 摘要正文;同阶段重写 = 覆盖更新,T4)+ stage_asset 索引同步(感知
   * 同款实现)。词表外阶段 / 空 goal / 空摘要 → ERR_STAGE_ASSET_INVALID。
   */
  stageSummarize(input: StageSummarizeInput): StageSummarizeResult
  // —— M3 提案读动词(任务 5.3;实现 = proposals/proposals-service.ts 经
  // services.ts 装配;只读硬约束 —— 本域零写动词,状态流转归终端/agent
  // 会话)——
  /**
   * 提案板(UF5 列表数据):proposal_snapshot 派生索引全量行 + 排序基线
   * (created 降序,平局 slug 升序)+ hasEval 活性拼接 + proposalsRoot
   * (空态卡路径说明)。快照随感知回流(DF007 ≤5s,proposals/ 感知根)。
   */
  getProposalBoard(projectId: string): ProposalBoardData
  /**
   * 提案文档 markdown 原文只读读(proposal | eval 两 kind;eval 确定性
   * 选锚 = eval/final-report.md 优先,否则字典序首位 .md)。项目缺失 →
   * ERR_PROJECT_NOT_FOUND;slug 段形态 → ERR_PROPOSAL_PATH_INVALID;
   * 文件缺失/eval 无报告 → ERR_PROPOSAL_NOT_FOUND。
   */
  readProposalDoc(input: { readonly projectId: string; readonly slug: string; readonly kind: 'proposal' | 'eval' }): ProposalDoc
  // —— M3 编排动词(任务 3.3;实现 = dispatch/dispatch-service.ts 经
  // services.ts 装配;内核不持会话创建权 —— subagent 启动仅经 host 回调
  // 接口 launch-port,3.5 接线)——
  /**
   * 派发(可派发集校验:状态允许 + 依赖终态 → 阻止并返回依赖提示;
   * checkStageArtifacts 消费:缺失且未 acknowledgeMissing → blocked 联合
   * 返回缺失清单;同批多任务单 batch_id、每任务独立行)。files 项目 →
   * ERR_TASK_NOT_AUTHORITATIVE;预合成缺失 → ERR_SYSTEM_PROMPT_CONTRACT。
   * 完成事件 dispatch_updated 经批量通道推送。
   */
  dispatchTasks(input: DispatchTasksInput, actor: TaskActor): Promise<DispatchTasksResult>
  /**
   * 重派发(failed 行的恢复路径):重走检查 + 预合成 + 新行落库(原行留
   * 审计轨迹);二次确认在 UI。非 failed 行 → ERR_DISPATCH_STATE_INVALID;
   * 行缺失 → ERR_DISPATCH_NOT_FOUND。
   */
  redispatch(dispatchId: string, actor: TaskActor): Promise<DispatchTasksResult>
  /** 项目派发全量(dispatched_at 倒序;看板编排面板数据源)。 */
  getDispatches(projectId: string): DispatchRow[]
  /** 项目审批全量(pending 前 created_at 倒序;审批 dock 数据源)。 */
  listApprovals(projectId: string): ApprovalRow[]
  /**
   * 审批显式决策(批准/拒绝):decided_by/decided_at 审计;重复决策 →
   * ERR_APPROVAL_DECIDED;失效条目 → ERR_APPROVAL_NOT_FOUND。最后一条
   * pending 决策后 dispatch awaiting → running(dispatch_updated 回流)。
   */
  decideApproval(input: DecideApprovalInput, actor: TaskActor): ApprovalRow

  // —— M3 host 回调段(任务 3.5):renderer relay 替 host 半身转发的回调面
  //    (dispatch-launch 启动回填 + approval-bridge 审批入列)。语义/事务在
  //    dispatch-service 域面,非 UI 直呼语义;通道面零特权(渲染进程被攻破
  //    面的最大能力 = 既定动词集,与 UI 同权)。 ——

  /** 审批事件入列(host approval-bridge → T2 桥 → 本动词):pending + awaiting 联动。 */
  receiveApproval(input: ReceiveApprovalVerbInput): ApprovalRow
  /** launch 成功回填:starting → running + session_id(幂等:同 session 重复 no-op)。 */
  notifySessionStarted(dispatchId: string, sessionId: string): DispatchRow
  /** launch 失败:starting → failed + 原因(ERR_DISPATCH_LAUNCH_FAILED 呈现口径)。 */
  notifyLaunchFailed(dispatchId: string, error: string): DispatchRow

  // —— M4 v3 项目中心动词(任务 1.3;实现 = projects/lifecycle-service
  //    经 services.ts 装配;硬校验语义/事件见该模块头)——

  /**
   * C7 侦测动词(只读;消费 1.2 DetectReport):归一化 + 存在性/可读性
   * 事实 + 三层比对已注册快车道 + 证据侦测(gitRoot/forgeTreeHit/
   * childRepos,固定前缀有界探测)。路径级失败降级进报告形态,不抛错。
   */
  probeProjectPath(input: ProbeProjectPathInput): DetectReport
  /** 纯 DB 改名,零 fs;完成 → project_list_changed。 */
  renameProject(input: RenameProjectInput): Project
  /** archived=1(dsh 侧 workspace 保留);完成 → project_list_changed。 */
  archiveProject(input: ProjectRefInput): Project
  /** archived=0;完成 → project_list_changed。 */
  restoreProject(input: ProjectRefInput): Project
  /** v3 扩展列全量(sort_order 注册序输出)。 */
  listProjects(): Project[]
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
