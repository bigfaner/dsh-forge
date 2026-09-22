// Task 6.1 fixture self-coverage: the deterministic task-set generator and
// the forge-project writer (AC1/AC2/AC5 — the model side; the journey-side
// smoke rides e2e/forge-fixture-selfcheck).
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FEATURE_STATUSES,
  TASK_STATUSES,
  generateTaskSet,
  sc1TaskSet,
  seededRandom,
} from '../e2e/fixtures/task-generator.ts'
import {
  removeForgeProject,
  tasksIndexJson,
  writeForgeProject,
} from '../e2e/fixtures/forge-project.ts'

const roots: string[] = []
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fixture-unit-'))
  roots.push(root)
  return root
}
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true })
})

describe('task-generator determinism (AC2)', () => {
  it('same seed + options → identical model and identical index.json bytes', () => {
    const a = generateTaskSet({ seed: 'det', taskCount: 40, featureCount: 4 })
    const b = generateTaskSet({ seed: 'det', taskCount: 40, featureCount: 4 })
    expect(JSON.stringify(a.features)).toBe(JSON.stringify(b.features))
    const serialize = (set: typeof a): string => set.features.map(f => tasksIndexJson(f)).join('')
    expect(serialize(a)).toBe(serialize(b))
    expect(a.facts).toEqual(b.facts)
  })

  it('different seeds → different models', () => {
    const a = generateTaskSet({ seed: 'one', taskCount: 30, featureCount: 3 })
    const b = generateTaskSet({ seed: 'two', taskCount: 30, featureCount: 3 })
    expect(JSON.stringify(a.features)).not.toBe(JSON.stringify(b.features))
  })

  it('seededRandom is a stable float stream', () => {
    const draw = (): number[] => Array.from({ length: 5 }, seededRandom('stable'))
    expect(draw()).toEqual(draw())
    expect(draw().every(v => v >= 0 && v < 1)).toBe(true)
  })

  it('rejects non-positive counts', () => {
    expect(() => generateTaskSet({ seed: 'x', taskCount: 0, featureCount: 1 })).toThrow(/taskCount/)
    expect(() => generateTaskSet({ seed: 'x', taskCount: 5, featureCount: 0 })).toThrow(/featureCount/)
  })
})

describe('task-generator dialect fidelity', () => {
  it('every status of the 7-state vocabulary is present (SC1 ground truth)', () => {
    const set = generateTaskSet({ seed: 'vocab', taskCount: 60, featureCount: 5 })
    for (const status of TASK_STATUSES) {
      expect(set.facts.statusCounts[status], `status ${status}`).toBeGreaterThan(0)
    }
    expect(Object.values(set.facts.statusCounts).reduce((a, b) => a + b, 0)).toBe(set.facts.taskCount)
  })

  it('statusWeights bias the distribution (AC2 分布可配置)', () => {
    const set = generateTaskSet({
      seed: 'bias', taskCount: 200, featureCount: 10,
      statusWeights: { completed: 50, pending: 1 },
    })
    expect(set.facts.statusCounts.completed).toBeGreaterThan(set.facts.statusCounts.pending)
  })

  it('feature statuses stay in the manifest vocabulary', () => {
    const set = generateTaskSet({ seed: 'fs', taskCount: 20, featureCount: 10 })
    for (const feature of set.features) {
      expect(FEATURE_STATUSES).toContain(feature.status)
    }
  })

  it('dependencies reference earlier same-feature ids only (DAG), with a dangling slice', () => {
    const set = generateTaskSet({ seed: 'dag', taskCount: 80, featureCount: 4, danglingRate: 0.15 })
    expect(set.facts.dangling.length).toBeGreaterThan(0)
    for (const feature of set.features) {
      const ids = feature.tasks.map(task => task.localId)
      const indexOf = new Map(feature.tasks.map(task => [task.localId, ids.indexOf(task.localId)]))
      for (const task of feature.tasks) {
        for (const dep of task.dependencies) {
          if (dep === '99.1') continue // the never-generated dangling target
          const position = indexOf.get(dep)
          expect(position, `${feature.slug}/${task.localId} dep ${dep}`).toBeDefined()
          expect(position as number).toBeLessThan(indexOf.get(task.localId) as number)
        }
      }
    }
    for (const edge of set.facts.dangling) {
      const feature = set.features.find(f => f.slug === edge.featureSlug)
      expect(feature?.tasks.some(task => task.dependencies.includes(edge.target))).toBe(true)
    }
  })

  it('records carry the actor mix (session/terminal/absent ground truth)', () => {
    const set = generateTaskSet({ seed: 'actor', taskCount: 100, featureCount: 5, recordRate: 0.9 })
    expect(set.facts.tasksWithRecord).toBeGreaterThan(0)
    expect(set.facts.recordsWithSessionActor).toBeGreaterThan(0)
    expect(set.facts.recordsWithTerminalActor).toBeGreaterThan(0)
    const withRecord = set.features.flatMap(f => f.tasks).filter(t => t.record !== null)
    expect(withRecord.length).toBe(set.facts.tasksWithRecord)
    const sessionActors = withRecord.filter(t => t.record?.actor?.startsWith('session:')).length
    const terminalActors = withRecord.filter(t => t.record?.actor === 'terminal').length
    expect(sessionActors).toBe(set.facts.recordsWithSessionActor)
    expect(terminalActors).toBe(set.facts.recordsWithTerminalActor)
  })

  it('the SC1 preset is 500 tasks / 50 features', () => {
    const set = sc1TaskSet('sc1-unit')
    expect(set.facts.taskCount).toBe(500)
    expect(set.facts.featureCount).toBe(50)
    expect(set.facts.edgeCount).toBeGreaterThan(0)
  })
})

