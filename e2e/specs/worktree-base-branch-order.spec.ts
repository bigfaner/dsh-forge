// worktree-branch-management 1.22 真机 UI e2e：新建表单基准分支选项排序
//   · 用户裁决 2026-10-16：main > master > {default branch} > {current branch} > 其余（字母序）
//   · default branch = branches RPC defaultBranch（1.13 存在性校验链——fixture 以
//     init.defaultBranch=trunk + 本地 trunk 分支产出）；current branch = 主行检出 main；
//   · 去重：current=main 与 default 各归其位，一分支一槽（不重复出现）。
// data 锚：基准分支触发器 = [data-dswt-base-trigger]；菜单 = .dswt-base-branch-menu（行 role=menuitem）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.22/001-base-branch-order'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；default branch 经 init.defaultBranch=trunk） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-22-order-repo-'))
  const git = (args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=t122@test', '-c', 'user.name=t122', ...args], { cwd: dir, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.22 order fixture\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  for (const name of ['master', 'develop', 'trunk', 'zeta']) git(['branch', name])
  // 1.13 存在性校验链第二级：init.defaultBranch（本地 trunk 在场）→ default branch = trunk
  git(['config', 'init.defaultBranch', 'trunk'])
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
          name: 'order-repo',
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

test('1.22 UI：新建表单基准分支选项排序 main > master > default > current > 其余', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-22-order-'))
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const wsDir = makeGitRepo()
  const app = await launchElectron({
    env: { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData },
  })
  try {
    const page: Page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(page.locator('[data-dswt-hero-trigger]').first(), 'hero chip 未注入').toBeVisible({ timeout: 30_000 })

    // defaultBranch RPC 实证（fixture 期望 trunk——1.13 校验链产出）
    const rpcRaw = (await forgeRpc(page, 'forge:worktree/branches', { projectRoot: wsDir })) as {
      data?: { defaultBranch?: string; branches?: readonly string[] }
      defaultBranch?: string
      branches?: readonly string[]
    } | null
    const defaults = rpcRaw?.data ?? rpcRaw ?? {}
    const evidenceRpc = { defaultBranch: defaults.defaultBranch, branches: defaults.branches }
    writeFileSync(join(EVIDENCE_DIR, 'defaults-rpc.json'), JSON.stringify(evidenceRpc, null, 2))

    // 打开新建弹窗 → 展开基准分支菜单 → 取行序
    await page.locator('[data-dswt-hero-trigger]').first().click()
    await page.getByText('新建 worktree…', { exact: false }).first().click()
    const dialog = page.getByRole('dialog', { name: '新建 worktree' })
    await expect(dialog).toBeVisible()
    await dialog.locator('[data-dswt-base-trigger]').click()
    const rows = page.locator('.dswt-base-branch-menu [role="menuitem"]')
    await expect(rows.first()).toBeVisible()
    const order = (await rows.allTextContents()).map((text) => text.trim())
    writeFileSync(join(EVIDENCE_DIR, 'base-branch-order.json'), JSON.stringify(order, null, 2))
    try {
      // 元素级截图（菜单面）——页面级截图在 electron 收尾动画期偶发超时，逐级兜底
      await rows.screenshot({ path: join(EVIDENCE_DIR, 'base-branch-order.png'), animations: 'disabled', timeout: 10_000 })
    } catch {
      try {
        await page.screenshot({ path: join(EVIDENCE_DIR, 'base-branch-order.png'), timeout: 10_000 })
      } catch {
        // 截图失败仅损失证据帧（行序 json + RPC json 已是主证据）
      }
    }
    // 主行检出 main；default=trunk（非 main/master）→ 期望 main > master > trunk > current(main 已居首) > 其余字母序
    expect(order, '基准分支选项排序').toEqual(['main', 'master', 'trunk', 'develop', 'zeta'])
    await page.keyboard.press('Escape')
  } finally {
    await closeApp(app)
    if (existsSync(userData)) rmSync(userData, { recursive: true, force: true })
  }
})

/** 清理：走查夹具仓（EVIDENCE_DIR 不动——证据留盘） */
test.afterAll(() => {
  const dirs = readdirSync(tmpdir()).filter((name) => name.startsWith('dsh-forge-1-22-order-repo-'))
  for (const name of dirs) rmSync(join(tmpdir(), name), { recursive: true, force: true })
})
