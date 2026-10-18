// worktree-branch-management 1.31 真机 UI e2e（设计 A 重锚——点选时点确认守卫三场景）：
//   · A1：点选跨分支行 → 确认框立现（点选时点——零 draft/冷却窗依赖）；
//   · A2：取消 → mask 退场干净（composer 可点可键入，零遮挡残留——上轮失败症状回归钉）；
//   · A3：显式重选 → 确认框重弹（取消非永久否决）；确认后选中态切行 + 零会话副作用
//     （点选零编排——确认/待决全程 attachedSessions 恒零，结构性无并发第二路）。
// data 锚与夹具配方 = worktree-risk-confirmation.spec.ts（1.19）同款。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.8/003-p1-guards'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；wt-a 检出 feat-a） */
function makeGitRepo(): { dir: string; wtDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-31-guards-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t131@test', '-c', 'user.name=t131', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.31 guards fixture\n')
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
          name: 'guards-repo',
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
const composer = (page: Page) => page.locator('[data-composer-input]').last()

async function acknowledgeAndConfirm(page: Page): Promise<void> {
  const dialog = heroRiskDialog(page)
  const box = dialog.locator('input[type="checkbox"]').first()
  await expect(box).toBeVisible()
  await box.check()
  await dialog.getByRole('button', { name: '确认继续' }).click()
}

async function pickMenuRow(page: Page, text: string): Promise<void> {
  await chip(page).first().click()
  await heroMenu(page).getByText(text, { exact: false }).first().click()
}

async function chipText(page: Page): Promise<string> {
  return (await chip(page).first().textContent()) ?? ''
}

async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧，不影响 AC 断言
  }
}

/** 挂靠会话计数（checks RPC——纯选中态零副作用判定源） */
async function attachedSessions(page: Page, wsDir: string, path: string): Promise<number> {
  const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
    data?: { attachedSessions?: number }
    attachedSessions?: number
  } | null
  return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
}

/** mask 退场干净（A2 本体）：确认框关闭后 composer 可点 + 键入回显（零遮挡残留） */
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
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await composer(page).click({ timeout: 8_000 }).catch(() => {
      throw new Error('composer 点击被遮挡（mask 残留）')
    })
    await page.keyboard.insertText(text)
    const echoed = await composer(page).evaluate((el) => (el as HTMLElement).textContent ?? '')
    if (echoed.includes(text)) return
    await page.waitForTimeout(3_000)
  }
  throw new Error(`composer 键入失败（回显不含目标文本）：${text}`)
}

test('1.31 UI：A1 点选时点确认立现 + A2 mask 退场干净 + A3 确认切行零会话副作用', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-31-guards-'))
  const { dir: wsDir, wtDir } = makeGitRepo()
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
    await page.locator('.dswf-hero-picker-list').getByText('guards-repo', { exact: false }).first().click()
    await expect(page.locator('[data-composer-input]').last()).toBeVisible({ timeout: 30_000 })
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    await expect.poll(async () => chipText(page), { timeout: 30_000 }).toContain('main')
    // 项目根挂靠基线（工作区拾取触发的官方 create 预铸为异步落点——轮询至计数稳定后
    // 定格；A3 断言 = 点选/确认全程零「新增」第二路，而非绝对零）
    let rootBaseline = -1
    for (let round = 0; round < 5; round += 1) {
      await page.waitForTimeout(3_000)
      const current = await attachedSessions(page, wsDir, wsDir)
      if (current === rootBaseline) break
      rootBaseline = current
    }

    // ── A1：点选跨分支行 → 确认框立现（点选时点——零 draft 依赖，设计 A 主断言）──
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page), 'A1：点选时点确认框应立现（零 draft/冷却窗依赖）').toBeVisible({ timeout: 8_000 })
    await snap(page, 'a1-pick-time-dialog.png')

    // ── A2：取消 → mask 退场干净——composer 可点可键入（零遮挡残留）──
    await heroRiskDialog(page).getByRole('button', { name: '取消', exact: true }).click()
    await expect(heroRiskDialog(page)).toBeHidden()
    await expect.poll(async () => chipText(page), { timeout: 30_000 }).not.toContain('feat-a')
    await typeIntoComposer(page, '1-31 A2 mask-clean typing')
    await snap(page, 'a2-mask-clean-composer.png')

    // ── A3：显式重选 → 确认框重弹（取消非永久否决）→ 确认 → 选中态切行 + 零会话副作用 ──
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page), 'A3：显式重选应重弹确认框').toBeVisible({ timeout: 8_000 })
    await snap(page, 'a3-dialog-reopens-after-reselect.png')
    await acknowledgeAndConfirm(page)
    await expect(heroRiskDialog(page)).toBeHidden()
    await expect.poll(async () => chipText(page), { timeout: 30_000 }).toContain('feat-a')
    // 点选零编排（结构性无并发第二路）：确认全程 wt-a 与项目根 attachedSessions 恒零
    //（会话创建唯一时机 = 官方 create 调用点 wrap 预铸；点选 = 纯选中态）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: 'A3：点选确认不应产生 wt-a 挂靠会话（纯选中态）' })
      .toBe(0)
    expect(
      await attachedSessions(page, wsDir, wsDir),
      'A3：项目根零并发第二路——点选/确认全程零新增（基线对照）',
    ).toBe(rootBaseline)
    await snap(page, 'a3-confirmed-switched-zero-sessions.png')
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
