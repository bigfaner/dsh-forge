// worktree 切换序列回归（bug 267dcac1 验收续——用户真机序列复刻）：
// 选树 X → **切到非 git 项目 → 切回 git 项目**（侧栏项目行——官方 selectWorkspace，无闸径）
// → 选树 Y → composer 发送 → 会话必须落 Y（显示 = 实际生效，AGENTS 3.4）。
// 闸证据：点选后 pending 翻转 true→false（window.__dshForgeWorktreeSwitchGate）。
// 夹具/助手与 1.29 同构（隔离仓库 + 产品弹窗建树——流程 A 闭环前置；非 git 项目 = 无 .git 纯目录）。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { findFixtureSession } from '../support/session-files.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'D:/software/dsh-forge/data/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/binding-derivation/1.9/003-project-row-interlude'
mkdirSync(EVIDENCE_DIR, { recursive: true })

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-row-interlude-repo-'))
  const git = (args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=t133@test', '-c', 'user.name=t133', ...args], { cwd: dir, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), 'row interlude fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  return dir
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
/** 官方 hero 工作区 chip（aria-label 稳定锚）+ 项目行弹层（.dswf-hero-picker-list） */
const workspaceChip = (page: Page) => page.getByRole('button', { name: '选择工作区' })

/** hero 工作区菜单切项目（官方 selectWorkspace 链——用户「切换项目」操作径） */
async function pickProject(page: Page, name: string): Promise<void> {
  await workspaceChip(page).click()
  await page.locator('.dswf-hero-picker-list').getByText(name, { exact: false }).first().click()
}

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

async function acknowledgeAndConfirm(page: Page): Promise<void> {
  const dialog = heroRiskDialog(page)
  const box = dialog.getByRole('checkbox', { name: '我已了解跨分支上下文风险' })
  await expect(box).toBeVisible()
  await box.check()
  await dialog.getByRole('button', { name: '确认继续' }).click()
  await expect(heroRiskDialog(page)).toBeHidden()
}

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

async function clickNewSession(page: Page): Promise<void> {
  await page
    .locator('.dswf-sidebar-project-row', { hasText: 'orch-repo' })
    .first()
    .hover()
  await newSessionButton(page).click()
}

async function attachedSessions(page: Page, wsDir: string, path: string): Promise<number> {
  const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
    data?: { attachedSessions?: number }
    attachedSessions?: number
  } | null
  return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
}

async function sealBinding(page: Page, sessionId: string): Promise<{ worktreePath?: string; branch?: string } | undefined> {
  const full = sessionId.startsWith('session-') ? sessionId : `session-${sessionId}`
  const raw = (await forgeRpc(page, 'forge:worktree/seal', { sessionId: full }).catch(() => undefined)) as
    | { data?: { binding?: { worktreePath?: string; branch?: string } | null }; binding?: { worktreePath?: string; branch?: string } | null }
    | undefined
  return raw?.data?.binding ?? raw?.binding ?? undefined
}

const norm = (p: string | undefined): string => (p ?? '').toLowerCase().replaceAll('\\', '/')

