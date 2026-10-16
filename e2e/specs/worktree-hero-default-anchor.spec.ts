// worktree-branch-management 1.17 真机 UI e2e：hero 第二 chip 默认回填 = 主 worktree 当前
// 检出分支 → 检出该分支的行（锚定链，不硬编码 main/主行；纯展示零编排）。
// 夹具：真 git 仓——主树检出 feature 分支 feat/x（非 main），另建 wt-a/feat-a 行；
// 无任何用户选择 → chip 默认回填 `feat/x · <主仓名>`（非占位），且零编排（无挂靠会话）。
// data 锚：chip = [data-dswt-hero-trigger]；占位文案 = 「选择 worktree…」。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 feat/x + wt-a 检出 feat-a） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-17-anchor-repo-'))
  const git = (args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=t117@test', '-c', 'user.name=t117', ...args], { cwd: dir, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.17 anchor fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  // 主树检出 feature 分支（锚定链判据：默认回填跟随主树当前分支，而非 main）
  git(['checkout', '-b', 'feat/x'])
  // 次级 worktree 行（另支 feat-a——锚定映射不得误落此行）
  const wtDir = join(dir, 'wt-a').replaceAll('\\', '/')
  git(['worktree', 'add', '-b', 'feat-a', wtDir, 'main'])
  return dir
}

/** renderer 侧 forge RPC（preload 面真身——window.dshForge.invoke） */
async function forgeRpc(page: Page, channel: string, payload?: unknown): Promise<unknown> {
  return page.evaluate(
    ([ch, payload]) => (window as unknown as { dshForge: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge.invoke(ch, payload),
    [channel, payload] as const,
  )
}

test('1.17 UI：无用户选择时 hero chip 默认回填主树当前检出分支所在行（纯展示零编排）', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-17-anchor-'))
  const wsDir = makeGitRepo()
  const repoName = wsDir.split(/[\\/]/).pop() ?? ''
  const app = await launchElectron({
    env: {
      DSH_FORGE_DEV_PROFILE: 'dev',
      DSH_FORGE_USER_DATA: userData,
    },
  })
  try {
    const page: Page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissOnboardingModals(page)
    await expect
      .poll(async () => {
        try {
          const raw = (await forgeRpc(page, 'forge:projects/register', {
            workspaceDir: wsDir,
            name: 'anchor-repo',
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
    // AC：清单就绪且无用户选择/记忆 → chip 默认回填主树当前检出分支所在行（feat/x · 主仓名）
    const chip = page.locator('[data-dswt-hero-trigger]')
    await expect(chip, 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    await expect
      .poll(async () => (await chip.count()) > 0 ? await chip.first().textContent() : '', {
        timeout: 30_000,
        message: 'chip 未按锚定链默认回填（仍占位）',
      })
      .toContain('feat/x')
    const chipText = (await chip.first().textContent()) ?? ''
    expect(chipText, '默认回填应呈 `分支 · worktree 名` 一体形态').toMatch(/·/)
    expect(chipText, '默认回填不得落占位文案').not.toContain('选择 worktree…')
    expect(chipText, '默认回填不得误落他支 worktree 行（feat-a）').not.toContain('feat-a')
    expect(chipText, '默认回填应指向主仓行（worktree 名 = 目录名）').toContain(repoName)
    // AC：纯展示默认零编排——未确认选择时无挂靠会话产生
    const checks = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path: wsDir })) as {
      attachedSessions?: number
      data?: { attachedSessions?: number }
    } | null
    expect(checks?.data?.attachedSessions ?? checks?.attachedSessions ?? -1, '默认回填不应触发挂靠编排').toBe(0)
    // 走查证据留盘
    await page.screenshot({
      path: 'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.17/001-default-anchor/hero-default-anchor.png',
      fullPage: false,
    })
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
