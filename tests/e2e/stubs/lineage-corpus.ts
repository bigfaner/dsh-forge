// tests/e2e/stubs/lineage-corpus — the subagent 血缘语料 stub (M4 task 2.9;
// tech-design §Testing Strategy·「stub 扩展」: 会话 stub 支持
// `parentSession`/`origin` 头注入,真核心消费(非 mock 旁路),journal 对拍).
//
// The corpus channel the SC7 leg drives: sessions WITH lineage headers cannot
// come from the dispatch chain (its channel stub mints header-less top
// sessions and runs no real agent — 命名遵循率 is a FIXED stub by task
// discipline), so the lineage corpus rides the REAL session-persistence
// backend instead of a renderer-side mock:
//
//   · the TEST process instantiates the REAL vendored
//     `@deepseek-ai/dsh-session-persistence-jsonl` backend (a real cordis root
//     Context + the default `compression: 'zstd'` the host child boots with —
//     an opposite-encoding artifact makes the host's list scan THROW, verified
//     against the vendored `resolveGenerationInDirectory`) against the
//     journey-isolated `$DSH_HOME/sessions` root BEFORE launch;
//   · every seed becomes a REAL v3 artifact: the header carries
//     `parentSession`/`origin: 'subagent'`/`delegationDepth` verbatim
//     (SessionHeader v3), the event log carries the `subagent/descriptor`
//     (mode + the durable LABEL — the 命名遵循率 corpus's stub session name)
//     and optionally a `session/title` USER event (the 手工改名桩 — the
//     naming-vs-lineage conflict corpus, Hard Rule: 血缘为准);
//   · the host child then consumes them through the REAL chain on boot —
//     sessionQuery list (byId parentSessionId/origin) + the workspaceRegistry
//     bootstrap (sessions group by canonical cwd) + the subagentsByParent
//     catalog (refreshSubagents folds the descriptor events) — no mock bypass
//     anywhere;
//   · the seeding journal rows (`session-seeded`, appended into the dispatch
//     stub's unified journal) carry the injected header facts for 对拍: the
//     spec re-opens the artifacts through a SECOND backend instance and
//     cross-checks headers + labels against the journal and the UI rows.
//
// Why the channel stub itself stays header-free: dispatch-launch creates TOP
// sessions only (no parentSession to inject), so the header-injection channel
// of the stub protocol IS this module — the corpus vocabulary speaks the same
// `parentSession`/`origin` header names the real SessionHeader v3 defines.

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** One corpus session seed — the header/event facts the backend materializes. */
export interface LineageSeedSession {
  /** The durable session id (the corpus addresses everything by it). */
  readonly sessionId: string
  /** The session's project cwd — MUST exist on disk (workspace grouping). */
  readonly cwd: string
  /** Header `createdAt` (ms epoch) — controls the recency ladder. */
  readonly createdAt: number
  /** A `session/title` USER event (the 手工改名桩 — explicit rename, pinned). */
  readonly title?: string
  /** Header `parentSession` — the DIRECT durable parent (subagent lineage). */
  readonly parentSession?: string
  /** Header `origin` — `'subagent'` rows fold under their parent, never top. */
  readonly origin?: 'subagent'
  /** The `subagent/descriptor` mode ('continuable' needs a label). */
  readonly mode?: 'one-shot' | 'continuable'
  /** The descriptor LABEL — the stub session NAME (命名遵循率 corpus). */
  readonly label?: string
}

/** One journal 对拍 row (the dispatch stub's unified stream, fifth kind). */
export type SessionSeededJournalEntry = import('./dispatch.ts').SessionSeededJournalEntry

/**
 * The 命名遵循率 corpus name (the 2.8 appendix's convention, Interface 7):
 * the dispatch prompt conventions every spawned subagent to be named
 * 「任务 id + title」 — the stub corpus complies by construction, so the e2e
 * asserts on the stub session name, never on a real agent execution.
 */
export function namingCompliantName(taskKey: string, title: string): string {
  return `${taskKey} ${title}`
}

/** The 「查看全部」 fold corpus: MORE descendants than the 20-hit cap (2.5). */
export const MANY_DESCENDANT_COUNT = 24

/**
 * Seed the corpus into the REAL persistence backend (pre-boot discipline:
 * the host child's workspaceRegistry bootstrap indexes STORED headers once —
 * a post-boot seed would miss the canonical-cwd grouping, so every seed lands
 * before launch).
 *
 * @param input.dshHome - the journey-isolated `$DSH_HOME` (the sessions root
 *   `<dshHome>/sessions` the host child boots on via the same env seam).
 * @param input.seeds - the corpus sessions (top + subagent children).
 * @param input.note - the journal appender (the dispatch stub's
 *   `noteSessionSeeded`); each seed lands one 对拍 row.
 */
