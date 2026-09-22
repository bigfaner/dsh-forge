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
