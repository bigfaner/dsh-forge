// binding-derivation 真机 UI e2e（重写）：chat-view 会话头分支 chip §2.3.1 目标形态。
// worktree 经产品创建弹窗建立（流程 A——官方 workspace 幂等创建 + DTO 携带 workspaceId）。
//   · chip 分支实时跟随：实时解析 header.cwd——手动 git switch 后 chip 显示新分支；
//   · ahead/behind 内联：`数字+箭头`（`1↓ 1↑` = 落后在前）于分支名旁（chip 折叠态
//     data-dswt-chip-ab + 信息卡 data-dswt-chip-ab-inline），独立「领先/落后」行不再出现；
//   · 信息卡行序：分支 → worktree → 项目 → 工作区（「路径」label 更名「工作区」）；
//   · branch 漂移 banner（data-dswt-bind-drift-notice）：git switch 后出现（实时 ≠ 留痕），
//     切回后消失（判定随 seal 渲染现算——会话切换重挂触发）。
// 断言面 = forge:worktree/seal（branchDrift/aheadBehind host 解析面单点）。
// data 锚：chip = [data-dswt-session-chip]；信息卡 = [data-dswt-session-chip-popover]；
// hero chip = [data-dswt-hero-trigger]；菜单 = .dswt-hero-menu；创建弹窗 =
// data-dswt-worktree-input / data-dswt-branch-input / data-dswt-create-submit；
// 会话行 = [data-dswf-session]。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost, stablePhase, waitShellReady } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'D:/software/dsh-forge/data/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/binding-derivation/1.9/003-hero-chip'
mkdirSync(EVIDENCE_DIR, { recursive: true })

/**
 * 隔离 git 仓库夹具（真 git CLI——含 upstream 使 ahead/behind 非零）：
 * 主树 main = ahead 1 / behind 1（本地独有提交 + upstream 独有提交）；
 * wt-a 经产品创建弹窗建立（流程 A），检出 feat-a。
 */
function makeGitRepo(): string {
  const git = (args: string[], cwd: string): void => {
    execFileSync('git', ['-c', 'user.email=chip@test', '-c', 'user.name=chip', ...args], { cwd, stdio: 'pipe' })
  }
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-chip-repo-'))
  writeFileSync(join(dir, 'README.md'), 'chip fixture\n')
  git(['init', '-b', 'main'], dir)
  git(['add', '.'], dir)
  git(['commit', '-m', 'init'], dir)
  // bare origin + push -u（main 建立跟踪）
  const origin = join(dir, 'origin.git')
  git(['clone', '--bare', dir, origin], dir)
  git(['remote', 'add', 'origin', origin], dir)
  git(['push', '-u', 'origin', 'main'], dir)
  // behind 1：第二 clone 提交推 upstream
  const clone2 = join(dir, 'clone2')
  git(['clone', origin, clone2], dir)
  writeFileSync(join(clone2, 'BEHIND.md'), 'upstream only\n')
  git(['add', '.'], clone2)
  git(['commit', '-m', 'behind'], clone2)
  git(['push', 'origin', 'main'], clone2)
  git(['fetch', 'origin'], dir)
  // ahead 1：主树本地独有提交
  writeFileSync(join(dir, 'AHEAD.md'), 'local only\n')
  git(['add', '.'], dir)
  git(['commit', '-m', 'ahead'], dir)
  return dir
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
          name: 'chip-repo',
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

const heroChip = (page: Page) => page.locator('[data-dswt-hero-trigger]')
const heroMenu = (page: Page) => page.locator('.dswt-hero-menu')
const heroRiskDialog = (page: Page) => page.getByRole('dialog', { name: '跨分支风险确认' })
const newSessionButton = (page: Page) => page.locator('[data-dswf-project-action="new-session"]').first()
const sessionChip = (page: Page) => page.locator('[data-dswt-session-chip]')
const driftBanner = (page: Page) => page.locator('[data-dswt-bind-drift-notice]')

/**
 * 经产品创建弹窗建 worktree（流程 A：git worktree add + 官方 workspace 幂等创建 + DTO
 * 携带 workspaceId）。外部 git CLI 建树不产生官方 workspace record（list 只读解析）——
 * 选树路由（chip 双发 workspaceId）的 fixture 前置必须走此径。
 */
async function createWorktreeViaDialog(page: Page, projectRoot: string, branch: string, name: string): Promise<void> {
  await heroChip(page).first().click()
  await heroMenu(page).getByText('新建 worktree…', { exact: false }).first().click()
  await page.locator('[data-dswt-branch-input]').fill(branch)
  await page.locator('[data-dswt-worktree-input]').fill(name)
  await page.locator('[data-dswt-create-submit]').click()
  await expect
    .poll(async () => {
      try {
        const raw = (await forgeRpc(page, 'forge:worktree/list', { projectRoot })) as {
          data?: { entries?: Array<{ worktreeName?: string; workspaceId?: string }> }
          entries?: Array<{ worktreeName?: string; workspaceId?: string }>
        } | null
        const entries = raw?.data?.entries ?? raw?.entries ?? []
        return entries.some((row) => row.worktreeName === name && typeof row.workspaceId === 'string' && row.workspaceId !== '')
      } catch {
        return false
      }
    }, { timeout: 60_000, message: `worktree ${name} 应入清单且携带 workspaceId（流程 A 闭环）` })
    .toBe(true)
}

/** 风险框交互：勾选风险知悉 → 确认继续（1.19 同款） */
async function acknowledgeAndConfirm(page: Page): Promise<void> {
  const dialog = heroRiskDialog(page)
  const box = dialog.getByRole('checkbox', { name: '我已了解跨分支上下文风险' })
  await expect(box).toBeVisible()
  await box.check()
  await dialog.getByRole('button', { name: '确认继续' }).click()
  await expect(heroRiskDialog(page)).toBeHidden()
}

/** 选中 worktree 行（跨分支首次点选弹确认框——闩锁后直通） */
async function selectWorktree(page: Page, text: string): Promise<void> {
  await heroChip(page).first().click()
  await heroMenu(page).getByText(text, { exact: false }).first().click()
  const appeared = await heroRiskDialog(page)
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false)
  if (appeared) await acknowledgeAndConfirm(page)
  await expect.poll(async () => (await heroChip(page).first().textContent()) ?? '', { timeout: 30_000 })
    .toContain(text)
}

