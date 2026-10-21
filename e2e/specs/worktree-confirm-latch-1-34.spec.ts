// worktree-branch-management 1.34 真机 UI e2e（设计 A 重锚——点选时点确认，用户裁决 2026-10-18）：
//   · 点选跨分支行 → 点选时点确认框立现；确认后才切选中态（chip 回填）；
//   · 确认闩锁：同行重选零弹框（静默切换——零弹框、零等待）；
//   · 「不再提示」：勾选确认 → forge settings 持久化（get 回读 true）→ 跨分支点选静默切换；
//   · 取消路径：本次改选未发生（chip 保持原行）+ mask 退场干净（composer 可点零遮挡）。
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
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.8/001-confirm-latch'

/** 隔离 git 仓库夹具（主树 main；wt-a 检出 feat-a、wt-b 检出 feat-b——两条跨分支行） */
function makeGitRepo(): { dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-34-latch-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t134@test', '-c', 'user.name=t134', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.34 confirm-latch fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  git(['worktree', 'add', '-b', 'feat-a', join(dir, 'wt-a'), 'main'])
  git(['worktree', 'add', '-b', 'feat-b', join(dir, 'wt-b'), 'main'])
  return { dir }
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
const composer = (page: Page) => page.locator('[data-composer-input]').first()

async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧
  }
}

async function pickMenuRow(page: Page, text: string): Promise<void> {
  await chip(page).first().click()
  await heroMenu(page).getByText(text, { exact: false }).first().click()
}

async function chipText(page: Page): Promise<string> {
  return (await chip(page).first().textContent()) ?? ''
}

/** mask 退场干净（设计 A 缺陷②）：确认框关闭后 composer 可点、可聚焦（零遮挡残留） */
async function expectComposerReachable(page: Page, label: string): Promise<void> {
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
  await composer(page).click({ timeout: 8_000 }).catch(() => {
    throw new Error(`${label}：composer 点击被遮挡（mask 残留）`)
  })
}

/** 「不再提示」持久化回读（forge:settings/get——闩锁状态跨会话持久证据） */
async function crossBranchDismissed(page: Page): Promise<boolean> {
  const raw = (await forgeRpc(page, 'forge:settings/get')) as {
    data?: { worktree?: { crossBranchRiskDismissed?: boolean } }
    worktree?: { crossBranchRiskDismissed?: boolean }
  } | null
  const settings = raw?.data ?? raw
  return settings?.worktree?.crossBranchRiskDismissed === true
}

test('1.34 UI：点选时点确认 + 确认闩锁静默切换 +「不再提示」持久化静默切换', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-34-latch-'))
  const { dir: wsDir } = makeGitRepo()
  const app = await launchElectron({
    env: { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData },
  })
  try {
    const page: Page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    // 前置：选中项目工作区（hero chip 挂载前置）
    await page.locator('button[aria-label="选择工作区"]').first().click()
    await page.locator('.dswf-hero-picker-list').getByText('latch-repo', { exact: false }).first().click()
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    await expect.poll(async () => chipText(page), { timeout: 30_000 }).toContain('main')

    // ── 点选跨分支行（feat-a）：点选时点确认框立现（设计 A——确认前选中态不变）──
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page), '点选跨分支行应立现确认框（点选时点）').toBeVisible({ timeout: 8_000 })
    await snap(page, 'pick-time-dialog.png')

    // ── 取消：本次改选未发生（chip 保持原行）+ mask 退场干净 ──
    await heroRiskDialog(page).getByRole('button', { name: '取消', exact: true }).click()
    await expect(heroRiskDialog(page)).toBeHidden()
    await expect.poll(async () => chipText(page), { timeout: 30_000 }).toContain('main')
    await expectComposerReachable(page, '取消后')

    // ── 重选 → 确认框重弹（取消非永久否决）→ 确认后才切行 ──
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page), '重选应重弹确认框').toBeVisible({ timeout: 8_000 })
    const dialog = heroRiskDialog(page)
    await dialog.locator('input[type="checkbox"]').first().check()
    await dialog.getByRole('button', { name: '确认继续' }).click()
    await expect(heroRiskDialog(page)).toBeHidden()
    await expect.poll(async () => chipText(page), { timeout: 30_000 }).toContain('feat-a')
    await expectComposerReachable(page, '确认后')
    await snap(page, 'confirmed-switched.png')

    // ── 确认闩锁：同行重选零弹框（静默切换——零弹框、零等待）──
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page), '闩锁命中：同行重选不应弹框').not.toBeVisible({ timeout: 8_000 })
    await expect.poll(async () => chipText(page), { timeout: 30_000 }).toContain('feat-a')
    await expectComposerReachable(page, '闩锁静默切换后')

    // ── 换目标（feat-b）：闩锁清退 → 确认框重弹；勾选「不再提示」→ 确认 ──
    await pickMenuRow(page, 'feat-b')
    await expect(heroRiskDialog(page), '换目标应重弹确认框（闩锁清退）').toBeVisible({ timeout: 8_000 })
    const riskBox = heroRiskDialog(page).locator('input[type="checkbox"]').first()
    await riskBox.check()
    const dismissBox = heroRiskDialog(page).getByRole('checkbox', { name: /不再提示/ })
    const dismiss = (await dismissBox.count()) > 0 ? dismissBox : heroRiskDialog(page).locator('input[type="checkbox"]').nth(1)
    await dismiss.check()
    await heroRiskDialog(page).getByRole('button', { name: '确认继续' }).click()
    await expect(heroRiskDialog(page)).toBeHidden()
    await expect.poll(async () => chipText(page), { timeout: 30_000 }).toContain('feat-b')

    // ──「不再提示」持久化（跨会话）+ 命中后跨分支点选静默切换 ──
    await expect
      .poll(async () => crossBranchDismissed(page), { timeout: 30_000, message: 'settings 应持久化 crossBranchRiskDismissed=true' })
      .toBe(true)
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page), '「不再提示」命中：跨分支点选应静默切换零弹框').not.toBeVisible({ timeout: 8_000 })
    await expect.poll(async () => chipText(page), { timeout: 30_000 }).toContain('feat-a')
    await snap(page, 'dismissed-silent-switch.png')
  } finally {
    await closeApp(app).catch(() => {})
  }
})
