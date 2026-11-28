// plugin-spec/1.13 债务补撰 · spec ①：matchAcSettlements 聚合动词真机数据链（journey =
// task-loop-ac-settlements，module = task-loop——tests/<moduleName>/<journey>/ 约定树，
// desktop-journeys 池）。真机可 reaching 面 = 测试桥写动词（addTask/claimTask/submitTask，
// 与 tool 面同一 dispatchRpc 服务路径）+ forge:tasks/* 读通道单发 invoke + 容器库直读；
// 聚合动词本体（forgeTasks.matchAcSettlements）真机直调缝缺席（bridge 白名单面封闭——
// Hard Rule 扩面须回 5.1 裁决；typert forgeTasks/acSettlements 端点无 renderer 窗口缝）
// ——其可观测前置数据链（判据原文随卡落账 → 最新结算行逐字在账）本 spec 真机断言，
// 动词直调断言留痕 skip（转正条件随文件尾注记）。
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../../e2e/support/launch.js'
import { forgeInvoke } from '../../../e2e/support/rpc.js'
import { refetchOnce, createBridgeDriver, type ReplayWriteDriver } from '../../../e2e/support/replay/executor.js'
import { openTaskLoopDb } from '../../../e2e/support/sqlite.js'
import { projectKeyOf } from '../../../e2e/support/project-key.js'
import { TASKS_CHANNELS } from '@dsh-forge/lib-api/channels'

const SLUG = 'task-loop-ac-settlements'
const AC_A = '判据甲：AC 结算聚合数据链真机可达'
const AC_B = '判据乙：判据原文逐字落账'
const SESSION = 'e2e-tlac-dispatch-s1'

interface Boot {
  readonly app: Awaited<ReturnType<typeof launchHost>>['app']
  readonly page: Page
  readonly driver: ReplayWriteDriver
  readonly projectKey: string
  readonly userData: string
  readonly pageErrors: readonly string[]
}

async function bootHost(tag: string): Promise<Boot> {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), `dsh-tlac-${tag}-ws-`)))
  const userData = mkdtempSync(join(tmpdir(), `dsh-tlac-${tag}-ud-`))
  const launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { page } = launched
  await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: ws,
    name: `tlac-${tag}`,
    forgeDir: join(ws, '.forge'),
  })
  const projectKey = projectKeyOf(ws)
  return { app: launched.app, page, driver: createBridgeDriver(launched.app), projectKey, userData, pageErrors: launched.pageErrors }
}

test('@task-loop-e2e @task-loop-ac-settlements matchAcSettlements 数据链：AC 判据随卡落账 → 结算逐字在账（投影聚合前置链真机）', async () => {
  test.setTimeout(300_000)
  const env = await bootHost('acchain')
  const { page, driver, projectKey, pageErrors } = env
  try {
    // ── 建卡：AC 判据原文随卡（投影 joinKey = ac_results_json[].criterion 的定义侧镜像） ──
    const added = (await driver.call('forgeTasks', 'addTask', {
      projectKey,
      slug: SLUG,
      title: 'AC 聚合数据链任务',
      type: 'doc',
      acceptanceCriteria: [AC_A, AC_B],
    })) as { taskId: string; slug: string; localId: string }
    expect(added.slug, 'slug 直键契约回显').toBe(SLUG)

    // ── 领取 + 结算：ac_results 判据逐字回填（met 全 true + gate.test 门） ──
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: SLUG, localId: added.localId }, sessionId: SESSION })
    const settled = (await driver.call('forgeTasks', 'submitTask', {
      projectKey,
      taskRef: { slug: SLUG, localId: added.localId },
      result: 'success',
      summary: 'AC 聚合数据链接算',
      acceptanceCriteria: [
        { criterion: AC_A, met: true, evidence: '真机链路绿（spec 定向执行）' },
        { criterion: AC_B, met: true, evidence: '判据原文逐字落账断言' },
      ],
      gate: { compile: true, fmt: true, lint: true, test: true },
    })) as { status: string }
    expect(settled.status, '结算信封终态 completed').toBe('completed')

    // ── 读面单发：list/detail 即见终态（AC 进度水化数据源在账） ──
    const cards = await refetchOnce<readonly { localId: string; taskStatus: string }[]>(page, TASKS_CHANNELS.list, { projectKey, slug: SLUG })
    expect(cards.find((c) => c.localId === added.localId)?.taskStatus, 'list 即见 completed').toBe('completed')
    const detail = await refetchOnce<{ taskId: string; taskStatus: string }>(page, TASKS_CHANNELS.detail, { projectKey, taskId: added.taskId })
    expect(detail.taskId, 'detail 即见同卡').toBe(added.taskId)

    // ── 域库直读：最新 submit 结算行 ac_results 判据逐字 = 任务定义判据（投影匹配单源） ──
    const db = openTaskLoopDb(env.userData)
    try {
      const row = db.prepare(
        `SELECT ac_results_json FROM task_settlements WHERE task_id = ? ORDER BY id DESC LIMIT 1`,
      ).get(added.taskId) as { ac_results_json: string } | undefined
      const acResults = JSON.parse(row?.ac_results_json ?? '[]') as readonly { criterion: string; met: boolean }[]
      expect(acResults.map((r) => r.criterion), '结算判据逐字 = 任务定义判据（投影归一化匹配单源在账）').toEqual([AC_A, AC_B])
      expect(acResults.every((r) => r.met === true), '全判据 met=true 在账').toBe(true)
    } finally {
      db.close()
    }
    expect(pageErrors, '全程零 renderer 未捕获异常').toEqual([])
  } finally {
    await closeApp(env.app)
  }
})

// ── 聚合动词真机直调缝留痕 skip（占位——seam 缺席记账，与 task-loop-mainline B6.O3 同口径） ──
test('matchAcSettlements 直调断言留痕 skip（占位）', () => {
  test.skip(
    true,
    'forgeTasks.matchAcSettlements 真机直调缝缺席：测试桥动词面封闭（Hard Rule 扩面须回 5.1 裁决）+ typert forgeTasks/acSettlements 端点无 renderer 窗口缝——' +
      '投影聚合归一化匹配/OR 语义由 plugins/task-loop/tests/domain-tasks/ac-match.test.ts 单测 pin；本 spec 已真机断言其前置数据链（判据随卡落账 → 结算逐字在账）。' +
      '转正条件 = e2e 可达缝落地（读通道扩 acSettlements 或 typert 窗口缝），届时本占位改直调断言 { criterion, met, taskRefs, unmatched } 聚合 DTO',
  )
})
