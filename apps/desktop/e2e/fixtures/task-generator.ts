// e2e fixture: deterministic forge task-set generator (task 6.1, SC1's data
// engine — 500 tasks / 50 features default preset).
//
// Determinism contract (AC2): the SAME seed + options produce the SAME model —
// every randomness draw goes through one seeded PRNG (xmur3 hash → mulberry32),
// iteration order is insertion-ordered, and no clock/path input feeds the
// model. The writer (forge-project.ts) then renders byte-stable files from it,
// so "same seed ⇒ same index.json bytes" holds (mtimes are deliberately NOT
// part of the model — the indexer derives updatedAt from file mtimes, which
// are per-write facts, not generator facts).
//
// Dialect fidelity (2.5 parse-task/parse-feature, live-repo form): statuses
// from the 7-state snapshot vocabulary; dependencies are same-feature local
// ids (chains + diamonds + an explicit dangling slice); records carry the
// `actor:` frontmatter line (`session:<id>` / `terminal` / absent) so the
// source badges have ground truth; branch/worktree are NEVER generated — the
// dialect pins them to null/false (Hard Rule: 不虚构 forge 未写的字段).
//
// Repository hygiene Hard Rule: this module only ever RETURNS a model; the
// writer decides where it lands (temp dirs in every caller).

/** The 7-state snapshot vocabulary (parse-task TASK_STATUS_VOCAB mirror). */
export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected'] as const
export type GeneratedTaskStatus = typeof TASK_STATUSES[number]

/** Feature manifest status vocabulary (parse-feature FEATURE_STATUS_VOCAB mirror). */
export const FEATURE_STATUSES = ['prd', 'design', 'tasks', 'in-progress', 'completed'] as const
export type GeneratedFeatureStatus = typeof FEATURE_STATUSES[number]

/** Doc kinds a generated feature can carry beyond the mandatory manifest+tasks. */
export const OPTIONAL_DOC_KINDS = ['prd', 'design', 'ui'] as const
export type OptionalDocKind = typeof OPTIONAL_DOC_KINDS[number]

/** Task `type` vocabulary sampled by the generator (live-repo forms). */
export const TASK_TYPES = ['coding.feature', 'doc.feature', 'test', 'validation', 'gate'] as const

export interface GeneratedRecord {
  /** frontmatter `actor:` line value; null = no actor line ([终端]/推断面). */
  readonly actor: string | null
  /** `## Summary` body (single line — the parser takes the section verbatim). */
  readonly summary: string
  /** Local, timezone-free forge-style timestamp (`YYYY-MM-DD HH:mm`). */
  readonly completed: string
}

export interface GeneratedTask {
  /** index.json key (file stem) — `<localId>-<slug>`, the live-repo form. */
  readonly stem: string
  readonly localId: string
  readonly title: string
  readonly status: GeneratedTaskStatus
  readonly type: typeof TASK_TYPES[number]
  /** Same-feature local ids (may include the dangling slice verbatim). */
  readonly dependencies: string[]
  readonly record: GeneratedRecord | null
}

export interface GeneratedFeature {
  readonly slug: string
  readonly status: GeneratedFeatureStatus
  /** Always includes manifest + tasks; the optional kinds rotate by seed. */
  readonly docKinds: readonly OptionalDocKind[]
  readonly tasks: GeneratedTask[]
}

export interface TaskSetFacts {
  readonly taskCount: number
  readonly featureCount: number
  readonly statusCounts: Readonly<Record<GeneratedTaskStatus, number>>
  /** Total dependency edges across all features (dangling included). */
  readonly edgeCount: number
  /** Edges whose target id exists in NO feature task list, by (slug, target). */
  readonly dangling: ReadonlyArray<{ readonly featureSlug: string; readonly target: string }>
  readonly tasksWithRecord: number
  readonly recordsWithSessionActor: number
  readonly recordsWithTerminalActor: number
}

export interface GeneratedTaskSet {
  readonly options: ResolvedTaskSetOptions
  readonly features: GeneratedFeature[]
  readonly facts: TaskSetFacts
}

