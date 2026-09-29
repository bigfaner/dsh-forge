/**
 * The 文档 tab's directory-tree IDENTITY model (M4 task 2.4, layout §4.5 +
 * 裁决 #22-①): the pure half that turns one project-relative tree path into
 * (a) the tab-name form `slug/产物名称` (the 目录树条目名, 含子目录; title =
 * 全路径口径) and (b) the M3 read verb the path addresses — plus the doc-tab
 * LIFECYCLE half the §4.8 dedupe rule needs.
 *
 * Path vocabulary (the 2.3 panes' openTab seam, verbatim):
 *   docs/features/<slug>/<kind>       kind ∈ the five canonical DocKinds
 *   docs/proposals/<slug>/proposal.md the proposal body
 *   docs/proposals/<slug>/eval        the deterministic eval-report pick
 *
 * 零新读侧 (Implementation Notes): parsing maps onto the EXISTING M3 face
 * verbs — readFeatureDoc(projectId, slug, kind) / readProposalDoc({…}) — the
 * DocTab body consumes {@link DocTarget}; nothing here touches IPC.
 *
 * The lifecycle half (AC1 可多开 · 重复打开激活既有): the doc kind rides the
 * upstream `multiple: true` machinery, whose contentId carries a fresh uuid
 * per open — the native page dedupe (one page per pane) therefore CANNOT key
 * on the document. The plugin-side registry below closes that gap: every
 * MOUNTED doc tab body registers (tabId, path); the open seam
 * {@link focusOrOpenDoc} focuses the live tab for a re-opened path instead of
 * minting a duplicate. A body's mount IS the liveness signal (the slot
 * runtime keeps hidden tab bodies mounted — the `signal` contract aborts only
 * when the record disappears), so a closed tab unregisters by unmounting.
 */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { DocKind } from '../../ipc-types'
import { isDocKind } from '../../i18n/feature-status'
import type { RightbarTabsFace } from './tabs-model'

/** One parsed doc-tree target (the M3 read verb's arguments). */
export type DocTarget =
  | { readonly area: 'features'; readonly slug: string; readonly kind: DocKind }
  | { readonly area: 'proposals'; readonly slug: string; readonly kind: 'proposal' | 'eval' }

/** The proposals tree's entry names (含子目录 form: the file the tree shows). */
const PROPOSAL_ENTRY: Record<'proposal' | 'eval', string> = { proposal: 'proposal.md', eval: 'eval' }

/**
 * Parse one project-relative doc path (the 2.3 open seam's `path` form).
 * Unknown shapes answer `undefined` — the tab renders its error branch, the
 * read side is never reached with a malformed address.
 */
export function parseDocPath(path: string): DocTarget | undefined {
  if (path.startsWith('docs/features/')) {
    const rest = path.slice('docs/features/'.length)
    const slash = rest.indexOf('/')
    if (slash <= 0) return undefined
    const slug = rest.slice(0, slash)
    const kind = rest.slice(slash + 1)
    // A kind segment with a further subdirectory is not a kind address.
    return isDocKind(kind) && kind.indexOf('/') === -1
      ? { area: 'features', slug, kind }
      : undefined
  }
  if (path.startsWith('docs/proposals/')) {
    const rest = path.slice('docs/proposals/'.length)
    const slash = rest.indexOf('/')
    if (slash <= 0) return undefined
    const slug = rest.slice(0, slash)
    const entry = rest.slice(slash + 1)
    if (entry === 'proposal.md') return { area: 'proposals', slug, kind: 'proposal' }
    if (entry === 'eval') return { area: 'proposals', slug, kind: 'eval' }
    return undefined
  }
  return undefined
}

/**
 * The 目录树条目名 (含子目录): the file name the overview's directory tree
 * shows for one target — the 产物名称 half of the tab-name form.
 */
export function docEntryName(target: DocTarget): string {
  return target.area === 'features' ? target.kind : PROPOSAL_ENTRY[target.kind]
}

