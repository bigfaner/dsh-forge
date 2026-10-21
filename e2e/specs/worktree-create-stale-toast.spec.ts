// bug dbbef6a8 真机 UI e2e 回归：创建成功自动跟进不得触发陈旧选中自愈误报。
//   · 创建后自动选中必须发生在含新行清单就位之后——自愈效应（bug 4a30b193）以
//     present/行在册为判据，旧清单竞态会把「刚创建的新树」误判为已删（toast 误报 +
//     选中态/host 记忆切回主行）。
// data 锚：chip = [data-dswt-hero-trigger]；误报横幅 = [data-dswt-stale-selection-notice]；
// 弹窗/提交锚同 worktree-create-follow-error.spec（1.24 口径）。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-stale-toast-repo-'))
  const git = (args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=stale@test', '-c', 'user.name=stale', ...args], { cwd: dir, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), 'stale toast fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  return dir
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
          name: 'stale-repo',
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
const createDialog = (page: Page) => page.getByRole('dialog', { name: '新建 worktree' })
const worktreeInput = (page: Page) => createDialog(page).locator('[data-dswt-worktree-input]')
const branchInput = (page: Page) => createDialog(page).locator('input[placeholder="feat/my-branch"]')
const staleNotice = (page: Page) => page.locator('[data-dswt-stale-selection-notice]')

test('bug dbbef6a8 UI：创建成功自动选中新树，零「已不存在」误报且选中态不回切主行', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-stale-toast-'))
  const wsDir = makeGitRepo()
  const app = await launchHost({ userData })
  try {
    const { page } = app
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })

    await chip(page).first().click()
    await heroMenu(page).getByText('新建 worktree…', { exact: false }).first().click()
    await expect(createDialog(page)).toBeVisible()
    await branchInput(page).fill('stale-check')
    await expect(worktreeInput(page)).toHaveValue('stale-check') // 同名默认跟随
    await createDialog(page).locator('[data-dswt-create-submit]').click()
    await expect(createDialog(page), '创建成功后表单关闭').not.toBeVisible()

    // 自愈竞态窗口：创建结算后的效应链在数百毫秒内落定——给足窗口再断言
    await page.waitForTimeout(2_000)

    await expect(staleNotice(page), '创建后零「已不存在」误报横幅（bug dbbef6a8 在场即误报）').toHaveCount(0)
    await expect(chip(page).first(), 'chip 保持选中新建树（不被自愈切回主行）').toHaveText(/stale-check/)
  } finally {
    await closeApp(app.app)
  }
})