test('切换序列回归：选树 X → 非 git 项目折返 → 选树 Y → 发送落 Y（composer 闸 pending 翻转在场）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-row-interlude-'))
  const dshHome = join(userData, 'dsh-home')
  const wsDir = makeGitRepo()
  const plainDir = mkdtempSync(join(tmpdir(), 'dsh-forge-row-interlude-plain-'))
  const wtA = join(wsDir, '.forge', 'worktrees', 'wt-a')
  const wtB = join(wsDir, '.forge', 'worktrees', 'wt-b')
  const app = await launchHost({ userData })
  const consoleLog: string[] = []
  try {
    const { page } = app
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`))
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page).first(), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    const _baseRoot = await attachedSessions(page, wsDir, wsDir)
    await createWorktreeViaDialog(page, wsDir, 'feat-a', 'wt-a')
    await createWorktreeViaDialog(page, wsDir, 'feat-b', 'wt-b')

    // ── 选树 X（wt-a）→ 开户 ──
    await clickNewSession(page)
    await selectWorktree(page, 'feat-a')
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtA), { timeout: 30_000, message: '选 wt-a 应开户' })
      .toBe(1)

    // ── 非 git 项目折返（侧栏项目行——官方 selectWorkspace，无闸径）──
    await expect
      .poll(async () => {
        try {
          const raw = (await forgeRpc(page, 'forge:projects/register', {
            workspaceDir: plainDir,
            name: 'plain-proj',
            forgeDir: join(plainDir, '.forge'),
            knowledgeDir: join(plainDir, '.knowledge'),
          })) as { ok?: boolean; data?: { projectId?: string }; projectId?: string } | null
          const projectId = raw?.data?.projectId ?? raw?.projectId
          return typeof projectId === 'string'
        } catch {
          return false
        }
      }, { timeout: 60_000, message: '非 git 项目注册未就绪' })
      .toBe(true)
    await pickProject(page, 'plain-proj')
    await expect
      .poll(async () => (await chip(page).first().count()), { timeout: 30_000, message: '非 git 项目下 worktree chip 应消失' })
      .toBe(0)
    await pickProject(page, 'orch-repo')
    await expect
      .poll(async () => (await chip(page).first().count()), { timeout: 30_000, message: '切回 git 项目 chip 应恢复' })
      .toBe(1)

    // ── 选树 Y（wt-b）：闸 pending 翻转证据 + 开户 ──
    const pendingProbe = async (): Promise<boolean> =>
      page.evaluate(() => {
        const gate = (globalThis as unknown as Record<string, { isPending?: () => boolean } | undefined>)[
          '__dshForgeWorktreeSwitchGate'
        ]
        return gate?.isPending?.() ?? false
      })
    await chip(page).first().click()
    await heroMenu(page).getByText('feat-b', { exact: false }).first().click()
    const appeared = await heroRiskDialog(page)
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false)
    if (appeared) await acknowledgeAndConfirm(page)
    await expect
      .poll(pendingProbe, { timeout: 10_000, message: '点选后切换闸应置位（composer block 缝已接）' })
      .toBe(true)
    await expect
      .poll(pendingProbe, { timeout: 15_000, message: '切换闸应敛棋解除' })
      .toBe(false)
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtB), { timeout: 30_000, message: '选 wt-b 应开户' })
      .toBe(1)

    // ── composer 发送（闸解除后）→ 首条消息必须落 wt-b ──
    const MARKER = 'row-interlude-first-message'
    const composer = page.locator('[data-composer-input]').first()
    await composer.click()
    await page.keyboard.insertText(MARKER)
    const sendButton = page.getByRole('button', { name: '发送消息' })
    await composer.click()
    if (await sendButton.isEnabled().catch(() => false)) await sendButton.click().catch(() => {})
    else await page.keyboard.press('Enter')
    await expect
      .poll(async () => {
        const rows = page.locator('[data-dswf-session]')
        const n = await rows.count()
        for (let i = 0; i < n; i += 1) {
          if (((await rows.nth(i).textContent()) ?? '').includes(MARKER)) return true
        }
        return false
      }, { timeout: 60_000, message: '首条消息应落账' })
      .toBe(true)
    let wtBSessionId = ''
    await expect
      .poll(async () => {
        const found = findFixtureSession(dshHome, 'wt-b')
        if (found !== undefined) wtBSessionId = found.sessionId
        return wtBSessionId
      }, { timeout: 60_000, message: 'wt-b 会话应开户（盘侧 cwd 分组）' })
      .not.toBe('')
    const binding = await sealBinding(page, wtBSessionId!)
    console.log('[row-interlude] wt-b binding =', JSON.stringify(binding))
    expect(norm(binding?.worktreePath), '发送应落所选树 wt-b（非上一次选中的 wt-a）').toBe(norm(wtB))
    expect(await attachedSessions(page, wsDir, wtA), 'wt-a 零新增（发送未落上一棵树）').toBe(1)
  } finally {
    console.log('[renderer-console]\n' + consoleLog.join('\n'))
    try {
      writeFileSync(join(EVIDENCE_DIR, 'renderer-console.log'), consoleLog.join('\n'), 'utf8')
    } catch {
      // 留痕失败不影响清理
    }
    await closeApp(app.app)
    rmSync(userData, { recursive: true, force: true })
  }
})
