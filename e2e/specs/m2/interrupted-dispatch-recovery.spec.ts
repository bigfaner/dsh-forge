// @feature:dsh-forge-m2-pipeline @web-e2e
// gen-test-scripts 产物 —— Journey: interrupted-dispatch-recovery（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m2-pipeline/testing/interrupted-dispatch-recovery/contracts/
//   step-{1..3}-*.md（eval-contract 857/1100 通过）。
//
// 载体形态：同 task-dispatch-pipeline.spec（回放主径钩子 + refetchOnce 单发 + 直插受控初态）。
// 「执行记录缺失 = 中断」的模拟口径：verbs 写到 claim 为止（submit 缺席）——中断是
// executor 子会话缺席的账本态，不需要真进程崩溃。
//
// Fact Table 摘录（源码核实）：
//   - claim 幂等重入（claim.ts M2_CLAIM_REENTRY）：显式 taskRef 对 in_progress 重入 →
//     reclaimed=true、零状态转移、from/to 空、digest 新值（简报按当前库状态重合成）；
//   - 盲选边界：无 taskRef 不领他会话 in_progress；本会话 links 已挂接的 in_progress
//     盲选可重入（最新挂接优先）——「不重复派发」的 core 可观测面 = 同任务幂等重入；
//   - 前置回归拒绝（claim.ts:131 + 187-189）：守卫适用一切路径——重入亦先过依赖终态
//     守卫（ERR_DEPENDENCIES_UNMET）；
//   - agent 面矩阵（state-machine.ts）：非 pending/blocked 态不可转 in_progress
//     （人工处置态 skipped/suspended 的重入领取 → ERR_INVALID_TRANSITION）。
//
// Outcome → 测试映射：
//   Step1-3 success 链（中断→重入→重简报→结算）…「冒烟：中断恢复全链零人工清理」
//   Step1 record-present-no-misredispatch ………………………………「执行记录在场：盲选幂等重入同任务（不重复派发）」
//   Step1 prerequisite-regression-rejects-reentry ……………………「前置回归非终态：重入被守卫拒绝」
//   Step1 foreign-session-in-progress-not-blind-claimed ……「他会话 in_progress：盲选不领（双外环并存防线）」
//   Step2 repeated-interruptions-idempotent ………………………………「多次中断：逐次幂等重入 + digest 逐次新值 + 审计 append-only」
//   Step3 manual-disposal-claim-rejected ……………………………………「人工处置态：重入领取被矩阵拒绝（处置不被覆盖）」
//
// Assertion depth: 42/45 behavioral (93%)，其中 deep 19/42 (45%)——两阈均过。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { FEATURES_CHANNELS, PROJECTS_M2_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import type { ClaimTaskResult, SubmitTaskResult, TaskDetail } from '../../../packages/contracts/src/dto/forge.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'

const DISP_SESSION = 'e2e-idr-dispatch-r1'
const EXEC_SESSION = 'e2e-idr-executor-e1'

async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

async function setupWorld(page: Page, wsDir: string, wsName: string, feature: string) {
  const project = await registerProject(page, wsDir, wsName)
  const projectId = project.id
  await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: feature, title: `中断恢复演示 ${feature}` })
  const dir = (await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: wsDir })).dir
  return { projectId, dir }
}

/** 受控初态直插（feature 行 + 指定状态任务 + 可选 claim 审计/挂接/边）——不可经动词构造的中断形态 */
function seedInterruptedWorld(
  dir: string,
  feature: string,
  o: {
    readonly localId: string
    readonly status: string
    readonly title?: string
    readonly claimRecord?: boolean
    readonly linkSession?: string
    readonly transitionRecord?: boolean
    readonly edges?: readonly { readonly prerequisiteLocalId: string; readonly prerequisiteStatus: string }[]
  },
): string {
  const db = openForgeDbAt(dir)
  const taskId = `t-${feature}-${o.localId}`
  try {
    db.transaction(() => {
      const fid = db.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE slug = ?`).get(feature)?.id ?? ''
      db.prepare(
        `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, feature_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'doc', ?, ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
      ).run(taskId, feature, o.localId, o.title ?? `中断任务 ${o.localId}`, o.status, fid)
      if (o.claimRecord === true) {
        db.prepare(
          `INSERT INTO task_records (task_id, verb, from_status, to_status, dispatch_digest, actor, session_id, created_at, updated_at)
           VALUES (?, 'claim', 'pending', 'in_progress', 'aaaabbbbcccc', 'plugin-tool', ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
        ).run(taskId, DISP_SESSION)
      }
      if (o.transitionRecord === true) {
        db.prepare(
          `INSERT INTO task_records (task_id, verb, from_status, to_status, reason, actor, session_id, created_at, updated_at)
           VALUES (?, 'transition', 'in_progress', ?, '人工处置（中断窗口内）', 'ui', null, '2026-10-06T00:30:00.000Z', '2026-10-06T00:30:00.000Z')`,
        ).run(taskId, o.status)
      }
      if (o.linkSession !== undefined) {
        db.prepare(
          `INSERT INTO task_session_links (task_id, session_id, created_at, updated_at)
           VALUES (?, ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
        ).run(taskId, o.linkSession)
      }
      for (const edge of o.edges ?? []) {
        const prereqId = `t-${feature}-${edge.prerequisiteLocalId}`
        db.prepare(
          `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, feature_id, created_at, updated_at)
           VALUES (?, ?, ?, '前置任务', 'doc', ?, ?, '2026-10-05T00:00:00.000Z', '2026-10-05T00:00:00.000Z')
           ON CONFLICT(id) DO NOTHING`,
        ).run(prereqId, feature, edge.prerequisiteLocalId, edge.prerequisiteStatus, fid)
        db.prepare(
          `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
           VALUES (?, ?, 'manual', '2026-10-05T00:00:00.000Z', '2026-10-05T00:00:00.000Z')`,
        ).run(taskId, prereqId)
      }
    })()
  } finally {
    db.close()
  }
  return taskId
}

