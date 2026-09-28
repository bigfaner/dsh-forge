// @feature dsh-forge-m2 | @web-e2e | @journey sc3-reflow-source
// Traceability: docs/features/dsh-forge-m2/tasks/6.3-sc23-session-injection-flow.md
//
// SC3 验收腿(PRD Story3 状态回流与来源;6.1 演进:M2 发起链随
// ForgeBridge 退役删除,挂接建立腿改为内核 recordSessionLink 动词直调 ——
// 正是 M2 发起成功链在成功侧调用的同一持久腿,回流/来源/挂接历史语义
// 不变;subagent 发起链的 e2e 归 SC3/6.5):
//
//   SC3-1 会话侧变更 → ≤5s [会话] —— 2.5 判定序的两条路径都走:
//     ① actor 标记(记录 frontmatter `actor: session:<id>`,FORGE_ACTOR
//        透传槽的 submit-time 形态)— 在一条「无 active 挂接」的任务上变更,
//        [会话] 只能来自路径①(隔离证明);
//     ② 挂接推断兜底(主路径)— 在已发起(active link)的任务上裸变更
//        (无 actor 记录),[会话] 只能来自路径②。
//   SC3-2 终端侧变更 → ≤5s [终端] — 直接改 fixture 任务文件(helpers/
//     file-mutate),无挂接无 actor,判定序终点 = [终端]。
//   SC3-3 挂接结束→历史回溯 — 同任务再发起(4.2 supersede:旧 active 行
//     置 ended,不删行),详情侧板 挂接历史 呈现 active→ended 全程;
//     records 侧的来源徽标(①路径产物)一并断言。
//
// ≤5s 计量口径(Hard Rule: 真实时钟,不得用假时钟放宽):t0 = 测试进程
// writeFileSync(最后一次语义变更)返回时刻,t1 = 页内 waitForFunction 首次
// 观测到「目标徽标 + 新状态短标签」的时刻(测试进程时钟)。窗口覆盖全链:
// fs 事件 → watcher 400ms debounce → 全量重扫 → 事件批 ≤500ms → IPC 推送
// → 渲染侧 store 400ms debounce → getTaskBoard → 行级渲染(5.15 预算分解
// ≈1.3s worst,余量 3.7s)。CI 波动 → 每腿重试一次并打印分布,阈值不动。
//
// Hard Rules:腿内启动前单实例探测守卫;DSH_FORGE_USER_DATA 隔离;跑腿前
// pnpm build:plugins && pnpm stage:plugin-tarballs。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball,
} from '../../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../../fixtures/forge-project.ts'
import { generateTaskSet } from '../../fixtures/task-generator.ts'
import type { GeneratedTaskStatus } from '../../fixtures/task-generator.ts'
import { zh } from '../../../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'
import { en } from '../../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'
import {
  cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, openTasksBoard,
} from './helpers/restart-app.ts'
import { createFixtureMutator } from './helpers/file-mutate.ts'

/** AC budget: the full 感知+推送+渲染 chain, real clock, never widened. */
const REFLOW_BUDGET_MS = 5_000

/** The wait's failure ceiling — well above budget so a retry leg can measure. */
const REFLOW_WAIT_TIMEOUT_MS = 20_000

/** The short-label locale keys (view-A node cards render the SHORT label). */
const SHORT_LABEL_KEYS: Readonly<Record<GeneratedTaskStatus, keyof typeof zh>> = {
  pending: 'tasks.status.short.pending',
  in_progress: 'tasks.status.short.in_progress',
  completed: 'tasks.status.short.completed',
  blocked: 'tasks.status.short.blocked',
  suspended: 'tasks.status.short.suspended',
  skipped: 'tasks.status.short.skipped',
  rejected: 'tasks.status.short.rejected',
}

/** Both locales' short labels for a status (the shell's `t` seat is either). */
function shortLabelsOf(status: GeneratedTaskStatus): string[] {
  return [zh[SHORT_LABEL_KEYS[status]], en[SHORT_LABEL_KEYS[status]]]
}

