// binding-derivation 1.29 真机 UI e2e（绑定推导制重写）：快速切换 + 发送落所选树。
// 点选 worktree 行 = 显式传参官方 openWorkspace（建/复用该树 blank，主视图随之切换——
// bug 05c712a4 composer 腿收口：显示 = 实际生效状态，AGENTS 3.4）；点选时点跨分支确认
// （1.19 语义回归）；worktree 经产品创建弹窗建立（流程 A——官方 workspace 幂等创建 +
// DTO 携带 workspaceId，选树路由硬前置）。
// 创建 = 官方 session.create({workspaceId})（项目行钮显式项目根直通；官方壳「新会话」
// 无参 startSession 由入口锚定 wrap 按 chip 显示选中树路由），发送走官方原流直落
// header.cwd 对应 worktree——无哨兵改投（已退役），官方 blank 复用天然命中。
//   · 挂载/默认锚定回填：零新增会话副作用；
//   · 根树开户（项目行钮）→ 快速切换 feat-a → main → feat-a：点选即建/复用该树 blank
//     （wt-a 恰 1，复用零重复；主树复用既有 blank）；
//   · 官方壳「新会话」→ 会话 cwd = 所选树（feat-a）；
//   · 发送 → 首条消息落所选树会话（seal 绑定回读 = cwd 证据；模型运行失败可接受
//     ——隔离 profile 无模型凭据，user 消息落账不受影响）；零重复建。
// 断言面 = forge:worktree/seal（header.cwd 推导读侧）+ forge:worktree/checks（官方
// workspace record sessionIds 计数）。基线取 boot 后快照（以「零新增」为口径）。
// data 锚：chip = [data-dswt-hero-trigger]；菜单 = .dswt-hero-menu；新会话钮 =
// [data-dswf-project-action="new-session"]；创建弹窗 = data-dswt-worktree-input /
// data-dswt-branch-input / data-dswt-create-submit；风险框 = role dialog「跨分支风险确认」；
// 会话行 = [data-dswf-session]；composer = [data-composer-input]。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { findFixtureSession } from '../support/session-files.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'D:/software/dsh-forge/data/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/binding-derivation/1.9/002-pure-selection'
mkdirSync(EVIDENCE_DIR, { recursive: true })

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；worktree 经产品弹窗创建，见流程 A） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-29-pure-repo-'))
  const git = (args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=t129@test', '-c', 'user.name=t129', ...args], { cwd: dir, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.29 pure-selection fixture\n')
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

/**
 * 经产品创建弹窗建 worktree（流程 A：git worktree add + 官方 workspace 幂等创建 + DTO
 * 携带 workspaceId）。外部 git CLI 建树不产生官方 workspace record（list 只读解析）——
 * 选树路由（chip 双发 workspaceId）的 fixture 前置必须走此径。
 */
async function createWorktreeViaDialog(page: Page, projectRoot: string, branch: string, name: string): Promise<void> {
  await chip(page).first().click()
  await heroMenu(page).getByText('新建 worktree…', { exact: false }).first().click()
  await page.locator('[data-dswt-branch-input]').fill(branch)
  await page.locator('[data-dswt-worktree-input]').fill(name)
  await page.locator('[data-dswt-create-submit]').click()
  await expect
    .poll(async () => {
      try {
        const raw = (await forgeRpc(page, 'forge:worktree/list', { projectRoot })) as {
          data?: { entries?: Array<{ worktreeName?: string; workspaceId?: string }> }
          entries?: Array<{ worktreeName?: string; workspaceId?: string }>
        } | null
        const entries = raw?.data?.entries ?? raw?.entries ?? []
        return entries.some((row) => row.worktreeName === name && typeof row.workspaceId === 'string' && row.workspaceId !== '')
      } catch {
        return false
      }
    }, { timeout: 60_000, message: `worktree ${name} 应入清单且携带 workspaceId（流程 A 闭环）` })
    .toBe(true)
}

/** 风险框交互：勾选风险知悉 → 确认继续（1.19 同款；「不再提示」勾选行不勾——保持可重问） */
async function acknowledgeAndConfirm(page: Page): Promise<void> {
  const dialog = heroRiskDialog(page)
  const box = dialog.getByRole('checkbox', { name: '我已了解跨分支上下文风险' })
  await expect(box).toBeVisible()
  await box.check()
  await dialog.getByRole('button', { name: '确认继续' }).click()
  await expect(heroRiskDialog(page)).toBeHidden()
}