test('@web-e2e @m2 中断恢复·冒烟：中断→重入→重简报→结算（零人工清理全链）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-'))
  const wsDir = join(fixtureRoot, 'ws-idr')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'idr-feat'
    const { projectId, dir } = await setupWorld(page, wsDir, '中断恢复冒烟', FEATURE)
    const driver = createBridgeDriver(app)

    // ── 中断前：首次领取（claim 行 + 挂接落账）──
    const added = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '中断恢复冒烟任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const first = (await driver.call('forgeTasks', 'claimTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: DISP_SESSION,
    })) as ClaimTaskResult
    expect(first.reclaimed, '首领 = 非重入').toBe(false)
    expect(first.digest, '首领 digest 在场（12 hex）').toMatch(/^[0-9a-f]{12}$/)

    // ── 中断（submit 缺席——执行记录缺失态）→ 外环重入领取 ──
    const reentry = (await driver.call('forgeTasks', 'claimTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: DISP_SESSION,
    })) as ClaimTaskResult
    expect(reentry.reclaimed, '重入领取 reclaimed = true（中断恢复零人工清理）').toBe(true)
    expect(reentry.task?.taskId, '重入返回同一任务').toBe(added.taskId)
    expect(reentry.task?.taskStatus, '幂等重入零状态转移（仍 in_progress）').toBe('in_progress')
    // digest = sha-256(简报全文) 前 12 hex（claim.test 钉死确定性合成）：同状态重入 → 同文同
    // digest；digest 新值仅在库态变化时出现（PHASE_SUMMARY 消失形）——中断未改态故恒等
    expect(reentry.digest, '同状态重入 digest 恒等（确定性重合成——claim.test 单测钉死）').toBe(first.digest)
    expect(reentry.digest, 'digest 仍为 12 hex').toMatch(/^[0-9a-f]{12}$/)
    // 重合成简报：四段构成不变 + 动态块按当前状态取数
    expect(reentry.dispatchPrompt, '重派简报人格段不变').toContain('You are a focused task executor.')
    expect(reentry.dispatchPrompt, '重派简报约束块不变').toContain('<constraints>')
    expect(reentry.dispatchPrompt, '动态信息块按当前库状态重合成').toContain(`TASK_ID: ${added.slug}/${added.localId}`)
    expect(reentry.dispatchPrompt, '类型策略块不变').toContain('<type-policy>')

    const db = openForgeDbAt(dir)
    try {
      // 挂接表幂等不增行 + 重入审计行 from/to 为空（无状态效应）
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_session_links WHERE task_id = ? AND session_id = ?`,
      ).get(added.taskId, DISP_SESSION)?.n, '挂接幂等（重入不增行）').toBe(1)
      const reentryRow = db.prepare<unknown[], { from_status: string | null; to_status: string | null; dispatch_digest: string | null }>(
        `SELECT from_status, to_status, dispatch_digest FROM task_records WHERE task_id = ? AND verb = 'claim' ORDER BY id DESC LIMIT 1`,
      ).get(added.taskId)
      expect(reentryRow?.from_status, '重入行 from 为空（零状态效应）').toBeNull()
      expect(reentryRow?.to_status, '重入行 to 为空').toBeNull()
      expect(reentryRow?.dispatch_digest, '重入行落新 digest').toBe(reentry.digest)
    } finally {
      db.close()
    }

    // ── 恢复结算（Step 3）：重派简报派发 executor → completed ──
    const submit = (await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success',
      summary: '中断恢复后结算（链路自愈完成）',
      gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: EXEC_SESSION,
    })) as SubmitTaskResult
    expect(submit.status, '恢复结算落账 completed').toBe('completed')

    // 审计链 append-only：add → claim → claim(重入) → submit（中断与恢复不篡改既有记录）
    const db2 = openForgeDbAt(dir)
    try {
      const verbs = db2.prepare<unknown[], { verb: string }>(`SELECT verb FROM task_records WHERE task_id = ? ORDER BY id`).all(added.taskId).map((r) => r.verb)
      expect(verbs, '审计链 append-only 完整').toEqual(['add', 'claim', 'claim', 'submit'])
    } finally {
      db2.close()
    }
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: added.taskId })
    expect(detail.taskStatus, '读面单发即见 completed').toBe('completed')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 中断恢复·Step1 执行记录在场：盲选幂等重入同任务（不重复派发）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-rec-'))
  const wsDir = join(fixtureRoot, 'ws-idr-rec')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-rec-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'idr-rec'
    const { projectId, dir } = await setupWorld(page, wsDir, '记录在场演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 受控初态：in_progress + 本会话挂接 + 活跃执行记录（claim 与 submit 前置均在——executor 正常执行中）
    const taskId = seedInterruptedWorld(dir, FEATURE, {
      localId: '2.1', status: 'in_progress', claimRecord: true, linkSession: DISP_SESSION,
    })
    // 活跃执行面：submit 缺席即「未结算」；本用例补充记录在场形态——盲选对本会话 in_progress 幂等重入
    const claim = (await driver.call('forgeTasks', 'claimTask', { projectId, sessionId: DISP_SESSION })) as ClaimTaskResult
    expect(claim.task?.taskId, '盲选重入本会话 in_progress（同任务）').toBe(taskId)
    expect(claim.reclaimed, '幂等重入形态（reclaimed=true）').toBe(true)
    expect(claim.task?.taskStatus, '零状态转移（不重复派发不重复执行）').toBe('in_progress')

    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`,
      ).get(taskId)?.n, '无重复结算（submit 零行）').toBe(0)
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_session_links WHERE task_id = ?`,
      ).get(taskId)?.n, '挂接不重复').toBe(1)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 中断恢复·Step1 前置回归非终态：重入被守卫拒绝（dispatcher 须重规划）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-pr-'))
  const wsDir = join(fixtureRoot, 'ws-idr-pr')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-pr-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'idr-pr'
    const { projectId, dir } = await setupWorld(page, wsDir, '前置回归演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 受控初态：T in_progress（中断态）+ 前置 P 中断窗口内回归 suspended（守卫适用一切路径）
    const taskId = seedInterruptedWorld(dir, FEATURE, {
      localId: '3.1', status: 'in_progress', claimRecord: true, linkSession: DISP_SESSION,
      edges: [{ prerequisiteLocalId: '3.0', prerequisiteStatus: 'suspended' }],
    })

    const rejection = await rejectMessage(driver.call('forgeTasks', 'claimTask', {
      projectId, taskRef: { slug: FEATURE, localId: '3.1' }, sessionId: DISP_SESSION,
    }))
    expect(rejection, '重入领取被依赖守卫拒绝（守卫适用一切路径）').toContain('前置依赖未满足')
    expect(rejection, '未满足清单携带回归前置（suspended）').toContain('suspended')

    // 任务保持 in_progress（无状态转移）+ 零残留（重入 claim 未落账）
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId })
    expect(detail.taskStatus, '中断任务保持 in_progress（不可强行续链）').toBe('in_progress')
    const db = openForgeDbAt(dir)
    try {
      const digests = db.prepare<unknown[], { dispatch_digest: string | null }>(
        `SELECT dispatch_digest FROM task_records WHERE task_id = ? AND verb = 'claim'`,
      ).all(taskId)
      expect(digests, '拒绝零残留（无新重入行——仅初态一行）').toHaveLength(1)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 中断恢复·Step1 他会话 in_progress：盲选不领（双外环并存防线）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-fo-'))
  const wsDir = join(fixtureRoot, 'ws-idr-fo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-fo-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'idr-fo'
    const { projectId, dir } = await setupWorld(page, wsDir, '双外环演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 受控初态：旧外环（他会话）挂接的 in_progress；当前会话零挂接、无就绪 pending
    const taskId = seedInterruptedWorld(dir, FEATURE, {
      localId: '4.1', status: 'in_progress', claimRecord: true, linkSession: 'e2e-idr-stale-loop',
    })

    const claim = (await driver.call('forgeTasks', 'claimTask', { projectId, sessionId: DISP_SESSION })) as ClaimTaskResult
    expect(claim.task, '新外环盲选不领旧外环 in_progress（task = null）').toBeNull()
    expect(claim.dispatchPrompt, '空出口信号（空简报）').toBe('')

    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_session_links WHERE task_id = ?`,
      ).get(taskId)?.n, '挂接表零变更（不产生双派发）').toBe(1)
      expect(db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(taskId)?.task_status, '任务保持 in_progress').toBe('in_progress')
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 中断恢复·Step2 多次中断：逐次幂等重入 + digest 逐次新值 + 审计 append-only', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-multi-'))
  const wsDir = join(fixtureRoot, 'ws-idr-multi')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-multi-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'idr-multi'
    const { projectId, dir } = await setupWorld(page, wsDir, '多次中断演示', FEATURE)
    const driver = createBridgeDriver(app)
    const added = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '多次中断任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }

    // 首领领取（round 0 = 首次 claim——reclaimed=false）+ 两次中断重入（reclaimed=true）
    const first = (await driver.call('forgeTasks', 'claimTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: DISP_SESSION,
    })) as ClaimTaskResult
    expect(first.reclaimed, '首领领取 reclaimed = false').toBe(false)
    const digests = new Set<string>([first.digest])
    for (let round = 1; round <= 2; round++) {
      const claim = (await driver.call('forgeTasks', 'claimTask', {
        projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: DISP_SESSION,
      })) as ClaimTaskResult
      expect(claim.reclaimed, `第 ${round} 次中断后重入：reclaimed=true`).toBe(true)
      expect(claim.task?.taskStatus, '状态恒 in_progress（零状态转移）').toBe('in_progress')
      digests.add(claim.digest)
    }
    // digest = 确定性合成（claim.test 钉死）：零状态变化的逐次重入 → 同文同 digest（单值）
    expect(digests.size, 'digest 同态恒定（确定性重合成——状态未变则相异不可判）').toBe(1)

    const db = openForgeDbAt(dir)
    try {
      const rows = db.prepare<unknown[], { verb: string; from_status: string | null; to_status: string | null }>(
        `SELECT verb, from_status, to_status FROM task_records WHERE task_id = ? ORDER BY id`,
      ).all(added.taskId)
      expect(rows.filter((r) => r.verb === 'claim'), 'claim 行累积 3 行（append-only 审计链）').toHaveLength(3)
      // 首领行承载 pending→in_progress 转移；重入行 from/to 恒空（转移面零行——claim.test 同形）
      const claimRows = rows.filter((r) => r.verb === 'claim')
      expect(claimRows[0], '首领行 from/to 承载转移').toMatchObject({ from_status: 'pending', to_status: 'in_progress' })
      expect(claimRows.slice(1).every((r) => r.from_status === null && r.to_status === null), '重入行 from/to 恒空（转移面零行）').toBe(true)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 中断恢复·Step3 人工处置态：重入领取被矩阵拒绝（处置不被覆盖）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-md-'))
  const wsDir = join(fixtureRoot, 'ws-idr-md')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-idr-md-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'idr-md'
    const { projectId, dir } = await setupWorld(page, wsDir, '人工处置演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 受控初态：中断窗口内人工置 skipped（claim 历史行 + transition 人工处置行在场）
    const taskId = seedInterruptedWorld(dir, FEATURE, {
      localId: '5.1', status: 'skipped', claimRecord: true, transitionRecord: true, linkSession: DISP_SESSION,
    })

    const rejection = await rejectMessage(driver.call('forgeTasks', 'claimTask', {
      projectId, taskRef: { slug: FEATURE, localId: '5.1' }, sessionId: DISP_SESSION,
    }))
    expect(rejection, '人工处置态重入 → ERR_INVALID_TRANSITION（非 pending/blocked 不可转 in_progress）').toContain('非法任务转移')
    expect(rejection, '矩阵先验呈现实际当前态').toContain('skipped')

    // 处置结果不被覆盖 + 零残留
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId })
    expect(detail.taskStatus, '任务保持 skipped（人工处置不被覆盖）').toBe('skipped')
    const db = openForgeDbAt(dir)
    try {
      const verbs = db.prepare<unknown[], { verb: string }>(`SELECT verb FROM task_records WHERE task_id = ? ORDER BY id`).all(taskId).map((r) => r.verb)
      expect(verbs, '审计链不被拒绝污染（claim → transition 原样）').toEqual(['claim', 'transition'])
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});
