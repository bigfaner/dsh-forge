/**
 * The rightbar forge tab-kind table (M4 task 2.2, tech-design §Integration
 * #5 + §Interfaces·Interface 4): the FIVE kinds the project workbench's right
 * column hosts, registered into the upstream `ui-sidebar-right` tab system
 * through its two-stage public path — the definition here (stage one,
 * `ctx.sidebarRightTabs`) plus the keyed `sidebar.right.pane.tab` body
 * (stage two, RightbarTabs.tsx). 声明合并纯增量, 上游槽位机制零修改
 * (Hard Rule T1/vendored; the `ui-sidebar-terminal` precedent is the live
 * proof an outside package registers exactly this way).
 *
 * The kind strings are the Interface 4 `TabKind` whitelist — the same enum
 * the project-domain layout blob (project_ui_state, task 4.5) replays — so
 * this table is the SINGLE source both halves share.
 *
 * `guide` is a TAKE-OVER, not a fresh kind: the shipped guide is `builtin`
 * and the registry admits one `extension` beside it (the extension is the one
 * in force — bodies and titles dispatch under the definition's own id), so
 * the forge 开始页 replaces the shipped door page while the kind string
 * stays exactly `guide`: the native machinery keys its invariants on that
 * string — the empty-column seed (stores.ts defaultSeed → guide), the strip's
 * ＋ (addTab → openTab('guide'), hidden while the pane holds a guide), the
 * sole-docked-guide close protection (canCloseTab) — and every one of them
 * keeps working, now landing on the forge page. The prototype-era
 * divergences (裁决 #20/#22/#23: closable 开始 chip / chipless all-closed
 * board / ＋ hidden at zero tabs) are PROTOTYPE affordances the native
 * column expresses its own way (last close collapses the column; the next
 * expansion re-seeds the guide; the ＋ shows exactly while no guide is in
 * the pane) — vendored-zero-modification keeps the native semantics.
 */
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { WorkbenchKey } from '../../locale/en'

/**
 * The forge tab-kind whitelist (Interface 4's `TabKind` verbatim): guide 开始页
 * / overview 项目概览 / board 任务看板 / doc 文档 / depgraph 依赖图.
 */
export type TabKind = 'guide' | 'overview' | 'board' | 'doc' | 'depgraph'

/** The whitelist as a runtime list (layout-blob validation + linkage filters). */
export const RIGHTBAR_TAB_KINDS: readonly TabKind[] = ['guide', 'overview', 'board', 'doc', 'depgraph']

/** Is an unknown kind string one of the forge kinds? (layout-blob guard, 4.5) */
export function isTabKind(kind: string): kind is TabKind {
  return (RIGHTBAR_TAB_KINDS as readonly string[]).includes(kind)
}

/**
 * The kinds whose CONTENT belongs to one project (§4.8): a doc tab or a
 * depgraph tab shows a specific project's artifacts, so a project switch
 * closes them (§4.7 联动); overview/board follow the active-project pointer
 * instead (their bodies re-derive), guide is project-agnostic.
 */
export const PROJECT_SCOPED_TAB_KINDS: readonly TabKind[] = ['doc', 'depgraph']

/** Prefix of the five definitions' implementation ids (the keyed-seat keys). */
export const FORGE_TAB_ID_PREFIX = '@dsh-forge/plugin-forge-workbench/rightbar/'

/** One forge kind's implementation identity — the `sidebar.right.pane.tab` dispatch key. */
export function forgeTabId(kind: TabKind): string {
  return `${FORGE_TAB_ID_PREFIX}${kind}`
}

/** The translate seat the definitions read (the plugin's own `t`). */
export type TabKindTranslate = (key: WorkbenchKey) => string

/**
 * Build the five definitions (pure; `title`/`guide` copy thunks re-read per
 * use so a locale change needs no re-registration — the upstream contract).
 *
 *   guide     — extension take-over of the shipped `guide` kind: the forge
 *               开始页 (GuideTab.tsx). One page per pane (no `multiple`), the
 *               kind string stays `guide` (see the module note).
 *   overview  — the 项目概览 door; its guide ENTRY (order 10, before the
 *               upstream terminal 20 / browser 30) is the registry's honest
 *               statement of the §4.1 card list, and keeps the native
 *               defaultSeed on the guide even in degenerate entry counts.
 *   board     — the 2.1 dual-host TasksView (host='pane', fed by the ACTIVE
 *               project; a project switch is a re-key, i.e. a new mount).
 *   doc       — 2.4's content pane; `multiple` (文档可多开, §4.8) with the
 *               document identity riding the `doc` navigation params.
 *   depgraph  — 2.4's content pane; one per pane (概览/依赖图各一, §4.8).
 *
 * doc/depgraph bodies are PLACEHOLDER MOUNTS in this task (render nothing —
 * never an empty view or preset data, the SC2 discipline); 2.4 owns their
 * interiors. overview's interior is 2.3's.
 * @param t - the plugin locale seat.
 * @returns the five definitions, keyed by kind.
 */
export function forgeTabDefinitions(t: TabKindTranslate): Readonly<Record<TabKind, SidebarRightTabDefinition>> {
  return {
    guide: {
      id: forgeTabId('guide'),
      kind: 'guide',
      // The take-over band: in force over the shipped builtin (the registry's
      // extension-over-builtin rule) — 原生门页语义不变, 门后是 forge 开始页.
      priority: 'extension',
      title: () => t('rightbar.tab.guide'),
    },
    overview: {
      id: forgeTabId('overview'),
      kind: 'overview',
      title: () => t('rightbar.tab.overview'),
      guide: [{
        id: 'overview',
        order: 10,
        title: () => t('rightbar.guide.overview.title'),
        description: () => t('rightbar.guide.overview.description'),
      }],
    },
    board: {
      id: forgeTabId('board'),
      kind: 'board',
      title: () => t('rightbar.tab.board'),
    },
    doc: {
      id: forgeTabId('doc'),
      kind: 'doc',
      multiple: true,
      // Fallback chip text only: a doc tab's real name (`slug/产物名称`) is
      // the 2.4 title seat's job (the params carry the document identity).
      title: () => t('rightbar.tab.doc'),
    },
    depgraph: {
      id: forgeTabId('depgraph'),
      kind: 'depgraph',
      title: () => t('rightbar.tab.depgraph'),
    },
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** One forge document tab's identity (2.4 opens; the params are the seam). */
    doc: {
      /** The document's project-relative path (the read verb's argument). */
      readonly path: string
      /** The tab-name form `slug/产物名称` (title = 全路径口径). */
      readonly displayName: string
    }
    /** The dependency-graph tab's scope (2.4 opens; empty = the active feature). */
    depgraph: {
      readonly featureSlug?: string
    }
  }
}
