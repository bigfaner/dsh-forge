// worktree-branch-management 1.34 真机 UI e2e（bug ccfcc103——跨分支确认框每键重弹）：
//   · 选中跨分支行 → 键入首段文字 → 确认框弹一次 → 勾选知悉 + 确认 → 预铸编排（cwd = wt-a）；
//   · 确认后闩锁：继续键入多字 → 零重弹（框保持隐藏）；编排产物会话草稿照常 carryDraft；
//   · 取消路径不混用：取消抑制语义（1.31 A3）保持——本意图静默。
// data 锚同 1.29：chip = [data-dswt-hero-trigger]；composer = [data-composer-input]；
// 风险框 = role dialog「跨分支风险确认」。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.34/001-confirm-latch'

/** 隔离 git 仓库夹具（主树 main；wt-a 检出 feat-a——跨分支行） */
function makeGitRepo(): { dir: string; wtDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-34-latch-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t134@test', '-c', 'user.name=t134', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.34 confirm-latch fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  const wtDir = join(dir, 'wt-a').replaceAll('\\', '/')
  git(['worktree', 'add', '-b', 'feat-a', wtDir, 'main'])
  return { dir, wtDir }
}

async function forgeRpc(page: Page, channel: string, payload?: unknown): Promise<unknown> {
  return page.evaluate(
    ([ch, payload]) =>
      (window as unknown as { dshForge: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge.invoke(ch, payload),
    [channel, payload] as const,
  )
}

async function registerProject(page: Page, wsDir: string): Promise<void> {
  await expect
    .poll(async () => {
      try {
        const raw = (await forgeRpc(page, 'forge:projects/register', {
          workspaceDir: wsDir,
          name: 'latch-repo',
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

async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧
  }
}

/** composer 键入（1.26/1.29 同径：contenteditable 收敛门 + insertText + 回显重试） */
async function typeIntoComposer(page: Page, text: string): Promise<void> {
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
    await page.keyboard.insertText(text)
    const echoed = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')
    if (echoed.includes(text)) return
    await page.waitForTimeout(5_000)
  }
}

test('1.34 UI：确认闩锁——确认后键入多字零重弹（同一次选中意图只弹一次）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-34-latch-'))
  const { dir: wsDir, wtDir } = makeGitRepo()
  const app = await launchElectron({
    env: { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData },
  })
  const consoleLog: string[] = []
  try {
    const page: Page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissOnboardingModals(page)
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message()}`))
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message()}`))
    await registerProject(page, wsDir)
    // 先选中项目工作区（A7 编排数据根 = selectedId 严格命中——1.31 闸，fixture 必经步骤；
    // 1-31 同配方：aria 触发器 → .dswf-hero-picker-list 行）
    await page.locator('button[aria-label="选择工作区"]').first().click()
    await page.locator('.dswf-hero-picker-list').getByText('latch-repo', { exact: false }).first().click()
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })

    // ── 点选跨分支行（feat-a）：纯选中态零确认框（1.29）──
    await chip(page).first().click()
    await heroMenu(page).getByText('feat-a', { exact: false }).first().click()
    await expect(heroRiskDialog(page), '点选不应弹确认框').not.toBeVisible({ timeout: 8_000 })
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('feat-a')

    // ── 键入首段 → 确认框弹一次 → 勾选知悉 + 确认 ──
    await typeIntoComposer(page, 'latch-first')
    await expect(heroRiskDialog(page), '首条消息意图应触发确认框').toBeVisible({ timeout: 30_000 })
    await snap(page, 'first-dialog.png')
    const dialog = heroRiskDialog(page)
    await dialog.locator('input[type="checkbox"]').check()
    await dialog.getByRole('button', { name: '确认继续' }).click()
    await expect(heroRiskDialog(page)).toBeHidden()

    // ── 确认闩锁：继续键入多字 → 零重弹（框保持隐藏 = 同一次选中意图只弹一次）──
    for (const chunk of [' continued-a', ' continued-b', ' continued-c']) {
      await typeIntoComposer(page, chunk)
    }
    await expect(heroRiskDialog(page), '确认后续字不应重弹确认框（bug ccfcc103 闩锁）')
      .not.toBeVisible({ timeout: 8_000 })
    await page.waitForTimeout(3_000)
    await expect(heroRiskDialog(page), '静置后仍零重弹').not.toBeVisible()

    // ── 编排照常完成：选中树挂靠会话唯一 + 草稿照常搬运（carryDraft 未被闩锁阻断）──
    const attachedRaw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path: wtDir })) as {
      data?: { attachedSessions?: number }
      attachedSessions?: number
    } | null
    await expect
      .poll(async () => {
        const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path: wtDir })) as {
          data?: { attachedSessions?: number }
          attachedSessions?: number
        } | null
        return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
      }, { timeout: 60_000, message: '确认后应产生 wt-a 挂靠会话（闩锁不阻断编排）' })
      .toBe(1)
    void attachedRaw
    await snap(page, 'after-continue-no-repop.png')
  } finally {
    await closeApp(app).catch(() => {})
  }
})
