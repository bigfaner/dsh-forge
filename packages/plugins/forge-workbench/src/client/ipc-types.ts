/**
 * The Interface 1 DTO family, client half (task 5.1) — the structural source
 * the 5.x build tasks consume (UI dependency layering: build tasks import DTO
 * TYPES + mock data only; the IPC runtime is wired by the 5.14-5.16 assembly
 * tasks). PURE TYPES, zero runtime code.
 *
 * The plugin package cannot depend on the app (the M2 4.1 precedent — the
 * retired host/forge-bridge.ts), so this file is the client-side declaration of the
 * SAME shapes the main process serves: field definitions follow tech-design
 * §Interface 1 as the single authority, the main-side peer being
 * apps/desktop/src/main/workbench/ipc/types.ts (task 2.7). Both halves derive
 * from the spec section; a field drifting from it is a defect on either side.
 *
 * Scope note: this lands with the chrome-relevant subset (getState's
 * assembly). Later 5.x tasks extend the module with the board/detail/doc DTOs
 * they consume — the same incremental growth the main-side module followed.
 */

import type { TabKind } from './views/rightbar/tab-kinds'

/**
 * Where a project's feature documents live (Interface 1): inside the repo, or
 * an explicitly authorized external path.
 */
export type DocLocationType = 'in_repo' | 'external'

/**
 * M4 v3 证据三档落位(tech-design §Interface 1;main-side peer =
 * repos/types.ts DocsPlacement,schema-v3 projects.docs_placement CHECK 同源):
 * repo-existing(仓内已有树)/ repo-new(仓内新建,懒物化)/ app(内核
 * docsRoot 派生)/ custom(仓外自定义,须显式授权);legacy = v3 迁移前值
 * 冻结(仅迁移回填不可归类行)。
 */
export type DocsPlacement = 'repo-existing' | 'repo-new' | 'app' | 'custom' | 'legacy'

/**
 * M4 v3 投影状态机(tech-design §Interface 1;schema-v3
 * projects.projection_state CHECK 同源):pending → healthy;上游操作失败
 * / relay 不在场 → degraded(可重试);对账 diff 检出 dsh 侧手改 →
 * deviation(仅呈现,无反向写)。
 */
export type ProjectionState = 'pending' | 'healthy' | 'degraded' | 'deviation'

/**
 * A registered project (workbench-owned state, single source of truth in the
 * main-process store; the renderer only ever sees this DTO).
 */
export interface Project {
  /** crypto.randomUUID(), minted by the main process at registration. */
  readonly id: string
  readonly displayName: string
  /** Absolute, normalized at registration. */
  readonly codeRoot: string
  readonly docLocationType: DocLocationType
  /** Non-null and ≠ codeRoot when external; always null when in_repo. */
  readonly docLocationPath: string | null
  /** ISO 8601 UTC. */
  readonly createdAt: string
  readonly lastActivatedAt: string | null
  // —— M4 v3 增列(任务 1.3;main-side peer = repos/types.ts Project)——
  /** 归档位(归档 ≠ 删除:dsh 侧 workspace 保留,forge 侧归档分区)。 */
  readonly archived: boolean
  /** 注册序(= 投影「同名同序」的 forge 侧权威)。 */
  readonly sortOrder: number
  /** 投影状态机单值(3.x 对账接线前恒 'pending')。 */
  readonly projectionState: ProjectionState
  /** 证据三档落位 + custom(仓内落点永不继承)。 */
  readonly docsPlacement: DocsPlacement
}

/**
 * Interface 1 registerProject input, v1 face (the three-step wizard's submit
 * payload, task 5.4 — the M2/M3 frozen shape). `displayName` omitted / empty
 * means 缺省 = the codeRoot directory name; `docLocationPath` is required
 * (and ≠ codeRoot) when external, always null when in_repo.
 */
export interface RegisterProjectInputV1 {
  readonly codeRoot: string
  readonly docLocationType: DocLocationType
  readonly docLocationPath?: string | null
  readonly displayName?: string
}

/**
 * Interface 1 registerProject input, v2 face (M4 task 1.3;the C7 确认卡's
 * submit payload). Hard checks are exactly two kernel-side (anchor exists +
 * dir + readable; cross-project uniqueness via the D11 three-tier identity);
 * `docsPath` is required for repo-new / custom; `customAuthorized: true` is
 * required for custom (BIZ-001/003 收窄).
 */
export interface RegisterProjectInputV2 {
  /** 代码根目录(D11 anchor;bare drives / relative paths rejected at entry). */
  readonly anchor: string
  /** 缺省 = 文件夹名。 */
  readonly displayName?: string
  readonly docsPlacement: 'repo-existing' | 'repo-new' | 'app' | 'custom'
  /** repo-new / custom 必填;app = kernel-derived. */
  readonly docsPath?: string
  /** custom 必填 true. */
  readonly customAuthorized?: boolean
}

/**
 * Interface 1 registerProject input(M4 任务 1.3 起的双形态联合:同一动词
 * 通道收 v1 | v2 —— v1 = M2/M3 向导冻结面,v2 = P1 批新面,2.x C7 卡接线)。
 */
export type RegisterProjectInput = RegisterProjectInputV1 | RegisterProjectInputV2

/**
 * Interface 1 updateProject patch: rename = `displayName`; repoint = the doc
 * location fields (repoint completes with a rescan — the registry verb's own
 * semantics; the patch itself only carries the fields).
 */
export interface ProjectPatch {
  readonly displayName?: string
  readonly docLocationType?: DocLocationType
  readonly docLocationPath?: string | null
}

