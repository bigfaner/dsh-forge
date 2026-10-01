// tests/e2e/specs/split-pane-layout-memory/harness — the journey's worlds and
// the split/tree-posture dialect (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m4/testing/split-pane-layout-memory/
// contracts/step-{1..6}-*.md. Worlds:
//   main — 项目 A `sp-split`(2 任务)+ REAL 会话语料:TOP_A(带 subagent 后
//          代 SUB_A,收起语料)+ TOP_B(闭 turn 会话 = conversation chrome 挂
//          载面,C9 [分屏] 座位所依);
//   dual — 项目 A + 项目 B `sp-other`(跨项目布局隔离语料)。
// Techniques: sc4 ①②(C9 split 用户径 + 分隔条键盘模型 + blob 面断言)/
// sc4 树姿态(expandedProjects/expandedSessions + caret 用户径)。
//
// 边界口径(4.5/4.6):vendored 预算 = 两个 docked pane —— 真链可达 split 态 =
// 双 pane 各一 board tab;第三「pane」不可达(以 tab 落位承载,见 step-2 注记)。

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import {
  bootM4World, freshRoot, m4Env, type M4World, type M4WorldManager,
} from '../_lib/m4-world.ts'
import { buildKernelWorld, handBuiltTaskSet, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'
import { writeForgeProject } from '../../../../apps/desktop/e2e/fixtures/forge-project.ts'

/** Project A's corpus vocabulary (the split subject). */
export const FEATURE = 'sp-split'
export const TASK_BOARD = `${FEATURE}/1.1`
export const TASK_FREE = `${FEATURE}/1.2`
/** Project B's corpus vocabulary (the 跨项目隔离 target)。 */
export const OTHER_FEATURE = 'sp-other'

/** The REAL 会话语料 ids(TOP_A 带 subagent 后代;TOP_B = conversation 面)。 */
export const TOP_A = 'sp-sess-top-a'
export const SUB_A = 'sp-sess-sub-a'
export const TOP_B = 'sp-sess-top-b'

const MAIN_TASKS: readonly TaskSpec[] = [
  { stem: '1.1', localId: '1.1', title: 'sp split board task', status: 'in_progress', type: 'coding.feature', dependencies: [] },
  { stem: '1.2', localId: '1.2', title: 'sp split second task', status: 'pending', type: 'coding.feature', dependencies: [] },
]

export interface SpJourneyRoot {
  readonly root: string
  readonly dshHome: string
  readonly kernel: KernelWorld
  readonly other: { readonly projectId: string, readonly codeRoot: string } | null
}

/** The A+B lineage seeds (subagent 收起语料 + conversation chrome 承载)。 */
export function spSeeds(codeRoot: string, now: number) {
  return [
    { sessionId: TOP_A, cwd: codeRoot, createdAt: now - 1_000, title: 'SP 顶层会话 A' },
    { sessionId: SUB_A, cwd: codeRoot, createdAt: now - 500, parentSession: TOP_A, origin: 'subagent' as const, mode: 'continuable' as const, label: 'SP subagent 后代', title: 'SP subagent 后代' },
    { sessionId: TOP_B, cwd: codeRoot, createdAt: now - 60_000, title: 'SP 顶层会话 B', turnStart: true },
  ]
}

/**
 * Build the split-pane journey root:`dual` adds a second project B(pre-boot
 * repo 注册 —— 本旅程无投影断言,读径语料即可)。
 */
export async function buildSpJourneyRoot(options: { readonly dual?: boolean } = {}): Promise<SpJourneyRoot> {
  const root = freshRoot(options.dual === true ? 'm4-sp-dual' : 'm4-sp')
  const kernel = await buildKernelWorld(root, {
    feature: { slug: FEATURE, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-sp' },
    tasks: MAIN_TASKS,
  })
  let other: { projectId: string, codeRoot: string } | null = null
  if (options.dual === true) {
    const setB = handBuiltTaskSet(
      { slug: OTHER_FEATURE, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-sp-b' },
      [{ stem: '1.1', localId: '1.1', title: 'sp other project task', status: 'pending', type: 'coding.feature', dependencies: [] }],
    )
    const writtenB = writeForgeProject(setB, { codeRoot: join(root, 'repo-b') })
    const { openDatabase } = await import('../../../../apps/desktop/src/main/workbench/store/db.ts')
    const { registerProject } = await import('../../../../apps/desktop/src/main/workbench/repos/projects.ts')
    const { scanForgeFiles } = await import('../../../../apps/desktop/src/main/workbench/indexer/scan.ts')
    const { db } = await openDatabase(kernel.userDataDir)
    try {
      const project = registerProject(db, { codeRoot: writtenB.codeRoot, docLocationType: 'in_repo' })
      scanForgeFiles(db, { id: project.id, codeRoot: writtenB.codeRoot, docLocationPath: null })
      other = { projectId: project.id, codeRoot: writtenB.codeRoot }
    } finally {
      db.close()
    }
  }
  const dshHome = join(root, 'dsh-home')
  mkdirSync(dshHome, { recursive: true })
  await seedLineageCorpus({ dshHome, seeds: spSeeds(kernel.codeRoot, Date.now()) })
  return { root, dshHome, kernel, other }
}

/** Boot the split-pane world over the journey root (isolated DSH_HOME). */
export async function bootSpWorld(manager: M4WorldManager, tag: string, built: SpJourneyRoot): Promise<M4World> {
  return await manager.acquire(async () => await bootM4World({
    tag, root: built.root, dshHome: built.dshHome, kernel: built.kernel,
    env: m4Env(built.dshHome),
  }))
}

// ---------------------------------------------------------------------------
// The split/tree-posture dialect (sc4 helpers over the m4-world faces)
// ---------------------------------------------------------------------------

/** One tree-posture read (project-group expansion + subagent 收起)。 */
export async function treePosture(page: Page, projectId: string): Promise<{ projectExpanded: boolean, subagentRows: number }> {
  return await page.evaluate((ids: { project: string, sub: string }) => ({
    projectExpanded: document.querySelector(`[data-dsh-forge-tree-project-toggle="${ids.project}"]`)?.getAttribute('aria-expanded') === 'true',
    subagentRows: document.querySelectorAll(`[data-dsh-forge-tree-session="${ids.sub}"]`).length,
  }), { project: projectId, sub: SUB_A })
}

/** The session composer's contenteditable host(the 输入 assertion's face)。 */
export const composerInput = (page: Page) =>
  page.locator('[data-composer-card] [contenteditable="true"]').first()
