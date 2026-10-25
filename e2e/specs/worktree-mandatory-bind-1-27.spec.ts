// binding-derivation 1.27 真机 UI e2e（绑定推导制重写）：选树 → 会话 cwd = 所选树，
// 官方 blank 复用天然命中。预铸/绑定事件可见行为不再可断言（forge/worktree-attach 与
// 发送哨兵/换绑编排已退役——绑定 = header.cwd 推导，创建 = 官方 session.create({workspaceId})）。
//   · 场景 A（默认锚主树）：回填零「新增」会话副作用 → 项目行「新会话」钮（显式项目根
//     workspaceId 直通官方）→ 会话 cwd = 项目根（branch = main）；重复点击零重复建；
//   · 场景 B（选树 wt-a）：worktree 经产品创建弹窗建立（流程 A——官方 workspace 幂等创建
//     + DTO 携带 workspaceId，选树路由硬前置）→ 点选时点跨分支确认（1.19 语义回归）→
//     点选即 openWorkspace（建/复用该树 blank——bug 05c712a4 显示 = 实际生效状态）→
//     官方壳「新会话」（无参 startSession——入口锚定 wrap 按 chip 显示选中树路由）→
//     复用同一 blank → 会话 cwd = 所选树（branch = feat-a）；重复点击零重复建。
// 断言面 = forge:worktree/seal（header.cwd 推导读侧）+ forge:worktree/checks（官方
// workspace record sessionIds 计数）。基线取 boot 后快照（官方 boot 默认会话在场——
// 推导制下计数 = 官方挂账事实，绝对 0 不可达，以「零新增」为口径）。
// data 锚：chip = [data-dswt-hero-trigger]；菜单 = .dswt-hero-menu；新会话钮 =
// [data-dswf-project-action="new-session"]；创建弹窗 = data-dswt-worktree-input /
// data-dswt-branch-input / data-dswt-create-submit；风险框 = role dialog「跨分支风险确认」。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { findFixtureSession } from '../support/session-files.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'D:/software/dsh-forge/data/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/binding-derivation/1.9/001-mandatory-bind'
mkdirSync(EVIDENCE_DIR, { recursive: true })

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；worktree 经产品弹窗创建，见流程 A） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-27-orch-repo-'))
  const git = (args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=t127@test', '-c', 'user.name=t127', ...args], { cwd: dir, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.27 binding-derivation fixture\n')
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
  // 创建闭环：清单行携带 workspaceId（官方 workspace 幂等创建——选树路由硬前置）
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

/** 风险框交互：勾选风险知悉 → 确认继续（1.19 同款），循环至收敛（上限 4 轮） */
async function acknowledgeUntilSettled(page: Page): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    const appeared = await heroRiskDialog(page)
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false)
    if (!appeared) return
    const dialog = heroRiskDialog(page)
    const box = dialog.getByRole('checkbox', { name: '我已了解跨分支上下文风险' })
    await expect(box).toBeVisible()
    await box.check()
    await dialog.getByRole('button', { name: '确认继续' }).click()
    await expect(heroRiskDialog(page)).toBeHidden()
  }
}

/** 项目行「新会话」钮（行尾动作 = hover 显现——显式 workspaceId = 项目根 workspace 直通） */
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

