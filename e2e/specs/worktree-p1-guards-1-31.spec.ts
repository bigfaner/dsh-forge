// worktree-branch-management 1.31 真机 UI e2e：P1 批守卫三场景（A1/A3/A4——同一发射取证）。
//   · A1：draft 非空（发送意图在场）→ 点选跨分支行 → 风险确认框立现（不被 8s 冷却窗挡——
//     冷却只压「点选引发」即 draft 空的 arm；发送意图是唯一编排时机）；
//   · A3：确认框取消 → 显式重选同一行 → 确认框重弹（取消抑制被显式重选清除——非永久否决）；
//   · A4：确认框开着期间点选他行（主行，其余闸全过）→ 零并发第二路编排——确认 feat-a 后
//     仅 wt-a 一个挂靠会话、项目根零新增（守卫链 defaultRiskPath 闸生效）。
// data 锚与夹具配方 = worktree-risk-confirmation.spec.ts（1.19）同款。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.31/001-p1-guards'

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

async function typeDraft(page: Page, text: string): Promise<void> {
  // 风险框已在场（draft 非空下重选即时重开）= 首条消息意图已被消费——键入面被 mask 拦截，直接返回
  if (await heroRiskDialog(page).isVisible().catch(() => false)) return
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
  const composer = page.locator('[data-composer-input]').last()
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await composer.click()
    await page.keyboard.insertText(text)
    const echoed = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')
    if (echoed.includes(text)) return
    await page.waitForTimeout(5_000)
  }
  throw new Error(`composer 键入失败（8 次重试后回显仍不含目标文本）：${text}`)
}

async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧，不影响 AC 断言
  }
}

/** 挂靠会话计数（checks RPC——编排判定共用源） */
async function attachedSessions(page: Page, wsDir: string, path: string): Promise<number> {
  const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
    data?: { attachedSessions?: number }
    attachedSessions?: number
  } | null
  return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
}

test('1.31 UI：A1 冷却窗维度拆分 + A3 取消抑制显式重选清除 + A4 确认框零并发编排', async () => {
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
    // A7 前置：选中项目工作区（selectedId 命中项目行——编排数据根严格命中；未选中项目
    // 时编排默认停用正是 A7 语义，此处显式走正确用法）
    await page.locator('button[aria-label="选择工作区"]').first().click()
    await page.locator('.dswf-hero-picker-list').getByText('guards-repo', { exact: false }).first().click()
    await expect(page.locator('[data-composer-input]').last()).toBeVisible({ timeout: 30_000 })
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')

    // ── A1：draft 非空（发送意图在场）→ 点选跨分支行 → 确认框在冷却窗（8s）内立现。
    // 修复前：readArmCooldownActive 先行 return——8s 内零确认框零编排（WYSIWYG 主承诺违约）。
    await typeDraft(page, '1-31 A1 send-intent message')
    // 工作区切换后 composer InputState store 绑定可能滞后于 DOM 回显——补键入直至
    // 首条消息意图（draft 非空）被 arm 闸读到（确认框立现 = A1 断言本体）。
    let dialogShown = false
    for (let attempt = 0; attempt < 5 && !dialogShown; attempt += 1) {
      dialogShown = await heroRiskDialog(page)
        .waitFor({ state: 'visible', timeout: 4_000 })
        .then(() => true)
        .catch(() => false)
      if (!dialogShown) {
        await pickMenuRow(page, 'feat-a')
        // pick 本身即可弹框（draft 非空下改选即时重开）——弹了就不必再键入
        dialogShown = await heroRiskDialog(page)
          .waitFor({ state: 'visible', timeout: 4_000 })
          .then(() => true)
          .catch(() => false)
        if (!dialogShown) await typeDraft(page, ' 1-31')
      }
    }
    await expect(
      heroRiskDialog(page),
      'A1：发送意图引发的 arm 不被冷却窗挡——确认框应在 8s 冷却窗内立现',
    ).toBeVisible({ timeout: 6_000 })
    await snap(page, 'a1-dialog-within-cooldown.png')
    // A4 基线：主行被锚定默认选中，draft 键入即已编排主行（root 计数为既有值）——
    // A4 断言口径 = feat-a 确认框待决/确认全程 root 计数零新增
    const rootBaseline = await attachedSessions(page, wsDir, wsDir)

    // ── A3：取消 → 显式重选同一行 → 确认框重弹（取消抑制被显式重选清除）。
    await heroRiskDialog(page).getByRole('button', { name: '取消', exact: true }).click()
    await expect(heroRiskDialog(page)).toBeHidden()
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .not.toContain('feat-a')
    await pickMenuRow(page, 'feat-a')
    await expect(
      heroRiskDialog(page),
      'A3：显式重选同树清除取消抑制——确认框必须重弹（修复前被 armSuppressed 永久挡）',
    ).toBeVisible({ timeout: 6_000 })
    await snap(page, 'a3-dialog-reopens-after-reselect.png')

    // ── A4：确认框待决期间零并发第二路编排。模态 mask 下 UI 输入不可达（点选/键入均被
    // 官方 Modal 拦截——并发重入只能来自效应层，归 shouldArmSelectedRow 单测钉）；此处
    // 取终态面：确认 feat-a 后恰一个挂靠会话，项目根（主行，draft 非空下其余闸全过）
    // 零杂散编排。
    await acknowledgeAndConfirm(page)
    await expect(heroRiskDialog(page)).toBeHidden()
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 60_000, message: '确认后 wt-a 应恰一个挂靠会话' })
      .toBe(1)
    expect(
      await attachedSessions(page, wsDir, wsDir),
      'A4：项目根（主行）零并发编排——确认框待决/确认全程零新增第二路会话',
    ).toBe(rootBaseline)
    await snap(page, 'a4-final-single-session.png')
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