/**
 * The Interface 1 verb rejection shape (tech-design Error Handling: every IPC
 * verb rejects with the serialized `{ code, message, detail? }` form — the
 * `ERR_*` code vocabulary is the client's error-mapping key). The build-stage
 * mocks throw this same shape, so the view's code mapping is exercised before
 * the runtime exists.
 */
export interface WorkbenchVerbError {
  readonly code: string
  readonly message: string
  readonly detail?: string
}

/** One plugin row in the two-level model (mandatory derived from the product manifest). */
export interface PluginRow {
  readonly name: string
  readonly mandatory: boolean
  readonly enabled: boolean
}

/**
 * workbench.getState()'s assembly (Interface 1): the project registry, the
 * single-activation pointer, and the plugin rows. `activeProjectId === null`
 * is the page-map state gate: the tasks/features views guide to registration
 * instead of erroring.
 */
export interface WorkbenchState {
  readonly projects: readonly Project[]
  readonly activeProjectId: string | null
  readonly plugins: readonly PluginRow[]
  /**
   * customSkillDirs boot 同步失败告警(任务 5.7;main 侧 getState 装配,
   * 缺省 = 无告警)。设置面(概览页)呈现 ERR_SKILL_DIR_SYNC 条目。
   */
  readonly skillDirSyncAlerts?: readonly SkillDirSyncAlert[] | undefined
}

/**
 * 一条技能目录同步告警(tech-design §Error Types & Codes 的 ERR_SKILL_DIR_SYNC
 * 行;plugin = 携带技能面的 bundle 名,message = 失败原因)。
 */
export interface SkillDirSyncAlert {
  readonly code: 'ERR_SKILL_DIR_SYNC'
  readonly plugin: string
  readonly message: string
  readonly detail?: string | undefined
}

/**
 * Session-link status (session_links.status, er-diagram): event-driven
 * transition, `ended` rows are kept for the history list.
 */
export type SessionLinkStatus = 'active' | 'ended'

/**
 * One session_links row (Interface 1): the task↔session 挂接 index — the
 * workbench-owned source of truth behind the UF2/UF3 挂接徽标 and the UF3
 * 挂接历史.
 */
export interface SessionLink {
  readonly id: string
  readonly projectId: string
  /** Workbench dialect: qualified `<featureSlug>/<localId>` (task 2.5). */
  readonly taskKey: string
  readonly sessionId: string
  readonly status: SessionLinkStatus
  /** ISO 8601 UTC (发起时间; repeat registration refreshes it). */
  readonly startedAt: string
  /** Non-null when status='ended'. */
  readonly endedAt: string | null
}

/** Interface 1 recordSessionLink input (the launch success chain's persist leg). */
export interface RecordSessionLinkInput {
  readonly projectId: string
  readonly taskKey: string
  readonly sessionId: string
}

/**
 * Interface 1 TaskStatus — the forge task-state vocabulary, 7 态 (tech-design
 * §Interface 1 / Cross-Layer Data Map: "enum(同词表,StateDot)"). The runtime
 * vocabulary constant and the display maps live in i18n/task-status.ts (task
 * 5.5, the shared status-rendering layer 5.7 consumes); the FEATURE-status
 * vocabulary below is a DIFFERENT forge vocabulary with its own sibling
 * module (i18n/feature-status.ts, task 5.9). This file stays pure types.
 */
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'suspended'
  | 'skipped'
  | 'rejected'

/**
 * Interface 1 ChangeSource — the per-change marker ([会话]/[终端]), the
 * Interface 3 判定序 product (actor 标记 → 挂接推断); null = no recorded
 * change source yet.
 */
export type ChangeSource = 'session' | 'terminal'

/**
 * M3 v2 dispatch.state — the orchestration 5 态 (tech-design §Data Models
 * dispatch 行; kernel twin = repos/types.ts DispatchState). The badge
 * spectrum's vocabulary (task 3.7): starting/running/awaiting/failed/done,
 * done/failed terminal. Declared HERE (not selection-mode.ts) so the event
 * union below and every orchestration consumer share one canonical client
 * twin; selection-mode.ts re-exports it.
 */
export type DispatchState = 'starting' | 'running' | 'awaiting' | 'failed' | 'done'

/**
 * M3 v2 approval_request.state — the 3 态 (tech-design §Data Models; kernel
 * twin = repos/types.ts ApprovalState). `awaiting ⇔ pending 审批` 不变式;
 * the dock presents pending only, decided rows ride the audit trail.
 */
export type ApprovalState = 'pending' | 'approved' | 'rejected'

/**
 * M3 dispatch 行 / approval_request 行的 client 孪生(任务 3.5;kernel twin =
 * ipc/types.ts DispatchRow/ApprovalRow,camelCase 投影同形)。服务于 host
 * 回调 relay 面(tool-bridge approval_* 帧 + launch 回填动词):3.5 的桥接线
 * 与 3.9 的编排 wiring 共用;selection-mode.ts 的 DispatchRow 为 UI 视图孪生,
 * 与本行结构兼容。
 */
export interface DispatchRow {
  readonly id: string
  readonly batchId: string
  readonly projectId: string
  readonly featureSlug: string
  readonly taskKey: string
  readonly state: DispatchState
  readonly sessionId: string | null
  readonly promptHash: string
  readonly actor: string
  readonly dispatchedAt: string
  readonly endedAt: string | null
  readonly error: string | null
}