/** The tab-name form `slug/产物名称` (title = 全路径 rides the `path` itself). */
export function docDisplayName(target: DocTarget): string {
  return `${target.slug}/${docEntryName(target)}`
}

// ---------------------------------------------------------------------------
// The doc-tab registry (AC1: 可多开 · 重复打开激活既有)
// ---------------------------------------------------------------------------

/** The plugin-lifetime doc-tab registry (path → the live tab id). */
export interface DocTabsRegistry {
  /** Record one MOUNTED doc tab body (the latest mount wins a path). */
  register(tabId: string, path: string): void
  /** Drop one unmounted body (a no-op when a newer mount owns the path). */
  unregister(tabId: string, path: string): void
  /** The live tab id currently holding the path, if any. */
  tabIdOf(path: string): string | undefined
}

/**
 * Create a doc-tabs registry (one per plugin lifetime — the container
 * installer owns the instance so the doc bodies and the open seam share it).
 */
export function createDocTabsRegistry(): DocTabsRegistry {
  const byPath = new Map<string, string>()
  return {
    register: (tabId, path) => { byPath.set(path, tabId) },
    unregister: (tabId, path) => {
      if (byPath.get(path) === tabId) byPath.delete(path)
    },
    tabIdOf: path => byPath.get(path),
  }
}

/** What {@link focusOrOpenDoc} did (the assertion surface for tests). */
export type DocOpenOutcome = 'focused' | 'opened' | 'inert'

/**
 * The open seam's dedupe pass (AC1 重复打开激活既有): a path with a LIVE doc
 * tab focuses it; anything else opens a fresh tab carrying the identity in
 * the `doc` navigation params. An absent controller face answers `inert`
 * (the caller falls back to its own open route — never a dead button).
 */
export function focusOrOpenDoc(
  face: RightbarTabsFace,
  registry: DocTabsRegistry,
  input: { readonly path: string; readonly displayName: string },
): DocOpenOutcome {
  const existing = registry.tabIdOf(input.path)
  if (existing !== undefined) {
    face.focus(existing)
    return 'focused'
  }
  face.openTab('doc', { params: { path: input.path, displayName: input.displayName } })
  return 'opened'
}

// ---------------------------------------------------------------------------
// The doc chip title (`slug/产物名称`)
// ---------------------------------------------------------------------------

/**
 * Read one doc tab's navigation params onto their declared shape (the
 * SidebarRightTabParamsMap seam's `doc` entry). A structurally invalid read
 * answers `undefined` — a restored or seeded tab renders the registry's
 * fallback title instead.
 */
export function docParamsOf(info: ReturnType<UseSidebarRightTabInfo> | undefined):
  { readonly path: string; readonly displayName: string } | undefined {
  const params = info?.tab.navigation.params as { path?: unknown; displayName?: unknown } | undefined
  if (params === undefined || typeof params !== 'object') return undefined
  if (typeof params.path !== 'string' || params.path === '') return undefined
  if (typeof params.displayName !== 'string' || params.displayName === '') return undefined
  return { path: params.path, displayName: params.displayName }
}

/** The doc chip title's composed props (the keyed title-seat dispatch). */
export type DocTabTitleProps =
  & PropsRuntime<'sidebar.right.pane.tab.title'>

/**
 * The 文档 chip: the tab-name form `slug/产物名称` from the tab's own
 * navigation params (title = 全路径), falling back to the registry-captured
 * title when the params are absent (a restored tab) — without this seat every
 * doc chip would show the kind's generic fallback (「Document」).
 */
export function DocTabTitle({ useTabInfo }: DocTabTitleProps): ReactNode {
  const info = useTabInfo()
  const params = docParamsOf(info)
  if (params === undefined) {
    return <span data-dsh-forge-doc-title="fallback">{info.tab.title}</span>
  }
  return (
    <span data-dsh-forge-doc-title={params.path} title={params.path}>
      {params.displayName}
    </span>
  )
}