/** 选中 worktree 行（跨分支首次点选弹确认框——闩锁后直通） */
async function selectWorktree(page: Page, text: string): Promise<void> {
  await chip(page).first().click()
  await heroMenu(page).getByText(text, { exact: false }).first().click()
  const appeared = await heroRiskDialog(page)
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false)
  if (appeared) await acknowledgeAndConfirm(page)
  await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
    .toContain(text)
}

/** 项目行「新会话」钮（行尾动作 = hover 显现；显式 workspaceId = 项目根 workspace 直通） */
async function clickNewSession(page: Page): Promise<void> {
  await page
    .locator('.dswf-sidebar-project-row', { hasText: 'orch-repo' })
    .first()
    .hover()
  await newSessionButton(page).click()
}

/** 官方壳「新会话」钮（无参 startSession——入口锚定 wrap 消费 chip 显示选中树路由） */
async function clickOfficialNewSession(page: Page): Promise<void> {
  const exact = page.getByRole('button', { name: '新会话', exact: true })
  if (await exact.first().isVisible().catch(() => false)) {
    await exact.first().click()
    return
  }
  await page.getByRole('button', { name: /新会话|新建会话/ }).first().click()
}

/** 挂靠会话计数（checks 通道——官方 workspace record sessionIds 单源） */
async function attachedSessions(page: Page, wsDir: string, path: string): Promise<number> {
  const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
    data?: { attachedSessions?: number }
    attachedSessions?: number
  } | null
  return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
}

/** seal 绑定回读（推导制读侧：binding.worktreePath = header.cwd——cwd 即绑定证据；
 *  sessionId = 账本 id（session-<uuid> 全名）） */