export interface ApprovalRow {
  readonly id: string
  readonly dispatchId: string
  readonly projectId: string
  readonly taskKey: string
  readonly sessionId: string
  readonly payload: unknown
  readonly state: ApprovalState
  readonly createdAt: string
  readonly decidedAt: string | null
  readonly decidedBy: string | null
}

/** decideApproval 入参(显式点击,无自动批准;kernel twin 同名)。 */
export interface DecideApprovalInput {
  readonly approvalId: string
  readonly approve: boolean
}

/**
 * 派发应答行的启动载荷(任务 6.3 client 孪生;kernel twin = ipc/types.ts
 * DispatchLaunchPayload)—— dispatchTasks/redispatch 应答的 dispatched 行
 * 携带,renderer launch relay 的输入面(prompt 不落库、不随 getDispatches
 * 回流;tech-design §Interface 3 两段式派发链)。
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

/** 派发应答行(dispatch 行 + 启动载荷;kernel twin = ipc/types.ts DispatchedRow)。 */
export type DispatchedRow = DispatchRow & { readonly launch: DispatchLaunchPayload }

/** receiveApproval 入参(host approval-bridge → T2 桥 → 内核;relay 形态)。 */
export interface ReceiveApprovalInput {
  readonly dispatchId: string
  readonly sessionId?: string
  readonly payload: unknown
}

/**
 * 单条缺失项(任务 3.9 canonical client twin;main-side peer = ipc/types.ts
 * MissingItem, verbatim)—— dispatch/selection-mode.ts 的同名 UI 视图孪生与本行
 * 结构兼容,双生并存由 3.5 的 DispatchRow 注记先例覆盖。`rule` 在客户端保持
 * string(kernel StageCheckRule 词表原词透传,呈现层不枚举)。
 */
export interface MissingItem {
  /** 产生该期望的阶段行(PRD 清单行). */
  readonly stage: FeatureStatus
  /** 命中的机器规则(kernel StageCheckRule 词表原词). */
  readonly rule: string
  /** 缺失对象:相对路径(tasks/ 方言)/ 任务看板地址 / 聚合面名. */
  readonly artifact: string
  /** 机器可读解释(稳定文案,UI 直接呈现). */
  readonly detail: string
}

/** checkStageArtifacts 产物(任务 3.9 canonical client twin;kernel StageArtifactsReport). */
export interface StageArtifactsReport {
  readonly stage: FeatureStatus
  /** 期望清单全过(= missing 为空);false 仍可派发(acknowledgeMissing). */
  readonly satisfied: boolean
  readonly missing: readonly MissingItem[]
}

/**
 * stageSummarize 入参(任务 4.1 canonical client twin;kernel
 * StageSummarizeInput verbatim)—— the forge.stage.summarize tool's kernel
 * write face (Interface 2「文档根直写」over the bridge).
 */
export interface StageSummarizeInput {
  readonly projectId: string
  readonly featureSlug: string
  /** 资产阶段(词表 = forge 管线;决定文件名 stages/<stage>.md). */
  readonly stage: FeatureStatus
  /** 阶段目标(frontmatter goal;非空). */
  readonly goal: string
  /** 摘要正文(frontmatter 之后;非空). */
  readonly summary: string
}

/** stageSummarize 产物(任务 4.1 canonical client twin;kernel StageSummarizeResult). */
export interface StageSummarizeResult {
  readonly stage: FeatureStatus
  /** features 根相对路径(`<slug>/stages/<stage>.md`). */
  readonly path: string
  /** 内核铸造的生成时戳(frontmatter generated). */
  readonly generatedAt: string
  /** feature 当前阶段(活性解析,manifest SoT). */
  readonly featureStage: FeatureStatus
  /** 写后门态:当前阶段总结已生成(推进门开). */
  readonly gateOpen: boolean
}

/**
 * stage_asset 行(任务 4.3 canonical client twin;kernel StageAssetRow)。
 * 元数据三字段 = stage_asset 派生索引列;`goal`/`summary` = UF2 第六
 * 「阶段资产」tab 的内容腿(4.3 裁决:动词行在索引行上活性拼接文档根
 * `stages/<stage>.md` 的 frontmatter goal + 正文摘要 —— page-map 的
 * 「listStageAssets 只读渲染」数据源;DB 索引仍元数据-only,schema 不动)。
 * 可选性 = 内核内部索引读(assemble 预合成腿)不携带内容;呈现层缺省 ''。
 */
export interface StageAssetRow {
  readonly stage: FeatureStatus
  /** features 根相对路径(`<slug>/stages/<stage>.md`;与 task.desc_path 同方言). */
  readonly path: string
  /** frontmatter generated 原词;缺失 → null. */
  readonly generatedAt: string | null
  /** 资产内容:frontmatter goal(动词行就位;索引内部读缺省). */
  readonly goal?: string
  /** 资产内容:frontmatter 之后正文摘要(动词行就位;索引内部读缺省). */
  readonly summary?: string
}

/**
 * getStageGate 产物(任务 4.3 canonical client twin;kernel StageGateInfo):
 * 门态(当前阶段总结已生成,活性 fs 判定)+ 资产列表(管线序,含内容)。
 */
export interface StageGateInfo {
  readonly featureSlug: string
  readonly stage: FeatureStatus
  /** 门态:当前阶段总结资产(stages/<stage>.md)已生成. */
  readonly summaryGenerated: boolean
  /** 门资产路径(features 根相对);未生成 → null. */
  readonly gateAssetPath: string | null
  /** 阶段资产列表(stage_asset 索引,管线序). */
  readonly assets: readonly StageAssetRow[]
}

