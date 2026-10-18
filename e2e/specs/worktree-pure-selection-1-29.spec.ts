// worktree-branch-management 1.29 真机 UI e2e（W3 arm 退役语义更新——纯选中态）：点选
// worktree 行只改选中态（点选时点跨分支确认，1.19 语义回归），会话创建唯一时机 = 官方
// create 调用点（wrap 改道预铸，目标 = 注册项目根）。
//   · 挂载/默认锚定回填：零会话副作用（attachedSessions = 0）；
//   · 点选 worktree 行（feat-a ≠ main）：点选时点确认框立现 → 确认 → 纯选中态——chip
//     回填 + host 选中记忆推送 + 零会话副作用（attachedSessions 恒零）；
//   · 「新会话」钮 → 官方 create → wrap 预铸绑定项目根（创建即绑定；选中树消费面 =
//     host 必绑重路由，对无绑定 blank 生效）；
//   · 发送 → 首条消息落预铸绑定会话（seal 绑定回读 = 落账证据；模型运行失败可接受
//     ——隔离 profile 无模型凭据，user 消息落账不受影响）。
// data 锚：chip = [data-dswt-hero-trigger]；菜单 = .dswt-hero-menu；新会话钮 =
// [data-dswf-project-action="new-session"]；会话行 = [data-dswf-session]；
// composer = [data-composer-input]。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.8/006-pure-selection'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；wt-a 检出 feat-a） */
function makeGitRepo(): { dir: string; wtDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-29-pure-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t129@test', '-c', 'user.name=t129', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.29 pure-selection fixture\n')
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
          name: 'orch-repo',
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
const newSessionButton = (page: Page) => page.locator('[data-dswf-project-action="new-session"]').first()

/** 风险框交互：勾选风险知悉 → 确认继续（1.19 同款；「不再提示」勾选行不勾——保持可重问） */
async function acknowledgeAndConfirm(page: Page): Promise<void> {
  const dialog = heroRiskDialog(page)
  const box = dialog.getByRole('checkbox', { name: '我已了解跨分支上下文风险' })
  await expect(box).toBeVisible()
  await box.check()
  await dialog.getByRole('button', { name: '确认继续' }).click()
  await expect(heroRiskDialog(page)).toBeHidden()
}

/** 挂靠会话计数（checks RPC——编排/封存判定共用源） */
async function attachedSessions(page: Page, wsDir: string, path: string): Promise<number> {
  const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
    data?: { attachedSessions?: number }
    attachedSessions?: number
  } | null
  return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
}

/** seal 绑定回读（header.cwd ≡ worktreePath 由宿主 cwd 守护保证——读到即 cwd 证据） */
async function sealBinding(page: Page, sessionId: string): Promise<{ worktreePath?: string; branch?: string; sealed?: boolean } | undefined> {
  const raw = (await forgeRpc(page, 'forge:worktree/seal', { sessionId })) as {
    data?: { sealed?: boolean; binding?: { worktreePath?: string; branch?: string } | null }
    sealed?: boolean
    binding?: { worktreePath?: string; branch?: string } | null
  } | null
  const seal = raw?.data ?? raw
  return seal?.binding === null || seal?.binding === undefined ? undefined : { ...seal.binding, sealed: seal?.sealed }
}

