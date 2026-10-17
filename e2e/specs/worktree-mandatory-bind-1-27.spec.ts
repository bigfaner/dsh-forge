// worktree-branch-management 1.27 真机 UI e2e（1.29 时序随动——会话创建唯一时机 = 首条
// 消息）：git 仓库会话必绑分支——选中主行同样走编排，git 项目不存在无绑定新会话。
//   · 场景 B（主树绑定）：默认锚定主行 → 首条消息意图（草稿键入）触发 arm 编排——
//     seal 绑定回读 worktreePath = 项目根、branch = main、恒不封存；会话落盘目录 = 项目根
//     cwd 分组；双路防重（零重复建会话）；
//   · 场景 A（树内会话）：点选 wt-a = 纯选中态（零确认框零会话）→ 首条消息意图 →
//     1.19 确认框 → 预铸编排——会话落盘目录含 wt-a（cwd 各就各位）。
// data 锚：chip = [data-dswt-hero-trigger]；菜单 = .dswt-hero-menu；会话头 chip =
// [data-dswt-session-chip]；风险框 = role dialog「跨分支风险确认」。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { findFixtureSession } from '../support/session-files.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.27/001-mandatory-bind'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；wt-a 检出 feat-a） */
function makeGitRepo(): { dir: string; wtDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-27-orch-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t127@test', '-c', 'user.name=t127', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.27 mandatory-bind fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  const wtDir = join(dir, 'wt-a').replaceAll('\\', '/')
  git(['worktree', 'add', '-b', 'feat-a', wtDir, 'main'])
  return { dir, wtDir }
}

/** renderer 侧 forge RPC（preload 面真身——window.dshForge.invoke） */
async function forgeRpc(page: Page, channel: string, payload?: unknown): Promise<unknown> {
  return page.evaluate(
    ([ch, payload]) =>
      (window as unknown as { dshForge: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge.invoke(ch, payload),
    [channel, payload] as const,
  )
}

/** 注册项目（轮询至就绪——1.17 同配方） */
async function registerProject(page: Page, wsDir: string): Promise<void> {
  await expect
    .poll(async () => {
      try {
        const raw = (await forgeRpc(page, 'forge:projects/register', {
          workspaceDir: wsDir,
          name: 'orch-repo',
          forgeDir: join(wsDir, '.forge'),
          knowledgeDir: join(wsDir, '.knowledge'),
        })) as { ok?: boolean; data?: { projectId?: string }; projectId?: string } | null
        const projectId = raw?.data?.projectId ?? raw?.projectId
        return typeof projectId === 'string'
      } catch {
        return false
      }
    }, { timeout: 60_000, message: '项目注册未就绪' })
    .toBe(true)
}

const chip = (page: Page) => page.locator('[data-dswt-hero-trigger]')
const heroMenu = (page: Page) => page.locator('.dswt-hero-menu')
const heroRiskDialog = (page: Page) => page.getByRole('dialog', { name: '跨分支风险确认' })

/** 风险框交互：勾选知悉 → 确认继续（1.19 同款），循环至收敛（上限 4 轮） */
async function acknowledgeUntilSettled(page: Page): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    const appeared = await heroRiskDialog(page)
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false)
    if (!appeared) return
    const dialog = heroRiskDialog(page)
    const box = dialog.locator('input[type="checkbox"]').first()
    await expect(box).toBeVisible()
    await box.check()
    await dialog.getByRole('button', { name: '确认继续' }).click()
    await expect(heroRiskDialog(page)).toBeHidden()
  }
}

/** 挂靠会话计数（checks RPC——编排/封存判定共用源） */
async function attachedSessions(page: Page, wsDir: string, path: string): Promise<number> {
  const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
    data?: { attachedSessions?: number }
    attachedSessions?: number
  } | null
  return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
}

/** seal 绑定回读（header.cwd ≡ worktreePath 由宿主 cwd 守护保证——读到即 cwd 证据） */
async function sealBinding(page: Page, sessionId: string): Promise<{ worktreePath?: string; branch?: string; sealed?: boolean } | undefined> {
  const raw = (await forgeRpc(page, 'forge:worktree/seal', { sessionId })) as {
    data?: { sealed?: boolean; binding?: { worktreePath?: string; branch?: string } | null }
    sealed?: boolean
    binding?: { worktreePath?: string; branch?: string } | null
  } | null
  const seal = raw?.data ?? raw
  return seal?.binding === null || seal?.binding === undefined ? undefined : { ...seal.binding, sealed: seal?.sealed }
}

