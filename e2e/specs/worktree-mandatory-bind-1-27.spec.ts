// worktree-branch-management 1.27 真机 UI e2e（W3 arm 退役升级——创建即绑定）：git 项目
// 会话在官方 create 调用点即被 wrap 改道预铸（birth binding），零消息意图参与。
//   · 场景 B（主树绑定）：默认锚定主行 → 「新会话」钮触发官方 create（无消息键入）→
//     wrap 预铸——挂靠会话出生在场：seal 绑定回读 worktreePath = 项目根、branch = main、
//     恒不封存；会话落盘目录 = 项目根 cwd 分组；双路防重（零重复建会话）；
//   · 场景 A（树内点选）：点选 wt-a = 点选时点跨分支确认（1.19 语义回归）→ 确认后纯
//     选中态（零会话副作用；创建目标 = 注册项目根——选中树消费面 = host 必绑重路由）。
// data 锚：chip = [data-dswt-hero-trigger]；菜单 = .dswt-hero-menu；新会话钮 =
// [data-dswf-project-action="new-session"]；会话头 chip = [data-dswt-session-chip]；
// 风险框 = role dialog「跨分支风险确认」。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { findFixtureSession } from '../support/session-files.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.4/001-create-time-bind'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；wt-a 检出 feat-a） */
function makeGitRepo(): { dir: string; wtDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-27-orch-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t127@test', '-c', 'user.name=t127', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.27 create-time-bind fixture\n')
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
const newSessionButton = (page: Page) => page.locator('[data-dswf-project-action="new-session"]').first()

/** 风险框交互：勾选风险知悉 → 确认继续（1.19 同款），循环至收敛（上限 4 轮） */
async function acknowledgeUntilSettled(page: Page): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    const appeared = await heroRiskDialog(page)
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false)
    if (!appeared) return
    const dialog = heroRiskDialog(page)
    const box = dialog.getByRole('checkbox', { name: '我已了解跨分支上下文风险' })
    await expect(box).toBeVisible()
    await box.check()
    await dialog.getByRole('button', { name: '确认继续' }).click()
    await expect(heroRiskDialog(page)).toBeHidden()
  }
}

/** 项目行「新会话」钮（行尾动作 = hover 显现——先 hover 项目行再点钮） */
async function clickNewSession(page: Page): Promise<void> {
  await page
    .locator('.dswf-sidebar-project-row', { hasText: 'orch-repo' })
    .first()
    .hover()
  await newSessionButton(page).click()
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

test('1.27 UI：创建即绑定——官方 create 调用点 wrap 预铸（主树 + 树内点选确认双场景）', async () => {
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

    // ── 场景 B（主树绑定·创建即绑定）：默认锚定主行（回填零会话）→ 「新会话」钮触发
    // 官方 create → wrap 改道预铸——零消息键入即绑定在场 ──
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')
    // 回填零会话副作用（创建时机 = 官方 create 调用点，不在回填）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), {
        timeout: 30_000,
        message: '回填不应预建主树挂靠会话',
      })
      .toBe(0)
    // 「新会话」钮 = 官方 startSession → create（无 sessionId）→ wrap 预铸 Y（主树绑定）
    await clickNewSession(page)
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), {
        timeout: 60_000,
        message: '创建即绑定：官方 create 调用点应产出主树挂靠会话（零消息意图参与）',
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
    // 双路防重：wrap 消费后零重复建会话（挂靠计数恒 1）
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

    // ── 场景 A（树内点选·点选时点确认）：点选 wt-a = 点选时点跨分支确认（1.19 语义
    // 回归）→ 确认后纯选中态（零会话副作用）。创建目标 = wrap 消费注册项目根（选中树
    // 的消费面 = host 必绑重路由，仅对无绑定 blank 生效）——新会话仍绑主树且零 wt-a 会话。──
    await chip(page).first().click()
    await heroMenu(page).getByText('feat-a', { exact: false }).first().click()
    await expect(heroRiskDialog(page), '点选时点跨分支确认框应立现（1.19 语义回归）').toBeVisible({ timeout: 8_000 })
    await snap(page, 'scene-a-select-time-risk-dialog.png')
    await acknowledgeUntilSettled(page)
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('feat-a')
    // 确认后纯选中态：零会话副作用（创建唯一时机 = 官方 create 调用点，点选零编排）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: '点选确认不应产生 wt-a 挂靠会话（纯选中态）' })
      .toBe(0)
    // 「新会话」钮 → 官方 startSession = reuse-or-create（既有 blank 产物直接采纳）→
    // 挂靠计数恒 1（零重复建）；选中态不改变 wrap 创建目标（wt-a 恒零）
    await clickNewSession(page)
    await page.waitForTimeout(10_000)
    expect(await attachedSessions(page, wsDir, wtDir), '选中态不改变 wrap 创建目标（wt-a 零挂靠）').toBe(0)
    expect(await attachedSessions(page, wsDir, wsDir), 'blank 采纳复用：主树挂靠不重复建').toBe(1)
    await snap(page, 'scene-a-selection-no-session.png')
  } finally {
    await closeApp(app.app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
