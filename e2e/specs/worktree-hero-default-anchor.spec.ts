// worktree-branch-management 1.17 真机 UI e2e：hero 第二 chip 默认回填 = 主 worktree 当前
// 检出分支 → 检出该分支的行（锚定链，不硬编码 main/主行；纯展示零编排）。
// 夹具：真 git 仓——主树检出 feature 分支 feat/x（非 main），另建 wt-a/feat-a 行；
// 无任何用户选择 → chip 默认回填 `feat/x · <主仓名>`（非占位），且零编排（无挂靠会话）。
// data 锚：chip = [data-dswt-hero-trigger]；占位文案 = 「选择 worktree…」。
// e2e-fast-shared-launch 存量迁移（批次三a）：共享 launch fixture——launchHost 整 spec 一次，
// 夹具工作区即隔离 git 仓（seedWorkspace 播种基准态，单用例 spec = 每跑批一次冷启）。
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSharedLaunchFixture } from '../support/fixtures.js'
import { expect, type Page } from '@playwright/test'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 feat/x + wt-a 检出 feat-a）。
 *  共享 launch 形态：仓库落夹具工作区本体（首启/重播种/crash 重启统一播种同参基准态）。 */
function makeGitRepo(dir: string): void {
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
}

/** renderer 侧 forge RPC（preload 面真身——window.dshForge.invoke） */
async function forgeRpc(page: Page, channel: string, payload?: unknown): Promise<unknown> {
  return page.evaluate(
    ([ch, payload]) => (window as unknown as { dshForge: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge.invoke(ch, payload),
    [channel, payload] as const,
  )
}

// ── 共享 launch fixture（夹具工作区 = git 仓本体；项目注册由 fixture 层首注册承载）──
const { test } = createSharedLaunchFixture({
  seedWorkspace: makeGitRepo,
  workspaceName: 'anchor-repo',
})

test('1.17 UI：无用户选择时 hero chip 默认回填主树当前检出分支所在行（纯展示零编排）', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page, wsDir } = sharedLaunch
  const repoName = wsDir.split(/[\\/]/).pop() ?? ''
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
  // AC：纯展示默认零编排——回填动作不产生任何挂靠会话（triage 1.7 重锚 2026-11-03：
  // 官方会话面挂载即建主树 blank 基座（实测恒 1，与回填无关——点选他树时主树仍恒 1），
  // 旧字面量 toBe(0) 已失真；不变量重锚 = 主树 ≤ 基座 1 且非选中次级行恒 0）
  const checksOf = async (path: string): Promise<number> => {
    const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
      attachedSessions?: number
      data?: { attachedSessions?: number }
    } | null
    return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
  }
  const mainAttached = await checksOf(wsDir)
  expect(mainAttached, '默认回填零编排——主树挂靠不超会话面基座 blank（1）').toBeLessThanOrEqual(1)
  const wtAPath = join(wsDir, 'wt-a')
  expect(await checksOf(wtAPath), '默认回填零编排——零用户选择下非选中树（wt-a）零挂靠会话').toBe(0)
  // 走查证据留盘
  await page.screenshot({
    path: 'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.17/001-default-anchor/hero-default-anchor.png',
    fullPage: false,
  })
})
