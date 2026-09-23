/**
 * The Interface 1 DTO family, client half (task 5.1) — the structural source
 * the 5.x build tasks consume (UI dependency layering: build tasks import DTO
 * TYPES + mock data only; the IPC runtime is wired by the 5.14-5.16 assembly
 * tasks). PURE TYPES, zero runtime code.
 *
 * The plugin package cannot depend on the app (the 4.1 precedent — see
 * host/forge-bridge.ts), so this file is the client-side declaration of the
 * SAME shapes the main process serves: field definitions follow tech-design
 * §Interface 1 as the single authority, the main-side peer being
 * apps/desktop/src/main/workbench/ipc/types.ts (task 2.7). Both halves derive
 * from the spec section; a field drifting from it is a defect on either side.
 *
 * Scope note: this lands with the chrome-relevant subset (getState's
 * assembly). Later 5.x tasks extend the module with the board/detail/doc DTOs
 * they consume — the same incremental growth the main-side module followed.
 */

/**
 * Where a project's feature documents live (Interface 1): inside the repo, or
 * an explicitly authorized external path.
 */
export type DocLocationType = 'in_repo' | 'external'

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
}

/**
 * Interface 1 registerProject input: the three-step wizard's submit payload
 * (task 5.4). `displayName` omitted / empty means 缺省 = the codeRoot
 * directory name; `docLocationPath` is required (and ≠ codeRoot) when
 * external, always null when in_repo.
 */
export interface RegisterProjectInput {
  readonly codeRoot: string
  readonly docLocationType: DocLocationType
  readonly docLocationPath?: string | null
  readonly displayName?: string
}

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
  // M3 v2 (task 1.5): deviation signal — presentation only, never a block
  // (PRD G8/Story 8). Consumed by the UF2 badge (4.2), declared here so the
  // client union stays the structural twin of the main-side vocabulary.
  | { readonly type: 'deviation_detected'; readonly projectId: string }

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