async function sealBinding(page: Page, sessionId: string): Promise<{ worktreePath?: string; branch?: string; sealed?: boolean } | undefined> {
  const full = sessionId.startsWith('session-') ? sessionId : `session-${sessionId}`
  const raw = (await forgeRpc(page, 'forge:worktree/seal', { sessionId: full }).catch(() => undefined)) as
    | { data?: { sealed?: boolean; binding?: { worktreePath?: string; branch?: string } | null }; sealed?: boolean; binding?: { worktreePath?: string; branch?: string } | null }
    | undefined
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

const norm = (p: string | undefined): string => (p ?? '').toLowerCase().replaceAll('\\', '/')

test('1.29 UI（推导制）：快速切换点选即切换（openWorkspace 显式传参）——发送落所选树（官方复用天然命中）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-29-pure-'))
  const dshHome = join(userData, 'dsh-home')
  const wsDir = makeGitRepo()
  const wtDir = join(wsDir, '.forge', 'worktrees', 'wt-a')
  const app = await launchHost({ userData })
  const consoleLog: string[] = []
  try {
    const { page } = app
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`))
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')
    // boot 后基线快照（官方默认会话在场——绝对 0 不可达，以「零新增」为口径）
    const baseRoot = await attachedSessions(page, wsDir, wsDir)
    console.log('[1.29] baseline root =', baseRoot)
    // worktree 经产品弹窗创建（流程 A 闭环——选树路由硬前置）
    await createWorktreeViaDialog(page, wsDir, 'feat-a', 'wt-a')
    // 挂载/默认锚定回填：零新增会话副作用
    await page.waitForTimeout(2_000)
    expect(await attachedSessions(page, wsDir, wsDir), '回填零新增主树会话').toBe(baseRoot)
    expect(await attachedSessions(page, wsDir, wtDir), '建树零新增 wt-a 会话').toBe(0)

    // ── 根树开户（项目行钮——显式项目根 workspaceId 直通官方；wrap 无参路由的官方锚在管
    // 形态）→ 快速切换 feat-a → main → feat-a：点选即建/复用该树 blank（主视图随之切换）──
    await clickNewSession(page)
    let rootSessionId = ''
    await expect
      .poll(async () => {
        const found = findFixtureSession(dshHome, 'pure-repo')
        if (found !== undefined) rootSessionId = found.sessionId
        return rootSessionId
      }, { timeout: 60_000, message: '主树会话应开户（盘侧 cwd 分组）' })
      .not.toBe('')
    let rootBinding: { worktreePath?: string; branch?: string } | undefined
    await expect
      .poll(async () => (rootBinding = await sealBinding(page, rootSessionId).catch(() => undefined)), {
        timeout: 60_000,
        message: 'seal 未读到主树会话绑定',
      })
      .toBeDefined()
    expect(norm(rootBinding?.worktreePath), '项目行新会话 cwd = 项目根').toBe(norm(wsDir))
    await selectWorktree(page, 'feat-a')
    await snap(page, 'select-feat-a.png')
    // 点选即建/复用（bug 05c712a4：显示 = 实际生效状态——wt-a blank 恰 1，composer 发送落点）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: '点选 feat-a 应开户 wt-a blank（openWorkspace 显式传参）' })
      .toBe(1)
    await selectWorktree(page, 'main')
    await snap(page, 'select-main.png')
    // 主树复用既有 blank（root 会话即 blank——零重复）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), { timeout: 30_000, message: '点选 main 复用既有 blank（零重复）' })
      .toBe(baseRoot)
    await selectWorktree(page, 'feat-a')
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: '回切 feat-a 复用 blank（恰 1 零重复）' })
      .toBe(1)
    await snap(page, 'quick-switch-blank-per-tree.png')

    // ── 官方壳「新会话」（无参 startSession——wrap 按 chip 显示选中树路由）→ 会话
    // cwd = 所选树（feat-a）──
    await clickOfficialNewSession(page)
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 60_000, message: '新会话应落所选树 wt-a' })
      .toBe(1)
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), { timeout: 30_000, message: '主树不新增会话（选中 feat-a）' })
      .toBe(baseRoot)
    // 落树判读：wt-a 会话开户（盘侧 cwd 分组 = 所选树），seal 回读 cwd = 所选树
    let wtSessionId = ''
    await expect
      .poll(async () => {
        const found = findFixtureSession(dshHome, 'wt-a')
        if (found !== undefined) wtSessionId = found.sessionId
        return wtSessionId
      }, { timeout: 60_000, message: 'wt-a 会话应开户（盘侧 cwd 分组 = 所选树）' })
      .not.toBe('')
    let binding: { worktreePath?: string; branch?: string; sealed?: boolean } | undefined
    await expect
      .poll(async () => (binding = await sealBinding(page, wtSessionId!).catch(() => undefined)), {
        timeout: 60_000,
        message: 'seal 未读到所选树会话绑定',
      })
      .toBeDefined()
    console.log('[1.29] seal binding =', JSON.stringify(binding))
    expect(norm(binding?.worktreePath)).toBe(norm(wtDir))
    expect(binding?.branch).toBe('feat-a')
    await snap(page, 'create-bound-selected-tree.png')

    // ── 发送：消息落所选树会话（header.cwd = wt-a；无哨兵改投——官方原流直通）──
    const MARKER = '1-29-pure-selection-first-message'
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
    // 发送落所选树：seal 绑定回读不变（cwd = wt-a；模型运行失败不影响绑定与落账）
    let afterSend: { worktreePath?: string; branch?: string } | undefined
    await expect
      .poll(async () => (afterSend = await sealBinding(page, wtSessionId!).catch(() => undefined)), {
        timeout: 60_000,
        message: '发送后 seal 未读到绑定',
      })
      .toBeDefined()
    console.log('[1.29] after-send binding =', JSON.stringify(afterSend))
    expect(norm(afterSend?.worktreePath)).toBe(norm(wtDir))
    expect(afterSend?.branch).toBe('feat-a')
    // 官方复用天然命中：发送全程零重复建（计数维持）
    expect(await attachedSessions(page, wsDir, wtDir), '发送零重复建（官方复用天然命中）').toBe(1)
    expect(await attachedSessions(page, wsDir, wsDir), '主树零新增（无哨兵改投）').toBe(baseRoot)
    await snap(page, 'first-message-in-selected-tree.png')
  } finally {
    // 判读留痕：runner stdout（Tee 日志）+ 证据目录双落
    console.log('[renderer-console]\n' + consoleLog.join('\n'))
    try {
      writeFileSync(join(EVIDENCE_DIR, 'renderer-console.log'), consoleLog.join('\n'), 'utf8')
    } catch {
      // 留痕失败不影响清理
    }
    await closeApp(app.app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
