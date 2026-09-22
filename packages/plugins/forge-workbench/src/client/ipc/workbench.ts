/**
 * The Interface 1 IPC adapter, client half (task 5.16 — the FIRST real-IPC
 * assembly: 5.14 overview and 5.15 task board reuse this pattern verbatim):
 *
 *   1. BRIDGE READ — `getWorkbenchIpcBridge()` reads the preload namespace
 *      `window.dshForge.workbench` (task 2.7's contextBridge verbs; one verb
 *      per whitelisted channel). The read is GUARDED: hostless environments
 *      (jsdom unit mounts, tests, the fallback-rail world before the shell
 *      exists) have no `dshForge` — the resolver answers undefined and the
 *      views keep their build-stage defaults instead of throwing at import
 *      time. A bridge counts as present only when EVERY declared member is a
 *      callable (a partial bridge degrades to absent — one rule, no
 *      per-verb presence checks scattered through the views).
 *
 *   2. FACE→VERB MAPPING — one factory per contract.ts face, each member
 *      mirroring its §Interface 1 verb one-to-one with the QUALIFIED argument
 *      order verbatim (getFeatureBoard(projectId), readFeatureDoc(projectId,
 *      featureSlug, kind)). No batching, no caching here — page-session
 *      caches belong to the views' stores (store/feature-board.ts,
 *      store/workbench-state.ts).
 *
 *   3. ERROR NORMALIZATION — main-side verb rejections arrive as an Error
 *      whose `.message` is the serialized `{ code, message, detail? }`
 *      envelope (handlers.ts WorkbenchIpcError; tech-design §Error Handling).
 *      `normalizeWorkbenchVerbError` folds every rejection into the plain
 *      {@link WorkbenchVerbError} shape the build-stage mocks already throw,
 *      so a view's code mapping (i18n/errors.ts routing, the
 *      ERR_SNAPSHOT_STALE branch) is form-agnostic from day one. Unknown
 *      shapes fall to the spec's ERR_WORKBENCH_DB 兜底 (Propagation
 *      Strategy: unclassified → generic error card).
 */
import type {
  DocKind, FeatureBoardData, FeatureDoc, PluginRow, Project, ProjectPatch, RecordSessionLinkInput,
  RegisterProjectInput, SessionLink, TaskBoardData, TaskDetail, WorkbenchEvent, WorkbenchState,
  WorkbenchVerbError,
} from '../ipc-types'
import type {
  FeatureBoardFace, FeatureDocFace, OverviewFace, PluginFace, RegisterWizardFace,
} from '../contract'

/**
 * The preload namespace surface (task 2.7): the 13 data verbs + the
 * single-subscriber event verb. The client DTOs are structural twins of the
 * main-side types (both halves derive from tech-design §Interface 1), so the
 * declaration is local — the plugin cannot depend on the app (4.1 precedent).
 */
export interface WorkbenchIpcBridge {
  getState(): Promise<WorkbenchState>
  registerProject(input: RegisterProjectInput): Promise<Project>
  updateProject(id: string, patch: ProjectPatch): Promise<Project>
  removeProject(id: string): Promise<void>
  activateProject(id: string): Promise<void>
  getTaskBoard(projectId: string): Promise<TaskBoardData>
  getTaskDetail(projectId: string, taskKey: string): Promise<TaskDetail>
  getFeatureBoard(projectId: string): Promise<FeatureBoardData>
  readFeatureDoc(projectId: string, featureSlug: string, kind: DocKind): Promise<FeatureDoc>
  listPlugins(): Promise<PluginRow[]>
  setPluginEnabled(name: string, enabled: boolean): Promise<PluginRow[]>
  recordSessionLink(input: RecordSessionLinkInput): Promise<SessionLink>
  endSessionLink(linkId: string): Promise<void>
  /** Batched push (≤500ms main-side); returns the unsubscribe. */
  onEvents(callback: (events: readonly WorkbenchEvent[]) => void): () => void
}

/** Every member the presence check walks (keep in lockstep with the interface). */
const BRIDGE_MEMBERS: readonly (keyof WorkbenchIpcBridge)[] = [
  'getState', 'registerProject', 'updateProject', 'removeProject', 'activateProject',
  'getTaskBoard', 'getTaskDetail', 'getFeatureBoard', 'readFeatureDoc',
  'listPlugins', 'setPluginEnabled', 'recordSessionLink', 'endSessionLink', 'onEvents',
]

/**
 * The guarded preload read. Answers the bridge only when the whole verb
 * surface is callable; undefined in hostless environments — callers then keep
 * their build-stage defaults (the views never throw on a missing host).
 */