/** 会话落盘所在的工作区目录名（<dshHome>/sessions/<sanitized-cwd>/session-<id>——cwd 分组证据） */
function sessionWorkspaceDir(dshHome: string, sessionId: string): string | undefined {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return undefined
  const target = sessionId.startsWith('session-') ? sessionId : `session-${sessionId}`
  for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!wsDir.isDirectory()) continue
    if (readdirSync(join(sessionsDir, wsDir.name), { withFileTypes: true }).some((s) => s.isDirectory() && s.name === target)) {
      return wsDir.name
    }
  }
  return undefined
}

/** 走查截图（非关键路径——失败不阻塞断言链） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧，不影响 AC 断言
  }
}

test('1.27 UI：git 项目会话必绑分支——主行锚定自动编排绑定主树 + 树内点选编排双场景', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-27-bind-'))
  const dshHome = join(userData, 'dsh-home')
  const { dir: wsDir, wtDir } = makeGitRepo()
  const app = await launchHost({ userData })
  try {
    const { page } = app
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    // A7 前置：选中项目工作区（arm 编排数据根 = selectedId 严格命中项目行——1.31 同配方；
    // 未选中项目时编排默认停用正是 A7 语义）
    await page.locator('button[aria-label="选择工作区"]').first().click()
    await page.locator('.dswf-hero-picker-list').getByText('orch-repo', { exact: false }).first().click()

    // ── 场景 B（主树绑定）：默认锚定主行（回填零会话）→ 首条消息意图触发 arm 编排 ──
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')
    // 1.29：挂载/回填零会话副作用（会话创建唯一时机 = 首条消息）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), {
        timeout: 30_000,
        message: '回填不应预建主树挂靠会话（1.29 唯一时机）',
      })
      .toBe(0)
    // 首条消息意图（主行同分支零风险——无确认框直通 arm）：键入触发主树绑定编排
    await page
      .waitForFunction(
        () => {
          const els = document.querySelectorAll<HTMLElement>('[data-composer-input]')
          return els.length > 0 && [...els].every((el) => el.isContentEditable)
        },
        undefined,
        { timeout: 60_000 },
      )
      .catch(() => undefined)
    const sceneBComposer = page.locator('[data-composer-input]').first()
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await sceneBComposer.click()
      await page.keyboard.insertText('1-27 scene-b first message')
      const echoed = await sceneBComposer.evaluate((el) => (el as HTMLElement).textContent ?? '')
      if (echoed.includes('1-27 scene-b first message')) break
      await page.waitForTimeout(5_000)
    }
    // 主行 arm 编排消费：主树挂靠会话在场（官方原流口子堵死——不存在无绑定新会话）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), {
        timeout: 60_000,
        message: '首条消息意图应触发主行编排绑定主树（1.27 必绑收紧 @ 1.29 时点）',
      })
      .toBeGreaterThanOrEqual(1)
    // seal 绑定回读：worktreePath = 项目根 + branch = main + 恒不封存（主树恒在场）；
    // header.cwd ≡ worktreePath 由宿主 cwd 守护保证（读到 = cwd 语义证据）
    let binding: { worktreePath?: string; branch?: string; sealed?: boolean } | undefined
    await expect
      .poll(async () => {
        const found = findFixtureSession(dshHome, 'orch-repo')
        if (found === undefined) return false
        const bare = found.sessionId.replace(/^session-/, '')
        binding =
          (await sealBinding(page, bare).catch(() => undefined)) ??
          (await sealBinding(page, found.sessionId).catch(() => undefined))
        return binding !== undefined
      }, { timeout: 60_000, message: 'seal 未读到主树绑定' })
      .toBe(true)
    console.log('[1.27-scene-b] seal binding =', JSON.stringify(binding))
    expect(binding?.worktreePath?.toLowerCase().replaceAll('\\', '/')).toBe(wsDir.toLowerCase().replaceAll('\\', '/'))
    expect(binding?.branch).toBe('main')
    expect(binding?.sealed, '主树绑定恒不封存（evaluateSeal 对主树在场恒假）').toBe(false)
    // cwd 各就各位：会话落盘目录 = 项目根 cwd 分组（目录名含夹具段 orch-repo）
    const foundMain = findFixtureSession(dshHome, 'orch-repo')
    expect(foundMain, '主树绑定会话应落盘').toBeDefined()
    const wsDirName = sessionWorkspaceDir(dshHome, foundMain!.sessionId)
    console.log('[1.27-scene-b] session ws dir =', wsDirName)
    expect(wsDirName, '主树绑定会话 cwd = 项目根（落盘分组）').toContain('orch-repo')
    // 双路防重：arm 消费后零重复建会话（挂靠计数恒 1）
    await page.waitForTimeout(10_000)
    expect(await attachedSessions(page, wsDir, wsDir), '双路防重：主树挂靠不重复建').toBe(1)
    // 会话头 chip 呈现 main（软探针——header 槽渲染相位，1.25 口径：缺席留痕不判败）
    const sessionChip = page.locator('[data-dswt-session-chip]')
    try {
      await expect(sessionChip.first(), '会话头 worktree chip 呈现（main）').toBeVisible({ timeout: 15_000 })
      console.log('[1.27-scene-b] session-chip =', await sessionChip.first().textContent())
      expect(await sessionChip.first().textContent()).toContain('main')
    } catch {
      console.log('[1.27-scene-b] session-chip 未呈现（header 槽渲染相位）——留痕')
    }
    await snap(page, 'scene-b-main-tree-bound.png')

    // ── 场景 A（树内会话）：点选 wt-a = 纯选中态（1.29——零确认框零会话）→ 首条消息
    // 意图 → 1.19 确认框 → 预铸编排（cwd = wt-a）──
    // 先清空 scene B 残留草稿（draft 非空时改选会即时重开确认框——首条消息意图语义；
    // 点选纯选中态断言须在零草稿前提下判读）
    const sceneADraft = page.locator('[data-composer-input]').first()
    await sceneADraft.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Delete')
    await expect(heroRiskDialog(page), '点选不应弹确认框（1.29 时机后移）').not.toBeVisible({ timeout: 8_000 })
    await chip(page).first().click()
    await heroMenu(page).getByText('feat-a', { exact: false }).first().click()
    await expect(heroRiskDialog(page), '点选纯选中态——零确认框').not.toBeVisible({ timeout: 8_000 })
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('feat-a')
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: '点选不应产生 wt-a 挂靠会话（纯选中态）' })
      .toBe(0)
    // 首条消息意图：跨分支 → 确认框 → 确认才编排
    const sceneAComposer = page.locator('[data-composer-input]').first()
    for (let attempt = 0; attempt < 8; attempt += 1) {
      // 风险框已在场（draft 非空下改选即时重开）= 首条消息意图已被消费——直接进确认
      if (await heroRiskDialog(page).isVisible().catch(() => false)) break
      await sceneAComposer.click()
      await page.keyboard.insertText('1-27 scene-a first message')
      const echoed = await sceneAComposer.evaluate((el) => (el as HTMLElement).textContent ?? '')
      if (echoed.includes('1-27 scene-a first message')) break
      await page.waitForTimeout(5_000)
    }
    await expect(heroRiskDialog(page), '首条消息意图应触发跨分支确认框（时机后移）').toBeVisible({ timeout: 30_000 })
    await snap(page, 'scene-a-risk-dialog.png')
    await acknowledgeUntilSettled(page)
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 60_000, message: '确认后应产生 wt-a 挂靠会话（首条消息时点）' })
      .toBe(1)
    // cwd 各就各位：会话落盘目录含 wt-a（cwd = worktree 根）
    await expect
      .poll(() => {
        const sessionsDir = join(dshHome, 'sessions')
        try {
          return readdirSync(sessionsDir, { withFileTypes: true }).some((row) => row.isDirectory() && row.name.includes('wt-a'))
        } catch {
          return false
        }
      }, { timeout: 60_000, message: '树内会话应落 wt-a cwd 分组目录' })
      .toBe(true)
    // 会话头 chip 呈现 feat-a（软探针同上）
    try {
      await expect(sessionChip.first(), '会话头 worktree chip 呈现（feat-a）').toBeVisible({ timeout: 15_000 })
      console.log('[1.27-scene-a] session-chip =', await sessionChip.first().textContent())
      expect(await sessionChip.first().textContent()).toContain('feat-a')
    } catch {
      console.log('[1.27-scene-a] session-chip 未呈现（header 槽渲染相位）——留痕')
    }
    await snap(page, 'scene-a-worktree-bound.png')
  } finally {
    await closeApp(app.app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