// ———— M3 提案域 DTO(任务 5.3 canonical client twin;kernel ipc/types.ts
// ———— ProposalStatus/ProposalSummary/ProposalBoardData/ProposalDoc,只读数据面)

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

/** dispatchTasks 入参(任务 3.9 canonical client twin;acknowledgeMissing = 缺失确认面). */
export interface DispatchTasksInput {
  readonly projectId: string
  readonly taskKeys: readonly string[]
  readonly acknowledgeMissing?: boolean
}

/**
 * dispatchTasks 联合返回(任务 3.9 canonical client twin;blocked = 产物缺失未
 * 确认 —— 零落行,警告门重开)。任务 6.3:dispatched 行携带 launch payload
 * (kernel twin = ipc/types.ts DispatchedRow —— 两段式派发链的 renderer
 * relay 输入面)。
 */
export type DispatchTasksResult =
  | { readonly dispatched: readonly DispatchedRow[] }
  | { readonly blocked: 'artifacts-missing'; readonly missing: readonly MissingItem[] }

/**
 * Interface 1 TaskSummary (task 5.5's consumption; the main-side peer is
 * apps/desktop/src/main/workbench/ipc/types.ts from 2.7 — both halves derive
 * from the same spec section). Dialect notes (task 2.5): `key` is the 看板
 * 限定地址 `<featureSlug>/<localId>`; `blockers` carry the same-feature
 * LOCAL upstream keys verbatim.
 */
export interface TaskSummary {
  /** 看板限定地址 `<featureSlug>/<localId>` (task 2.5 dialect). */
  readonly key: string
  readonly title: string
  readonly status: TaskStatus
  readonly featureSlug: string
  /**
   * Direct upstream blockers — same-feature LOCAL upstream keys (task 2.5
   * dialect; the transitive chain is getTaskDetail's, not the board's).
   */
  readonly blockers: string[]
  /** The task's execution git branch (执行痕迹); null when the dialect has none. */
  readonly branch: string | null
  readonly worktree: boolean
  /** The most recent change's source; null when none is recorded. */
  readonly source: ChangeSource | null
  readonly updatedAt: string
}

/**
 * Interface 1 SyncStatus — the perception layer's health projection (the
 * indexer's SyncStatusPayload shape). `state === 'error'` is a TOOLBAR
 * indicator, never a view error: the board keeps rendering its data beside
 * the sync light (tech-design §Error Handling: 看板顶栏轻量态 + 重试).
 */
export interface SyncStatus {
  readonly state: 'idle' | 'scanning' | 'error'
  readonly lastScanAt: string | null
  readonly error?: string
}

/** Interface 1 TaskBoardData — workbench.getTaskBoard(projectId)'s payload. */
export interface TaskBoardData {
  readonly tasks: readonly TaskSummary[]
  readonly generatedAt: string
  readonly sync: SyncStatus
}

/**
 * Interface 1 TaskRecord (task 5.7's consumption; the main-side peer is
 * apps/desktop/src/main/workbench/ipc/types.ts from 2.7). Dialect notes
 * (task 2.5): the forge write-once record .md adaptation — `at` is the
 * record's timestamp string VERBATIM (frontmatter, no re-normalization),
 * `kind` the task's type, `source` the actor slot when forge recorded one
 * (mostly null in practice — the 挂接推断 fallback is main-side), `summary`
 * the record's summary section verbatim.
 */
export interface TaskRecord {
  readonly at: string
  readonly kind: string
  readonly source: ChangeSource | null
  readonly summary: string
}

/**
 * Interface 1 depChain entry — the upstream TRANSITIVE chain in topological
 * order (blockers first); `key` is the qualified `<featureSlug>/<localId>`
 * address (task 2.5 dialect — the same address the board's edges resolve
 * to, which is what 依赖链呈现与视图 A 图同源同序 rests on).
 */
export interface TaskDepChainEntry {
  readonly key: string
  readonly title: string
  readonly status: TaskStatus
}

/**
 * Interface 1 TaskDetail — workbench.getTaskDetail(projectId, taskKey)'s
 * one-shot assembly: summary + 描述原文 + 依赖链 + 执行记录 + 挂接历史.
 * `descriptionMarkdown` is the task file's original text; the read-only
 * rendering (防注入) is MarkdownView's job, never a raw injection face.
 */
export interface TaskDetail {
  readonly summary: TaskSummary
  readonly descriptionMarkdown: string
  readonly depChain: readonly TaskDepChainEntry[]
  readonly records: readonly TaskRecord[]
  /** 挂接历史 (新→旧). */
  readonly links: readonly SessionLink[]
}

/**
 * Interface 1 WorkbenchEvent — the push channel's payload (batched ≤500ms
 * main-side; single-subscriber semantics). The 5.5 board consumes
 * `task_updated` for the 回流 updating 态; `sync` / `feature_updated` become
 * live with the 5.15 assembly.
 */