export interface TaskSetOptions {
  /** Deterministic seed — same seed + options ⇒ identical model. */
  readonly seed: string
  /**
   * EXACT total task count across all features (phase-gate tails included —
   * the budget allocator shrinks/grows the regular slice so the sum matches).
   */
  readonly taskCount: number
  readonly featureCount: number
  /**
   * Fraction [0,1) of dependency edges rewired to nonexistent targets
   * (dangling references preserved verbatim — diff.ts findDanglingBlockers
   * ground truth). Default 0.05.
   */
  readonly danglingRate?: number
  /** Fraction [0,1] of tasks carrying an execution record. Default 0.4. */
  readonly recordRate?: number
  /** Average tasks per phase before a new phase number starts. Default 6. */
  readonly tasksPerPhase?: number
  /** Phase tail gate tasks (`<phase>.gate`, type `gate`). Default true. */
  readonly gates?: boolean
  /**
   * Relative status weights (AC2 状态分布可配置). Unspecified statuses share
   * weight 1; default = uniform. The first `TASK_STATUSES.length` tasks still
   * cycle the full vocabulary so every status is present regardless of
   * weights (0-weight statuses appear only through that floor).
   */
  readonly statusWeights?: Partial<Record<GeneratedTaskStatus, number>>
}

export interface ResolvedTaskSetOptions extends Required<Omit<TaskSetOptions, 'seed' | 'statusWeights'>> {
  readonly seed: string
  readonly statusWeights: Readonly<Partial<Record<GeneratedTaskStatus, number>>>
}

// ---------------------------------------------------------------------------
// Seeded PRNG (xmur3 string hash → mulberry32) — no dependencies, stable
// across platforms/Node versions (integer arithmetic only).
// ---------------------------------------------------------------------------

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic float [0,1) stream for a seed string. */
export function seededRandom(seed: string): () => number {
  const mixer = xmur3(seed)
  return mulberry32(mixer())
}

// ---------------------------------------------------------------------------
// Deterministic content vocabulary (stable word lists — no Date, no locale).
// ---------------------------------------------------------------------------

const SUBJECTS = ['registry', 'indexer', 'watcher', 'store', 'snapshot', 'bridge', 'channel', 'board', 'detail', 'launch', 'plugin', 'session', 'feature', 'doc', 'panel', 'slot', 'event', 'recovery', 'guard', 'fixture']
const VERBS = ['wire', 'scan', 'diff', 'batch', 'render', 'inject', 'resolve', 'assert', 'isolate', 'refresh', 'migrate', 'validate', 'orchestrate', 'converge', 'audit', 'seed']
const QUALIFIERS = ['主链', '降级链', '边界', '一致性', '回归', '首屏', '回流', '装配', '守卫', '对拍']

const RECORD_SUMMARIES = [
  '落地主路径并补齐单测基线',
  '按任务文件完成实现与门禁',
  '修复回归并固定复现用例',
  '迁移完成,旧路径退役',
  '装配链路打通,观测面就位',
]

/** The dangling edge target: a phase that is never generated (phases stay ≤ 98). */
const DANGLING_TARGET = '99.1'

function titleOf(rand: () => number, index: number): string {
  const subject = SUBJECTS[Math.floor(rand() * SUBJECTS.length)] ?? 'fixture'
  const verb = VERBS[Math.floor(rand() * VERBS.length)] ?? 'wire'
  const qualifier = QUALIFIERS[Math.floor(rand() * QUALIFIERS.length)] ?? '主链'
  return `${verb}-${subject} ${qualifier} #${String(index)}`
}

function timestampOf(rand: () => number): string {
  // Deterministic forge-style local timestamp within a fixed window.
  const day = 1 + Math.floor(rand() * 28)
  const hour = Math.floor(rand() * 24)
  const minute = Math.floor(rand() * 60)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `2026-09-${pad(day)} ${pad(hour)}:${pad(minute)}`
}

/** Pick per status so every vocabulary member appears (when volume allows). */
function statusAt(rand: () => number, i: number, weights: Readonly<Partial<Record<GeneratedTaskStatus, number>>>): GeneratedTaskStatus {
  // Floor-i slots cycle the full vocabulary first, then weighted draws — a
  // 7-task set covers all 7 states deterministically; larger sets keep the
  // vocabulary complete while the tail distributes per the configured bias.
  if (i < TASK_STATUSES.length) return TASK_STATUSES[i] ?? 'pending'
  const table = TASK_STATUSES.map(status => ({ status, weight: Math.max(0, weights[status] ?? 1) }))
  const total = table.reduce((sum, row) => sum + row.weight, 0)
  if (total <= 0) return TASK_STATUSES[Math.floor(rand() * TASK_STATUSES.length)] ?? 'pending'
  let draw = rand() * total
  for (const row of table) {
    draw -= row.weight
    if (draw <= 0 && row.weight > 0) return row.status
  }
  const lastPositive = [...table].reverse().find(row => row.weight > 0)
  return lastPositive?.status ?? 'pending'
}