export function getWorkbenchIpcBridge(): WorkbenchIpcBridge | undefined {
  let candidate: unknown
  try {
    candidate = (globalThis as { dshForge?: { workbench?: unknown } }).dshForge?.workbench
  } catch {
    return undefined // sandboxed globals can throw on property reads
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const bridge = candidate as Record<string, unknown>
  return BRIDGE_MEMBERS.every(member => typeof bridge[member] === 'function')
    ? (candidate as WorkbenchIpcBridge)
    : undefined
}

/**
 * The throwing twin for call sites that REQUIRE a host (explicit error over
 * silent mocks — the dispatcher's hostless guard). Assembly views use the
 * undefined-returning {@link getWorkbenchIpcBridge} instead.
 */
export function requireWorkbenchIpcBridge(): WorkbenchIpcBridge {
  const bridge = getWorkbenchIpcBridge()
  if (bridge === undefined) {
    throw new Error('dshForge.workbench IPC bridge is unavailable (hostless environment?)')
  }
  return bridge
}

/** Is the value shaped like the serialized error envelope? */
function asEnvelope(value: unknown): WorkbenchVerbError | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const { code, message, detail } = value as { code?: unknown; message?: unknown; detail?: unknown }
  if (typeof code !== 'string' || code === '' || typeof message !== 'string') return undefined
  return detail === undefined ? { code, message } : { code, message, detail: String(detail) }
}

/**
 * Fold any verb rejection into the plain {@link WorkbenchVerbError} shape:
 *   ① the plain-object form the build-stage mocks throw (passthrough);
 *   ② the IPC form — an Error whose `.message` is the envelope JSON
 *      (handlers.ts serializes on purpose so the renderer can parse back);
 *   ③ anything else → the spec's ERR_WORKBENCH_DB 兜底.
 */
export function normalizeWorkbenchVerbError(error: unknown): WorkbenchVerbError {
  const plain = asEnvelope(error)
  if (plain !== undefined) return plain
  if (error instanceof Error) {
    try {
      const parsed = asEnvelope(JSON.parse(error.message))
      if (parsed !== undefined) return parsed
    } catch {
      // Not an envelope message — the 兜底 below.
    }
  }
  return {
    code: 'ERR_WORKBENCH_DB',
    message: error instanceof Error ? error.message : String(error),
  }
}

/** Normalize a rejection by re-throwing it (the face wrappers' catch leg). */
function renormalize(error: unknown): never {
  throw normalizeWorkbenchVerbError(error)
}

/** The UF4 board face over the verb (task 5.16's consumption; 1:1 mapping). */
export function createIpcFeatureBoardFace(bridge: WorkbenchIpcBridge): FeatureBoardFace {
  return {
    loadFeatureBoard: async (projectId: string): Promise<FeatureBoardData> => {
      try {
        return await bridge.getFeatureBoard(projectId)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/** The UF4 doc face over the verb (task 5.16's consumption; 1:1 mapping). */
export function createIpcFeatureDocFace(bridge: WorkbenchIpcBridge): FeatureDocFace {
  return {
    readFeatureDoc: async (
      projectId: string,
      featureSlug: string,
      kind: DocKind,
    ): Promise<FeatureDoc> => {
      try {
        return await bridge.readFeatureDoc(projectId, featureSlug, kind)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/** The UF1 overview face over the verbs (task 5.14's consumption; 1:1 mapping). */
export function createIpcOverviewFace(bridge: WorkbenchIpcBridge): OverviewFace {
  return {
    loadState: async (): Promise<WorkbenchState> => {
      try {
        return await bridge.getState()
      } catch (error) {
        renormalize(error)
      }
    },
    activateProject: async (id: string): Promise<void> => {
      try {
        await bridge.activateProject(id)
      } catch (error) {
        renormalize(error)
      }
    },
    updateProject: async (id: string, patch: ProjectPatch): Promise<Project> => {
      try {
        return await bridge.updateProject(id, patch)
      } catch (error) {
        renormalize(error)
      }
    },
    removeProject: async (id: string): Promise<void> => {
      try {
        await bridge.removeProject(id)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/** The UF6 plugin-section face over the verbs (task 5.14's consumption; 1:1 mapping). */
export function createIpcPluginFace(bridge: WorkbenchIpcBridge): PluginFace {
  return {
    listPlugins: async (): Promise<PluginRow[]> => {
      try {
        return await bridge.listPlugins()
      } catch (error) {
        renormalize(error)
      }
    },
    setPluginEnabled: async (name: string, enabled: boolean): Promise<PluginRow[]> => {
      try {
        return await bridge.setPluginEnabled(name, enabled)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}

/**
 * The register wizard's IPC WRITE pair (task 5.14) — registerProject /
 * updateProject, the verbs Interface 1 actually declares for the wizard's
 * submit. The step-①/② PROBE members have no Interface 1 verb (the 5.14
 * task's verb list carries none): the wizard's build-stage twin keeps
 * serving them (permissive for unknown paths — the instant feedback UX),
 * and the REAL validation is the submit-time main-side chain whose ERR_*
 * rejections land in the wizard's centralized i18n/errors.ts mapping — the
 * inline correction copy the spec's Error Handling table assigns those
 * codes. Returned as a Partial-compatible slice: the shell hands it to the
 * wizard's face seam, which spreads it over the mock twin.
 */
export function createIpcRegisterWizardVerbs(
  bridge: WorkbenchIpcBridge,
): Pick<RegisterWizardFace, 'registerProject' | 'updateProject'> {
  return {
    registerProject: async (input: RegisterProjectInput): Promise<Project> => {
      try {
        return await bridge.registerProject(input)
      } catch (error) {
        renormalize(error)
      }
    },
    updateProject: async (id: string, patch: ProjectPatch): Promise<Project> => {
      try {
        return await bridge.updateProject(id, patch)
      } catch (error) {
        renormalize(error)
      }
    },
  }
}