describe('forge-project writer (AC1/AC5)', () => {
  it('writes the complete dialect tree the indexer consumes', () => {
    const root = tempRoot()
    const set = generateTaskSet({ seed: 'write', taskCount: 18, featureCount: 2 })
    const written = writeForgeProject(set, { codeRoot: root })
    expect(existsSync(join(root, '.forge', 'state.json'))).toBe(true)
    expect(existsSync(written.featuresDir)).toBe(true)
    for (const { slug, path } of written.indexPaths) {
      expect(existsSync(path)).toBe(true)
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { tasks: Record<string, { id: string; status: string; dependencies: string[]; file: string }> }
      const feature = set.features.find(f => f.slug === slug)
      expect(Object.keys(parsed.tasks).length).toBe(feature?.tasks.length)
      for (const task of feature?.tasks ?? []) {
        const entry = parsed.tasks[task.stem]
        expect(entry.id).toBe(task.localId)
        expect(entry.status).toBe(task.status)
        expect(entry.dependencies).toEqual(task.dependencies)
        expect(existsSync(join(written.featuresDir, slug, 'tasks', entry.file))).toBe(true)
        if (task.record !== null) {
          const recordPath = join(written.featuresDir, slug, 'tasks', 'records', `${task.stem}.md`)
          expect(existsSync(recordPath)).toBe(true)
          const record = readFileSync(recordPath, 'utf8')
          expect(record).toContain('## Summary')
          if (task.record.actor === null) expect(record).not.toContain('actor:')
          else expect(record).toContain(`actor: "${task.record.actor}"`)
        }
      }
      expect(existsSync(join(written.featuresDir, slug, 'manifest.md'))).toBe(true)
    }
  })

  it('byte-stable re-render: same set, same bytes (mtimes aside)', () => {
    const set = generateTaskSet({ seed: 'bytes', taskCount: 12, featureCount: 2 })
    const first = tempRoot()
    const second = tempRoot()
    const a = writeForgeProject(set, { codeRoot: first })
    const b = writeForgeProject(set, { codeRoot: second })
    expect(a.indexPaths.length).toBe(b.indexPaths.length)
    for (let i = 0; i < a.indexPaths.length; i += 1) {
      const pathA = (a.indexPaths[i] as { path: string }).path
      const pathB = (b.indexPaths[i] as { path: string }).path
      expect(readFileSync(pathA, 'utf8')).toBe(readFileSync(pathB, 'utf8'))
    }
    for (let i = 0; i < a.manifestPaths.length; i += 1) {
      expect(readFileSync(a.manifestPaths[i] as string, 'utf8')).toBe(readFileSync(b.manifestPaths[i] as string, 'utf8'))
    }
  })

  it('external docsRoot produces the SC5 shape (codeRoot and docs tree separate)', () => {
    const root = tempRoot()
    const docs = tempRoot()
    const set = generateTaskSet({ seed: 'ext', taskCount: 8, featureCount: 1 })
    const written = writeForgeProject(set, { codeRoot: root, docsRoot: docs })
    expect(written.docsRoot).toBe(docs)
    expect(existsSync(join(root, '.forge', 'state.json'))).toBe(true)
    expect(existsSync(join(docs, 'docs', 'features'))).toBe(true)
    expect(existsSync(join(root, 'docs'))).toBe(false)
  })

  it('removeForgeProject cleans the whole tree (AC5)', () => {
    const root = tempRoot()
    writeForgeProject(generateTaskSet({ seed: 'clean', taskCount: 6, featureCount: 1 }), { codeRoot: root })
    removeForgeProject(root)
    expect(existsSync(root)).toBe(false)
  })
})