/**
 * Allocate per-feature regular-task counts so the TOTAL (regular + phase
 * gates) is exactly `taskCount`. Round-robin base, then deterministic
 * corrections: trim from the last features / top up from the first until the
 * sum matches (each unit changes the total by 1, occasionally 2 when it
 * crosses a phase boundary — the loop converges either way).
 */
function allocateBudget(taskCount: number, featureCount: number, tasksPerPhase: number, gates: boolean): number[] {
  const roundRobin = (): number[] => {
    const budget = Array.from({ length: featureCount }, () => 0)
    for (let i = 0; i < taskCount; i += 1) budget[i % featureCount] = (budget[i % featureCount] ?? 0) + 1
    return budget
  }
  if (!gates) return roundRobin()
  const budget = Array.from({ length: featureCount }, () => 0)
  const totalOf = (): number => budget.reduce((sum, n) => sum + n + Math.ceil(n / Math.max(1, tasksPerPhase)), 0)
  let regular = taskCount - featureCount // reserve one gate per feature
  if (regular < 0) regular = 0
  for (let i = 0; i < regular; i += 1) budget[i % featureCount] = (budget[i % featureCount] ?? 0) + 1
  for (let guard = 0; guard < 4 * taskCount + 8 && totalOf() !== taskCount; guard += 1) {
    if (totalOf() > taskCount) {
      // Trim the LAST feature that still has regular tasks (early features stay dense;
      // a feature may thin to zero, in which case it carries no gate either).
      for (let f = featureCount - 1; f >= 0; f -= 1) {
        if ((budget[f] ?? 0) > 0) { budget[f] = (budget[f] ?? 0) - 1; break }
      }
    } else {
      const target = Math.max(...budget)
      const f = budget.findIndex(n => n < target)
      budget[f === -1 ? 0 : f] = (budget[f === -1 ? 0 : f] ?? 0) + 1
    }
  }
  if (totalOf() !== taskCount) {
    // Degenerate volume (the gate parity makes the exact total unreachable —
    // e.g. taskCount 1): exactness wins over gate presence.
    return roundRobin()
  }
  return budget
}

/**
 * Generate the deterministic task model.
 *
 * Shape rules (dialect-faithful, 6.2's assertion surface):
 * - local ids `<phase>.<seq>` (plus `<phase>.gate` tails); dependencies
 *   reference EARLIER local ids in the same feature only (DAG, no cycles),
 *   with 1-3 blockers on recent predecessors (chains + diamonds).
 * - the dangling slice rewrites drawn edges to the never-generated `99.1`.
 */
