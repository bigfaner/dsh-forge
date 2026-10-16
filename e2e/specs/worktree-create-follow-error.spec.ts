// worktree-branch-management 1.24 真机 UI e2e：同名去重展示 + 创建成功自动跟进 + 失败错误呈现。
//   · 同名去重：branch 与 worktreeName 同名 → chip/菜单行单一名称（不再「x · x」）；
//   · 创建成功自动跟进：hero 选中态自动切到新 worktree（选中记忆写入），挂靠会话落新树
//     cwd；主树 HEAD 不动（零 checkout 语义不回归）；
//   · 创建失败：表单保持打开 + 错误行呈现（不静默吞错）。
// data 锚：chip = [data-dswt-hero-trigger]；菜单 = .dswt-hero-menu；提交 = [data-dswt-create-submit]；
// 错误行 = [data-dswt-create-error]（1.24 新增）。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.24/001-create-follow-error'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-24-follow-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t124@test', '-c', 'user.name=t124', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.24 create follow fixture\n')
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
const customPathInput = (page: Page) => createDialog(page).locator('[data-dswt-custom-path-input]')
const createError = (page: Page) => createDialog(page).locator('[data-dswt-create-error]')

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

/** 挂靠检查（checks RPC——attachedSessions） */
async function attachedSessions(page: Page, wsDir: string, path: string): Promise<number> {
  const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
    data?: { attachedSessions?: number }
    attachedSessions?: number
  } | null
  return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
}

/** 主树当前检出分支（零 checkout 语义面） */
function headBranch(repoDir: string): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir, stdio: 'pipe' })
    .toString()
    .trim()
}

/** 走查截图（非关键路径——失败不静默：animations 缺省直采退元素级，打点进跑批日志可考） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, animations: 'disabled', timeout: 30_000 })
  } catch {
    try {
      await page.locator('body').screenshot({ path: `${EVIDENCE_DIR}/${name}`, timeout: 30_000 })
    } catch (cause) {
      console.log(`[1.24-snap-miss] ${name}: ${String(cause)}`)
    }
  }
}

test('1.24 UI：同名去重 + 创建成功自动跟进 + 失败错误呈现', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-24-follow-'))
  const wsDir = makeGitRepo()
  const app = await launchHost({ userData })
  try {
    const { page } = app
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })

    // ── 场景 A：同名创建（分支 = worktree 名）→ chip/菜单行单一名称（不再「x · x」） ──
    await pickMenuRow(page, '新建 worktree…')
    await expect(createDialog(page)).toBeVisible()
    await branchInput(page).fill('dup-row')
    await expect(worktreeInput(page)).toHaveValue('dup-row') // 同名默认跟随
    await createDialog(page).locator('[data-dswt-create-submit]').click()

    await expect
      .poll(async () => (await listEntries(page, wsDir)).some((entry) => entry.name === 'dup-row'), {
        timeout: 30_000,
        message: '创建后清单应含 dup-row',
      })
      .toBe(true)

    // ── 场景 B：创建成功自动跟进——表单关闭 + chip 选中态切到新 worktree（同名 → 单段） ──
    await expect(createDialog(page), '创建成功后表单关闭').not.toBeVisible()
    await expect(chip(page).first(), 'chip 切至新 worktree（同名去重：单段「dup-row」，无「dup-row · dup-row」）')
      .toHaveText(/dup-row/)
    const chipText = await chip(page).first().textContent()
    expect(chipText, '同名去重（chip）').not.toContain('dup-row · dup-row')
    await snap(page, 'chip-dedup-follow.png')

    // 菜单行同名去重
    await chip(page).first().click()
    const dupRow = heroMenu(page).getByText('dup-row', { exact: false }).first()
    await expect(dupRow, '菜单行呈现新 worktree').toBeVisible()
    const rowText = (await dupRow.textContent()) ?? ''
    expect(rowText, '同名去重（菜单行）').not.toContain('dup-row · dup-row')
    await snap(page, 'menu-row-dedup.png')
    await page.keyboard.press('Escape')

    // 选中记忆 + 挂靠编排：新 worktree 挂靠会话在场（attachedSessions ≥ 1）
    const created = (await listEntries(page, wsDir)).find((entry) => entry.name === 'dup-row')
    expect(created, '新 worktree 路径在场').toBeTruthy()
    await expect
      .poll(async () => attachedSessions(page, wsDir, created!.path), {
        timeout: 30_000,
        message: '新 worktree 应有挂靠会话（自动跟进编排）',
      })
      .toBeGreaterThanOrEqual(1)

    // 零 checkout 语义不回归：主树 HEAD 恒 = main
    expect(headBranch(wsDir), '主树 HEAD 不动').toBe('main')

    // ── 场景 C：创建失败——表单保持打开 + 错误行呈现（不静默） ──
    await pickMenuRow(page, '新建 worktree…')
    await expect(createDialog(page)).toBeVisible()
    await branchInput(page).fill('fail-row')
    // 自定义路径指向不存在的外部卷 → git worktree add 失败（git 会自建中间目录，
    // 同仓内不存在父目录路径不构成失败——须卷级缺失才确定性失败）
    await createDialog(page).locator('[data-dswt-custom-path]').click()
    await customPathInput(page).fill('Q:\\dsh-e2e-no-such-volume\\fail-row')
    await createDialog(page).locator('[data-dswt-create-submit]').click()
    await expect(createError(page), '失败错误行呈现（不静默吞错）').toBeVisible()
    await expect(createError(page)).toContainText('创建失败')
    await expect(createDialog(page), '失败后表单保持打开').toBeVisible()
    // 场景 C 取证：实机截帧在错误呈现相位恒超时（run6-8 三轮实证，渲染忙）——
    // 退 DOM 级证据（错误行/弹窗全文本 + 表单字段值，落跑批日志可考）
    console.log('[1.24-scene-c] error-row =', await createError(page).textContent())
    console.log('[1.24-scene-c] dialog-text =', (await createDialog(page).innerText()).replaceAll('\n', ' | '))
    console.log('[1.24-scene-c] branch =', await branchInput(page).inputValue())
    await page.waitForTimeout(1500) // 渲染稳定退避
    await snap(page, 'create-failure-error.png')

    // 清理失败残留（无——git 未落树）；主树 HEAD 复核
    expect(headBranch(wsDir), '失败路径主树 HEAD 仍不动').toBe('main')
  } finally {
    await closeApp(app.app)
  }
})
