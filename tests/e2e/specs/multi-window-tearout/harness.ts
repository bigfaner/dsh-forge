// tests/e2e/specs/multi-window-tearout/harness — the journey's worlds and the
// C10 拆出/收回 dialect (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m4/testing/multi-window-tearout/
// contracts/step-{1..6}-*.md. Worlds:
//   main — 项目 A `mw-tear`(2 任务)+ REAL 会话语料(TOP_A 带 subagent 后代
//          + TOP_B 闭 turn 会话 = conversation chrome/C9 座位);
//   dual — A + 项目 B `mw-other`(主窗切换边界语料)。
// Techniques: sc4 ③④(pane 头 [拆出为窗口] → waitForDetachedBoard;双窗并行
// 互不干扰;OS 关主窗 = 托盘驻留;退出漏斗 = 计数归零;第二实例锁挡退)。
//
// 边界口径(index.ts 接线注记):[分屏] 的「会话旁置」行在当前接线为 DISABLED
// (aside 目标解析器缺席,C5/C6 跳转缝供给前永不激活)—— conversation 型拆出
// 经由旁置路径不可达;窗口集合/几何/记忆语义对 DetachedViewKind 类型无关,
// 复数窗腿以双 board 窗承载(见 step-5 注记)。

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import {
  bootM4World, ensureBoardPaneDetachable, ensureProjectGroupExpanded, ensureSplitActive,
  freshRoot, m4Env, openTreeSession, pickSplitBoard, type M4World, type M4WorldManager,
} from '../_lib/m4-world.ts'
import { buildKernelWorld, handBuiltTaskSet, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'
import { writeForgeProject } from '../../../../apps/desktop/e2e/fixtures/forge-project.ts'

/** Project A's corpus vocabulary (the tearout subject). */
export const FEATURE = 'mw-tear'
export const TASK_BOARD = `${FEATURE}/1.1`
export const TASK_FREE = `${FEATURE}/1.2`
/** Project B's corpus vocabulary (the 主窗切换 target)。 */
export const OTHER_FEATURE = 'mw-other'
export const TASK_OTHER = `${OTHER_FEATURE}/1.1`

/** The REAL 会话语料 ids。 */
export const TOP_A = 'mw-sess-top-a'
export const SUB_A = 'mw-sess-sub-a'
export const TOP_B = 'mw-sess-top-b'

const MAIN_TASKS: readonly TaskSpec[] = [
  { stem: '1.1', localId: '1.1', title: 'mw tearout board task', status: 'in_progress', type: 'coding.feature', dependencies: [] },
  { stem: '1.2', localId: '1.2', title: 'mw tearout second task', status: 'pending', type: 'coding.feature', dependencies: [] },
]

export interface MwJourneyRoot {
  readonly root: string
  readonly dshHome: string
  readonly kernel: KernelWorld
  readonly other: { readonly projectId: string, readonly codeRoot: string } | null
}

/** The A lineage seeds(subagent 收起语料 + conversation chrome 承载)。 */
export function mwSeeds(codeRoot: string, now: number) {
  return [
    { sessionId: TOP_A, cwd: codeRoot, createdAt: now - 1_000, title: 'MW 顶层会话 A' },
    { sessionId: SUB_A, cwd: codeRoot, createdAt: now - 500, parentSession: TOP_A, origin: 'subagent' as const, mode: 'continuable' as const, label: 'MW subagent 后代', title: 'MW subagent 后代' },
    { sessionId: TOP_B, cwd: codeRoot, createdAt: now - 60_000, title: 'MW 顶层会话 B', turnStart: true },
  ]
}

/** Build the tearout journey root(`dual` adds project B)。 */
export async function buildMwJourneyRoot(options: { readonly dual?: boolean } = {}): Promise<MwJourneyRoot> {
  const root = freshRoot(options.dual === true ? 'm4-mw-dual' : 'm4-mw')
  const kernel = await buildKernelWorld(root, {
    feature: { slug: FEATURE, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-mw' },
    tasks: MAIN_TASKS,
  })
  let other: { projectId: string, codeRoot: string } | null = null
  if (options.dual === true) {
    const setB = handBuiltTaskSet(
      { slug: OTHER_FEATURE, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-mw-b' },
      [{ stem: '1.1', localId: '1.1', title: 'mw other project task', status: 'pending', type: 'coding.feature', dependencies: [] }],
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
  await seedLineageCorpus({ dshHome, seeds: mwSeeds(kernel.codeRoot, Date.now()) })
  return { root, dshHome, kernel, other }
}

/** Boot the tearout world over the journey root (isolated DSH_HOME)。 */
export async function bootMwWorld(manager: M4WorldManager, tag: string, built: MwJourneyRoot): Promise<M4World> {
  return await manager.acquire(async () => await bootM4World({
    tag, root: built.root, dshHome: built.dshHome, kernel: built.kernel,
    env: m4Env(built.dshHome),
  }))
}

/**
 * Drive the world to the tearout-ready state:project active + 会话打开
 * (conversation chrome)+ split-active(pane 头动作位在座)。
 */
export async function reachTearoutReady(page: Page, projectId: string): Promise<void> {
  await ensureProjectGroupExpanded(page, projectId)
  await openTreeSession(page, TOP_B)
  await page.locator('[data-composer-card] [contenteditable="true"]').first()
    .waitFor({ state: 'visible', timeout: 20_000 })
  await pickSplitBoard(page)
  await ensureSplitActive(page)
  // calibration r2(plumbing harden):后置条件收紧到消费者真实所需 —— 拆出
  // 动作位在场且可用(pane 头挂载 = split-active ∧ 该 pane 为 board)。round 2
  // 实测两例:separator 在场(ensureSplitActive 通过)而 board pane 未落位,
  // 后续 clickStable(pane-detach) 19s 不可达 —— ensureBoardPaneDetachable
  // 的自愈环(pickSplitBoard 重试)正是该后置条件的确定性承载。
  await ensureBoardPaneDetachable(page)
}

/** The session composer's contenteditable host。 */
export const composerInput = (page: Page) =>
  page.locator('[data-composer-card] [contenteditable="true"]').first()