/**
 * t0 → t1 measurement of one reflow: the DOM must show the target source badge
 * AND the new status's short label on the task's view-A node card.
 */
async function measureReflow(
  page: Page,
  taskKey: string,
  expectSource: 'session' | 'terminal',
  newStatus: GeneratedTaskStatus,
  apply: () => void,
): Promise<number> {
  const newLabels = shortLabelsOf(newStatus)
  apply() // the semantic file change(s); the LAST write is the t0 anchor
  const t0 = Date.now()
  await page.waitForFunction((input: { key: string; source: string; labels: string[] }) => {
    const card = document.querySelector(`[data-dsh-forge-node-card="${input.key}"]`)
    if (card === null) return false
    const badge = card.querySelector('[data-dsh-forge-badge^="source:"]')
    if (badge?.getAttribute('data-dsh-forge-badge') !== `source:${input.source}`) return false
    const text = card.textContent ?? ''
    return input.labels.some(label => text.includes(label))
  }, { key: taskKey, source: expectSource, labels: newLabels }, { timeout: REFLOW_WAIT_TIMEOUT_MS, polling: 50 })
  return Date.now() - t0
}

/**
 * The Hard-Rule retry policy: try each attempt (each a FRESH mutation) until
 * one lands inside the budget — at most the pool's size, in practice ≤2
 * (retry once); the distribution is ALWAYS printed; the threshold never moves.
 */
async function assertReflowWithinBudget(
  label: string,
  attempts: ReadonlyArray<() => Promise<number>>,
): Promise<void> {
  const samples: number[] = []
  for (const attempt of attempts) {
    samples.push(await attempt())
    if ((samples[samples.length - 1] as number) <= REFLOW_BUDGET_MS) break
  }
  console.log(`[sc3] ${label} reflow(ms)=${JSON.stringify(samples)} budget=${String(REFLOW_BUDGET_MS)} (感知+推送+渲染全链,真实时钟)`)
  expect(
    samples.some(ms => ms <= REFLOW_BUDGET_MS),
    `${label}: ≤${String(REFLOW_BUDGET_MS)}ms not met — distribution ${JSON.stringify(samples)} (Hard Rule: retry once + record distribution, threshold unchanged)`,
  ).toBe(true)
}

/** recordSessionLink 的 bridge 面子集。 */
interface RecordLinkBridge {
  dshForge?: {
    workbench?: {
      recordSessionLink?: (input: {
        projectId: string
        taskKey: string
        sessionId: string
      }) => Promise<{ sessionId: string; status: string }>
    }
  }
}

/** 建立一条 active 挂接(内核动词直调 —— M2 发起成功链的同一持久腿)。 */
async function linkSession(page: Page, projectId: string, taskKey: string, sessionId: string): Promise<string> {
  const link = await page.evaluate(async (input: { projectId: string; taskKey: string; sessionId: string }) => {
    const bridge = (globalThis as RecordLinkBridge).dshForge?.workbench
    if (bridge?.recordSessionLink === undefined) {
      throw new Error('dshForge.workbench.recordSessionLink bridge unavailable in the e2e renderer')
    }
    return await bridge.recordSessionLink(input)
  }, { projectId, taskKey, sessionId })
  expect(link.sessionId).toBe(sessionId)
  expect(link.status).toBe('active')
  return sessionId
}

function sc3Bundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

