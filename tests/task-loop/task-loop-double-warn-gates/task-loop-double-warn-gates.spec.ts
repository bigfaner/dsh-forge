// plugin-spec/1.13 债务补撰 · spec ②：submitTask 双 warn 机械门真机断言（journey =
// task-loop-double-warn-gates）。真机可 reaching 面 = 测试桥写动词 + 容器库直读。
// 双 warn 门（plugins/task-loop/host/domain/tasks/submit.ts ②d/②h）语义 = 结算判据 ≠
// 任务定义判据 / 结算 facets ≠ 任务定义 facets 提示——仅 warn 不拒写。真机可观测判据：
// 漂移结算照常落账 completed 且 ac_results 携漂移判据原文（warn 不拒写的状态后果）；
// diag warn 事件捕获缝缺席 → 留痕 skip（B6.O3 同口径，转正条件随文件尾注记）。
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../../e2e/support/launch.js'
import { forgeInvoke } from '../../../e2e/support/rpc.js'
import { createBridgeDriver, type ReplayWriteDriver } from '../../../e2e/support/replay/executor.js'
import { openTaskLoopDb } from '../../../e2e/support/sqlite.js'
import { projectKeyOf } from '../../../e2e/support/project-key.js'

const SLUG = 'task-loop-double-warn-gates'
const AC_A = '判据甲：双 warn 门真机行为断言'
const SESSION = 'e2e-tldwg-dispatch-s1'

interface Boot {
  readonly app: Awaited<ReturnType<typeof launchHost>>['app']
  readonly page: Page
  readonly driver: ReplayWriteDriver
  readonly projectKey: string
  readonly userData: string
  readonly pageErrors: readonly string[]
}

async function bootHost(tag: string): Promise<Boot> {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), `dsh-tldwg-${tag}-ws-`)))
  const userData = mkdtempSync(join(tmpdir(), `dsh-tldwg-${tag}-ud-`))
  const launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { page } = launched
  await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: ws,
    name: `tldwg-${tag}`,
    forgeDir: join(ws, '.forge'),
  })
  return { app: launched.app, page, driver: createBridgeDriver(launched.app), projectKey: projectKeyOf(ws), userData, pageErrors: launched.pageErrors }
}

interface AddArgs {
  readonly acceptanceCriteria?: readonly string[]
  readonly context?: Readonly<Record<string, string>>
}

async function addClaimed(env: Boot, title: string, args: AddArgs = {}): Promise<{ taskId: string; localId: string }> {
  const added = (await env.driver.call('forgeTasks', 'addTask', {
    projectKey: env.projectKey,
    slug: SLUG,
    title,
    type: 'doc',
    ...args,
  })) as { taskId: string; localId: string }
  await env.driver.call('forgeTasks', 'claimTask', { projectKey: env.projectKey, taskRef: { slug: SLUG, localId: added.localId }, sessionId: SESSION })
  return added
}

async function submitSettles(env: Boot, localId: string, payload: Record<string, unknown>): Promise<string> {
  const settled = (await env.driver.call('forgeTasks', 'submitTask', {
    projectKey: env.projectKey,
    taskRef: { slug: SLUG, localId },
    result: 'success',
    summary: '双 warn 门漂移结算（应 warn 不拒写）',
    gate: { compile: true, fmt: true, lint: true, test: true },
    ...payload,
  })) as { status: string }
  return settled.status
}

function latestSubmitRow(db: ReturnType<typeof openTaskLoopDb>, taskId: string): { ac_results_json: string; evidence_json: string | null } {
  return db.prepare(
    `SELECT ac_results_json, evidence_json FROM task_settlements WHERE task_id = ? ORDER BY id DESC LIMIT 1`,
  ).get(taskId) as { ac_results_json: string; evidence_json: string | null }
}

