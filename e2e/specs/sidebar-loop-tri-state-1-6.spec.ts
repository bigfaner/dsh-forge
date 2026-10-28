// loop-consol-flywheel-improvement fix-1（1.6 解锁）—— sidebar 循环标识三态 e2e 旅程。
// 断言面（apps/web/src/views/sidebar/ForgeWorkspacePanel.tsx SessionRow + sidebar-model.ts）：
//   行锚三件套 data-dswf-session-loop / data-dswf-session-loop-edge / data-dswf-session-loop-slug
//   + aria 语义层「任务源 slug · 状态 状态词」（sessionLoopAriaLabel：派发循环中/循环挂起/循环已结束）。
// 驱动配方对齐 loop-msg-consol-walk14.spec.ts：夹具 ws + 隔离 userData（真实凭据播种）+
// DSH_FORGE_TEST_BRIDGE 桥驱动（createBridgeDriver + /run-dag-tasks commands/execute）——
// 回放驱动、零模型参与（运行期事件全部由循环进度事件流驱动 UI，无模型回合断言面）。
// 三态驱动：
//   态① running —— 3 doc 任务容器启动后循环运行期（进度组卡着陆）读行锚 + aria；
//   态② terminal —— 同容器结算收敛后终态锚（D2：终态标识持续保留）+ aria；
//   态③ suspended —— 径②③故障注入配方（worker 模型档位失效 → worker-abort 退避梯次
//        超限 suspend）→ 循环挂起态锚 + aria。
// 本任务只产出 spec 文件，不执行断言（执行归 1.6 test-run）。
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { launchHost, closeApp, ROOT } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { createBridgeDriver } from '../support/replay/executor.js'

/** 真实凭据源（主检出 dev 实例 dsh-home——同文件同字节播种，walk14 先例） */
const CRED_SRC = join(ROOT, 'apps', 'host', 'userdata.dev', 'dsh-home', '.credentials.yaml')

