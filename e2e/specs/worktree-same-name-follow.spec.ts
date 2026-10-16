// worktree-branch-management 1.20 真机 UI e2e：worktree 名默认与分支同名跟随（三输入保留）。
//   · 未手改：worktree 名输入框 = 分支名同名，分支变化即同步（同名跟随）；
//   · 手改后脱离跟随（分支变化不再覆盖用户值）；
//   · 手改值清回分支同名 → 分支变化恢复跟随；
//   · 同名默认下创建：路径 = 所配 worktree 目录/worktree 名（真 git worktree add 落位）。
// data 锚：分支输入 placeholder = feat/my-branch；worktree 输入 = [data-dswt-worktree-input]；
// 提交 = [data-dswt-create-submit]；chip/menu 锚同 1.19。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.20/001-same-name-follow'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-20-follow-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t120@test', '-c', 'user.name=t120', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.20 same-name follow fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
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

/** 注册项目（轮询至就绪——1.19 同配方） */
async function registerProject(page: Page, wsDir: string): Promise<void> {
  await expect
    .poll(async () => {
      try {
        const raw = (await forgeRpc(page, 'forge:projects/register', {
          workspaceDir: wsDir,
          name: 'follow-repo',
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

/** 在 hero 菜单里点选含指定文案的行 */
async function pickMenuRow(page: Page, text: string): Promise<void> {
  await chip(page).first().click()
  await heroMenu(page).getByText(text, { exact: false }).first().click()
}

/** worktree 清单条目（list RPC——name + path） */
async function listEntries(page: Page, wsDir: string): Promise<readonly { name: string; path: string }[]> {
  const raw = (await forgeRpc(page, 'forge:worktree/list', { projectRoot: wsDir })) as {
    data?: { entries?: readonly { worktreeName?: string; path?: string }[] }
    entries?: readonly { worktreeName?: string; path?: string }[]
  } | null
  const entries = raw?.data?.entries ?? raw?.entries ?? []
  return entries.map((entry) => ({ name: entry.worktreeName ?? '', path: entry.path ?? '' }))
}

/** 走查截图（非关键路径——失败不阻塞断言链） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧，不影响 AC 断言
  }
}

test('1.20 UI：worktree 名同名默认跟随（三输入保留，可覆盖）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-20-follow-'))
  const wsDir = makeGitRepo()
  const app = await launchHost({ userData })
  try {
    const { page } = app
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })

    await pickMenuRow(page, '新建 worktree…')
    await expect(createDialog(page)).toBeVisible()

    // ── AC1：未手改 → worktree 名 = 分支名同名跟随；分支变化即同步 ──
    await branchInput(page).fill('topic-a')
    await expect(worktreeInput(page)).toHaveValue('topic-a')
    await branchInput(page).fill('topic-b')
    await expect(worktreeInput(page)).toHaveValue('topic-b')
    await snap(page, 'follow-default.png')

    // ── AC2：手改 worktree 名 → 脱离跟随（分支变化不覆盖用户值） ──
    await worktreeInput(page).fill('my-lab')
    await branchInput(page).fill('topic-c')
    await expect(worktreeInput(page)).toHaveValue('my-lab')
    await snap(page, 'detached-after-manual-edit.png')

    // ── AC2 恢复跟随：手改值清回分支同名 → 分支变化恢复跟随 ──
    await worktreeInput(page).fill('topic-c')
    await branchInput(page).fill('topic-d')
    await expect(worktreeInput(page)).toHaveValue('topic-d')
    await snap(page, 'resume-follow-on-same-name.png')

    // ── AC3：同名默认下创建 → 路径 = 所配目录/worktree 名（基准 main = 检出分支，无风险框） ──
    await branchInput(page).fill('topic-create')
    await expect(worktreeInput(page)).toHaveValue('topic-create')
    await createDialog(page).locator('[data-dswt-create-submit]').click()
    await expect
      .poll(async () => (await listEntries(page, wsDir)).some((entry) => entry.name === 'topic-create'), {
        timeout: 30_000,
        message: '创建后清单应含同名 worktree topic-create',
      })
      .toBe(true)
    const created = (await listEntries(page, wsDir)).find((entry) => entry.name === 'topic-create')
    expect(created?.path, '创建路径 = 所配目录/worktree 名（尾段同名）').toContain('/topic-create')
    await snap(page, 'created-same-name.png')
  } finally {
    await closeApp(app.app)
  }
})
