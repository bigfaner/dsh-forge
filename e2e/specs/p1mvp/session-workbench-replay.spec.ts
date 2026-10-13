// @feature:dsh-forge-p1-mvp @web-e2e
// session-workbench 回放版（worker-exec-evidence-replay/1.5——提案附录 D 层：会话 UI 走
// 转录播种）。「模型」变量由转录种子承载（e2e/support/replay/transcript-seed.ts——官方
// startSession 开户 + 确定性手写回合追加重写，session format v4 版本锚），零真实模型调用；
// 冒烟（session-workbench.spec.ts dogfood 组）的 UI/确定性面断言逐条保留，只换「模型」：
//   Step 2 往返 → 播种转录渲染（对话 tab：用户行 + 助手行在位）
//   Step 3 轨迹 → 官方轨迹表 user 行（本轮提问）+ tool 行（种子工具调用）
//   Step 4 恢复 → 新会话再点回历史行，转录完整呈现
//   书海背景/主题跟随/沉底结构（fix-38/44 断言随行迁移）+ Step 5 右栏展开/草稿/知识视图
//   互换/切回恢复——与冒烟同锚照跑。
// 去模型化门：隔离 home 不播种凭据（零模型配置依赖——真实模型不可用即失败可见）。
// 复启形态：同 userData 二次 launchHost（官方开户的会话目录/账本绑定复用——播种在两次
// launch 之间的盘面进行；工作台挂载竞态以 generous 超时 + ensureNoBlockingDialog 承载）。
import { mkdtempSync, readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject } from '../../support/rpc.js'
import { bestSessionLog, decodeSessionFile } from '../../support/session-files.js'
import { seedTranscript, refreshSessionProjcache } from '../../support/replay/transcript-seed.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import {
  COMPOSER_INPUT,
  CONVERSATION_CONTENT,
  DOCKKIT_STRIP_TAB,
  KNOWLEDGE_ENTRY,
  NAV_SHELL,
  RIGHTBAR_COLLAPSED,
  SIDEBAR_RIGHT_EXPAND,
  TAB_ITEM,
  TRAJECTORY_SCROLL,
  WORKBENCH,
  projectActionOf,
  projectRowOf,
  sessionRowOf,
  trajectoryRow,
  workbenchOfView,
} from '../../support/anchors.js'

const FIXTURE_USER = '列出当前工作区根目录下的文件'
const FIXTURE_ASSISTANT = '工作区根目录下有 fixture-file.txt（哨兵文件）与 .knowledge/ 目录。'
const FIXTURE_TOOL_RESULT = 'fixture-file.txt'
const FIXTURE_TITLE = '回放夹具：列工作区文件'

/** 工作区夹具：{root}/<name>（含哨兵文件——种子工具调用的确定性对象） */
function makeWorkspaceFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-swr-'))
  mkdirSync(join(root, name, '.knowledge'), { recursive: true })
  writeFileSync(join(root, name, 'fixture-file.txt'), 'sentinel', 'utf8')
  return root
}

