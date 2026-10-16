// worktree-branch-management 1.19 真机 UI e2e：切换分支风险确认框 + 零 checkout/cwd 三重纪律。
//   · hero chip 改选跨分支行 → 官方 RiskConfirmation 弹出；取消保持原选；勾选知悉 + 确认才切换；
//   · 同分支重选（目标 = 主树当前检出分支）不弹框直接切换；
//   · 新建表单基准分支 ≠ 主树检出分支 → 创建前同款确认框；取消不进 git，确认才创建；
//   · 挂靠会话 cwd 强制：sessionCreate 真机预铸 → 落盘 SessionHeader.cwd = worktree 根，
//     且在该 cwd 下实测 pwd 语义面（git rev-parse --show-toplevel）= worktree 根。
// data 锚：chip = [data-dswt-hero-trigger]；新建提交 = [data-dswt-create-submit]；
// 弹窗锚 = role=dialog + aria-label（官方 Modal 语义）；菜单锚 = .dswt-hero-menu。
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.19/001-risk-confirm'

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
  const box = dialog.locator('input[type="checkbox"]')
  await expect(box).toBeVisible()
  await box.check()
  await dialog.getByRole('button', { name: '确认继续' }).click()
}

/** 在 hero 菜单里点选含指定文案的行 */
async function pickMenuRow(page: Page, text: string): Promise<void> {
  await chip(page).first().click()
  await heroMenu(page).getByText(text, { exact: false }).first().click()
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

test('1.19 UI：跨分支风险确认框（hero 改选 + 新建基准）+ 挂靠会话 cwd 强制', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-19-risk-'))
  const { dir: wsDir, wtDir } = makeGitRepo()
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

    // ── AC1：hero chip 改选跨分支行（feat-a ≠ main）→ 先弹风险框；取消保持原选 ──
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page), '跨分支改选应先弹官方 RiskConfirmation').toBeVisible()
    await snap(page, 'hero-risk-dialog.png')
    await heroRiskDialog(page).getByRole('button', { name: '取消', exact: true }).click()
    await expect(heroRiskDialog(page)).toBeHidden()
    expect(await chip(page).first().textContent(), '取消后 chip 保持原选（main）').toContain('main')

    // ── AC1 确认路径：勾选知悉 → 确认才走挂靠编排 ──
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page)).toBeVisible()
    await acknowledgeAndConfirm(page, heroRiskDialog(page))
    await expect(heroRiskDialog(page)).toBeHidden()
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('feat-a')

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
      .poll(async () => (await listNames(page, wsDir)).includes('feat/new'), { timeout: 30_000, message: '确认后应创建同名 worktree feat/new' })
      .toBe(true)
    await snap(page, 'create-confirmed.png')

    // ── AC5：挂靠会话 cwd 强制（真机预铸 → 落盘头 cwd = worktree 根 → cwd 下 pwd 实测） ──
    const raw = (await forgeRpc(page, 'forge:worktree/session-create', { worktreePath: wtDir })) as {
      data?: { sessionId?: string }
      sessionId?: string
    } | null
    const sessionId = raw?.data?.sessionId ?? raw?.sessionId
    expect(typeof sessionId).toBe('string')
    // 落盘证据双面：① session_projcache 快照 cwd 字段；② 官方存储按会话 cwd 分组——
    // session-<id> 目录必落 `…-wt-a--` 组（分组键 = SessionHeader.cwd）
    const headerCwd = findSessionHeaderCwd(userData, sessionId as string)
    expect(headerCwd, 'session_projcache 快照 cwd 应 = 挂靠 worktree 根').toBe(wtDir)
    const sessionDir = findSessionDir(userData, sessionId as string)
    expect(sessionDir, '会话存储目录应按 wt-a worktree cwd 分组').toContain('wt-a')
    // cwd 实测：该目录下 pwd 语义面（git rev-parse --show-toplevel）= worktree 根；零 checkout（主树仍在 main）
    const toplevel = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: headerCwd, encoding: 'utf8' }).stdout.trim().replaceAll('\\', '/')
    expect(toplevel.toLowerCase()).toBe(wtDir.toLowerCase())
    const mainBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wsDir, encoding: 'utf8' }).trim()
    expect(mainBranch, '零 checkout：主树 HEAD 不因建树/挂靠而切换').toBe('main')
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsDir, { recursive: true, force: true })
  }
})

/** 在 userData 下定位会话存储目录（session-<id> 目录——官方按会话 cwd 分组） */
function findSessionDir(userData: string, sessionId: string): string | undefined {
  const visit = (dir: string, depth: number): string | undefined => {
    if (depth > 8) return undefined
    let rows: string[] = []
    try {
      rows = readdirSync(dir)
    } catch {
      return undefined
    }
    for (const row of rows) {
      const full = join(dir, row)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        if (row === `session-${sessionId}` || row === sessionId) return full
        const hit = visit(full, depth + 1)
        if (hit !== undefined) return hit
      }
    }
    return undefined
  }
  for (const root of [join(userData, 'dsh-home'), userData]) {
    if (existsSync(root)) {
      const hit = visit(root, 0)
      if (hit !== undefined) return hit
    }
  }
  return undefined
}

/** 在 userData 下定位会话存储并解析头 cwd（session_projcache 快照 json 的 cwd 字段） */
function findSessionHeaderCwd(userData: string, sessionId: string): string | undefined {
  const visit = (dir: string, depth: number): string | undefined => {
    if (depth > 8) return undefined
    let rows: string[] = []
    try {
      rows = readdirSync(dir)
    } catch {
      return undefined
    }
    for (const row of rows) {
      const full = join(dir, row)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        const hit = visit(full, depth + 1)
        if (hit !== undefined) return hit
        continue
      }
      if (row.includes(sessionId) && row.endsWith('.json')) {
        try {
          // session_projcache 快照（真机落盘面）——全量解析抽 cwd 字段
          const parsed = JSON.parse(readFileSync(full, 'utf8')) as {
            cwd?: string
            header?: { cwd?: string }
          } & Record<string, unknown>
          const cwd = parsed.header?.cwd ?? parsed.cwd
          if (typeof cwd === 'string') return cwd
          // 通用深取：任意层级的 cwd 字符串字段
          const stack: unknown[] = [parsed]
          while (stack.length > 0) {
            const node = stack.pop()
            if (node === null || typeof node !== 'object') continue
            for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
              if (key === 'cwd' && typeof value === 'string') return value
              if (value !== null && typeof value === 'object') stack.push(value)
            }
          }
        } catch {
          continue
        }
      }
    }
    return undefined
  }
  for (const root of [join(userData, 'dsh-home'), userData]) {
    if (existsSync(root)) {
      const hit = visit(root, 0)
      if (hit !== undefined) return hit
    }
  }
  return undefined
}
