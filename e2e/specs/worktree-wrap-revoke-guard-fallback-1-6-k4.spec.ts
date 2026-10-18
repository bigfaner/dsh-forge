// session-binding-guarantee 1.6 口径 4 真机 UI e2e：体验层 wrap 失效注入 → 首条消息仍获
// 绑定（host guard 兜底）——正确性层单点保证，体验降级不损正确性。
//   · 前置态自证：hero chip 在场 + 项目选中（体验层装配正常）；
//   · 注入（宿主 ipcMain 公共 API 换装——1.25 真实故障面配方，不可逆故无先行成功场景）：
//     forge:worktree/session-create 通道恒抛 → client wrap 改道链失败（提案 W3 ④ fail-open
//     官方原流）= wrap 注销/失效的真机替身（W4 测试配方：wrap 失效语义同构——wrap 不可达
//     时官方直建无绑定会话）；
//   · 兜底判读（用户可见行为）：首条消息发送后 host 必绑守卫重路由预铸——
//       ① 主树挂靠会话在场（checks attachedSessions ≥ 1）；
//       ② seal 绑定回读 worktreePath = 项目根 + branch = main；
//       ③ 会话日志落 git 项目 cwd 分组目录。
// 注：host guard 重路由走 host 内部服务调用（不经 ipcMain 通道）——注入不伤兜底链，正是
// 口径 4 的结构前提。
// data 锚：chip = [data-dswt-hero-trigger]；composer = [data-composer-input]；发送钮 =
// role button「发送消息」；落盘证据 = 会话日志 mtime（zstd 不可文本扫，1.29 同口径）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { findFixtureSession } from '../support/session-files.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.7/002-wrap-revoke-guard-fallback'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-7-k4-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t17k4@test', '-c', 'user.name=t17k4', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.7 k4 wrap-revoke fixture\n')
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
          name: 'k4-repo',
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

/** composer 键入（Lexical 配方：contenteditable 收敛门 + insertText + 回显重试） */
async function typeDraft(page: Page, text: string): Promise<void> {
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
    await page.keyboard.insertText(text)
    const echoed = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')
    if (echoed.includes(text)) return
    await page.waitForTimeout(5_000)
  }
}

/**
 * 注入（宿主主进程边界——真实故障面，1.25 同配方）：ipcMain.removeHandler + 重挂恒抛。
 * 重挂不可逆（原 handler 取不回）——注入恒为本测试唯一场景，前置态自证先行。注入自检：
 * 换装后经 renderer 桥直调该通道，必须确实被拒（后续兜底断言才可信）。
 */
async function injectSessionCreateFaultFinal(page: Page, app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    const channel = 'forge:worktree/session-create'
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async () => {
      throw new Error('e2e fault: session-create rpc down (wrap revoke)')
    })
  })
  const blocked = await page.evaluate(async () => {
    const g = globalThis as unknown as { dshForge: { invoke(c: string): Promise<unknown> } }
    try {
      await g.dshForge.invoke('forge:worktree/session-create')
      return false
    } catch {
      return true
    }
  })
  if (!blocked) throw new Error('session-create 故障注入未生效（ipcMain 换装失败）')
}

/** 挂靠会话计数（checks RPC——绑定判定共用源） */
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

/** 发送重试环（1.29 同款）：以会话日志落盘为唯一发送成功证据 */
async function sendUntilLanded(page: Page, userData: string, dirFragment: string, since: number): Promise<string> {
  const composer = page.locator('[data-composer-input]').first()
  const sendButton = page.getByRole('button', { name: '发送消息' })
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await composer.click()
    const enabled = await sendButton.isEnabled().catch(() => false)
    if (enabled) await sendButton.click().catch(() => {})
    else await page.keyboard.press('Enter')
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const hit = findSessionDir(userData, dirFragment, since)
      if (hit !== undefined) return hit
      await page.waitForTimeout(1_000)
    }
  }
  throw new Error(`发送未落盘（dirFragment=${dirFragment}）——发送链路证据缺席`)
}