/** 公共底座（walk14 bootFixture 同款裁剪）：夹具 ws + 隔离 userData → launchHost → 项目 → 提案+任务 → GUI 会话 */
async function bootFixture(options: {
  wsName: string
  slug: string
  proposalTitle: string
  taskTitles: readonly string[]
  forgeSettings?: Record<string, unknown>
}): Promise<{
  page: Page
  app: Parameters<typeof closeApp>[0]
  sessionId: string
  runLoop: (slug: string, rpcId: string) => Promise<void>
  fixtureRoot: string
}> {
  const { wsName, slug, proposalTitle, taskTitles, forgeSettings } = options
  const fixtureRoot = mkdtempSync(join(tmpdir(), `dsh-loopedge-${slug}-ws-`))
  const wsDir = join(fixtureRoot, wsName)
  mkdirSync(wsDir, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: wsDir })
  execFileSync('git', ['config', 'user.email', 'loopedge@e2e.local'], { cwd: wsDir })
  execFileSync('git', ['config', 'user.name', 'loopedge'], { cwd: wsDir })
  writeFileSync(join(wsDir, 'README.md'), 'loopedge fixture\n')
  execFileSync('git', ['add', '.'], { cwd: wsDir })
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: wsDir })
  const userData = mkdtempSync(join(tmpdir(), `dsh-loopedge-${slug}-ud-`))
  mkdirSync(join(userData, 'dsh-home'), { recursive: true })
  copyFileSync(CRED_SRC, join(userData, 'dsh-home', '.credentials.yaml'))
  writeFileSync(join(userData, 'forge-settings.json'), JSON.stringify(forgeSettings ?? {}), 'utf8')
  const launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  const project = await registerProject(page, wsDir, wsName)
  const driver = createBridgeDriver(app)
  await driver.call('forgeProposals', 'createProposal', { projectId: project.id, slug, title: proposalTitle, mode: 'blitz' })
  for (const t of taskTitles) {
    await driver.call('forgeTasks', 'addTask', { projectId: project.id, source: { kind: 'proposal', slug }, title: t, type: 'doc' })
  }
  // 会话创建（官方直通——项目行尾新会话钮 startSession(workspaceId)，walk14 同款）
  await page
    .locator('[data-dswf-sidebar="wide"]', { has: page.locator(`[data-dswf-project="${project.id}"]`) })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(async () => {
      await page.locator('button[aria-label="打开侧边栏"], button[title="打开侧边栏"]').first().click()
      await expect(page.locator(`[data-dswf-project="${project.id}"]`).first()).toBeVisible({ timeout: 15_000 })
    })
  await page.locator('.dswf-sidebar-project-row').first().hover()
  await page.locator('[data-dswf-project-action="new-session"]').first().click({ force: true })
  const sessionRow = page.locator(`[data-dswf-project="${project.id}"] [data-dswf-session]`).first()
  await sessionRow.waitFor({ state: 'visible', timeout: 30_000 })
  const sessionId = await sessionRow.getAttribute('data-dswf-session')
  expect(sessionId, '会话描述（sessionId 在场）').toBeTruthy()
  await page.locator(`[data-dswf-session="${String(sessionId)}"]`).first().click()
  await expect(page.locator('[data-composer-input]').last(), '会话 composer 可用（活 agent）').toBeEnabled({ timeout: 30_000 })
  const manifest = (await page.evaluate(() => {
    const forge = (globalThis as unknown as {
      dshForge?: { getBootManifest(): Promise<{ url: string }> }
    }).dshForge
    if (forge === undefined) throw new Error('dshForge preload 面缺席')
    return forge.getBootManifest()
  })) as { url: string }
  const bootUrl = new URL(manifest.url)
  const boot = await fetch(manifest.url, { redirect: 'manual' })
  const cookie = (boot.headers.get('set-cookie') ?? '').split(';')[0]
  expect(boot.status, '官方认证交换（303 + set-cookie）').toBe(303)
  const runLoop = async (loopSlug: string, rpcId: string): Promise<void> => {
    const res = await fetch(`${bootUrl.origin}/api/commands/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: 'commands/execute',
        payload: { args: { agentId: sessionId, line: `/run-dag-tasks ${loopSlug}`, submittedAttachments: [] } },
      }),
    })
    expect(res.status, `commands/execute HTTP 200（${loopSlug}）`).toBe(200)
  }
  return { page, app, sessionId: String(sessionId), runLoop, fixtureRoot }
}

// ═══════════════════════ 态① running + 态② terminal（同一容器先后覆盖） ═══════════════════════
test('@web-e2e @loop-consol-flywheel-improvement fix-1 sidebar 循环标识态①派发循环中 + 态②循环已结束（锚三件套 + aria）', async () => {
  test.setTimeout(1_800_000)
  const PROP = 'loopedge-prop-a'
  const fx = await bootFixture({
    wsName: 'ws-loopedge-a',
    slug: PROP,
    proposalTitle: 'sidebar 循环标识三态容器甲（running + terminal）',
    taskTitles: [
      'loopedge-任务甲：在 ws 根写 loopedge-a.md 一行内容',
      'loopedge-任务乙：在 ws 根写 loopedge-b.md 一行内容',
      'loopedge-任务丙：在 ws 根写 loopedge-c.md 一行内容',
    ],
  })
  const { page, app, sessionId, runLoop } = fx
  try {
    await runLoop(PROP, 'e2e-loopedge-a')
    const row = page.locator(`[data-dswf-session="${sessionId}"]`).first()

    // ── 态① running：循环运行期行锚三件套 + aria「派发循环中」──
    await expect(
      row,
      '态① 行锚 data-dswf-session-loop="running"（运行期左缘标记在场）',
    ).toHaveAttribute('data-dswf-session-loop', 'running', { timeout: 180_000 })
    await expect(row, '态① 行锚 data-dswf-session-loop-slug 承载容器 slug').toHaveAttribute(
      'data-dswf-session-loop-slug',
      PROP,
    )
    await expect(row, '态① 左缘标记锚 data-dswf-session-loop-edge="running"（流光）').toHaveAttribute(
      'data-dswf-session-loop-edge',
      'running',
    )
    await expect(row, '态① aria「任务源 slug · 状态 派发循环中」').toHaveAttribute(
      'aria-label',
      `任务源 ${PROP} · 状态 派发循环中`,
    )

    // ── 态② terminal：结算收敛后终态锚（D2：终态标识持续保留不消失）──
    await expect(
      row,
      '态② 行锚 data-dswf-session-loop="terminal"（结算收敛）',
    ).toHaveAttribute('data-dswf-session-loop', 'terminal', { timeout: 900_000 })
    await expect(row, '态② 行锚 data-dswf-session-loop-slug 终态保留容器 slug').toHaveAttribute(
      'data-dswf-session-loop-slug',
      PROP,
    )
    await expect(row, '态② 左缘标记锚 data-dswf-session-loop-edge="terminal"（灰质静态）').toHaveAttribute(
      'data-dswf-session-loop-edge',
      'terminal',
    )
    await expect(row, '态② aria「任务源 slug · 状态 循环已结束」').toHaveAttribute(
      'aria-label',
      `任务源 ${PROP} · 状态 循环已结束`,
    )
    // D2 终态保留：持续驻留（10s 窗口内不退化为零标记/渐隐卸载）
    await page.waitForTimeout(10_000)
    await expect(row, '终态标识持续保留（10s 后仍在场）').toHaveAttribute('data-dswf-session-loop', 'terminal')
  } finally {
    await closeApp(app)
    console.log(`[loopedge-A] done; fixture ws kept at ${fx.fixtureRoot}`)
  }
})

// ═══════════════════════ 态③ suspended（径②③故障注入——worker 档位失效） ═══════════════════════
test('@web-e2e @loop-consol-flywheel-improvement fix-1 sidebar 循环标识态③循环挂起（故障注入 → suspend 梯次）', async () => {
  test.setTimeout(1_800_000)
  const PROP = 'loopedge-prop-b'
  const fx = await bootFixture({
    wsName: 'ws-loopedge-b',
    slug: PROP,
    proposalTitle: 'sidebar 循环标识三态容器乙（suspended）',
    taskTitles: ['loopedge-任务丁：在 ws 根写 loopedge-d.md 一行内容'],
    // 真机环境故障注入（walk14 径②③配方）：worker 模型档位失效 → spawn 后 worker 异常
    // 退出 → worker-abort 退避梯次 → 超限 suspend 挂起（suspend/abort-over-limit）。
    forgeSettings: { remoteApproval: { enabled: true }, worker: { provider: 'no-such-provider', model: 'no-such-model', reasoning: 'default' } },
  })
  const { page, app, sessionId, runLoop } = fx
  try {
    await runLoop(PROP, 'e2e-loopedge-b')
    const row = page.locator(`[data-dswf-session="${sessionId}"]`).first()

    // ── 态③ suspended：挂起态行锚三件套 + aria「循环挂起」──
    // 运行期先见 running（循环启动 → 首枚 loop 级事件即 running 态），再入挂起梯次。
    await expect(
      row,
      '态③ 前置：循环启动后行锚 running（挂起梯次前）',
    ).toHaveAttribute('data-dswf-session-loop', 'running', { timeout: 180_000 })
    await expect(
      row,
      '态③ 行锚 data-dswf-session-loop="suspended"（退避超限挂起）',
    ).toHaveAttribute('data-dswf-session-loop', 'suspended', { timeout: 600_000 })
    await expect(row, '态③ 行锚 data-dswf-session-loop-slug 承载容器 slug').toHaveAttribute(
      'data-dswf-session-loop-slug',
      PROP,
    )
    await expect(row, '态③ 左缘标记锚 data-dswf-session-loop-edge="suspended"（琥珀静态）').toHaveAttribute(
      'data-dswf-session-loop-edge',
      'suspended',
    )
    await expect(row, '态③ aria 含状态词「循环挂起」').toHaveAttribute(
      'aria-label',
      `任务源 ${PROP} · 状态 循环挂起`,
    )
  } finally {
    await closeApp(app)
    console.log(`[loopedge-B] done; fixture ws kept at ${fx.fixtureRoot}`)
  }
})