test('@task-loop-e2e @task-loop-double-warn-gates 双 warn 门①：结算判据 ≠ 任务定义判据 → warn 不拒写（漂移结算照常落账）', async () => {
  test.setTimeout(300_000)
  const env = await bootHost('criteria')
  try {
    const t = await addClaimed(env, '判据漂移结算任务', { acceptanceCriteria: [AC_A] })
    const DRIFTED = `${AC_A}（结算侧被转述——应仅 warn）`
    const status = await submitSettles(env, t.localId, {
      acceptanceCriteria: [{ criterion: DRIFTED, met: true, evidence: '漂移判据核销' }],
    })
    expect(status, '漂移结算不拒写（completed 落账）').toBe('completed')
    const db = openTaskLoopDb(env.userData)
    try {
      const row = latestSubmitRow(db, t.taskId)
      const acResults = JSON.parse(row.ac_results_json ?? '[]') as readonly { criterion: string }[]
      expect(acResults.map((r) => r.criterion), 'ac_results 携漂移判据原文（投影层按归一化匹配显形漂移）').toEqual([DRIFTED])
    } finally {
      db.close()
    }
    expect(env.pageErrors, '全程零 renderer 未捕获异常').toEqual([])
  } finally {
    await closeApp(env.app)
  }
})

test('@task-loop-e2e @task-loop-double-warn-gates 双 warn 门②：结算 facets ≠ 任务定义 facets 提示 → warn 不拒写；一致/提示缺席零对照', async () => {
  test.setTimeout(300_000)
  const env = await bootHost('facets')
  try {
    // 提示预填形（context facets 键 = to-tasks 拆解预填面）+ 漂移结算 → warn 不拒写
    // （漂移/提示两侧均取豁免域档——pure-logic/docs 不触发强制域取证门，warn 门独立可见）
    const tDrift = await addClaimed(env, 'facets 漂移结算任务', { context: { facets: 'docs' } })
    expect(await submitSettles(env, tDrift.localId, { facets: ['pure-logic'] }), '漂移 facets 结算不拒写').toBe('completed')
    // 一致结算 → 照常落账
    const tMatch = await addClaimed(env, 'facets 一致结算任务', { context: { facets: 'pure-logic' } })
    expect(await submitSettles(env, tMatch.localId, { facets: ['pure-logic'] }), '一致 facets 结算照常落账').toBe('completed')
    // 提示缺席 + 结算未声明 facets → 零对照直通
    const tBare = await addClaimed(env, 'facets 缺席对照任务')
    expect(await submitSettles(env, tBare.localId, {}), '提示缺席零对照直通').toBe('completed')
    const db = openTaskLoopDb(env.userData)
    try {
      const driftEvidence = JSON.parse(latestSubmitRow(db, tDrift.taskId).evidence_json ?? '{}') as { fields?: { facets?: string[] } }
      expect(driftEvidence.fields?.facets, '漂移结算 facets 声明如实落账').toEqual(['pure-logic'])
    } finally {
      db.close()
    }
    expect(env.pageErrors, '全程零 renderer 未捕获异常').toEqual([])
  } finally {
    await closeApp(env.app)
  }
})

// ── diag warn 事件捕获留痕 skip（占位——观察缝缺席记账，与 task-loop-mainline B6.O3 同口径） ──
test('ac-criteria-drift / facets-hint-drift 事件捕获断言留痕 skip（占位）', () => {
  test.skip(
    true,
    '双 warn 事件（ac-criteria-drift / facets-hint-drift）真机捕获缝缺席：emitDiag 落官方 diag/log 事件域，e2e 无 diag/console 捕获设施——' +
      '事件发射与载荷由 plugins/task-loop/tests/domain-tasks/verbs.test.ts 注入桩 pin；本 spec 已真机断言 warn 不拒写的状态后果（漂移照常落账 + 原文在账）。' +
      '转正条件 = 真机 diag/console 捕获设施落地（同 B6.O3），届时本占位改事件捕获断言',
  )
})