test('@web-e2e @p1mvp session-workbench·回放版：转录播种→对话/轨迹/恢复→右栏保留——零真实模型', async () => {
  test.setTimeout(900_000)
  const fixtureRoot = makeWorkspaceFixture('sw-replay')
  const wsDir = join(fixtureRoot, 'sw-replay')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-swr-ud-'))
  const dshHome = join(userData, 'dsh-home')
  let launched: Launched | undefined
  try {
    // ── launch #1：注册项目 + 官方开户会话（blank——零消息零往返）──
    launched = await launchHost({ userData })
    const page = launched.page
    const project = await registerProject(page, wsDir, 'sw-replay')
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    const block = page.locator(projectRowOf(project.id))
    await expect(block.locator('.dswf-sidebar-project-row').first(), '项目行在场').toBeVisible({ timeout: 30_000 })
    await block.locator('.dswf-sidebar-project-row').first().hover() // 行尾动作钮 hover 显形（tree-row 同径）
    await block.locator(projectActionOf('new-session')).click()
    await page.waitForTimeout(3_000) // 官方 startSession 落盘收敛窗（同冒烟静置口径）
    await ensureNoBlockingDialog(page)

    // 官方账本绑定面（storages/workspace.json 直读）：取 sw-replay workspace 行的绑定会话
    // ——开户可能多于账本可见（boot 期会话不绑行），播种必须落在账本绑定会话上（侧栏 =
    // 账本 sessionIds ∩ sessions 快照；绑外目录播种不入树——首轮实测教训）。
    const sessionsDir = join(dshHome, 'sessions')
    const wsDirEntries = readdirSync(sessionsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.includes('sw-replay'))
    expect(wsDirEntries, '官方会话项目目录在盘').toHaveLength(1)
    const ledger = JSON.parse(readFileSync(join(dshHome, 'storages', 'workspace.json'), 'utf8')) as {
      tables?: { workspaces?: Record<string, { path?: string; sessionIds?: string[] }> }
    }
    const wsRow = Object.values(ledger.tables?.workspaces ?? {}).find((r) => r.path === wsDir)
    expect(wsRow, 'sw-replay workspace 账本行在场（注册绑定）').toBeDefined()
    const boundIds = wsRow?.sessionIds ?? []
    expect(boundIds.length, '账本绑定会话 ≥1（startSession 开户绑定）').toBeGreaterThanOrEqual(1)
    const sessionId = boundIds[boundIds.length - 1]!
    const logBefore = bestSessionLog(join(sessionsDir, wsDirEntries[0]!.name, sessionId))
    expect(logBefore, '绑定会话日志在盘（header 起步）').toBeDefined()
    await closeApp(launched.app)
    launched = undefined

    // ── 播种：确定性转录代位（在盘面进行——两次 launch 之间）──
    const userSeq = seedTranscript(logBefore!, {
      userText: FIXTURE_USER,
      assistantText: FIXTURE_ASSISTANT,
      tool: { name: 'read_file', arguments: '{"path":"fixture-file.txt"}', resultText: FIXTURE_TOOL_RESULT },
      title: FIXTURE_TITLE,
    })
    // 投影缓存同步（listing 可见性承载——冷会话元数据源，见 transcript-seed 注记）
    refreshSessionProjcache(dshHome, sessionId, { title: FIXTURE_TITLE, asOfSeq: userSeq + 9, lastPromptAt: Date.now() })
    const seededEvents = decodeSessionFile(logBefore!)
    expect(seededEvents.find((e) => e.seq === userSeq)?.type, '种子 user 行在盘（seq 对账）').toBe('user/message')
    expect(seededEvents.map((e) => e.type), '种子工具调用在盘（fixture 保证——零模型往返代位）').toContain('tool/call')

    // ── launch #2：回放面走查 ──
    launched = await launchHost({ userData })
    const page2 = launched.page
    await expect(page2.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 60_000 })
    await expect(page2.locator(NAV_SHELL).first(), '官方导航壳在场').toBeVisible({ timeout: 30_000 })
    await ensureNoBlockingDialog(page2)

    // Step 4 恢复链载体：侧栏会话行（账本绑定 + 标题 = 种子 session/title）
    const sessionRow = page2.locator(sessionRowOf(sessionId)).first()
    await expect(sessionRow, '种子会话行入列（账本实时读）').toBeVisible({ timeout: 60_000 })
    await expect(sessionRow.locator('.dswf-sidebar-session-title'), '行语言：种子标题在场').toContainText(FIXTURE_TITLE, { timeout: 30_000 })

    // Step 4 回放面：先开新会话再点回历史行 → 转录完整呈现（恢复链载体——冒烟同径）。
    // 项目行锚必须在 page2 上重取——launch#1 的 page/block 已随 closeApp 关闭（复启用旧
    // locator = 「Target page closed」即发即崩；1.9 实测教训）。
    const block2 = page2.locator(projectRowOf(project.id))
    await block2.locator('.dswf-sidebar-project-row').first().hover() // 行尾动作钮 hover 显形（tree-row 同径）
    await block2.locator(projectActionOf('new-session')).click()
    await page2.waitForTimeout(2_000)
    await ensureNoBlockingDialog(page2) // 零凭据形态二次开户的晚到 onboarding 模态收口（tree-row 同径）
    await sessionRow.click()
    await expect(page2.locator(CONVERSATION_CONTENT).first()).toBeVisible()
    await expect
      .poll(
        async () =>
          (await page2.locator(CONVERSATION_CONTENT).first().textContent({ timeout: 10_000 }).catch(() => '')) ?? '',
        { timeout: 60_000, message: '播种转录完整呈现（消息与工具调用按时间序）' },
      )
      .toContain(FIXTURE_USER)
    await expect(page2.locator(CONVERSATION_CONTENT).first(), '助手回合渲染（模型变量 = 种子代位）').toContainText(FIXTURE_ASSISTANT)

    // fix-38：active 相位书海背景在场（确定性 UI 面断言随行保留——冒烟同锚）
    await expect
      .poll(
        async () =>
          await page2
            .evaluate(() => {
              const el = document.querySelector('[data-conversation-content]')
              return el === null ? '' : window.getComputedStyle(el, '::after').backgroundImage
            })
            .catch(() => ''),
        { timeout: 30_000, message: 'fix-38：active 相位书海背景在场（鲸游书海统一插画）' },
      )
      .toContain('whale-hero-bg.svg')
    // 主题跟随（双向显式翻转——brand spec 同径）
    const seaFilter = async (dark: boolean): Promise<string> =>
      await page2
        .evaluate((d) => {
          if (d) document.body.setAttribute('data-ds-dark-theme', '')
          else document.body.removeAttribute('data-ds-dark-theme')
          const el = document.querySelector('[data-conversation-content]')
          return el === null ? '' : window.getComputedStyle(el, '::after').filter
        }, dark)
        .catch(() => '')
    expect(await seaFilter(true), '暗色主题：插画提亮层在场').toContain('brightness')
    expect(await seaFilter(false), '浅色回位：提亮层退场').not.toContain('brightness')

    // Step 3 轨迹：官方轨迹表 user 行（本轮提问）+ tool 行（种子工具调用）+ 切回不重置
    await page2.locator(TAB_ITEM, { hasText: '轨迹' }).click()
    await expect(page2.locator(TRAJECTORY_SCROLL).first(), '官方轨迹视图渲染').toBeVisible({ timeout: 60_000 })
    await expect(
      page2.locator(trajectoryRow('user'), { hasText: FIXTURE_USER }).first(),
      '官方轨迹表含本轮提问行',
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page2.locator(trajectoryRow('tool')).first(),
      '官方轨迹表含 ≥1 条工具调用行（种子代位）',
    ).toBeVisible({ timeout: 60_000 })
    await page2.locator(TAB_ITEM, { hasText: '对话' }).click()
    await expect(page2.locator(CONVERSATION_CONTENT).first(), '切回对话 tab 转录仍在原位').toContainText(FIXTURE_USER)

    // Step 5：右栏展开 + 草稿 + 知识视图互换 + 切回恢复（右栏状态保留 + 转录保留）
    const expandButton = page2.locator(SIDEBAR_RIGHT_EXPAND).first()
    await expect(expandButton, '面板钮在场（官方右栏收展入口）').toBeVisible({ timeout: 30_000 })
    await expandButton.click()
    await expect(page2.locator(RIGHTBAR_COLLAPSED), '官方右栏展开（frame 收起标记退场）').toHaveCount(0)
    await expect(page2.locator(DOCKKIT_STRIP_TAB).first(), '页签条在场').toBeVisible()
    const composer = page2.locator(COMPOSER_INPUT).last()
    await composer.click()
    await page2.keyboard.insertText('待发问题')
    await page2.locator(KNOWLEDGE_ENTRY).first().click()
    await expect(page2.locator(workbenchOfView('knowledge')).first()).toBeAttached()
    await expect(page2.locator(RIGHTBAR_COLLAPSED).first(), '知识模式右栏隐藏').toBeAttached()
    await sessionRow.click()
    await expect(page2.locator(workbenchOfView('session')).first()).toBeAttached()
    await expect(page2.locator(RIGHTBAR_COLLAPSED), '切回后右栏恢复原展开态（rightbarViewPlan 记忆恢复）').toHaveCount(0)
    const draftText = await composer.evaluate((el) => (el as HTMLTextAreaElement).value ?? el.textContent ?? '')
    expect(draftText, '保留探针①：草稿「待发问题」仍在输入框').toContain('待发问题')
    await expect
      .poll(
        async () =>
          (await page2.locator(CONVERSATION_CONTENT).first().textContent({ timeout: 10_000 }).catch(() => '')) ?? '',
        { timeout: 60_000, message: '保留探针②：播种转录仍完整呈现' },
      )
      .toContain(FIXTURE_USER)
    expect(launched.pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    if (process.env.DSH_FORGE_SW_REPLAY_KEEP !== '1') {
      await rmDirBestEffort(userData)
      await rmDirBestEffort(fixtureRoot)
    } else {
      console.log('[sw-replay] 证据保留：', `userData=${userData}`, `fixtureRoot=${fixtureRoot}`)
    }
  }
})
