// tests/e2e/specs/task-session-roundtrip/harness — the journey's worlds, the
// 血缘 corpus, and the C5 dock dialect (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m4/testing/task-session-roundtrip/
// contracts/step-{1..7}-*.md. Worlds:
//   main — 项目 `rt-trace`:任务族(TASK_MAIN 挂接承载 in_progress / TASK_NOLINK
//          零挂接 in_progress / TASK_TERMINAL 终态零挂接 / TASK_PLAIN 无后代
//          顶层挂接 / TASK_GHOST 幽灵挂接 / TASK_AMB1+AMB2 一话多任务 /
//          )+ REAL 血缘语料(TOP_A 三后代:遵循/嵌套/改名桩;TOP_B 一后代;
//          TOP_M 24 后代 = 查看全部;TOP_PLAIN 无后代;TOP_AMB 共用)。
// Techniques: sc7(血缘语料 = stub 协议扩展 → REAL persistence backend;挂接
// 登记 = recordSessionLink/endSessionLink 真动词;行展开/[打开] 双通道;C6
// 元数据条三态;命名遵循率固定桩)。

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { seedLineageCorpus, namingCompliantName, MANY_DESCENDANT_COUNT } from '../../stubs/lineage-corpus.ts'
import {
  bootM4World, freshRoot, m4Env, type M4World, type M4WorldManager,
} from '../_lib/m4-world.ts'
import { buildKernelWorld, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'

/** The feature + task vocabulary(ids are stable anchors)。 */
export const FEATURE = 'rt-trace'
export const TASK_MAIN = `${FEATURE}/2.1` // in_progress;active → TOP_A;ended → M/B
export const TASK_NOLINK = `${FEATURE}/2.2` // in_progress;零挂接(no-link 态)
export const TASK_TERMINAL = `${FEATURE}/2.3` // completed;零挂接(no-link + 发起禁用)
export const TASK_PLAIN = `${FEATURE}/2.4` // in_progress;active → TOP_PLAIN(无后代)
export const TASK_GHOST = `${FEATURE}/2.5` // in_progress;active → 幽灵会话(open-failed)
export const TASK_AMB1 = `${FEATURE}/2.6` // in_progress;active → TOP_AMB(共用)
export const TASK_AMB2 = `${FEATURE}/2.7` // in_progress;active → TOP_AMB(共用)
export const TITLE_MAIN = 'rt trace main task'
export const TITLE_NOLINK = 'rt trace nolink task'
export const TITLE_TERMINAL = 'rt trace terminal task'
export const TITLE_PLAIN = 'rt trace plain task'
export const TITLE_GHOST = 'rt trace ghost task'
export const TITLE_AMB1 = 'rt trace ambiguity task one'
export const TITLE_AMB2 = 'rt trace ambiguity task two'

/** The REAL 会话语料 ids。 */
export const TOP_A = 'rt-sess-top-a'
export const SUB_OK = 'rt-sess-sub-ok' // 命名遵循(continuable)
export const SUB_NESTED = 'rt-sess-sub-nested' // depth-2(one-shot)
export const SUB_RENAMED = 'rt-sess-sub-renamed' // 手工改名桩(冲突语料)
export const TOP_B = 'rt-sess-top-b' // TASK_MAIN 的 ended 挂接(一后代)
export const SUB_B = 'rt-sess-sub-b'
export const TOP_M = 'rt-sess-top-many' // 查看全部语料(MANY 后代)
export const TOP_PLAIN = 'rt-sess-top-plain' // 无后代顶层(3b 无命中)
export const TOP_AMB = 'rt-sess-top-amb' // 一话多任务共用顶层
export const SUB_AMB = 'rt-sess-sub-amb'
export const GHOST_SESSION = 'rt-ghost-session' // 从不落盘(幽灵挂接)
export const RENAME_STUB = '手工改名桩 rt renamed stub'

const RT_TASKS: readonly TaskSpec[] = [
  { stem: '2.1', localId: '2.1', title: TITLE_MAIN, status: 'in_progress', type: 'coding.feature', dependencies: [] },
  { stem: '2.2', localId: '2.2', title: TITLE_NOLINK, status: 'in_progress', type: 'coding.feature', dependencies: [] },
  { stem: '2.3', localId: '2.3', title: TITLE_TERMINAL, status: 'completed', type: 'coding.feature', dependencies: [] },
  { stem: '2.4', localId: '2.4', title: TITLE_PLAIN, status: 'in_progress', type: 'coding.feature', dependencies: [] },
  { stem: '2.5', localId: '2.5', title: TITLE_GHOST, status: 'in_progress', type: 'coding.feature', dependencies: [] },
  { stem: '2.6', localId: '2.6', title: TITLE_AMB1, status: 'in_progress', type: 'coding.feature', dependencies: [] },
  { stem: '2.7', localId: '2.7', title: TITLE_AMB2, status: 'in_progress', type: 'coding.feature', dependencies: [] },
]

/** The 血缘 corpus(REAL persistence 预种;命名遵循率固定桩)。 */
export function rtSeeds(codeRoot: string, now: number) {
  const compliant = namingCompliantName(TASK_MAIN, TITLE_MAIN)
  const seeds = [
    { sessionId: TOP_A, cwd: codeRoot, createdAt: now - 1_000, title: 'RT 顶层会话 A' },
    // 命名遵循桩:descriptor label 与 durable title 双写一致(「任务 id + title」)。
    { sessionId: SUB_OK, cwd: codeRoot, createdAt: now - 500, parentSession: TOP_A, origin: 'subagent' as const, mode: 'continuable' as const, label: compliant, title: compliant },
    { sessionId: SUB_NESTED, cwd: codeRoot, createdAt: now - 400, parentSession: SUB_OK, origin: 'subagent' as const, mode: 'one-shot' as const, label: compliant, title: compliant },
    { sessionId: SUB_RENAMED, cwd: codeRoot, createdAt: now - 300, parentSession: TOP_A, origin: 'subagent' as const, mode: 'continuable' as const, label: compliant, title: RENAME_STUB },
    { sessionId: TOP_B, cwd: codeRoot, createdAt: now - 60_000, title: 'RT 顶层会话 B', turnStart: true },
    { sessionId: SUB_B, cwd: codeRoot, createdAt: now - 59_000, parentSession: TOP_B, origin: 'subagent' as const, mode: 'one-shot' as const, label: namingCompliantName(TASK_AMB2, TITLE_AMB2), title: namingCompliantName(TASK_AMB2, TITLE_AMB2) },
    { sessionId: TOP_M, cwd: codeRoot, createdAt: now - 120_000, title: 'RT 查看全部语料 M' },
    { sessionId: TOP_PLAIN, cwd: codeRoot, createdAt: now - 30_000, title: 'RT 无后代顶层', turnStart: true },
    { sessionId: TOP_AMB, cwd: codeRoot, createdAt: now - 20_000, title: 'RT 一话多任务顶层', turnStart: true },
    { sessionId: SUB_AMB, cwd: codeRoot, createdAt: now - 19_000, parentSession: TOP_AMB, origin: 'subagent' as const, mode: 'continuable' as const, label: namingCompliantName(TASK_AMB1, TITLE_AMB1), title: namingCompliantName(TASK_AMB1, TITLE_AMB1) },
  ]
  for (let index = 0; index < MANY_DESCENDANT_COUNT; index += 1) {
    seeds.push({
      sessionId: `rt-sess-many-${String(index).padStart(2, '0')}`,
      cwd: codeRoot, createdAt: now - 119_000 + index,
      parentSession: TOP_M, origin: 'subagent', mode: 'one-shot', label: `${namingCompliantName(TASK_MAIN, TITLE_MAIN)} #${String(index)}`,
    })
  }
  return seeds
}

/** Build the roundtrip journey root(kernel + REAL 血缘语料)。 */
export async function buildRtJourneyRoot(): Promise<{ root: string, dshHome: string, kernel: KernelWorld }> {
  const root = freshRoot('m4-rt')
  const kernel = await buildKernelWorld(root, {
    feature: { slug: FEATURE, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-rt' },
    tasks: RT_TASKS,
  })
  const dshHome = join(root, 'dsh-home')
  mkdirSync(dshHome, { recursive: true })
  await seedLineageCorpus({ dshHome, seeds: rtSeeds(kernel.codeRoot, Date.now()) })
  return { root, dshHome, kernel }
}

/** Boot the roundtrip world over the journey root(isolated DSH_HOME)。 */
export async function bootRtWorld(manager: M4WorldManager, tag: string, built: { root: string, dshHome: string, kernel: KernelWorld }): Promise<M4World> {
  return await manager.acquire(async () => await bootM4World({
    tag, root: built.root, dshHome: built.dshHome, kernel: built.kernel,
    env: m4Env(built.dshHome),
  }))
}

/**
 * Register the 挂接 history through the REAL verbs(recordSessionLink /
 * endSessionLink):TASK_MAIN = active(TOP_A)+ ended(M 新于 B);GHOST = active
 * (幽灵会话);PLAIN = active(无后代顶层);AMB1/AMB2 = 双 active(TOP_AMB)。
 */
export async function registerRtLinks(page: import('@playwright/test').Page, kernel: KernelWorld): Promise<void> {
  const { bridgeInvoke } = await import('../_lib/m4-world.ts')
  await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{ projectId: kernel.projectId, taskKey: TASK_MAIN, sessionId: TOP_A }])
  const linkB = await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{ projectId: kernel.projectId, taskKey: TASK_MAIN, sessionId: TOP_B }])
  await bridgeInvoke<void>(page, 'endSessionLink', [linkB.id])
  const linkM = await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{ projectId: kernel.projectId, taskKey: TASK_MAIN, sessionId: TOP_M }])
  await bridgeInvoke<void>(page, 'endSessionLink', [linkM.id])
  await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{ projectId: kernel.projectId, taskKey: TASK_PLAIN, sessionId: TOP_PLAIN }])
  await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{ projectId: kernel.projectId, taskKey: TASK_GHOST, sessionId: GHOST_SESSION }])
  await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{ projectId: kernel.projectId, taskKey: TASK_AMB1, sessionId: TOP_AMB }])
  await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{ projectId: kernel.projectId, taskKey: TASK_AMB2, sessionId: TOP_AMB }])
}
