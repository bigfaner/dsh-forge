// e2e/tests/m2/helpers/file-mutate — task 6.3 Implementation Notes file: the
// SC3 fixture mutator (the TERMINAL-side change driver, and the file half of
// the session-side simulation).
//
// What it does: holds a MUTABLE in-memory twin of the GeneratedTaskSet and
// re-renders the exact 6.1 dialect files into the written fixture tree:
//
//   mutateStatus(taskKey, next) — rewrites the feature's tasks/index.json with
//     one task's status flipped. This is the SEMANTIC change the 2.5 diff
//     classifies (sameTaskContent ignores updatedAt/source, so a pure mtime
//     touch is invisible — the status flip is what arms the reflow chain).
//
//   writeRecord(taskKey, actor) — writes records/<stem>.md in the submit-time
//     form (frontmatter `actor:` line = the FORGE_ACTOR passthrough slot,
//     Interface 3 判定序 path ①) AND latches the model record so the NEXT
//     index.json render carries the `record:` pointer (parse-task discovers
//     records through that entry field, never by directory scan).
//
// The judgment-order discipline (source.ts): a session-side change is
// simulated as writeRecord(actor `session:<id>`) + mutateStatus; a
// terminal-side change is mutateStatus alone on a task with no record and no
// active link. Order matters when both apply: record FIRST, status LAST —
// the status write is the t0 anchor of the ≤5s measurement and the one scan
// that fires must see both artifacts.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { recordMarkdown, tasksIndexJson } from '../../../fixtures/forge-project.ts'
import type { WrittenForgeProject } from '../../../fixtures/forge-project.ts'
import type {
  GeneratedFeature, GeneratedTask, GeneratedTaskSet, GeneratedTaskStatus, OptionalDocKind,
} from '../../../../fixtures/task-generator.ts'

/** A mutable twin of one generated task (the model the re-render reads). */
type MutableTask = Omit<GeneratedTask, 'status' | 'record' | 'dependencies' | 'docKinds'>
  & { status: GeneratedTaskStatus; record: GeneratedTask['record']; dependencies: string[] }

/** A mutable twin of one generated feature. */
interface MutableFeature {
  readonly slug: string
  readonly status: GeneratedFeature['status']
  readonly docKinds: OptionalDocKind[]
  readonly tasks: MutableTask[]
}

/** The result of one status mutation (diagnostics + the written file). */
export interface StatusMutation {
  readonly taskKey: string
  readonly indexPath: string
  readonly from: GeneratedTaskStatus
  readonly to: GeneratedTaskStatus
}

/** The mutator face the SC3 legs drive. */
export interface FixtureMutator {
  /** The task's CURRENT status (the model tracks every mutation). */
  statusOf(taskKey: string): GeneratedTaskStatus
  /**
   * A deterministic NEXT status ≠ current (≠ `avoid` when given — the
   * retry-once policy re-mutates a task and needs a third state).
   */
  nextStatusOf(taskKey: string, avoid?: GeneratedTaskStatus): GeneratedTaskStatus
  /** Flip one task's status in the model + rewrite the feature's index.json. */
  mutateStatus(taskKey: string, next: GeneratedTaskStatus): StatusMutation
  /**
   * Write a submit-style record carrying the actor line (path ① input) and
   * latch the model record so the next index.json render points at it.
   */
  writeRecord(taskKey: string, actor: string, summary?: string): string
}

/** Fixed, timezone-free record timestamp (forge `YYYY-MM-DD HH:mm` form). */
const RECORD_STAMP = '2026-09-23 12:00'

/** Clone the generated set into the mutable twin (arrays + records detach). */
function mutableTwin(set: GeneratedTaskSet): MutableFeature[] {
  return set.features.map(feature => ({
    slug: feature.slug,
    status: feature.status,
    docKinds: [...feature.docKinds],
    tasks: feature.tasks.map(task => ({
      ...task,
      dependencies: [...task.dependencies],
    })),
  }))
}

/**
 * Create the mutator over a WRITTEN fixture project. The model and the tree
 * start in sync (the 6.1 writer's exact bytes); every mutation keeps them so.
 */
export function createFixtureMutator(set: GeneratedTaskSet, project: WrittenForgeProject): FixtureMutator {
  const features = mutableTwin(set)
  const indexPathBySlug = new Map(project.indexPaths.map(row => [row.slug, row.path] as const))
  const entryByKey = new Map<string, { feature: MutableFeature; task: MutableTask }>()
  for (const feature of features) {
    for (const task of feature.tasks) {
      entryByKey.set(`${feature.slug}/${task.localId}`, { feature, task })
    }
  }
  const entryOf = (taskKey: string): { feature: MutableFeature; task: MutableTask } => {
    const entry = entryByKey.get(taskKey)
    if (entry === undefined) throw new Error(`file-mutate: unknown task key ${taskKey}`)
    return entry
  }

  return {
    statusOf: taskKey => entryOf(taskKey).task.status,
    nextStatusOf(taskKey, avoid) {
      const current = entryOf(taskKey).task.status
      const order = ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected'] as const
      for (const candidate of order) {
        if (candidate !== current && candidate !== avoid) return candidate
      }
      throw new Error(`file-mutate: no status distinct from ${current}/${String(avoid)}`)
    },
    mutateStatus(taskKey, next) {
      const { feature, task } = entryOf(taskKey)
      const from = task.status
      task.status = next
      const indexPath = indexPathBySlug.get(feature.slug)
      if (indexPath === undefined) throw new Error(`file-mutate: no index.json recorded for ${feature.slug}`)
      // Re-render through the 6.1 writer's own serializer — the dialect stays
      // byte-exact (only the status field — and any latched record pointer —
      // differ from the writer's output).
      writeFileSync(indexPath, tasksIndexJson(feature as GeneratedFeature))
      return { taskKey, indexPath, from, to: next }
    },
    writeRecord(taskKey, actor, summary = 'stub 会话侧变更:claim + 状态推进(fixture 记录)') {
      const { task } = entryOf(taskKey)
      const record = { actor, summary, completed: RECORD_STAMP }
      task.record = record
      const tasksDir = dirname(indexPathBySlug.get(entryOf(taskKey).feature.slug) ?? '')
      const recordPath = join(tasksDir, 'records', `${task.stem}.md`)
      mkdirSync(dirname(recordPath), { recursive: true })
      writeFileSync(recordPath, recordMarkdown({ ...task, record }))
      return recordPath
    },
  }
}
