// e2e fixture: synthetic forge project writer (task 6.1).
//
// Renders a GeneratedTaskSet (task-generator.ts) into the EXACT dialect the
// 2.5 indexer consumes — the live-repo form, verified against
// apps/desktop/src/main/workbench/indexer/{parse-feature,parse-task}.ts:
//
//   <root>/.forge/state.json                                  (checkout marker)
//   <docsRoot>/docs/features/<slug>/manifest.md               (frontmatter status)
//   <docsRoot>/docs/features/<slug>/prd/prd-spec.md           (optional kinds)
//   <docsRoot>/docs/features/<slug>/design/tech-design.md
//   <docsRoot>/docs/features/<slug>/ui/ui-design.md
//   <docsRoot>/docs/features/<slug>/tasks/index.json          (authority file)
//   <docsRoot>/docs/features/<slug>/tasks/<stem>.md           (description body)
//   <docsRoot>/docs/features/<slug>/tasks/records/<stem>.md   (execution records)
//
// `docsRoot` defaults to the codeRoot (in_repo form); passing a separate
// docsRoot produces the SC5 仓外 doc_location shape (6.4's leg registers with
// docLocationType 'external' + docLocationPath = docsRoot). Byte-stable: the
// same task set renders the same file bytes (only mtimes differ per write).
//
// Hard Rules: generated trees only ever live under caller-owned temp roots;
// nothing is committed, and removeForgeProject cleans the whole tree.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GeneratedFeature, GeneratedTask, GeneratedTaskSet } from './task-generator.ts'

export interface ForgeProjectLocation {
  /** Registered codeRoot candidate (the forge checkout). */
  readonly codeRoot: string
  /**
   * Where docs/features lives. Default: codeRoot (in_repo). A separate path
   * produces the external doc-location shape (SC5).
   */
  readonly docsRoot?: string
}

export interface WrittenForgeProject {
  readonly codeRoot: string
  readonly docsRoot: string
  /** Absolute path of each feature's authority file (mutation entry points). */
  readonly indexPaths: ReadonlyArray<{ readonly slug: string; readonly path: string }>
  /** Absolute manifest paths (5.15's dialect-gate file). */
  readonly manifestPaths: readonly string[]
  /** The docs/features directory (the forge-detect probe target). */
  readonly featuresDir: string
}

/** Serialize one feature's index.json body (2-space + trailing newline, repo form). */
export function tasksIndexJson(feature: GeneratedFeature): string {
  const tasks: Record<string, Record<string, unknown>> = {}
  for (const task of feature.tasks) {
    tasks[task.stem] = {
      id: task.localId,
      title: task.title,
      status: task.status,
      dependencies: [...task.dependencies],
      ...(task.type === '' ? {} : { type: task.type }),
      file: `${task.stem}.md`,
      ...(task.record === null ? {} : { record: `records/${task.stem}.md` }),
    }
  }
  return `${JSON.stringify({ tasks }, undefined, 2)}\n`
}

/** Render one task's description .md body (the detail dock's source). */
export function taskMarkdown(task: GeneratedTask, featureSlug: string): string {
  return [
    `# ${task.localId} — ${task.title}`,
    '',
    `Fixture task body for ${featureSlug}/${task.localId} (status: ${task.status}, type: ${task.type}).`,
    task.dependencies.length > 0 ? `Blockers: ${task.dependencies.join(', ')}.` : 'No blockers.',
    '',
    `Deterministic description for the ${featureSlug} fixture — rendered by the 6.1 project writer.`,
    '',
  ].join('\n')
}

/** Render one task's execution record .md (frontmatter + `## Summary`). */
export function recordMarkdown(task: GeneratedTask): string {
  const record = task.record
  if (record === null) throw new Error(`task ${task.localId} has no record to render`)
  return [
    '---',
    'status: "completed"',
    `started: "${record.completed}"`,
    `completed: "${record.completed}"`,
    'time_spent: "~1m"',
    ...(record.actor === null ? [] : [`actor: "${record.actor}"`]),
    '---',
    '',
    `# Task Record: ${task.localId} ${task.title}`,
    '',
    '## Summary',
    record.summary,
    '',
  ].join('\n')
}

/** Render a feature manifest.md (frontmatter status — the dialect gate). */
export function manifestMarkdown(feature: GeneratedFeature): string {
  return `---\nstatus: ${feature.status}\n---\n# ${feature.slug}\n\nFixture feature rendered by the 6.1 project writer (doc kinds: ${['manifest', ...feature.docKinds, 'tasks'].join(', ')}).\n`
}

