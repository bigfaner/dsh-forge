// worktree-branch-management fix-4 真机 UI e2e：GUI 载体（Playwright _electron 真宿主 +
// 真 web dist + 默认 profile dev 树）下 hero 第二 chip 真机可见且可选择。
// 链路 = overlay insert 注行（fix-4）→ 插件装载 → 官方面 provide → 宿主具名消费 →
// forge:worktree/list isGit:true → HeroWorktreeMount 注入。
// data 锚：chip = [data-dswt-hero-trigger]；弹层卡 = .dswt-hero-menu（hero-worktree-picker）。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

/** 隔离 git 仓库夹具（真 git CLI——list/resolveProject 数据源） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-fix4-ui-repo-'))
  const git = (args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=fix4@test', '-c', 'user.name=fix4', ...args], { cwd: dir, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), 'fix-4 ui fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  return dir
}

/** renderer 侧 forge RPC（preload 面真身——window.dshForge.invoke） */
async function forgeRpc(page: Page, channel: string, payload?: unknown): Promise<unknown> {
  return page.evaluate(
    ([ch, payload]) => (window as unknown as { dshForge: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge.invoke(ch, payload),
    [channel, payload] as const,
  )
}

test('fix-4 UI：注册 git 仓后 hero 第二 chip 真机可见，弹层列主仓 worktree 且可选择', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-fix4-ui-'))
  const wsDir = makeGitRepo()
  const app = await launchElectron({
    env: {
      DSH_FORGE_DEV_PROFILE: 'dev',
      DSH_FORGE_USER_DATA: userData,
    },
  })
  try {
    const page: Page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissOnboardingModals(page) // 新 profile API Key 引导模态收口（拦指针——support 既有纪律）
    // 注册 git 仓为主项目（renderer RPC 真身——注册链 canonical 化 + 身份归并锚）
    let registerError = ''
    await expect
      .poll(async () => {
        try {
          const raw = (await forgeRpc(page, 'forge:projects/register', {
            workspaceDir: wsDir,
            name: 'fix4-repo',
            forgeDir: join(wsDir, '.forge'),
            knowledgeDir: join(wsDir, '.knowledge'),
          })) as { ok?: boolean; data?: { projectId?: string }; projectId?: string } | null
          const projectId = raw?.data?.projectId ?? raw?.projectId
          return typeof projectId === 'string'
        } catch (cause) {
          registerError = String(cause).slice(0, 200)
          return false
        }
      }, { timeout: 60_000, message: `项目注册未就绪：${registerError}` })
      .toBe(true)
    // AC（1.16 预铸采纳）：host 直调 sessionCreate 单 RPC——预铸挂靠事件真机落盘闭环
    const preseed = (await forgeRpc(page, 'forge:worktree/session-create', {
      worktreePath: wsDir,
    })) as { sessionId?: string; branch?: string; data?: { sessionId?: string }; error?: unknown } | null
    const preseedId = preseed?.data?.sessionId ?? preseed?.sessionId
    if (typeof preseedId !== 'string') {
      throw new Error(`sessionCreate 直调未返回 sessionId：${JSON.stringify(preseed)?.slice(0, 400)}`)
    }
    // AC（1.16）：预铸挂靠落盘基线（attachedSessionsOf 统计持久绑定——预铸永久在账不可归零）
    let attachedBaseline = -1
    await expect
      .poll(async () => {
        const raw = (await forgeRpc(page, 'forge:worktree/checks', {
          projectRoot: wsDir,
          path: wsDir,
        })) as { attachedSessions?: number; data?: { attachedSessions?: number } } | null
        attachedBaseline = raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
        return attachedBaseline
      }, { timeout: 30_000, message: 'checks 未读到预铸挂靠会话（预铸挂靠事件未落盘）' })
      .toBeGreaterThanOrEqual(1)
    // AC（1.16）：seal 判定读到预铸挂靠事件（绑定回读）
    const seal = (await forgeRpc(page, 'forge:worktree/seal', { sessionId: preseedId })) as {
      sealed?: boolean
      binding?: { worktreePath?: string; branch?: string } | null
      data?: { sealed?: boolean; binding?: { worktreePath?: string; branch?: string } | null }
    } | null
    const sealData = seal?.data ?? seal
    expect(sealData?.binding?.worktreePath, `seal 未读到预铸绑定：${JSON.stringify(seal)?.slice(0, 400)}`).toBeTruthy()
    // AC：hero 第二 chip 真机可见（list isGit:true → ForgeHeroWorktreeMount 注入）
    const chip = page.locator('[data-dswt-hero-trigger]')
    await expect(chip, 'hero worktree chip 未注入（能力链断裂——本任务根因）').toBeVisible({ timeout: 30_000 })
    // 可选择：点击 chip（hero 触发器可能被 owner 面叠置——事件级点击兜底）→ 弹层列主仓行
    await chip.evaluate((el) => (el as HTMLElement).click())
    const menu = page.locator('.dswt-hero-menu')
    await expect(menu, 'worktree 选择弹层未呈现').toBeVisible({ timeout: 15_000 })
    await expect(menu.locator('text=/dsh-forge-fix4-ui-repo/').first()).toBeVisible()
    // AC（bug 907225f2）：选择确认后 chip 回填所选行（分支 · worktree 名）——不再恒占位。
    // 编排成功 → 会话面接管；经官方「新会话」入口重入 hero，选中记忆仍回填（确认即回填口径）
    await menu.locator('[role="menuitem"]').filter({ hasText: 'dsh-forge-fix4-ui-repo' }).first().click()
    await page.getByRole('button', { name: /新会话|新建会话/ }).first().click({ timeout: 30_000 })
    const backfilled = page.locator('[data-dswt-hero-trigger]')
    await expect
      .poll(async () => {
        const count = await backfilled.count()
        return count > 0 ? await backfilled.first().textContent() : `chip-absent(${count})`
      }, {
        timeout: 30_000,
        message: '选择确认后 chip 未回填所选行（挂载面缺 selectedPath 闭环——bug 907225f2）',
      })
      .toMatch(/·/)
    expect(await backfilled.first().textContent()).not.toContain('选择 worktree…')
    // AC（1.29/1.92 点选纯选中态）：选择确认零会话副作用——attachedSessions 相对预铸基线零增量
    //（点选=纯选中态，非绝对零：预铸挂靠绑定持久在账，语义=零新增挂靠）
    await expect
      .poll(async () => {
        const raw = (await forgeRpc(page, 'forge:worktree/checks', {
          projectRoot: wsDir,
          path: wsDir,
        })) as { attachedSessions?: number; data?: { attachedSessions?: number } } | null
        return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
      }, { timeout: 30_000, message: '点选后不应新增挂靠会话（纯选中态——相对预铸基线零增量）' })
      .toBe(attachedBaseline)
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
