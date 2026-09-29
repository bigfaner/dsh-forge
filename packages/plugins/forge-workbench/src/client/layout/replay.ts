/**
 * The layout-memory REPLAY half (M4 task 4.5; tech-design §Interfaces·
 * Interface 4「恢复 = 重放 open 操作序列(openTab/openResource/setWidth)」):
 * re-entering a project re-issues the recorded OPEN OPERATIONS — the pane
 * structure rebuilds through the native placement verbs (each pane's first
 * tab after the base opens with `preferNewPane`), the C9 ratio re-commits
 * through the split store, the sidebar geometry re-applies through the shell
 * seat's setters, and the detached window set re-opens through
 * `windowOpenDetached` (Interface 5). 恢复态 = 离开前布局 (SC4 断言口径).
 *
 * The replay is FORGE-OWNED operations only (the 双轨 boundary): it never
 * writes the native rightbar's own persistence, never re-seats the native
 * outer divider (the column's px preference is the native frame's own
 * policy), and never touches a session's adopted dockkit store beyond what
 * the public opens themselves do. The native machinery's own guarantees
 * (per-pane page uniqueness, the sole-docked-guide protection, the pane
 * budget) own every settle — the replay just asks, idempotently: an already
 * restored tab re-opens as a focus (the store's dedupe), so a re-replay is
 * always safe.
 *
 * 恢复失败 → 默认布局 (AC3's backstop chain): the KERNEL already resets an
 * invalid blob to the default layout before it ever reaches the renderer
 * (4.1's sanitize), and the default layout's plan is EMPTY (no tabs, no
 * ratio, no detached, sidebar at its default posture) — a corrupted memory
 * costs nothing. On THIS side every face is guarded (the
 * never-throw-never-load-gate discipline): a failed op degrades that op and
 * the sequence continues; the counted `failures` surface is the log's
 * material, never a user-facing error.
 */
import type { ProjectLayout, Rect, SessionTarget } from '../ipc-types'
import type { TabKind } from '../views/rightbar/tab-kinds'
import { clampSplitRatio } from '../views/rightbar/tabs-model'
import { docDisplayName, parseDocPath } from '../views/rightbar/DocTree'

/** One replay operation, in issue order (the 重放序列's assertion surface). */
export type LayoutReplayOp =
  | { readonly op: 'sidebar-width'; readonly width: number }
  | { readonly op: 'sidebar-collapse'; readonly collapsed: boolean }
  | { readonly op: 'open-tab'; readonly kind: TabKind; readonly topic?: string; readonly preferNewPane: boolean }
  | { readonly op: 'split-ratio'; readonly ratio: number }
  | {
    readonly op: 'open-detached'
    readonly view: 'board' | 'conversation'
    readonly target?: SessionTarget | undefined
    readonly rect?: Rect | undefined
  }

/** The doc tab's navigation params, derived from its topic (the doc path). */
function docParamsOf(topic: string): { path: string; displayName: string } | undefined {
  const target = parseDocPath(topic)
  return target === undefined ? undefined : { path: topic, displayName: docDisplayName(target) }
}

/**
 * Plan the replay's open-operation sequence (pure — the spec's 重放序列
 * target). Order is deterministic: the SIDEBAR geometry first (the frame
 * lands before content fills it), then the panes' tabs in pane order (the
 * base pane's tabs plain; every later pane's FIRST tab splits via
 * `preferNewPane`), then the C9 ratio (only while ≥ 2 panes replay — a
 * single pane has no split to size), then the detached windows (Interface 5
 * opens; the blob's rect rides along when present). The default layout
 * plans to an EMPTY sequence — the natural no-op backstop.
 */
export function planLayoutReplay(layout: ProjectLayout): readonly LayoutReplayOp[] {
  const ops: LayoutReplayOp[] = []
  if (layout.sidebar.width !== undefined) ops.push({ op: 'sidebar-width', width: layout.sidebar.width })
  if (layout.sidebar.collapsed) ops.push({ op: 'sidebar-collapse', collapsed: true })
  layout.rightbar.panes.forEach((pane, paneIndex) => {
    pane.tabs.forEach((tab, tabIndex) => {
      ops.push({
        op: 'open-tab',
        kind: tab.kind,
        ...(tab.topic === undefined ? {} : { topic: tab.topic }),
        preferNewPane: paneIndex > 0 && tabIndex === 0,
      })
    })
  })
  if (layout.rightbar.panes.length >= 2 && layout.rightbar.widthPct !== undefined) {
    ops.push({ op: 'split-ratio', ratio: clampSplitRatio(layout.rightbar.widthPct / 100) })
  }
  for (const entry of layout.detached) {
    ops.push({
      op: 'open-detached',
      view: entry.view,
      ...(entry.target === undefined ? {} : { target: entry.target }),
      ...(entry.rect === undefined ? {} : { rect: entry.rect }),
    })
  }
  return ops
}