/** Optional five-doc bodies (doc_kinds probe anchors). */
function optionalDocBody(feature: GeneratedFeature, kind: 'prd' | 'design' | 'ui'): string {
  return `# ${feature.slug} ${kind} fixture\n\nDeterministic ${kind} document body (6.1 writer).\n`
}

/**
 * Write the complete forge project tree for a generated task set. Creates
 * directories as needed; overwrites existing files (idempotent re-render).
 */
export function writeForgeProject(set: GeneratedTaskSet, location: ForgeProjectLocation): WrittenForgeProject {
  const codeRoot = location.codeRoot
  const docsRoot = location.docsRoot ?? codeRoot
  mkdirSync(join(codeRoot, '.forge'), { recursive: true })
  writeFileSync(join(codeRoot, '.forge', 'state.json'), `${JSON.stringify({ fixture: true, seed: set.options.seed, renderedFeatures: set.features.length }, undefined, 2)}\n`)
  const featuresDir = join(docsRoot, 'docs', 'features')
  const indexPaths: Array<{ slug: string; path: string }> = []
  const manifestPaths: string[] = []
  for (const feature of set.features) {
    const featureDir = join(featuresDir, feature.slug)
    const tasksDir = join(featureDir, 'tasks')
    mkdirSync(tasksDir, { recursive: true })
    const manifestPath = join(featureDir, 'manifest.md')
    writeFileSync(manifestPath, manifestMarkdown(feature))
    manifestPaths.push(manifestPath)
    const indexPath = join(tasksDir, 'index.json')
    writeFileSync(indexPath, tasksIndexJson(feature))
    indexPaths.push({ slug: feature.slug, path: indexPath })
    for (const task of feature.tasks) {
      writeFileSync(join(tasksDir, `${task.stem}.md`), taskMarkdown(task, feature.slug))
      if (task.record !== null) {
        mkdirSync(join(tasksDir, 'records'), { recursive: true })
        writeFileSync(join(tasksDir, 'records', `${task.stem}.md`), recordMarkdown(task))
      }
    }
    if (feature.docKinds.includes('prd')) {
      mkdirSync(join(featureDir, 'prd'), { recursive: true })
      writeFileSync(join(featureDir, 'prd', 'prd-spec.md'), optionalDocBody(feature, 'prd'))
    }
    if (feature.docKinds.includes('design')) {
      mkdirSync(join(featureDir, 'design'), { recursive: true })
      writeFileSync(join(featureDir, 'design', 'tech-design.md'), optionalDocBody(feature, 'design'))
    }
    if (feature.docKinds.includes('ui')) {
      mkdirSync(join(featureDir, 'ui'), { recursive: true })
      writeFileSync(join(featureDir, 'ui', 'ui-design.md'), optionalDocBody(feature, 'ui'))
    }
  }
  return { codeRoot, docsRoot, indexPaths, manifestPaths, featuresDir }
}

/** Remove a written project tree (Hard Rule: 测试后清理). */
export function removeForgeProject(root: string): void {
  rmSync(root, { recursive: true, force: true })
}

/**
 * A registration-bridge subset the journeys drive over dshForge.workbench
 * (the 5.11/5.15 precedent — the main-process validation/registry chain runs
 * inside the verb).
 */
export interface RegisterBridge {
  registerProject(input: { codeRoot: string; docLocationType: 'in_repo' | 'external'; docLocationPath?: string }): Promise<{ id: string }>
  activateProject(id: string): Promise<void>
}

/** Register + activate a written fixture over the real renderer bridge. */
export async function registerFixtureProject(page: import('@playwright/test').Page, project: WrittenForgeProject): Promise<string> {
  const external = project.docsRoot !== project.codeRoot
  return await page.evaluate(async (input: { codeRoot: string; docsRoot: string; external: boolean }) => {
    const bridge = (globalThis as { dshForge?: { workbench?: RegisterBridge } }).dshForge?.workbench
    if (bridge?.registerProject === undefined || bridge.activateProject === undefined) {
      throw new Error('dshForge.workbench bridge is unavailable in the e2e renderer')
    }
    const registered = await bridge.registerProject(input.external
      ? { codeRoot: input.codeRoot, docLocationType: 'external', docLocationPath: input.docsRoot }
      : { codeRoot: input.codeRoot, docLocationType: 'in_repo' })
    await bridge.activateProject(registered.id)
    return registered.id
  }, { codeRoot: project.codeRoot, docsRoot: project.docsRoot, external })
}