test('1.27 UI（推导制）：选树 → 会话 cwd = 所选树；官方 blank 复用天然命中', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-27-bind-'))
  const dshHome = join(userData, 'dsh-home')
  const wsDir = makeGitRepo()
  const wtDir = join(wsDir, '.forge', 'worktrees', 'wt-a')
  const app = await launchHost({ userData })
  try {
    const { page } = app
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')
    // boot 后基线快照（官方默认会话在场——绝对 0 不可达，以「零新增」为口径）
    const baseRoot = await attachedSessions(page, wsDir, wsDir)
    console.log('[1.27] baseline root =', baseRoot)

    // ── 场景 A（默认锚主树）：回填零新增 → 项目行「新会话」钮 → 会话 cwd = 项目根 ──
    await page.waitForTimeout(2_000)
    expect(await attachedSessions(page, wsDir, wsDir), '回填零新增主树会话（展示回填零副作用）').toBe(baseRoot)
    await clickNewSession(page)
    let rootSessionId = ''
    await expect
      .poll(async () => {
        const found = findFixtureSession(dshHome, 'orch-repo')
        if (found !== undefined) rootSessionId = found.sessionId
        return rootSessionId
      }, { timeout: 60_000, message: '主树会话应开户（盘侧 cwd 分组）' })
      .not.toBe('')
    let rootBinding: { worktreePath?: string; branch?: string; sealed?: boolean } | undefined
    await expect
      .poll(async () => (rootBinding = await sealBinding(page, rootSessionId).catch(() => undefined)), {
        timeout: 60_000,
        message: 'seal 未读到主树会话绑定',
      })
      .toBeDefined()
    console.log('[1.27-scene-a] seal binding =', JSON.stringify(rootBinding))
    expect(norm(rootBinding?.worktreePath), '会话 cwd = 项目根（header.cwd 推导）').toBe(norm(wsDir))
    expect(rootBinding?.branch).toBe('main')
    expect(rootBinding?.sealed, '主树恒在场恒不封存').toBe(false)
    // 官方 blank 复用天然命中：再次点击 → reuseOrCreateBlank 采纳既有 blank——零重复建
    const countAfterFirst = await attachedSessions(page, wsDir, wsDir)
    await clickNewSession(page)
    await page.waitForTimeout(10_000)
    expect(await attachedSessions(page, wsDir, wsDir), '官方复用天然命中：主树零重复建').toBe(countAfterFirst)
    await snap(page, 'scene-a-root-bound-blank-reuse.png')

    // ── 场景 B（选树 wt-a）：产品弹窗建树（流程 A 闭环）→ 点选时点跨分支确认 →
    // 点选即 openWorkspace（建/复用该树 blank）→ 官方壳「新会话」复用同一 blank ──
    await createWorktreeViaDialog(page, wsDir, 'feat-a', 'wt-a')
    await chip(page).first().click()
    await heroMenu(page).getByText('feat-a', { exact: false }).first().click()
    await expect(heroRiskDialog(page), '点选时点跨分支确认框应立现（1.19 语义回归）').toBeVisible({ timeout: 8_000 })
    await snap(page, 'scene-b-select-time-risk-dialog.png')
    await acknowledgeUntilSettled(page)
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('feat-a')
    // 点选即建/复用（bug 05c712a4：显示 = 实际生效状态——wt-a blank 恰 1）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: '点选确认应开户 wt-a blank（openWorkspace 显式传参）' })
      .toBe(1)
    await clickOfficialNewSession(page)
    let wtSessionId = ''
    await expect
      .poll(async () => {
        const found = findFixtureSession(dshHome, 'wt-a')
        if (found !== undefined) wtSessionId = found.sessionId
        return wtSessionId
      }, { timeout: 60_000, message: 'wt-a 会话应开户（盘侧 cwd 分组 = 所选树）' })
      .not.toBe('')
    let wtBinding: { worktreePath?: string; branch?: string; sealed?: boolean } | undefined
    await expect
      .poll(async () => (wtBinding = await sealBinding(page, wtSessionId).catch(() => undefined)), {
        timeout: 60_000,
        message: 'seal 未读到 wt-a 会话绑定',
      })
      .toBeDefined()
    console.log('[1.27-scene-b] seal binding =', JSON.stringify(wtBinding))
    expect(norm(wtBinding?.worktreePath), '会话 cwd = 所选树 wt-a').toBe(norm(wtDir))
    expect(wtBinding?.branch).toBe('feat-a')
    // 双树各自官方复用：重复点击零重复建
    const wtCountAfterFirst = await attachedSessions(page, wsDir, wtDir)
    await clickOfficialNewSession(page)
    await page.waitForTimeout(10_000)
    expect(await attachedSessions(page, wsDir, wtDir), '官方复用天然命中：wt-a 零重复建').toBe(wtCountAfterFirst)
    expect(await attachedSessions(page, wsDir, wsDir), '主树计数不受选树影响').toBe(countAfterFirst)
    await snap(page, 'scene-b-wt-bound-blank-reuse.png')
  } finally {
    await closeApp(app.app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})