export type WorkbenchEvent =
  | {
    readonly type: 'task_updated'
    readonly projectId: string
    readonly taskKey: string
    readonly source: ChangeSource | null
    readonly changeKind: 'attribute' | 'structural'
  }
  | { readonly type: 'feature_updated'; readonly projectId: string; readonly featureSlug: string }
  | { readonly type: 'sync'; readonly projectId: string; readonly sync: SyncStatus }
  // M3 v2 (task 1.4, tech-design §Interface 1 事件扩展): one migration_phase
  // completion signal per phase — the migration dialogs' step driver. The
  // payload carries phase + result only (audit detail stays main-side in
  // migration_event.detail_json; the UI reads it back through
  // getMigrationStatus().lastEvent).
  | {
    readonly type: 'migration_progress'
    readonly projectId: string
    readonly phase: MigrationPhase
    readonly result: MigrationPhaseResult
  }
  // M3 v2 (task 1.5/4.2): deviation signal — presentation only, never a block
  // (PRD G8/Story 8). Same channel, two payloads: project level (1.5 reingest
  // watcher — projectId only) and feature level (4.2 deviation watcher —
  // featureSlug rides along for the UF2 badge). Declared here so the client
  // union stays the structural twin of the main-side vocabulary.
  | { readonly type: 'deviation_detected'; readonly projectId: string; readonly featureSlug?: string }
  // M3 v2 (task 4.1 kernel push; client twin lands with 4.3's UF2 components):
  // the stage-advance reflux — the kernel fires it on every actual advance
  // (terminal 'completed' idempotent no-ops emit nothing). The UF2 surfaces
  // (stepper gate refresh + the stage-assets tab's new-card fade-in) ride it
  // ≤5s through the same batched channel.
  | { readonly type: 'stage_advanced'; readonly projectId: string; readonly featureSlug: string }
  // M3 v2 (task 3.7, tech-design §Interface 1 事件扩展): the orchestration
  // reflux pair — dispatch_updated drives the 编排角标谱 migration (≤5s,
  // subscription-driven), approval_received drives the approval dock's
  // refresh + the toolbar/tab counts (tech-design §Interface 3 审批路由).
  // Payload twins of the kernel dispatch-service.ts event builders verbatim.
  | {
    readonly type: 'dispatch_updated'
    readonly projectId: string
    readonly dispatchId: string
    readonly taskKey: string
    readonly state: DispatchState
  }
  | {
    readonly type: 'approval_received'
    readonly projectId: string
    readonly approvalId: string
    readonly taskKey: string
  }
  // M4 v3 (task 1.3, tech-design §Interface 1 事件 v3 扩展): project-center
  // signals. project_list_changed = any register/rename/archive/restore/remove
  // completion (empty payload — consumers re-pull listProjects/getState);
  // projection_push_required = the projection relay's work item (Interface 2;
  // task 1.3's registerProject emits the placeholder plan — a single ensure
  // op; 3.x generalizes the plan assembly).
  | { readonly type: 'project_list_changed' }
  | {
    readonly type: 'projection_push_required'
    readonly projectId: string
    readonly plan: ProjectionPlan
  }
  // M4 v3 (task 3.2): the projection state reflux — reconcile passes
  // (reconcile_match → healthy / reconcile_drift → deviation) and relay
  // outcome backfill (push_succeeded/push_failed) drive the state machine;
  // only actual transitions emit (idempotent self-spins stay silent), and the
  // live-materialized deviation detail rides along when non-empty (never
  // persisted — recomputed per reconcile, T2).
  | {
    readonly type: 'projection_updated'
    readonly projectId: string
    readonly state: ProjectionState
    readonly deviations?: readonly DeviationRow[]
  }

// ---------------------------------------------------------------------------
// M4 v3 project-center verb DTOs (task 1.3;main-side peers =
// apps/desktop/src/main/workbench/projects-identity/detect.ts and
// projects/lifecycle-service.ts — both halves derive from tech-design
// §Interface 1 v3)
// ---------------------------------------------------------------------------

/**
 * M4 v3 投影 plan 形态(tech-design §Interface 1 投影段;relay 执行序 =
 * ensure → rename → reorder → delete,幂等全量重推;仅 forge 所属子集相对序)。
 */
export type ProjectionOp =
  | { readonly kind: 'ensure'; readonly canonicalPath: string; readonly title: string }
  | { readonly kind: 'rename'; readonly workspaceId: string; readonly title: string }
  | { readonly kind: 'delete'; readonly workspaceId: string }
  | { readonly kind: 'reorder'; readonly orderedIds: readonly string[] }

/** 一个项目的投影期望 plan(幂等全量重推;偏差 = diff 实况,明细不落表)。 */
export interface ProjectionPlan {
  readonly projectId: string
  readonly ops: readonly ProjectionOp[]
}

// ---------------------------------------------------------------------------
// M4 v3 projection verb DTOs (task 3.2;main-side peers =
// apps/desktop/src/main/workbench/projection/{diff,service}.ts — both halves
// derive from tech-design §Interface 1 v3·P3 batch)
// ---------------------------------------------------------------------------

/** 偏差行(DeviationRow twin;明细不落表,对账重算物化)。 */
export interface DeviationRow {
  readonly type: 'renamed' | 'deleted' | 'reordered'
  readonly detail: string
}

/** client 上报的 workspace 实况条目(submitWorkspaceSnapshot 入参元素)。 */
export interface WorkspaceSnapshotEntry {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly orderIdx: number
}

/** getProjectionStatus 行(状态行 + 偏差明细;3.5 状态区数据源)。 */
export interface ProjectionStatusRow {
  readonly projectId: string
  /** 期望名(= projects.display_name)。 */
  readonly displayName: string
  /** 期望投影路径(anchor canonical;ensure 定位键)。 */
  readonly path: string
  /** 期望序(= 注册序权威)。 */
  readonly orderIdx: number
  /** 归档位(归档不对账;workspace 保留语义)。 */
  readonly archived: boolean
  /** 状态机现值(pending/healthy/degraded/deviation)。 */
  readonly state: ProjectionState
  /** 最近成功投影的 dsh WorkspaceId(未推送 = null)。 */
  readonly workspaceId: string | null
  /** 最近成功 push 时间(ISO 8601;未推送 = null)。 */
  readonly pushedAt: string | null
  /** degraded 原因(上游映射串;健康 = null)。 */
  readonly lastError: string | null
  /** 偏差明细(renamed/deleted/reordered;drift 时非空)。 */
  readonly deviations: readonly DeviationRow[]
}

