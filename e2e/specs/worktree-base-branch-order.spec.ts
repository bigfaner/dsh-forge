// worktree-branch-management 1.22/1.23 真机 UI e2e：新建表单基准分支选项排序 + 默认选中同源
//   · 用户裁决 2026-10-16：main > master > {default branch} > {current branch} > 其余（字母序）
//   · default branch = branches RPC defaultBranch（1.13 存在性校验链——fixture 以
//     init.defaultBranch=trunk + 本地 trunk 分支产出）；current branch = 主行检出 main；
//   · 去重：current=main 与 default 各归其位，一分支一槽（不重复出现）。
//   · 1.23 用户裁决：基准分支默认选中 = 排序后首项（默认与排序同源——本 fixture 即 main）。
// data 锚：基准分支触发器 = [data-dswt-base-trigger]；菜单 = .dswt-base-branch-menu（行 role=menuitem）。
// e2e-fast-shared-launch 存量迁移（批次三a）：共享 launch fixture——launchHost 整 spec 一次，
// 夹具工作区即隔离 git 仓（seedWorkspace 播种基准态，单用例 spec = 每跑批一次冷启）。
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSharedLaunchFixture } from '../support/fixtures.js'
import { expect, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.23/001-base-default-first'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；default branch 经 init.defaultBranch=trunk）。
 *  共享 launch 形态：仓库落夹具工作区本体（首启/重播种/crash 重启统一播种同参基准态）。 */
function makeGitRepo(dir: string): void {
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
}

async function forgeRpc(page: Page, channel: string, payload?: unknown): Promise<unknown> {
  return page.evaluate(
    ([ch, payload]) =>
      (window as unknown as { dshForge: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge.invoke(ch, payload),
    [channel, payload] as const,
  )
}

// ── 共享 launch fixture（夹具工作区 = git 仓本体；项目注册由 fixture 层首注册承载）──
const { test } = createSharedLaunchFixture({
  seedWorkspace: makeGitRepo,
  workspaceName: 'order-repo',
})

test('1.22 UI：新建表单基准分支选项排序 main > master > default > current > 其余', async ({ sharedLaunch }) => {
  test.setTimeout(300_000)
  const { page, wsDir } = sharedLaunch
  mkdirSync(EVIDENCE_DIR, { recursive: true })
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
  // 1.23 默认选中 = 排序首项（默认值与排序同源）：收起态触发器文案即选中项
  const triggerText = (await dialog.locator('[data-dswt-base-trigger]').textContent())?.trim() ?? ''
  writeFileSync(join(EVIDENCE_DIR, 'base-branch-default.json'), JSON.stringify({ default: triggerText }, null, 2))
  expect(triggerText, '基准分支默认选中 = 排序首项').toBe(order[0])
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
})