/** 项目行「新会话」钮（行尾动作 = hover 显现；显式 workspaceId = 项目根 workspace 直通） */
async function clickNewSession(page: Page): Promise<void> {
  await page
    .locator('.dswf-sidebar-project-row', { hasText: 'chip-repo' })
    .first()
    .hover()
  await newSessionButton(page).click()
}

/** 官方壳「新会话」钮（无参 startSession——入口锚定 wrap 消费 chip 显示选中树路由） */
async function clickOfficialNewSession(page: Page): Promise<void> {
  const exact = page.getByRole('button', { name: '新会话', exact: true })
  if (await exact.first().isVisible().catch(() => false)) {
    await exact.first().click()
    return
  }
  await page.getByRole('button', { name: /新会话|新建会话/ }).first().click()
}

/** 活跃（data-selected）会话行 id */
async function activeSessionId(page: Page): Promise<string> {
  return (await page.locator('[data-dswf-session][data-selected]').first().getAttribute('data-dswf-session')) ?? ''
}

/** 重挂触发 seal 现算（页面重载 → 重开主树会话行——判定随渲染现算，无轮询内建；
 *  非 blank 主树会话行在列，逐行点击 + data-selected 回读匹配） */
async function remountAndOpenRoot(page: Page, rootSessionId: string): Promise<void> {
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await waitShellReady(page)
  await dismissOnboardingModals(page)
  await stablePhase(page)
  const needle = rootSessionId.replace(/^session-/, '')
  const rows = page.locator('[data-dswf-session]')
  const n = await rows.count()
  for (let i = 0; i < n; i += 1) {
    await rows.nth(i).click()
    await page.waitForTimeout(800)
    if ((await activeSessionId(page)).includes(needle)) return
  }
  throw new Error(`重开后未找到主树会话行：${rootSessionId}（行数 ${n}）`)
}