/** retryProjection 入参(幂等全量重推;归档项目零 op)。 */
export interface RetryProjectionInput {
  readonly projectId: string
}

/** getProjectionStatus 入参(projectId 缺省 = 全量状态行)。 */
export interface GetProjectionStatusInput {
  readonly projectId?: string
}

/**
 * submitWorkspaceSnapshot 入参(client 上报原生 workspace 快照,follow 流;
 * 形状校验在 handler 层,主进程 log + debounce 对账在内核 —— T2:快照
 * 不落库、偏差不写表,零写放大)。
 */
export interface SubmitWorkspaceSnapshotInput {
  readonly workspaces: readonly WorkspaceSnapshotEntry[]
}

/**
 * reportProjectionOutcome 入参(relay 回填):ok → 期望 repo 回写 + healthy;
 * error(code/message)→ 上游错误码映射
 * (workspace/invalid-path|name-conflict|move-invalid →
 * ERR_PROJECTION_OP_FAILED detail 携原码)→ degraded + last_error。
 */
export type ReportProjectionOutcomeInput =
  | { readonly projectId: string; readonly ok: true }
  | { readonly projectId: string; readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/** probeProjectPath 入参(C7 侦测;裸盘符/相对路径在归一化入口即拒)。 */
export interface ProbeProjectPathInput {
  readonly path: string
}

/**
 * Interface 1 DetectReport(M4 任务 1.3;main-side peer =
 * projects-identity/detect.ts verbatim)— the C7 确认卡's detection data:
 * normalization facts + three-tier registered fast lane + bounded evidence
 * probes (gitRoot / forgeTreeHit / childRepos chips).
 */
export interface DetectReport {
  readonly input: string
  /** realpath.native canonical; null when realpath failed (string fallback). */
  readonly canonicalPath: string | null
  /** win32-folded comparison key; null only when the entry itself was rejected. */
  readonly pathKey: string | null
  readonly identity: { readonly dev: string; readonly ino: string } | null
  readonly exists: boolean
  readonly isDir: boolean
  readonly readable: boolean
  /** pathKey or (dev,ino) hit → fast lane { projectId, displayName }. */
  readonly registered: { readonly projectId: string; readonly displayName: string } | null
  /** Set when the probed root itself carries a top-level `.git`. */
  readonly gitRoot: string | null
  /** `<root>/docs/features` + direct manifest.md existence (D1 tree signal). */
  readonly forgeTreeHit: boolean
  /** Direct child repos; chips only when ≥2 (parent-dir mis-pick signal). */
  readonly childRepos: ReadonlyArray<{ readonly name: string; readonly path: string }>
}

/** renameProject 入参(纯 DB 改名,零 fs)。 */
export interface RenameProjectInput {
  readonly projectId: string
  readonly displayName: string
}

/** archiveProject / restoreProject 入参。 */
export interface ProjectRefInput {
  readonly projectId: string
}

// ---------------------------------------------------------------------------
// M4 v3 ui-state verb DTOs (task 4.1;main-side peer =
// apps/desktop/src/main/workbench/ui-state/layout-schema.ts — the CANONICAL
// ProjectLayout v1 declaration). This twin is local per the plugin-cannot-
// -import-app precedent; TabKind reuses 2.2's table (views/rightbar/
// tab-kinds.ts) so the plugin keeps a single declaration, and the kernel ↔
// client lockstep is locked by the drift assertion in apps/desktop/tests/
// workbench-ui-state.spec.ts.
// ---------------------------------------------------------------------------

/**
 * detached 窗口的会话定位(§Data Models:SessionId | SubagentAddress)——
 * 顶层会话 = sessionId;subagent = (parent, child, mode) 三元组(恰一形态)。
 */
export type SessionTarget =
  | { readonly sessionId: string }
  | { readonly parentSessionId: string; readonly childSessionId: string; readonly mode: 'one-shot' | 'continuable' }

/** detached 窗口矩形(Interface 4 detached[].rect;4.2 windowOpenDetached 同参)。 */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Interface 4 ProjectLayout v1(布局记忆 blob,项目域):sidebar 宽/收起、
 * tree 三集、rightbar 比例/panes·tabs、detached 窗口集。恢复 = 4.5 重放
 * open 操作序列;分组×排序视图选项 = localStorage 用户级(C3 口径),
 * 不入本形态(Hard Rule 双轨边界)。
 */
export interface ProjectLayout {
  readonly version: 1
  readonly sidebar: { readonly collapsed: boolean; readonly width?: number }
  readonly tree: {
    readonly expandedProjects: readonly string[]
    readonly expandedSessions: readonly string[]
    readonly overflowOpen: readonly string[]
  }
  readonly rightbar: {
    readonly widthPct?: number
    readonly panes: ReadonlyArray<{ readonly tabs: ReadonlyArray<{ readonly kind: TabKind; readonly topic?: string }> }>
  }
  readonly detached: ReadonlyArray<{
    readonly view: 'board' | 'conversation'
    readonly target?: SessionTarget
    readonly rect?: Rect
  }>
}

/** getProjectUiState 入参(无行 = 默认布局)。 */
export interface GetProjectUiStateInput {
  readonly projectId: string
}

/**
 * setProjectUiState 入参(client debounce(4.5)之上的服务端第二道校验:
 * 非法 blob 落库为默认布局 + ERR_LAYOUT_INVALID log,动词不拒 —— 唯一
 * reject 面 = ERR_PROJECT_NOT_FOUND)。
 */
export interface SetProjectUiStateInput {
  readonly projectId: string
  readonly layout: ProjectLayout
}

// ---------------------------------------------------------------------------
// Migration family, UF3 (task 1.6's consumption; the main-side peer is
// apps/desktop/src/main/workbench/ipc/types.ts from 1.4)
// ---------------------------------------------------------------------------

/**
 * The migration phase vocabulary (schema-v2.sql §9 CHECK twin; seven phases):
 * backup → ingest → verify → switch → archive is the one-shot pipeline's
 * linear order (Interface 4), rollback tags the wholesale-rollback completion
 * on failure, reingest is the external-write recovery phase (1.5) — never
 * part of the one-shot run presentation.
 */
export type MigrationPhase =
  | 'backup' | 'ingest' | 'verify' | 'switch' | 'archive' | 'rollback' | 'reingest'

/** A phase's outcome (migration_event.result CHECK twin). */
export type MigrationPhaseResult = 'ok' | 'fail'

/**
 * One migration_event audit row (Interface 1 MigrationEvent): the reviewable
 * record behind `getMigrationStatus().lastEvent` — `detailJson` carries the
 * phase's detail verbatim (the backup phase: `{ backupPath, … }`; verify: the
 * parity report; rollback: the restore outcome).
 */
export interface MigrationEvent {
  readonly id: string
  readonly projectId: string
  readonly phase: MigrationPhase
  readonly result: MigrationPhaseResult
  readonly detailJson: string | null
  readonly at: string
}

/**
 * Interface 1 getMigrationStatus(projectId) payload: the read-routing switch
 * plus the migration/deviation markers. `authority: 'files'` is the
 * migratable premise (the card-level detection of `tasks/index.json` joins
 * it in 1.7); `'sqlite'` = migrated.
 */
export interface MigrationStatus {
  readonly authority: 'files' | 'sqlite'
  readonly deviated: boolean
  readonly migratedAt: string | null
  readonly lastEvent: MigrationEvent | null
  /**
   * 最近一次成功备份的目录(migration_event backup-ok 行的稳定回读面;
   * 从未成功备份 → null)。进度对话框完成后呈现备份位置优先取本字段 —
   * lastEvent 会随管线前移,快速迁移下 backup 相位读回(lastEvent 语义)
   * 会错过,而备份位置是完成态必呈的恢复锚点。
   */
  readonly backupPath: string | null
  /**
   * Does the doc tree still carry tasks/index.json (task 1.7)? The migratable
   * judgment's doc-side half — authority 'files' + true = the card's 可迁移;
   * false after the archive (or when no task corpus ever existed).
   */
  readonly indexJsonDetected: boolean
}

/** Interface 1 startMigration(projectId) payload — progress rides the events. */
export interface MigrationStarted {
  readonly started: true
}

/**
 * Interface 1 getWorkbenchPaths() payload (task 1.7, structural twin of the
 * main-side type): the kernel-managed locations — docsRoot backs the flipped
 * 仓外 registration default (G7/SC9 应用管理路径), backupsRoot the migration
 * confirm dialog's mono 备份位置 copy.
 */
export interface WorkbenchPaths {
  readonly docsRoot: string
  readonly backupsRoot: string
}

// ---------------------------------------------------------------------------
// Feature family, UF4 (task 5.9's consumption)
// ---------------------------------------------------------------------------

/**
 * Interface 1 DocKind — the five feature-document kinds. The canonical tab
 * order (manifest/prd/design/ui/tasks, ui-design UF4 文档 tab) and the label
 * routing live in i18n/feature-status.ts; this file stays pure types.
 */
export type DocKind = 'manifest' | 'prd' | 'design' | 'ui' | 'tasks'

/**
 * Interface 1 FeatureStatus — the forge MANIFEST vocabulary passed through
 * VERBATIM (tech-design Cross-Layer Data Map: "manifest 词表(连字符
 * 'in-progress')"). Deliberately NOT the 7-态 TaskStatus: 'in-progress' keeps
 * its hyphen, and the set is the feature lifecycle's own five phases. The
 * runtime vocabulary + stepper-phase mapping live in i18n/feature-status.ts.
 */
export type FeatureStatus = 'prd' | 'design' | 'tasks' | 'in-progress' | 'completed'

/**
 * Interface 1 FeatureSummary — one row of workbench.getFeatureBoard(projectId)
 * (task 5.9's consumption; the main-side peer is
 * apps/desktop/src/main/workbench/ipc/types.ts from 2.7). `docKinds` lists the
 * kinds that ACTUALLY exist and drives the docs-tab disabled matrix (a missing
 * kind disables its tab, never hides it — spec Interface 1 note).
 */
export interface FeatureSummary {
  readonly slug: string
  readonly status: FeatureStatus
  /** Document kinds that exist for this feature (⊆ the five canonical kinds). */
  readonly docKinds: DocKind[]
  readonly taskTotal: number
  readonly taskCompleted: number
  /** ISO 8601 UTC. */
  readonly updatedAt: string
  /**
   * Feature-level deviation flag (task 4.4, tech-design §Integration #2 data
   * source = feature_snapshot.deviated; the watcher of 4.2 sets it, a kernel-
   * legal advance clears it). OPTIONAL on the client twin only: the kernel
   * verb always projects it, the presentation judges `=== true` (the badge
   * renders for a flagged feature and NOTHING otherwise — legacy build-stage
   * fixtures stay valid).
   */
  readonly deviated?: boolean
}

/** Interface 1 FeatureBoardData — workbench.getFeatureBoard(projectId)'s payload. */
export interface FeatureBoardData {
  readonly features: readonly FeatureSummary[]
  readonly generatedAt: string
}

/**
 * Interface 1 FeatureDoc — workbench.readFeatureDoc(projectId, featureSlug,
 * kind)'s payload. `markdown` is the document's original text; the read-only
 * rendering (防注入) is MarkdownView's job (task 5.2), never a raw injection.
 */
export interface FeatureDoc {
  readonly kind: DocKind
  readonly markdown: string
}

// ---------------------------------------------------------------------------
// M3 task verb DTOs (task 2.1) — the write-set/read family the tool bridge
// forwards to (tech-design §Interface 1 任务权威写集; the main-side peers are
// apps/desktop/src/main/workbench/ipc/types.ts from 1.3, both halves deriving
// from the same spec section).
// ---------------------------------------------------------------------------

/** 操作主体(tech-design Actor):`session:<id>` | `external` | `kernel` | 派发者。 */
export type TaskActor = string

/** taskAdd 入参(taskKey 缺省 = 内核自动 ID,Go disc-N 惯例)。 */
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

/** taskTransition 入参(reason 语境串;v2 schema 无列,接受不落库)。 */
export interface TaskTransitionInput {
  readonly projectId: string
  readonly taskKey: string
  readonly to: TaskStatus
  readonly reason?: string
}

/** taskSubmit 入参(recordPath 语境路径;记录 md 留文档树不入库)。 */
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
// M3 知识系 + feature 读动词 DTO(任务 2.2;tech-design §Interface 2 D4 段;
// 主侧 peer = apps/desktop/src/main/workbench/ipc/types.ts —— 同一 spec 段
// 的结构孪生,插件不得依赖应用(4.1 先例)。数据面移植基准 = forge-cli
// pkg/facttable · pkg/infocmd · internal/cmd/{forensic,feature}。
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

/** fact add 草稿(factId 缺省自动铸;source 缺省 manual;confidence 缺省 inferred)。 */
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
  readonly source?: 'static' | 'runtime' | 'manual'
  readonly confidence?: 'confirmed' | 'inferred' | 'assumed'
  readonly factId?: string
  readonly entry?: KnowledgeFactDraft
}

