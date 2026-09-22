/**
 * The UF4 feature-board page-session store (task 5.16, Implementation Notes
 * file): the read-through cache of already-read feature documents. Scope is
 * the task Hard Rule — 页内会话期 only: one cache per FeaturesPage mount
 * (surviving the list↔detail round trips because the page stays mounted),
 * never persisted, and CLEARED on a project switch so no doc crosses a
 * project boundary (文档缓存仅在页内会话期,不得跨项目残留).
 *
 * Deliberately a plain keyed object, not an observable store: the consumers
 * (FeatureDocs' per-tab read effect) consult it synchronously before firing
 * the verb and write resolved docs back — there is no state to project, so
 * getSnapshot/subscribe machinery would be dead weight (the selected-task
 * store carries state; this one carries data).
 */
import type { DocKind, FeatureDoc } from '../ipc-types'

/** The page-scoped read-through doc cache (one per FeaturesPage mount). */
export interface FeatureDocsCache {
  /** A previously resolved doc, or undefined (the caller then reads the verb). */
  get(featureSlug: string, kind: DocKind): FeatureDoc | undefined
  /** Record a resolved doc (the read path's success leg). */
  put(featureSlug: string, kind: DocKind, doc: FeatureDoc): void
  /** Drop every entry — the project-switch leg of the Hard Rule. */
  clear(): void
  /** Entry count (observability for tests; not used by views). */
  readonly size: number
}

/**
 * Create a page-scoped doc cache, keyed `<featureSlug>/<kind>` — the same
 * addressing the readFeatureDoc verb takes (the project dimension is the
 * CACHE's lifetime, not the key: a project switch clears, never re-keys).
 */
export function createFeatureDocsCache(): FeatureDocsCache {
  const entries = new Map<string, FeatureDoc>()
  return {
    get(featureSlug, kind) {
      return entries.get(`${featureSlug}/${kind}`)
    },
    put(featureSlug, kind, doc) {
      entries.set(`${featureSlug}/${kind}`, doc)
    },
    clear() {
      entries.clear()
    },
    get size() {
      return entries.size
    },
  }
}
