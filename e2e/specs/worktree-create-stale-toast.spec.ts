// bug dbbef6a8 真机 UI e2e 回归：创建成功自动跟进不得触发陈旧选中自愈误报。
//   · 创建后自动选中必须发生在含新行清单就位之后——自愈效应（bug 4a30b193）以
//     present/行在册为判据，旧清单竞态会把「刚创建的新树」误判为已删（toast 误报 +
//     选中态/host 记忆切回主行）。
// data 锚：chip = [data-dswt-hero-trigger]；误报横幅 = [data-dswt-stale-selection-notice]；
// 弹窗/提交锚同 worktree-create-follow-error.spec（1.24 口径）。
// e2e-fast-shared-launch 存量迁移（批次三a）：共享 launch fixture——launchHost 整 spec 一次，
// 夹具工作区即隔离 git 仓（seedWorkspace 播种基准态，单用例 spec = 每跑批一次冷启）。
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSharedLaunchFixture } from '../support/fixtures.js'
import { expect, type Page } from '@playwright/test'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main）。
 *  共享 launch 形态：仓库落夹具工作区本体（首启/重播种/crash 重启统一播种同参基准态）。 */
function makeGitRepo(dir: string): void {
  const git = (args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=stale@test', '-c', 'user.name=stale', ...args], { cwd: dir, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), 'stale toast fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
}

// ── 共享 launch fixture（夹具工作区 = git 仓本体；项目注册由 fixture 层首注册承载）──
const { test } = createSharedLaunchFixture({
  seedWorkspace: makeGitRepo,
  workspaceName: 'stale-repo',
})

const chip = (page: Page) => page.locator('[data-dswt-hero-trigger]')
const heroMenu = (page: Page) => page.locator('.dswt-hero-menu')
const createDialog = (page: Page) => page.getByRole('dialog', { name: '新建 worktree' })
const worktreeInput = (page: Page) => createDialog(page).locator('[data-dswt-worktree-input]')
const branchInput = (page: Page) => createDialog(page).locator('input[placeholder="feat/my-branch"]')
const staleNotice = (page: Page) => page.locator('[data-dswt-stale-selection-notice]')

test('bug dbbef6a8 UI：创建成功自动选中新树，零「已不存在」误报且选中态不回切主行', async ({ sharedLaunch }) => {
  test.setTimeout(300_000)
  const { page } = sharedLaunch
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
})