/** fact list 产物(fact_id 升序)。 */
export interface KnowledgeFactListResult {
  readonly total: number
  readonly facts: readonly KnowledgeFactEntry[]
}

/** fact summary 产物(分组计数 + runtime-confirmed 覆盖率)。 */
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

/** forensic extract 产物(Go extractResult 同形;证据以值返回,不落盘)。 */
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

/** knowledgeForensic 入参(三只读动作;无 projectId —— 机器全局只读源)。 */
export interface KnowledgeForensicInput {
  readonly action: 'search' | 'extract' | 'subagents'
  readonly projectPath?: string
  readonly keyword?: string
  readonly session?: string
  readonly skill?: string
  readonly last?: number
  readonly transcriptPath?: string
  readonly sessionDir?: string
}

/** forensic 动作判别产物。 */
export type KnowledgeForensicResult =
  | { readonly action: 'search'; readonly sessions: readonly ForensicSessionSummary[] }
  | { readonly action: 'extract'; readonly evidence: ForensicEvidence }
  | { readonly action: 'subagents'; readonly subagents: readonly ForensicSubagent[] }

/** feature list 条目(Go featureInfo 同形投影)。 */
export interface FeatureListEntry {
  readonly slug: string
  readonly status: string
  readonly created: string
  readonly completed: number
  readonly total: number
  readonly scores: { readonly prd: string; readonly design: string; readonly ui: string; readonly tests: string }
}