/** 走查截图（非关键路径——失败不阻塞断言链） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧，不影响 AC 断言
  }
}

test('1.29 UI：点选纯选中态（点选时点确认）——会话在官方 create 调用点预铸绑定', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-29-pure-'))
  const { dir: wsDir, wtDir } = makeGitRepo()
  const app = await launchElectron({
    env: { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData },
  })
  const consoleLog: string[] = []
  try {
    const page: Page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissOnboardingModals(page)
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`))
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    // 默认锚定：主树检出 main → chip = 主行（回填态）；零会话副作用——挂载/回填不建会话
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), {
        timeout: 30_000,
        message: '挂载/默认锚定回填不应产生主树挂靠会话',
      })
      .toBe(0)

    // ── 点选 worktree（跨分支 feat-a）：点选时点确认框立现（1.19 语义回归）→ 确认 →
    // 纯选中态（chip 回填 + host 选中记忆推送 + 零会话副作用）──
    await chip(page).first().click()
    await heroMenu(page).getByText('feat-a', { exact: false }).first().click()
    await expect(heroRiskDialog(page), '点选时点跨分支确认框应立现（1.19 语义回归）').toBeVisible({ timeout: 8_000 })
    await snap(page, 'select-time-risk-dialog.png')
    await acknowledgeAndConfirm(page)
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('feat-a')
    await page.waitForTimeout(2_000)
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: '点选确认不应产生 wt-a 挂靠会话（纯选中态）' })
      .toBe(0)
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), { timeout: 30_000, message: '点选确认不应产生主树挂靠会话（纯选中态）' })
      .toBe(0)
    await snap(page, 'pure-selection-no-session.png')

    // ── 「新会话」钮 → 官方 create → wrap 预铸（创建即绑定；创建目标 = 注册项目根——
    // 选中树消费面 = host 必绑重路由，对无绑定 blank 生效；点选零会话副作用不受影响）──
    await page
      .locator('.dswf-sidebar-project-row', { hasText: 'orch-repo' })
      .first()
      .hover()
    await newSessionButton(page).click()
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), { timeout: 60_000, message: '创建即绑定：新会话应预铸绑定项目根' })
      .toBe(1)
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: '选中态不改变 wrap 创建目标（wt-a 恒零）' })
      .toBe(0)
    await snap(page, 'create-bound-root.png')

    // ── 发送：startSession 落 hero 空态（composer inert——官方无 hero 提交建会话触点），
    // 先经左栏会话行打开预铸会话，再在会话 composer 键入并发送（发送钮手势）──
    const MARKER = '1-29-pure-selection-first-message'
    await page.locator('[data-dswf-session]').first().click()
    // 会话行激活判读（data-selected 翻转 = 官方 openSession 落位）
    await expect
      .poll(async () => {
        const rows = page.locator('[data-dswf-session]')
        const n = await rows.count()
        for (let i = 0; i < n; i += 1) {
          if ((await rows.nth(i).getAttribute('data-selected')) !== null) return true
        }
        return false
      }, { timeout: 30_000, message: '会话行点击后应激活（data-selected）' })
      .toBe(true)
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
    const composer = page.locator('[data-composer-input]').first()
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await composer.click()
      await page.keyboard.insertText(MARKER)
      const echoed = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')
      if (echoed.includes(MARKER)) break
      await page.waitForTimeout(5_000)
    }
    await snap(page, 'before-send.png')
    // 发送（发送钮手势——运行失败可接受：隔离 profile 无模型凭据，user 消息落账不受影响）
    const sendButton = page.getByRole('button', { name: '发送消息' })
    await composer.click()
    if (await sendButton.isEnabled().catch(() => false)) await sendButton.click().catch(() => {})
    else await page.keyboard.press('Enter')
    // 发送落账判读：左栏会话行标题 = 首条消息文本（官方会话题名取首条 user 消息）
    await expect
      .poll(async () => {
        const rows = page.locator('[data-dswf-session]')
        const n = await rows.count()
        for (let i = 0; i < n; i += 1) {
          if (((await rows.nth(i).textContent()) ?? '').includes(MARKER)) return true
        }
        return false
      }, { timeout: 60_000, message: '首条消息应落账（会话行标题 = 消息文本）' })
      .toBe(true)
    // seal 绑定回读：预铸会话出生即绑项目根（创建即绑定证据——header.cwd ≡ worktreePath
    // 由宿主 cwd 守护保证；模型运行失败不影响绑定与落账）
    const sessionId = (await page.locator('[data-dswf-session]').first().getAttribute('data-dswf-session')) ?? ''
    let binding: { worktreePath?: string; branch?: string; sealed?: boolean } | undefined
    await expect
      .poll(async () => (binding = await sealBinding(page, sessionId).catch(() => undefined)), {
        timeout: 60_000,
        message: 'seal 未读到预铸会话绑定',
      })
      .toBeDefined()
    console.log('[1.29] seal binding =', JSON.stringify(binding))
    expect(binding?.worktreePath?.toLowerCase().replaceAll('\\', '/')).toBe(wsDir.toLowerCase().replaceAll('\\', '/'))
    expect(binding?.branch).toBe('main')
    expect(binding?.sealed, '主树绑定恒不封存').toBe(false)
    await snap(page, 'first-message-in-worktree.png')
  } finally {
    // eslint-disable-next-line no-console -- 判读留痕：runner stdout（Tee 日志）+ 证据目录双落
    console.log('[renderer-console]\n' + consoleLog.join('\n'))
    try {
      writeFileSync(join(EVIDENCE_DIR, 'renderer-console.log'), consoleLog.join('\n'), 'utf8')
    } catch {
      // 留痕失败不影响清理
    }
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
