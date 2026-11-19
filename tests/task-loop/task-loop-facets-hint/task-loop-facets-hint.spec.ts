// plugin-spec/1.13 债务补撰 · spec ③：to-tasks facets 提示预填链真机断言（journey =
// task-loop-facets-hint）。预填链 = 拆解时把交付档位期望面作为 facets 提示写入任务定义
// （context_json 的 FACETS_HINT_CONTEXT_KEY='facets' 条目——shared/contract-constants.ts
// 单源）→ submitTask 结算 facets 对照提示仅 warn（机械门②）。真机可 reaching 面 = 测试桥
// 写动词 + forge:tasks/* 读通道 + 容器库直读；预填的拆解动作本体 = to-tasks skill（agent
// 会话层协作，非 RPC 面）——真机以「预填产物形态」断言：带提示建卡 → 读面/库两面核提示
// 在任务定义在场 → 结算门按提示咬合（漂移仅 warn）。模板预填格由
// plugins/task-loop/tests/contract/to-tasks-skill-doc.test.ts 快照契约 pin（单测层）。
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../../e2e/support/launch.js'
import { forgeInvoke } from '../../../e2e/support/rpc.js'
import { refetchOnce, createBridgeDriver, type ReplayWriteDriver } from '../../../e2e/support/replay/executor.js'
import { openTaskLoopDb } from '../../../e2e/support/sqlite.js'
import { projectKeyOf } from '../../../e2e/support/project-key.js'
import { TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'

const SLUG = 'task-loop-facets-hint'
const HINT = 'ui,api' // 预填形：逗号分隔档位期望面（to-tasks SKILL.md 模板 `facets=<ui,api>` 同形）
const SESSION = 'e2e-tlfh-dispatch-s1'

interface Boot {
  readonly app: Awaited<ReturnType<typeof launchHost>>['app']
  readonly page: Page
  readonly driver: ReplayWriteDriver
  readonly projectKey: string
  readonly userData: string
  readonly pageErrors: readonly string[]
}

async function bootHost(tag: string): Promise<Boot> {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), `dsh-tlfh-${tag}-ws-`)))
  const userData = mkdtempSync(join(tmpdir(), `dsh-tlfh-${tag}-ud-`))
  const launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { page } = launched
  await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: ws,
    name: `tlfh-${tag}`,
    forgeDir: join(ws, '.forge'),
  })
  return { app: launched.app, page, driver: createBridgeDriver(launched.app), projectKey: projectKeyOf(ws), userData, pageErrors: launched.pageErrors }
}

test('@task-loop-e2e @task-loop-facets-hint facets 提示预填链：提示随任务定义落库 → 读面在场 → 结算门按提示咬合（漂移仅 warn）', async () => {
  test.setTimeout(300_000)
  const env = await bootHost('prefill')
  const { page, driver, projectKey, pageErrors } = env
  try {
    // ── 预填产物：拆解建卡携 context facets 提示（FACETS_HINT_CONTEXT_KEY 形） ──
    const hintTask = (await driver.call('forgeTasks', 'addTask', {
      projectKey,
      slug: SLUG,
      title: 'facets 提示预填任务',
      type: 'doc',
      context: { facets: HINT },
    })) as { taskId: string; localId: string }
    // 无提示对照卡（零对照路径）
    const bareTask = (await driver.call('forgeTasks', 'addTask', {
      projectKey,
      slug: SLUG,
      title: 'facets 提示缺席对照任务',
      type: 'doc',
    })) as { taskId: string; localId: string }

    // ── 读面单发：提示卡与对照卡可辨（list 双卡在列） ──
    const cards = await refetchOnce<readonly { localId: string; taskId: string }[]>(page, TASKS_CHANNELS.list, { projectKey, slug: SLUG })
    expect(cards.map((c) => c.localId), '两卡在列').toEqual(expect.arrayContaining([hintTask.localId, bareTask.localId]))

    // ── 容器库直读：提示逐字在任务定义（context_json facets 键 = 预填落位单源判据） ──
    const db = openTaskLoopDb(env.userData)
    try {
      const hintRow = db.prepare(
        `SELECT context_json FROM task_tasks WHERE id = ?`,
      ).get(hintTask.taskId) as { context_json: string | null } | undefined
      expect(JSON.parse(hintRow?.context_json ?? '{}'), 'facets 提示预填落位（context facets 键逐字）').toEqual({ facets: HINT })
      const bareRow = db.prepare(
        `SELECT context_json FROM task_tasks WHERE id = ?`,
      ).get(bareTask.taskId) as { context_json: string | null } | undefined
      expect(bareRow?.context_json ?? null, '对照卡零提示（零对照路径可辨）').toBeNull()
    } finally {
      db.close()
    }

    // ── 结算门咬合：漂移结算（facets=['docs'] ≠ 提示 ui,api）仅 warn 不拒写 ──
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: SLUG, localId: hintTask.localId }, sessionId: SESSION })
    const settled = (await driver.call('forgeTasks', 'submitTask', {
      projectKey,
      taskRef: { slug: SLUG, localId: hintTask.localId },
      result: 'success',
      summary: 'facets 漂移结算（提示对照仅 warn）',
      facets: ['docs'],
      gate: { compile: true, fmt: true, lint: true, test: true },
    })) as { status: string }
    expect(settled.status, '漂移结算不拒写（机械门降为提示）').toBe('completed')
    expect(pageErrors, '全程零 renderer 未捕获异常').toEqual([])
  } finally {
    await closeApp(env.app)
  }
})