/** feature status 产物(manifest + 任务聚合 + 评分)。 */
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

// M3 偏好动词 DTO(任务 3.1;结构孪生 = main 侧 ipc/types.ts —— 双半身
// 各自声明,插件不依赖应用,4.1 先例)

/**
 * 偏好 scope 入参:global | { project } | { feature };feature 字段 =
 * 限定地址 `<projectId>/<featureSlug>`(scope_id 约定,防跨项目同 slug 碰撞)。
 */
export type PrefScope = 'global' | { readonly project: string } | { readonly feature: string }

/** setPrefs 条目(键集/类型校验在内核)。 */
export interface PrefEntry {
  readonly key: string
  readonly value: unknown
}

/** 生效值来源层级(三级解析 + 注册表默认;null = 无值)。 */
export type PrefSource = 'feature' | 'project' | 'global' | 'default' | null

/** getPrefs 行(生效值 + 来源 + 类型元数据 + 本级覆盖位)。 */
export interface PrefRow {
  readonly key: string
  readonly group: 'auto' | 'worktree' | 'coverage' | 'eval'
  readonly type: 'boolean' | 'number' | 'text' | 'list' | 'coverage'
  readonly control: 'toggle' | 'number-input' | 'text-input' | 'coverage-input'
  readonly value: unknown
  readonly source: PrefSource
  readonly override: boolean
  readonly localValue: unknown
  readonly defaultValue: unknown
}