/** 会话日志落盘定位：{dshHome}/sessions 下 dirFragment 段 cwd 分组目录内 mtime ≥ since 的日志 */
function findSessionDir(userData: string, dirFragment: string, since: number): string | undefined {
  const root = join(userData, 'dsh-home', 'sessions')
  if (!existsSync(root)) return undefined
  let hit: string | undefined
  const visit = (dir: string, depth: number): void => {
    if (hit !== undefined || depth > 6) return
    let rows: string[] = []
    try {
      rows = readdirSync(dir)
    } catch {
      return
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
        visit(full, depth + 1)
        if (hit !== undefined) return
        continue
      }
      if (row.endsWith('.jsonl.zstd') && stat.mtimeMs >= since && dir.replaceAll('\\', '/').toLowerCase().includes(dirFragment)) {
        hit = dir
        return
      }
    }
  }
  visit(root, 0)
  return hit
}

/** 走查截图（失败不静默——打点留痕） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, animations: 'disabled', timeout: 30_000 })
  } catch (cause) {
    console.log(`[k4-snap-miss] ${name}: ${String(cause)}`)
  }
}

test('1.6 口径 4 UI：wrap 失效注入（session-create 通道恒拒）→ 首条消息仍获绑定（host guard 兜底预铸）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-7-k4-ud-'))
  const wsDir = makeGitRepo()
  const app = await launchHost({ userData })
  const consoleLog: string[] = []
  try {
    const { page } = app
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入（前置态：体验层在场）').toBeVisible({ timeout: 30_000 })
    await page.locator('button[aria-label="选择工作区"]').first().click()
    await page.locator('.dswf-hero-picker-list').getByText('k4-repo', { exact: false }).first().click()
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')

    // ── 注入（不可逆——此后全场景在 wrap 失效世界）：session-create 通道恒抛 ──
    await injectSessionCreateFaultFinal(page, app.app)
    console.log('[k4] session-create channel injected (wrap revoke stand-in)')

    // ── hero 直输首条消息：wrap 改道失败 fail-open 官方原流（无绑定 X）→ host guard 重路由 ──
    const MARKER = '1-7-k4-first-message'
    await typeDraft(page, MARKER)
    const sendStart = Date.now() - 5_000
    const dir = await sendUntilLanded(page, userData, 'k4-repo', sendStart)
    console.log('[k4] message landed at', dir)

    // 兜底判读①：host 必绑守卫预铸重路由——主树挂靠会话在场
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), {
        timeout: 90_000,
        message: 'wrap 失效后首条消息应经 host guard 兜底重路由（主树挂靠会话在场）',
      })
      .toBeGreaterThanOrEqual(1)
    // 兜底判读②：seal 绑定回读——worktreePath = 项目根 + branch = main（guard 兜底绑定真相）
    const dshHome = join(userData, 'dsh-home')
    let binding: { worktreePath?: string; branch?: string; sealed?: boolean } | undefined
    await expect
      .poll(async () => {
        const found = findFixtureSession(dshHome, 'k4-repo')
        if (found === undefined) return false
        const bare = found.sessionId.replace(/^session-/, '')
        binding =
          (await sealBinding(page, bare).catch(() => undefined)) ??
          (await sealBinding(page, found.sessionId).catch(() => undefined))
        return binding !== undefined
      }, { timeout: 60_000, message: 'seal 未读到 guard 兜底绑定' })
      .toBe(true)
    console.log('[k4] seal binding =', JSON.stringify(binding))
    expect(binding?.worktreePath?.toLowerCase().replaceAll('\\', '/')).toBe(wsDir.toLowerCase().replaceAll('\\', '/'))
    expect(binding?.branch).toBe('main')
    // 兜底判读③：会话日志落 git 项目 cwd 分组目录（cwd 各就各位）
    expect(dir.toLowerCase().replaceAll('\\', '/'), '会话日志应落 git 项目 cwd 分组目录').toContain('k4-repo')
    await snap(page, 'guard-fallback-bound.png')
  } finally {
    // eslint-disable-next-line no-console -- 判读留痕：runner stdout（Tee 日志）+ 证据目录双落
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
