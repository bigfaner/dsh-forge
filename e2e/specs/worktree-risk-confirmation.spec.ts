// worktree-branch-management 1.19 真机 UI e2e：切换分支风险确认框 + 零 checkout 纪律。
// 设计 A 重锚（用户裁决 2026-10-18）：确认框在点选时点弹出——
//   · hero chip 点选跨分支行 → 官方 RiskConfirmation 立现；取消保持原选（mask 退场干净）；
//     确认才切换选中态（chip 回填目标行）；
//   · 同分支重选（目标 = 主树当前检出分支）不弹框直接切换；
//   · 新建表单基准分支 ≠ 主树检出分支 → 创建前同款确认框；取消不进 git，确认才创建。
//   （会话落树语义 = 官方 session.create({workspaceId}) 直通、cwd 即绑定——
//     worktree-pure-selection-1-29.spec 承载，本 spec 不再覆盖创建面。）
// data 锚：chip = [data-dswt-hero-trigger]；新建提交 = [data-dswt-create-submit]；
// 弹窗锚 = role=dialog + aria-label（官方 Modal 语义）；菜单锚 = .dswt-hero-menu。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.8/002-risk-confirm'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；wt-a 检出 feat-a） */
function makeGitRepo(): { dir: string; wtDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-19-risk-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t119@test', '-c', 'user.name=t119', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.19 risk fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  const wtDir = join(dir, 'wt-a').replaceAll('\\', '/')
  git(['worktree', 'add', '-b', 'feat-a', wtDir, 'main'])
  return { dir, wtDir }
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
          name: 'risk-repo',
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
const baseRiskDialog = (page: Page) => page.getByRole('dialog', { name: '基准分支跨分支确认' })

/** 风险框交互：勾选知悉 → 确认继续 */
async function acknowledgeAndConfirm(page: Page, dialog: ReturnType<typeof heroRiskDialog>): Promise<void> {
  const box = dialog.locator('input[type="checkbox"]').first()
  await expect(box).toBeVisible()
  await box.check()
  await dialog.getByRole('button', { name: '确认继续' }).click()
}

/** 在 hero 菜单里点选含指定文案的行 */
async function pickMenuRow(page: Page, text: string): Promise<void> {
  await chip(page).first().click()
  await heroMenu(page).getByText(text, { exact: false }).first().click()
}

/** mask 退场干净（设计 A 缺陷②）：确认框关闭后 composer 可点（零遮挡残留） */
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
  await page
    .locator('[data-composer-input]')
    .first()
    .click({ timeout: 8_000 })
    .catch(() => {
      throw new Error(`${label}：composer 点击被遮挡（mask 残留）`)
    })
}

/** 走查截图（非关键路径——动画收尾期 page.screenshot 可能超时，失败不阻塞断言链） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧，不影响 AC 断言
  }
}

/** worktree 清单（list RPC——条目 worktreeName 集） */
async function listNames(page: Page, wsDir: string): Promise<string[]> {
  const raw = (await forgeRpc(page, 'forge:worktree/list', { projectRoot: wsDir })) as {
    data?: { entries?: readonly { worktreeName?: string }[] }
    entries?: readonly { worktreeName?: string }[]
  } | null
  const entries = raw?.data?.entries ?? raw?.entries ?? []
  return entries.map((entry) => entry.worktreeName ?? '')
}

test('1.19 UI：点选时点跨分支风险确认框（hero 改选 + 新建基准）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-19-risk-'))
  const { dir: wsDir } = makeGitRepo()
  const app = await launchElectron({
    env: { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData },
  })
  try {
    const page: Page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    // 默认锚定：主树检出 main → chip = main 行
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')
    // 前置：选中项目工作区（hero chip 挂载前置）
    await page.locator('button[aria-label="选择工作区"]').first().click()
    await page.locator('.dswf-hero-picker-list').getByText('risk-repo', { exact: false }).first().click()

    // ── AC1：点选跨分支行（feat-a ≠ main）——点选时点确认框立现（设计 A）；
    // 取消 = 本次改选未发生（chip 保持原行）+ mask 退场干净 ──
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page), '点选跨分支行应立现确认框（点选时点）').toBeVisible({ timeout: 8_000 })
    await snap(page, 'hero-risk-dialog.png')
    await heroRiskDialog(page).getByRole('button', { name: '取消', exact: true }).click()
    await expect(heroRiskDialog(page)).toBeHidden()
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .not.toContain('feat-a')
    await expectComposerReachable(page, '取消后')

    // ── AC1 确认路径：重新点选 → 确认框重弹 → 勾选知悉 → 确认后才切换选中态 ──
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page), '重选应重弹确认框').toBeVisible({ timeout: 8_000 })
    await acknowledgeAndConfirm(page, heroRiskDialog(page))
    await expect(heroRiskDialog(page)).toBeHidden()
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('feat-a')
    await expectComposerReachable(page, '确认后')

    // ── AC2：同分支重选（目标 = 主树当前检出分支 main）不弹框直接切换 ──
    await pickMenuRow(page, 'main')
    await expect(heroRiskDialog(page), '同分支重选不得弹风险框').toBeHidden()
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('main')

    // ── AC3：新建表单基准分支 ≠ 主树检出分支 → 创建前同款确认框；取消不进 git ──
    const beforeCancel = await listNames(page, wsDir)
    await pickMenuRow(page, '新建 worktree…')
    const dialog = page.getByRole('dialog', { name: '新建 worktree' })
    await expect(dialog).toBeVisible()
    await dialog.locator('input[placeholder="feat/my-branch"]').fill('feat/new')
    await dialog.locator('[data-dswt-base-trigger]').click()
    await page.locator('.dswt-base-branch-menu').getByText('feat-a', { exact: false }).first().click()
    await dialog.locator('[data-dswt-create-submit]').click()
    await expect(baseRiskDialog(page), '基准分支跨分支应弹同款确认框').toBeVisible()
    await snap(page, 'create-risk-dialog.png')
    await baseRiskDialog(page).getByRole('button', { name: '取消', exact: true }).click()
    await expect(baseRiskDialog(page)).toBeHidden()
    expect(await listNames(page, wsDir), '取消后不进 git（无新 worktree）').toEqual(beforeCancel)

    // ── AC3 确认路径：确认才进 git ──
    await dialog.locator('[data-dswt-create-submit]').click()
    await expect(baseRiskDialog(page)).toBeVisible()
    await acknowledgeAndConfirm(page, baseRiskDialog(page))
    await expect
      .poll(async () => {
        const names = await listNames(page, wsDir)
        console.log('[1.19-ac3] worktree names =', names.join(','))
        // worktreeName = 分支末段归一（feat/new → new——list 条目名单面）
        return names.includes('new')
      }, { timeout: 30_000, message: '确认后应创建同名 worktree（分支 feat/new → 树名 new）' })
      .toBe(true)
    await snap(page, 'create-confirmed.png')
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
