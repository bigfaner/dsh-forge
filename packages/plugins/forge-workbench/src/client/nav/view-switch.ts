/**
 * The dual-view switching controller (task 3.3): the ONE write path both
 * navigation forms share. Behavior-contract identity between the forms (task
 * Hard Rules: any interaction difference is a defect) is structural here —
 * both forms call the same switch* methods, which transition the same
 * view-key machine, persist the same projection, and project onto the single
 * live carrier. Keyboard parity comes from the same activation surface: every
 * switch control in either form is a native button (click / Enter / Space),
 * wired to these methods.
 *
 * Carriers are exclusive: attaching one detaches the previous (the slot path
 * and the rail never both own presentation). External selection changes — the
 * upstream sidebar row clicking us into/out of the workbench panel, or the
 * shell's panel-lifecycle notifications — arrive through adoptExternalView,
 * which persists the adopted view but never re-projects (the carrier already
 * reflects it; re-presenting would loop).
 */
import type {
  TopLevelView, ViewKeySnapshot, ViewKeyStore, WorkbenchTabKey,
} from '../store/view-key'

/** Which navigation form is presenting (decision D3: slot path preferred, rail fallback). */
export type NavForm = 'slot' | 'rail'

/** Presents a view-key snapshot onto one navigation form. */
export interface ViewCarrier {
  /** The form this carrier serves. */
  readonly form: NavForm
  /**
   * Project the snapshot onto the form. Called on attach (the attach-time
   * projection IS the restart restore: a persisted workbench view re-selects
   * the panel once the slot registration commits) and after every
   * controller-driven transition.
   */
  present(snapshot: ViewKeySnapshot): void
}

/** The shared switching brain (one instance per plugin lifetime). */
export class ViewSwitchController {
  private carrier: ViewCarrier | undefined
  private restoreHold = false

  /**
   * @param store - the view-key machine this controller drives.
   */
  constructor(private readonly store: ViewKeyStore) {}

  /**
   * Attach the presenting carrier (exclusive: detaches any previous) and
   * project the current snapshot onto it.
   */
  attach(carrier: ViewCarrier): void {
    this.carrier = carrier
    carrier.present(this.store.getSnapshot())
  }

  /** Detach a carrier if it is the live one. */
  detach(carrier: ViewCarrier): void {
    if (this.carrier === carrier) this.carrier = undefined
  }

  /** The live carrier's form, or undefined while none is attached. */
  get form(): NavForm | undefined {
    return this.carrier?.form
  }

  /** Switch to the session (upstream) view. */
  switchSession(): void {
    this.store.selectSession()
    this.project()
  }

  /** Switch to the workbench view, optionally targeting a tab. */
  switchWorkbench(tab?: WorkbenchTabKey): void {
    this.store.selectWorkbench(tab)
    this.project()
  }

  /** Switch the workbench interior tab (stays in the workbench view). */
  switchWorkbenchTab(tab: WorkbenchTabKey): void {
    this.store.selectWorkbenchTab(tab)
    this.project()
  }

  /**
   * Open the feature-detail subview (task 5.9): the features tab carrying a
   * slug — the machine's own subview-addressing transition, driven through
   * the same one write path both navigation forms share. The return trip is
   * `switchWorkbenchTab('workbench/features')` (the machine clears the slug).
   */
  openFeatureDetail(slug: string): void {
    this.store.openFeatureDetail(slug)
    this.project()
  }

  /**
   * Arm the one-shot boot-restore hold. The upstream boot sequence re-opens
   * the last session AFTER the plugin loads (home-scoped session list
   * hydrating seconds after ui-ready; ui-workspace's replaceMain/clearMain
   * both end in `selectPanel(null)`), which deselects a panel restored from
   * persistence before it. AC4's 回到上次视图 wins that one collision: the
   * FIRST external dismissal after a persistence-driven workbench restore is
   * the boot bounce, not user intent — the restored view is re-presented and
   * the hold consumed. Later dismissals (a real 新建会话/conversation click)
   * adopt normally.
   */
  armRestoreHold(): void {
    this.restoreHold = true
  }

  /**
   * Adopt a top-level view an external actor already put on screen (upstream
   * sidebar row click, keyed-panel mount/unmount lifecycle). Persists through
   * the machine's ordinary transitions; never presents — the carrier already
   * reflects the change (the armed restore hold is the one exception).
   */
  adoptExternalView(view: TopLevelView): void {
    if (this.store.getSnapshot().view === view) return
    if (view === 'session' && this.restoreHold) {
      this.restoreHold = false
      this.project()
      return
    }
    this.store.adoptView(view)
  }

  /** Push the current machine state onto the live carrier. */
  private project(): void {
    this.carrier?.present(this.store.getSnapshot())
  }
}