/** 走查截图（非关键路径——失败不阻塞断言链） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧，不影响 AC 断言
  }
}

test('hero-chip UI（推导制）：chip 实时分支 + 内联 ahead/behind + §2.3.1 形态 + 漂移 banner', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-chip-'))
  const wsDir = makeGitRepo()
  const git = (args: string[]): void => {
    execFileSync('git', args, { cwd: wsDir, stdio: 'pipe' })
  }
  const app = await launchHost({ userData })
  const consoleLog: string[] = []
  try {
    const { page } = app
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`))
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(heroChip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    await expect.poll(async () => (await heroChip(page).count()) > 0 ? await heroChip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')

    // ── 建两个会话（主树 + wt-a）供切换重挂（blank 复用天然命中：每树恒一个）──
    await createWorktreeViaDialog(page, wsDir, 'feat-a', 'wt-a')
    await clickNewSession(page)
    let rootSessionId = ''
    await expect
      .poll(async () => (rootSessionId = await activeSessionId(page)), { timeout: 60_000, message: '主树会话应激活' })
      .not.toBe('')
    await selectWorktree(page, 'feat-a')
    await clickOfficialNewSession(page)
    // wt-a 会话应激活（id ≠ 主树会话——官方 create 落所选树）
    const rootUuid = rootSessionId.replace(/^session-/, '')
    await expect
      .poll(async () => {
        const id = await activeSessionId(page)
        return id !== '' && !id.includes(rootUuid) ? id : ''
      }, { timeout: 60_000, message: 'wt-a 会话应激活' })
      .not.toBe('')

    // ── AC：§2.3.1 目标形态（主树会话，main ahead 1 / behind 1）——项目行「新会话」
    // 重开主树视图；header actions 槽 chip 在会话非空后渲染，先发一条 marker 消息 ──
    await clickNewSession(page)
    const MARKER = 'hero-chip-root-first-message'
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
    const composer = page.locator('[data-composer-input]').first()
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await composer.click()
      await page.keyboard.insertText(MARKER)
      const echoed = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')
      if (echoed.includes(MARKER)) break
      await page.waitForTimeout(5_000)
    }
    const sendButton = page.getByRole('button', { name: '发送消息' })
    await composer.click()
    if (await sendButton.isEnabled().catch(() => false)) await sendButton.click().catch(() => {})
    else await page.keyboard.press('Enter')
    // 落账判读：会话行标题 = 消息文本（非 blank 会话行入列——header actions 槽渲染前提）
    await expect
      .poll(async () => {
        const rows = page.locator('[data-dswf-session]')
        const n = await rows.count()
        for (let i = 0; i < n; i += 1) {
          if (((await rows.nth(i).textContent()) ?? '').includes(MARKER)) return true
        }
        return false
      }, { timeout: 60_000, message: 'marker 消息应落账（主树会话转非 blank）' })
      .toBe(true)
    await expect(sessionChip(page).first(), '会话 chip 分支名实时呈现').toContainText('main', { timeout: 30_000 })
    // 内联 ahead/behind（折叠态）：`↑1 ↓1`（ahead 在前），独立「领先/落后」行不再出现
    await expect(sessionChip(page).locator('[data-dswt-chip-ab]')).toHaveText(/↑1/, { timeout: 30_000 })
    await expect(sessionChip(page).locator('[data-dswt-chip-ab]')).toHaveText(/↓1/)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText, '独立「领先/落后」行已移除').not.toContain('领先/落后')
    // 信息卡：行序 分支 → worktree → 项目 → 工作区；「路径」label 更名「工作区」；
    // 内联 `1↓ 1↑`（落后在前）于分支名旁
    await sessionChip(page).first().click()
    const card = page.locator('[data-dswt-session-chip-popover]')
    await expect(card).toBeVisible()
    const cardText = await card.innerText()
    console.log('[chip] info card =', JSON.stringify(cardText))
    expect(cardText).toContain('工作区')
    expect(cardText).not.toContain('路径')
    expect(cardText).toContain('1↓ 1↑')
    expect(cardText, '内联 ahead/behind 于分支名旁').toMatch(/main\s*1↓ 1↑/)
    const idx = (label: string): number => cardText.indexOf(label)
    expect(idx('分支'), '行序① 分支').toBeGreaterThanOrEqual(0)
    expect(idx('worktree'), '行序② worktree 在分支后').toBeGreaterThan(idx('分支'))
    expect(idx('项目'), '行序③ 项目在 worktree 后').toBeGreaterThan(idx('worktree'))
    expect(idx('工作区'), '行序④ 工作区在项目后').toBeGreaterThan(idx('项目'))
    expect(cardText.replaceAll('\\', '/'), '信息卡含工作区路径').toContain(wsDir.replaceAll('\\', '/'))
    await snap(page, 'info-card-2-3-1.png')

    // ── AC：chip 分支实时跟随 + 漂移 banner 出现——手动 git switch（main → feat-b）──
    git(['switch', '-c', 'feat-b'])
    await remountAndOpenRoot(page, rootSessionId)
    await expect(sessionChip(page).first(), 'chip 分支实时跟随：显示切换后分支').toContainText('feat-b', { timeout: 30_000 })
    await expect(driftBanner(page), '漂移 banner 应出现（留痕 main ≠ 实时 feat-b）').toBeVisible({ timeout: 30_000 })
    const bannerText = await driftBanner(page).innerText()
    console.log('[chip] drift banner =', JSON.stringify(bannerText))
    expect(bannerText).toContain('main')
    expect(bannerText).toContain('feat-b')
    await snap(page, 'drift-banner-visible.png')

    // ── AC：切回即消失——git switch main 后 banner 消失，chip 回 main ──
    git(['switch', 'main'])
    await remountAndOpenRoot(page, rootSessionId)
    await expect(sessionChip(page).first(), 'chip 分支实时跟随：切回 main').toContainText('main', { timeout: 30_000 })
    await expect(driftBanner(page), '切回后漂移 banner 应消失（判定随渲染现算）').toBeHidden({ timeout: 30_000 })
    await snap(page, 'drift-banner-gone.png')
  } finally {
    // 判读留痕：runner stdout（Tee 日志）+ 证据目录双落
    console.log('[renderer-console]\n' + consoleLog.join('\n'))
    try {
      writeFileSync(join(EVIDENCE_DIR, 'renderer-console.log'), consoleLog.join('\n'), 'utf8')
    } catch {
      // 留痕失败不影响清理
    }
    await closeApp(app.app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