// [M4 1.8 e2e 迁移·迁移清单 第②行 · M2 看板(workbench/tasks 主视图)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('6.3/sc3-reflow-source [@web-e2e @journey sc3-reflow-source]: ≤5s reflow with source attribution + ended-link retrospection', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // --- journey scaffolding: recordless/linkless board except where launched --
  const set = generateTaskSet({ seed: 'sc3reflow', taskCount: 12, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const featureA = set.features[0] as NonNullable<typeof set.features[0]>
  const featureB = set.features[1] as NonNullable<typeof set.features[1]>
  // The launched task (path ② + SC3-3 supersede subject).
  const KEY_LINKED = `${featureA.slug}/${(featureA.tasks[0] as NonNullable<typeof featureA.tasks[0]>).localId}`
  // Path-① pool: unlinked, recordless tasks in BOTH features (the retry leg
  // uses the second — a clean subject, not a re-mutation).
  const KEY_ACTOR_1 = `${featureA.slug}/${(featureA.tasks[2] as NonNullable<typeof featureA.tasks[2]>).localId}`
  const KEY_ACTOR_2 = `${featureB.slug}/${(featureB.tasks[2] as NonNullable<typeof featureB.tasks[2]>).localId}`
  // Terminal pool: unlinked, recordless tasks, both features.
  const KEY_TERM_1 = `${featureA.slug}/${(featureA.tasks[3] as NonNullable<typeof featureA.tasks[3]>).localId}`
  const KEY_TERM_2 = `${featureB.slug}/${(featureB.tasks[3] as NonNullable<typeof featureB.tasks[3]>).localId}`
  expect(set.facts.taskCount).toBe(12)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc3-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'fixture-project') })
  const mutator = createFixtureMutator(set, project)
  const session = createAppSessionFactory({
    bundles: sc3Bundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
    cwd: root,
    // 6.1(ForgeBridge 退役):应用 env 零 CLI 缝 —— 无 stub CLI、无 stub
    // 通道、无 allowlist;挂接经内核 recordSessionLink 动词建立。
  })

  try {
    const shell = await session.boot()
    let sessionIdOne = ''
    let sessionIdTwo = ''
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      expect(typeof projectId).toBe('string')
      await openTasksBoard(page, set.facts.taskCount)

      // Baseline: a recordless/linkless board is uniformly [终端]-sourced —
      // the reflow legs below must FLIP these marks.
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY_LINKED}"] [data-dsh-forge-badge="source:terminal"]`),
      ).toBeVisible()

      // ---- establish the active link (6.1: kernel verb; the session "acts") -
      sessionIdOne = await linkSession(page, projectId, KEY_LINKED, 'session-sc3-one')
      // 权威读点亮徽标:打开侧板(getTaskDetail.links reconcile)再回看板。
      await page.locator(`[data-dsh-forge-node-card="${KEY_LINKED}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${KEY_LINKED}"]`)).toBeVisible({ timeout: 15_000 })
      await page.locator('[data-dsh-forge-detail-close]').click()
      await expect(page.locator('[data-dsh-forge-task-detail]')).toHaveCount(0)
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY_LINKED}"] [data-dsh-forge-badge="session-live"]`),
      ).toHaveAttribute('data-dsh-forge-session-id', sessionIdOne, { timeout: 10_000 })

      // ======================================================================
      // SC3-1 ② 挂接推断(主路径): bare change on the LINKED task → [会话].
      // Retry policy: a second, further status transition on the same task.
      // ======================================================================
      const bareLinkedMutation = (): () => Promise<number> => () => {
        const next = mutator.nextStatusOf(KEY_LINKED)
        return measureReflow(page, KEY_LINKED, 'session', next,
          () => { mutator.mutateStatus(KEY_LINKED, next) })
      }
      await assertReflowWithinBudget('SC3-1② session-by-active-link (linked task, no actor record)', [
        bareLinkedMutation(),
        bareLinkedMutation(),
      ])

      // ======================================================================
      // SC3-1 ① actor 标记: unlinked task + session-attributed record → [会话].
      // (writeRecord FIRST, mutateStatus LAST — the one scan that fires sees
      // both; the record carries actor `session:<S1>`, exactly the form the
      // FORGE_ACTOR line instructs the session's agent to stamp.)
      // ======================================================================
      const actorMutation = (taskKey: string): (() => Promise<number>) => () => {
        const next = mutator.nextStatusOf(taskKey)
        return measureReflow(page, taskKey, 'session', next, () => {
          mutator.writeRecord(taskKey, `session:${sessionIdOne}`)
          mutator.mutateStatus(taskKey, next)
        })
      }
      await assertReflowWithinBudget('SC3-1① session-by-actor-mark (unlinked task + session actor record)', [
        actorMutation(KEY_ACTOR_1),
        actorMutation(KEY_ACTOR_2),
      ])

      // ======================================================================
      // SC3-2 终端侧: direct file mutation on an unlinked/actorless task.
      // ======================================================================
      const terminalMutation = (taskKey: string): (() => Promise<number>) => () => {
        const next = mutator.nextStatusOf(taskKey)
        return measureReflow(page, taskKey, 'terminal', next,
          () => { mutator.mutateStatus(taskKey, next) })
      }
      await assertReflowWithinBudget('SC3-2 terminal-by-direct-mutation (no link, no actor)', [
        terminalMutation(KEY_TERM_1),
        terminalMutation(KEY_TERM_2),
      ])

      // ======================================================================
      // SC3-3 挂接结束→历史回溯: link the task AGAIN (6.1: kernel verb) —
      // recordSessionLink's supersede ends the S1 row; the dock's 挂接历史
      // walks active→ended in full.
      // ======================================================================
      await page.locator(`[data-dsh-forge-node-card="${KEY_LINKED}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${KEY_LINKED}"]`)).toBeVisible({ timeout: 15_000 })
      sessionIdTwo = await linkSession(page, projectId, KEY_LINKED, 'session-sc3-two')
      expect(sessionIdTwo).not.toBe(sessionIdOne)

      await openTasksBoard(page, set.facts.taskCount)
      // The badge follows the NEW session (the dock's authoritative read below
      // keeps it honest).
      await page.locator(`[data-dsh-forge-node-card="${KEY_LINKED}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${KEY_LINKED}"]`)).toBeVisible({ timeout: 15_000 })
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY_LINKED}"] [data-dsh-forge-badge="session-live"]`),
      ).toHaveAttribute('data-dsh-forge-session-id', sessionIdTwo, { timeout: 10_000 })

      await page.locator(`[data-dsh-forge-node-card="${KEY_LINKED}"]`).click()
      const dock = page.locator(`[data-dsh-forge-task-detail="${KEY_LINKED}"]`)
      await expect(dock).toBeVisible({ timeout: 15_000 })
      // 挂接历史: BOTH rows, 新→旧, the full active→ended walk.
      await expect.poll(async () => {
        const rows = dock.locator('[data-dsh-forge-detail-link]')
        if (await rows.count() < 2) return []
        return await rows.evaluateAll(nodes => nodes.map(node => ({
          sessionId: node.getAttribute('data-dsh-forge-detail-link') ?? '',
          status: node.getAttribute('data-link-status') ?? '',
        })))
      }, { timeout: 15_000 }).toEqual([
        { sessionId: sessionIdTwo, status: 'active' },
        { sessionId: sessionIdOne, status: 'ended' },
      ])

      // records 侧的来源徽标(①路径产物): the actor-attributed task's
      // execution record renders the [会话] source badge in the dock.
      await page.locator('[data-dsh-forge-detail-close]').click()
      await expect(page.locator('[data-dsh-forge-task-detail]')).toHaveCount(0)
      await page.locator(`[data-dsh-forge-node-card="${KEY_ACTOR_1}"]`).click()
      const actorDock = page.locator(`[data-dsh-forge-task-detail="${KEY_ACTOR_1}"]`)
      await expect(actorDock).toBeVisible({ timeout: 15_000 })
      await expect(
        actorDock.locator('[data-dsh-forge-detail-record] [data-dsh-forge-badge="source:session"]'),
        'the session-attributed record carries the [会话] badge',
      ).toBeVisible({ timeout: 15_000 })

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    // Journey cleanup (6.1 Hard Rule: 测试后清理).
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
