// tests/e2e/specs/project-workbench-home/harness — the journey's worlds and
// project-center navigation dialect (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m4/testing/project-workbench-home/
// contracts/step-{1..6}-*.md. Worlds:
//   main — project A `wb-home-a`(活跃承载:1 feature + 3 tasks + 2 proposals
//          + 1 stage asset + 1 REAL 派发会话语料)+ project B `wb-home-b`
//          (第二项目,pre-boot 经内核 archive 位入归档分区 —— 树枚举/切换/
//          归档分区语料);activeProjectId 经树行点击(用户径)落位;
//   bare — 零注册表世界(freshUserDataDir;Step 1 空态腿);
//   big  — 500 任务 SC1 preset 世界(Step 6 首屏 ≤2s 计测;sc6 同款纪律)。
// The M4 SC-leg techniques (sc1/sc2/sc6) ride the shared _lib/m4-world.

import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { freshUserDataDir } from '../../helpers/app.ts'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import {
  bootM4World, freshRoot, m4Env, type M4World, type M4WorldManager,
} from '../_lib/m4-world.ts'
import { buildKernelWorld, handBuiltTaskSet, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'
import { writeForgeProject } from '../../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { openDatabase } from '../../../../apps/desktop/src/main/workbench/store/db.ts'
import { registerProject, setProjectArchived } from '../../../../apps/desktop/src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../../../../apps/desktop/src/main/workbench/indexer/scan.ts'

/** Project A's corpus vocabulary (the 活跃承载 project). */
export const FEATURE = 'wb-home-a'
export const TASK_EXEC = `${FEATURE}/1.1` // in_progress(无 active 挂接 → 执行中段 idle)
export const TASK_FREE = `${FEATURE}/1.2` // zero-dep pending
export const TASK_DEP = `${FEATURE}/1.3` // deps [1.2] → the DAG edge
export const PROP_LINKED = FEATURE // feature-associated WITH eval(互跳 chip)
export const PROP_ORPHAN = 'wb-home-orphan'
/** The REAL 派发会话语料 id(cwd = A 的 codeRoot;树会话行语料)。 */
export const SESS_A = 'wb-home-sess-a'

/** Project B's corpus vocabulary (the 第二/切换目标 project, archived). */
export const OTHER_FEATURE = 'wb-home-b'
export const TASK_OTHER = `${OTHER_FEATURE}/1.1`

const MAIN_TASKS: readonly TaskSpec[] = [
  { stem: '1.1', localId: '1.1', title: 'wb home in-progress task', status: 'in_progress', type: 'coding.feature', dependencies: [] },
  { stem: '1.2', localId: '1.2', title: 'wb home dispatchable task', status: 'pending', type: 'coding.feature', dependencies: [] },
  { stem: '1.3', localId: '1.3', title: 'wb home dependent task', status: 'pending', type: 'coding.feature', dependencies: ['1.2'] },
]

/**
 * Seed project B (the 切换目标) into A's kernel db PRE-BOOT and archive it
 * (the 内核 archive 位 — the tree's 归档分区 corpus). B carries its own
 * session-less minimal corpus + its own codeRoot (kept ALIVE on disk).
 */
async function seedArchivedSecondProject(root: string, userDataDir: string, options: { readonly archive: boolean }): Promise<{ projectId: string, codeRoot: string }> {
  const set = handBuiltTaskSet(
    { slug: OTHER_FEATURE, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-wb-home-b' },
    [{ stem: '1.1', localId: '1.1', title: 'wb home other project task', status: 'pending', type: 'coding.feature', dependencies: [] }],
  )
  const written = writeForgeProject(set, { codeRoot: join(root, 'repo-b') })
  const { db } = await openDatabase(userDataDir)
  try {
    const project = registerProject(db, { codeRoot: written.codeRoot, docLocationType: 'in_repo' })
    scanForgeFiles(db, { id: project.id, codeRoot: written.codeRoot, docLocationPath: null })
    if (options.archive) setProjectArchived(db, project.id, true)
    return { projectId: project.id, codeRoot: written.codeRoot }
  } finally {
    db.close()
  }
}

/** Build the main journey root (kernel A + second project B + REAL session corpus).
 * Variants: `archiveOther` (default true — the 归档分区 corpus) and
 * `removeOtherCodeRoot` (the path-degraded switch leg's 布景). */
export async function buildMainJourneyRoot(options: {
  readonly archiveOther?: boolean
  readonly removeOtherCodeRoot?: boolean
} = {}): Promise<{ root: string, dshHome: string, kernel: KernelWorld, other: { projectId: string, codeRoot: string } }> {
  const root = freshRoot(options.removeOtherCodeRoot === true ? 'm4-wb-home-degraded' : 'm4-wb-home')
  const kernel = await buildKernelWorld(root, {
    feature: { slug: FEATURE, status: 'in-progress', docKinds: ['prd', 'design', 'tasks'], seed: 'dsh-forge-m4-wb-home' },
    tasks: MAIN_TASKS,
    stageAssets: [
      { stage: 'design', goal: 'wb home stage asset', summaryMark: '阶段资产行(概览 feature 面 corpus)。' },
    ],
    proposals: [
      {
        slug: PROP_LINKED, status: 'accepted', author: 'wb-home-author', created: '2026-09-29T10:00:00.000Z',
        title: '工作台主线关联提案', mark: 'feature 关联提案(互跳 chip 语料)。', evalReport: '# WB eval 报告\n\neval 文档行语料。\n',
      },
      { slug: PROP_ORPHAN, status: 'draft', author: 'wb-home-author', created: '2026-09-29T11:00:00.000Z', title: '工作台孤儿提案', mark: '无关联 feature、无 eval。' },
    ],
  })
  const other = await seedArchivedSecondProject(root, kernel.userDataDir, { archive: options.archiveOther ?? true })
  if (options.removeOtherCodeRoot === true) {
    // The path-degraded switch leg's 布景:B 的代码区目录不可达(注册行仍在)。
    rmSync(other.codeRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
  const dshHome = join(root, 'dsh-home')
  mkdirSync(dshHome, { recursive: true })
  await seedLineageCorpus({
    dshHome,
    seeds: [{ sessionId: SESS_A, cwd: kernel.codeRoot, createdAt: Date.now() - 60_000, title: 'WB 会话 alpha', turnStart: true }],
  })
  return { root, dshHome, kernel, other }
}

/** Boot the main world over the journey root (isolated DSH_HOME). */
export async function bootMainWorld(manager: M4WorldManager, tag: string, built: {
  readonly root: string, readonly dshHome: string, readonly kernel: KernelWorld,
}): Promise<M4World> {
  return await manager.acquire(async () => await bootM4World({
    tag, root: built.root, dshHome: built.dshHome, kernel: built.kernel,
    env: m4Env(built.dshHome),
  }))
}

/** Boot the bare world (zero-project registry; the empty-first-boot leg). */
export async function bootBareWorld(manager: M4WorldManager, tag: string): Promise<{ world: M4World, root: string }> {
  const root = freshRoot('m4-wb-home-bare')
  const dshHome = join(root, 'dsh-home')
  mkdirSync(dshHome, { recursive: true })
  const { launchWorkbenchShell } = await import('../../helpers/app.ts')
  const world = await manager.acquire(async () => {
    const shell = await launchWorkbenchShell({ userDataDir: freshUserDataDir('m4-wb-home-bare'), rootDir: root, env: m4Env(dshHome) })
    return {
      tag, shell, page: shell.page, kernel: {
        root, codeRoot: root, docsRoot: root, featuresRoot: root,
        userDataDir: shell.userDataDir as string, projectId: '', featureSlug: '', set: handBuiltTaskSet(
          { slug: 'bare', status: 'tasks', docKinds: [], seed: 'bare' }, [],
        ),
      }, root, dshHome, stub: null, mainLog: [],
    } satisfies M4World
  })
  return { world, root }
}