export function generateTaskSet(input: TaskSetOptions): GeneratedTaskSet {
  if (!Number.isInteger(input.taskCount) || input.taskCount < 1) throw new Error(`taskCount must be a positive integer (got ${String(input.taskCount)})`)
  if (!Number.isInteger(input.featureCount) || input.featureCount < 1) throw new Error(`featureCount must be a positive integer (got ${String(input.featureCount)})`)
  const options: ResolvedTaskSetOptions = {
    seed: input.seed,
    taskCount: input.taskCount,
    featureCount: input.featureCount,
    danglingRate: input.danglingRate ?? 0.05,
    recordRate: input.recordRate ?? 0.4,
    tasksPerPhase: input.tasksPerPhase ?? 6,
    gates: input.gates ?? true,
    statusWeights: input.statusWeights ?? {},
  }
  const rand = seededRandom(`${input.seed}::dsh-forge-task-set`)

  const budget = allocateBudget(input.taskCount, input.featureCount, options.tasksPerPhase, options.gates)

  const features: GeneratedFeature[] = []
  const dangling: Array<{ featureSlug: string; target: string }> = []
  const statusCounts = Object.fromEntries(TASK_STATUSES.map(status => [status, 0])) as Record<GeneratedTaskStatus, number>
  let edgeCount = 0
  let tasksWithRecord = 0
  let recordsWithSessionActor = 0
  let recordsWithTerminalActor = 0
  let taskIndex = 0

  for (let f = 0; f < input.featureCount; f += 1) {
    const slug = `fixture-${String(f + 1).padStart(2, '0')}-${input.seed.replace(/[^a-z0-9-]/gi, '').slice(0, 8) || 'seed'}`
    const status = FEATURE_STATUSES[f % FEATURE_STATUSES.length] ?? 'in-progress'
    const docKinds = OPTIONAL_DOC_KINDS.filter((_, i) => (f + i) % 2 === 0)
    const tasks: GeneratedTask[] = []
    const count = budget[f] ?? 0
    const localIds: string[] = []

    for (let t = 0; t < count; t += 1) {
      const phase = 1 + Math.floor(t / Math.max(1, options.tasksPerPhase))
      const seq = (t % Math.max(1, options.tasksPerPhase)) + 1
      const localId = `${String(phase)}.${String(seq)}`
      localIds.push(localId)
      const status = statusAt(rand, taskIndex, options.statusWeights)
      statusCounts[status] = (statusCounts[status] ?? 0) + 1
      tasks.push({
        stem: `${localId}-t${String(t + 1)}`,
        localId,
        title: titleOf(rand, taskIndex),
        status,
        type: TASK_TYPES[Math.floor(rand() * (TASK_TYPES.length - 1))] ?? 'coding.feature',
        dependencies: [],
        record: null,
      })
      taskIndex += 1
    }

    // Phase gate tails (`<phase>.gate`) — real-repo form (e.g. 5.gate). A
    // feature thinned to zero regular tasks carries no gate either (the
    // allocator's trim may empty late features to hit the exact total).
    const phaseCount = Math.ceil(count / Math.max(1, options.tasksPerPhase))
    if (options.gates && count > 0) {
      for (let phase = 1; phase <= phaseCount; phase += 1) {
        const localId = `${String(phase)}.gate`
        localIds.push(localId)
        const status = statusAt(rand, taskIndex, options.statusWeights)
        statusCounts[status] = (statusCounts[status] ?? 0) + 1
        tasks.push({
          stem: `${localId}-gate`,
          localId,
          title: `phase ${String(phase)} gate — fixture 收口`,
          status,
          type: 'gate',
          dependencies: [],
          record: null,
        })
        taskIndex += 1
      }
    }

    // Dependencies: 1-3 earlier same-feature ids (chains + diamonds), then the
    // dangling slice rewires a fraction to the never-generated target.
    const existing = [...new Set(tasks.map(task => task.localId))]
    for (const task of tasks) {
      const position = existing.indexOf(task.localId)
      if (position <= 0) continue
      const blockers = Math.min(position, 1 + Math.floor(rand() * 3))
      const picked = new Set<string>()
      for (let b = 0; b < blockers; b += 1) {
        // Recent predecessors (chain bias) with occasional long jumps (diamonds).
        const back = 1 + Math.floor(rand() * Math.min(position, 4))
        const candidate = existing[position - back]
        if (candidate !== undefined) picked.add(candidate)
      }
      for (const target of picked) {
        if (rand() < options.danglingRate) {
          task.dependencies.push(DANGLING_TARGET)
          dangling.push({ featureSlug: slug, target: DANGLING_TARGET })
        } else {
          task.dependencies.push(target)
        }
        edgeCount += 1
      }
    }

    // Records on a deterministic slice; actor mix = session / terminal / none.
    for (const task of tasks) {
      if (rand() >= options.recordRate) continue
      const roll = rand()
      const actor = roll < 0.45 ? `session:fixture-${slug.slice(-4)}-${task.localId.replaceAll('.', '-')}` : roll < 0.7 ? 'terminal' : null
      if (actor !== null && actor.startsWith('session:')) recordsWithSessionActor += 1
      if (actor === 'terminal') recordsWithTerminalActor += 1
      task.record = {
        actor,
        summary: RECORD_SUMMARIES[Math.floor(rand() * RECORD_SUMMARIES.length)] ?? 'fixture record',
        completed: timestampOf(rand),
      }
      tasksWithRecord += 1
    }

    features.push({ slug, status, docKinds, tasks })
  }

  const facts: TaskSetFacts = {
    taskCount: features.reduce((sum, feature) => sum + feature.tasks.length, 0),
    featureCount: features.length,
    statusCounts,
    edgeCount,
    dangling,
    tasksWithRecord,
    recordsWithSessionActor,
    recordsWithTerminalActor,
  }
  return { options, features, facts }
}

/** The SC1 preset: 500 tasks across 50 features (tech-design Key Test Scenarios). */
export function sc1TaskSet(seed = 'sc1'): GeneratedTaskSet {
  return generateTaskSet({ seed, taskCount: 500, featureCount: 50 })
}