/** The sidebar leg's face (the main-window shell seat's geometry setters). */
export interface SidebarReplayFace {
  /** setWidth — apply the restored expanded preference in px. */
  setWidth?(px: number): void
  /** Apply the restored collapse posture (only a `true` collapse is issued). */
  setCollapsed?(collapsed: boolean): void
}

/** The rightbar leg's face — the public placement verbs (the 2.2/2.4 shapes). */
export interface RightbarReplayFace {
  openTab(kind: TabKind, options?: {
    readonly preferNewPane?: boolean
    readonly params?: { readonly path: string; readonly displayName: string } | { readonly featureSlug?: string }
  }): void
}

/** The C9 ratio leg's face (the split store's `setRatio`). */
export interface SplitReplayFace {
  setRatio(ratio: number): boolean
}

/** The detached leg's face (`windowOpenDetached`, Interface 5). */
export interface DetachedReplayFace {
  openDetached(input: { readonly view: 'board' | 'conversation'; readonly target?: SessionTarget; readonly rect?: Rect }): Promise<unknown>
}

/** Every replay leg, all optional (an absent face degrades its leg only). */
export interface LayoutReplayFaces {
  readonly sidebar?: SidebarReplayFace | undefined
  readonly rightbar?: RightbarReplayFace | undefined
  readonly split?: SplitReplayFace | undefined
  readonly detached?: DetachedReplayFace | undefined
}

/** What a replay pass did (the outcome surface tests assert). */
export interface LayoutReplayOutcome {
  /** Ops the plan carried (the issued + the skipped-together total). */
  readonly planned: number
  /** Ops that issued against a live face. */
  readonly issued: number
  /** Ops that degraded (absent face, a thrown verb, an unidentifiable doc). */
  readonly degraded: number
}

/**
 * Execute the replay plan against the resolved faces (AC2): strictly
 * sequenced, per-op guarded — one degraded op never aborts the rest (the
 * 恢复失败 tolerance). A `doc` op whose topic does not parse back onto a
 * document identity is skipped rather than opened broken; `openDetached`
 * rejections count degraded (the 4.3 discipline: a failed window open keeps
 * the main-window pane, never a lost view).
 */
export function replayProjectLayout(layout: ProjectLayout, faces: LayoutReplayFaces): LayoutReplayOutcome {
  const ops = planLayoutReplay(layout)
  let issued = 0
  let degraded = 0
  for (const op of ops) {
    try {
      switch (op.op) {
        case 'sidebar-width': {
          if (faces.sidebar?.setWidth === undefined) { degraded += 1; break }
          faces.sidebar.setWidth(op.width)
          issued += 1
          break
        }
        case 'sidebar-collapse': {
          if (faces.sidebar?.setCollapsed === undefined) { degraded += 1; break }
          faces.sidebar.setCollapsed(op.collapsed)
          issued += 1
          break
        }
        case 'open-tab': {
          const rightbar = faces.rightbar
          if (rightbar === undefined) { degraded += 1; break }
          if (op.kind === 'doc') {
            if (op.topic === undefined) { degraded += 1; break }
            const params = docParamsOf(op.topic)
            if (params === undefined) { degraded += 1; break }
            rightbar.openTab('doc', { params, ...(op.preferNewPane ? { preferNewPane: true } : {}) })
            issued += 1
            break
          }
          if (op.kind === 'depgraph') {
            rightbar.openTab('depgraph', {
              ...((op.topic !== undefined && op.topic !== '') ? { params: { featureSlug: op.topic } } : {}),
              ...(op.preferNewPane ? { preferNewPane: true } : {}),
            })
            issued += 1
            break
          }
          rightbar.openTab(op.kind, op.preferNewPane ? { preferNewPane: true } : {})
          issued += 1
          break
        }
        case 'split-ratio': {
          if (faces.split === undefined) { degraded += 1; break }
          faces.split.setRatio(op.ratio)
          issued += 1
          break
        }
        case 'open-detached': {
          const detached = faces.detached
          if (detached === undefined) { degraded += 1; break }
          void detached.openDetached({
            view: op.view,
            ...(op.target === undefined ? {} : { target: op.target }),
            ...(op.rect === undefined ? {} : { rect: op.rect }),
          }).then(() => {}, () => { /* a failed window open degrades quietly (4.3) */ })
          issued += 1
          break
        }
      }
    } catch {
      // A thrown verb (the rebind window mid session switch, a drifted
      // service): this op degrades, the sequence continues.
      degraded += 1
    }
  }
  return { planned: ops.length, issued, degraded }
}
