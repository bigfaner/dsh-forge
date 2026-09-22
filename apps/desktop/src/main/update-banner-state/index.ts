// Main-side UF3 UpdateBannerState machine (task 5.3 integration).
//
// The renderer banner component (apps/desktop/src/shell-ui/update-banner.js,
// task 5.1) enforces the same legal transition set locally; this module owns
// the *deciding* state in the main process (tech-design Cross-Layer Data Map:
// banner phase lives in the main process and is pushed over
// `dsh-forge:update-state` / pulled via the `dsh-forge:update-get-state` verb).
//
// Legal transitions (tech-design Data Models, mirrored from task 5.1):
//   hidden → shown | hidden → queued → shown | shown|queued → dismissed
// `dismissed` is terminal for this run (F4-D2 latch, reset only by relaunch).
//
// queued-while-mask (ui-design §UF3 横幅 × UF4 覆盖层): while the UF4 mask is
// up (recovery state restarting/restoring/failed) an arriving update-available
// queues instead of showing; when the mask exits (recovery → recovered) a
// queued banner transitions to shown. A banner that is already shown stays
// shown under the mask (mask z1200 simply covers/freezes it, ui-design).
//
// Inputs (wired in main/index.ts):
// - reportAvailable(version): update-checker resolved update-available
// - setMaskActive(active): UF4 mask entered / exited
// - dismiss(): renderer dismiss verb (run-level terminal latch)

export type UpdateBannerPhase = 'hidden' | 'queued' | 'shown' | 'dismissed'

export interface UpdateBannerState {
  readonly phase: UpdateBannerPhase
  readonly version?: string
}

export interface UpdateBannerStateDeps {
  /** State push sink (main/index.ts forwards to webContents.send). */
  readonly onState?: (state: UpdateBannerState) => void
}

export function createUpdateBannerState(deps: UpdateBannerStateDeps = {}) {
  const emit = deps.onState ?? (() => {})
  let state: UpdateBannerState = { phase: 'hidden' }
  let maskActive = false

  function moveTo(next: UpdateBannerState): void {
    const changed = next.phase !== state.phase || next.version !== state.version
    state = next
    if (changed) emit(state)
  }

  return {
    get context() { return state },
    /** update-checker resolved `update-available` for `version`. */
    reportAvailable(version: string): void {
      if (state.phase === 'dismissed') return // terminal for this run
      if (version === undefined || version === '') return
      if (state.phase === 'hidden') {
        moveTo(maskActive ? { phase: 'queued', version } : { phase: 'shown', version })
        return
      }
      // queued/shown: refresh the version in place (no re-show animation).
      moveTo({ phase: state.phase, version })
    },
    /** UF4 mask entered (true) / exited (false). queued → shown on exit. */
    setMaskActive(active: boolean): void {
      maskActive = active
      if (!active && state.phase === 'queued') moveTo({ phase: 'shown', version: state.version })
    },
    /** Renderer dismiss verb: terminal latch for this run. */
    dismiss(): void {
      if (state.phase === 'dismissed') return
      moveTo({ phase: 'dismissed' })
    },
    getState(): UpdateBannerState {
      return state
    },
  }
}

export type UpdateBannerStateMachine = ReturnType<typeof createUpdateBannerState>