export async function seedLineageCorpus(input: {
  readonly dshHome: string
  readonly seeds: readonly LineageSeedSession[]
  readonly note?: (entry: Omit<SessionSeededJournalEntry, 'kind' | 'at'>) => void
}): Promise<void> {
  const sessionsRoot = join(input.dshHome, 'sessions')
  mkdirSync(sessionsRoot, { recursive: true })
  // The REAL backend over a REAL cordis root context (vendored closure —
  // exactly the host child's build).
  const { Context, JsonlBackend } = await vendoredPersistencePair()
  const backend = new JsonlBackend(new Context(), { root: sessionsRoot })
  for (const seed of input.seeds) {
    const events: LineageSeedEvent[] = []
    if (seed.mode !== undefined) {
      events.push({
        type: 'subagent/descriptor',
        seq: events.length,
        time: seed.createdAt,
        data: { version: 3, mode: seed.mode, provider: 'e2e-lineage-corpus', ...labelOf(seed) },
      })
    }
    if (seed.title !== undefined) {
      events.push({
        type: 'session/title',
        seq: events.length,
        time: seed.createdAt,
        data: { title: seed.title, messageSeqs: [], source: { kind: 'user' } },
      })
    }
    const header = {
      version: 3,
      id: seed.sessionId,
      createdAt: seed.createdAt,
      cwd: seed.cwd,
      ...(seed.parentSession === undefined ? {} : { parentSession: seed.parentSession }),
      isSeeded: false,
      ...(seed.origin === undefined ? {} : { origin: seed.origin }),
      delegationDepth: seed.parentSession === undefined ? 0 : 1,
    }
    const handle = await backend.create(header)
    if (events.length > 0) await handle.append(events)
    await handle.flush()
    await handle.close()
    input.note?.({
      sessionId: seed.sessionId,
      cwd: seed.cwd,
      ...(seed.parentSession === undefined ? {} : { parentSession: seed.parentSession }),
      ...(seed.origin === undefined ? {} : { origin: seed.origin }),
      ...(seed.mode === undefined ? {} : { mode: seed.mode }),
      ...(seed.label === undefined ? {} : { label: seed.label }),
      ...(seed.title === undefined ? {} : { title: seed.title }),
    })
  }
}

/** A continuable descriptor requires its label; one-shot may omit it. */
function labelOf(seed: LineageSeedSession): { readonly label: string } | Record<string, never> {
  if (seed.label === undefined) {
    if (seed.mode === 'continuable') throw new Error(`corpus seed ${seed.sessionId}: continuable descriptor needs a label`)
    return {}
  }
  return { label: seed.label }
}

/**
 * The vendored backend's lib root (relative to this stub home; resolved from
 * the repo root the Playwright runner occupies — NO `import.meta` here: the
 * spec lane transpiles stubs to CJS, where it is a syntax error).
 */
function vendoredPersistenceLib(): string {
  return join(
    process.cwd(), 'packages', 'desktop-host-vendor', 'vendored', 'packages',
    'session', 'session-persistence-jsonl', 'lib',
  )
}

/**
 * The vendored pair (backend + a real cordis root context) behind ONE dynamic
 * import anchored at the backend's own lib dir — the closure's dependency
 * graph resolves exactly as the host child loads it (ESM file-URL import;
 * `require(esm)` is refused for this graph under the spec runner).
 */
async function vendoredPersistencePair(): Promise<{
  readonly Context: new () => unknown
  readonly JsonlBackend: new (ctx: unknown, config: { readonly root: string }) => LineageBackend
}> {
  const libDir = vendoredPersistenceLib()
  const asFileUrl = (path: string): string => new URL(`file://${path.replaceAll('\\', '/')}`).href
  const backend = await import(asFileUrl(join(libDir, 'index.js'))) as {
    default: new (ctx: unknown, config: { readonly root: string }) => LineageBackend
  }
  // vendored/vendor/cordis — the closure's own cordis build (the host child's).
  const cordis = await import(asFileUrl(join(libDir, '..', '..', '..', '..', 'vendor', 'cordis', 'lib', 'index.js'))) as {
    Context: new () => unknown
  }
  return { Context: cordis.Context, JsonlBackend: backend.default }
}

/** The backend face this module drives (create/append/flush/close + read). */
interface LineageSeedEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: Record<string, unknown>
}

interface LineageBackend {
  create(header: Record<string, unknown>): Promise<{
    append(events: readonly LineageSeedEvent[]): Promise<void>
    flush(): Promise<void>
    close(): Promise<void>
  }>
  open(id: string, access: 'read'): Promise<{
    readonly header: Record<string, unknown>
    read(): Promise<{ readonly events: ReadonlyArray<{ readonly type: string }> }>
    close(): Promise<void>
  }>
}

/**
 * 对拍: re-open one corpus artifact through a FRESH backend instance (the
 * host child's reader role) — the header + event types as the REAL core
 * decodes them, for the journal↔artifact cross-check.
 */
export async function readCorpusSession(input: {
  readonly dshHome: string
  readonly sessionId: string
}): Promise<{ header: Record<string, unknown>; events: ReadonlyArray<{ readonly type: string }> }> {
  const { Context, JsonlBackend } = await vendoredPersistencePair()
  const backend = new JsonlBackend(new Context(), { root: join(input.dshHome, 'sessions') })
  const handle = await backend.open(input.sessionId, 'read')
  try {
    const read = await handle.read()
    return { header: handle.header, events: read.events }
  } finally {
    await handle.close()
  }
}
