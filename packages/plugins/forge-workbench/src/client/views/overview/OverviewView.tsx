/**
 * The UF1 overview tab's COMPLETION assembly (task 5.14, Implementation
 * Notes file): the FeaturesView precedent (5.16) applied to the overview
 * family — with the shell's real-path store present (the preload bridge
 * live), the page's mocked data plane is swapped for the REAL IPC chain
 * (mock 全撤 in the real host):
 *
 *   1. the store (store/workbench-state.ts) is the page's loadState — ONE
 *      getState serves the first paint of the chrome, the page, and the
 *      wizard (the store's in-flight coalescing folds the mount kicks), and
 *      every mutation re-reads through it (single-source refresh);
 *   2. the card face (activateProject / updateProject / removeProject) and
 *      the UF6 plugin face (listPlugins / setPluginEnabled) are the
 *      ipc/workbench.ts adapter's — 1:1 verb mapping, rejections normalized
 *      to the plain WorkbenchVerbError shape;
 *   3. the store's sync-event-derived 失联 signals drive the per-card badge
 *      and the active-project error card (lostProjectIds).
 *
 * Form selection (one rule, no page knowledge): the explicit `overview`
 * seat (the shell's prop — the test seam) or a store-absent mount
 * (hostless jsdom, build stage) renders the 5.3 build-stage page verbatim
 * (its own mock twin faces) — the DI switch discipline every assembly
 * keeps. The wizard itself stays shell-owned (its dialog mounts above the
 * tab content); this view carries only the page's faces.
 */
import { useState, useSyncExternalStore } from 'react'
import type { Project } from '../../ipc-types'
import type { MigrationFace, OverviewFace, PluginFace, WorkbenchOverviewSeat } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { createIpcMigrationFace, createIpcOverviewFace, createIpcPluginFace } from '../../ipc/workbench'
import { INITIAL_WORKBENCH_STATE_SNAPSHOT, type WorkbenchStateStore } from '../../store/workbench-state'
import { OverviewPage } from './OverviewPage'

/** Inputs of {@link OverviewView}. */
export interface OverviewViewProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The register CTA seam — the shell's addProject (the wizard's owner). */
  onRegister?: (() => void) | undefined
  /** The repoint seam — the shell's wizard EDIT mode (the lost-card action). */
  onRepoint?: ((project: Project) => void) | undefined
  /**
   * The shell's external-mutation epoch (5.14): bumped when a mutation the
   * PAGE didn't fire (the wizard's register/repoint, the chrome switcher's
   * activation) refreshed the store — rides through as the page's
   * reloadToken so the grid re-reads without a remount (the plugin section
   * keeps its state; the 5.13 stability contract).
   */
  reloadToken?: number | undefined
  /** The explicit assembly seat (tests / build stage) — present wins over the store. */
  seat?: WorkbenchOverviewSeat | undefined
  /** The shell's real-path store — present (bridge live) selects the real chain. */
  store?: WorkbenchStateStore | undefined
}

/** The real chain's fixed face set (identities fixed for the view's life). */
interface RealFaces {
  overview: OverviewFace
  plugin: PluginFace
  migration: MigrationFace
}

/**
 * The overview tab's assembled view. The store form renders the real chain
 * (IPC faces + store-routed loadState + event-derived 失联 signals); the
 * seat/store-absent forms reproduce the 5.3 build-stage page exactly.
 */
export function OverviewView(props: OverviewViewProps) {
  const store = props.store
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.getSnapshot ?? (() => INITIAL_WORKBENCH_STATE_SNAPSHOT),
  )
  // Face identities fixed for the view's life (the page keys its loads on
  // them; the store routes loadState so chrome + page + wizard share reads).
  const [realFaces] = useState<RealFaces | undefined>(() => {
    if (store === undefined) return undefined
    return {
      overview: { ...createIpcOverviewFace(store.bridge), loadState: () => store.refresh() },
      plugin: createIpcPluginFace(store.bridge),
      migration: createIpcMigrationFace(store.bridge),
    }
  })

  if (props.seat !== undefined || store === undefined || realFaces === undefined) {
    // The 5.3 form, verbatim: the seat's faces (or the build-stage mock twins
    // when absent). The seat wins over everything (the explicit test seam).
    return (
      <OverviewPage
        t={props.t}
        onRegister={props.onRegister}
        onRepoint={props.onRepoint}
        lostProjectIds={props.seat?.lostProjectIds}
        face={props.seat?.face}
        pluginFace={props.seat?.pluginFace}
        migrationFace={props.seat?.migrationFace}
      />
    )
  }

  // The real chain: the IPC faces over the store-backed read model; the
  // shell's external-mutation token re-reads the page behind wizard/chrome
  // mutations (no remount — the plugin section keeps its 5.13 stability).
  // 1.7: the migration face joins the set — the real host gets the card
  // migration surface (mock 全撤 for it too).
  return (
    <OverviewPage
      t={props.t}
      onRegister={props.onRegister}
      onRepoint={props.onRepoint}
      lostProjectIds={snapshot.lostProjectIds}
      reloadToken={props.reloadToken}
      face={realFaces.overview}
      pluginFace={realFaces.plugin}
      migrationFace={realFaces.migration}
    />
  )
}
