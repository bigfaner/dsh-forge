// worktree-branch-management 1.28 真机 e2e：每树一工作区 + attachSession——树内会话获得
// 官方工作区归属（composer 门控/模式/侧栏可见性的官方单源）。
// 语义（binding-derivation 绑定推导制）：会话创建 = 官方 session.create({workspaceId})
// 直通（hero chip 选中树即双发锚，发送首条消息时官方 reuseOrCreateBlank 落树）——
//   · 点选跨分支行 → 点选时点确认框 → 确认后选中态切行（1.28 选中语义）；
//   · 发送首条消息（cwd = wt-a）→ 官方 workspace 快照（renderer domain/changed
//     推送投影）出现「树路径工作区节点」，其 sessionIds 名单非空；
//   · 首条消息落 wt-a cwd 分组目录（cwd 即绑定）。
// data 锚：chip = [data-dswt-hero-trigger]；菜单 = .dswt-hero-menu；composer = [data-composer-input]。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.8/004-workspace-membership'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；wt-a 检出 feat-a） */
function makeGitRepo(): { dir: string; wtDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-28-wsmembership-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t128@test', '-c', 'user.name=t128', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.28 workspace-membership fixture\n')
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

/** 风险框交互：勾选知悉 → 确认继续（1.19 同款） */
async function acknowledgeAndConfirm(page: Page): Promise<void> {
  const dialog = heroRiskDialog(page)
  const box = dialog.locator('input[type="checkbox"]').first()
  await expect(box).toBeVisible()
  await box.check()
  await dialog.getByRole('button', { name: '确认继续' }).click()
  await expect(heroRiskDialog(page)).toBeHidden()
}

/**
 * 官方 workspace 投影取证（probe-ws5 同配方——renderer 侧 getSnapshot(items: path+sessionIds)）：
 * 返回所有 sessionIds 非空的工作区行 + wt-a 树工作区行的 sessionIds 名单。
 */
async function workspaceSnapshot(page: Page, wtDirNorm: string): Promise<{
  owned: Array<{ path: string; sessionIds: string[] }>
  target: { path: string; sessionIds: string[] } | null
}> {
  return page.evaluate((wtDirNorm) => {
    const norm = (p: string): string => String(p).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
    const seen = new Set<object>()
    let found: Array<{ path: string; sessionIds: string[] }> | null = null
    const visit = (obj: unknown, depth: number): void => {
      if (found !== null || obj === null || typeof obj !== 'object' || depth > 6 || seen.has(obj)) return
      seen.add(obj)
      try {
        const candidate = obj as { getSnapshot?: () => unknown }
        if (typeof candidate.getSnapshot === 'function') {
          const snap = candidate.getSnapshot() as { items?: unknown } | null
          if (snap !== null && Array.isArray(snap.items) && snap.items.some((it) => {
            const row = it as { sessionIds?: unknown; path?: unknown }
            return row !== null && typeof row === 'object' && row.sessionIds !== undefined && row.path !== undefined
          })) {
            found = (snap.items as Array<{ path: string; sessionIds?: readonly string[] }>).map((it) => ({
              path: String(it.path),
              sessionIds: [...(it.sessionIds ?? [])].map(String),
            }))
            return
          }
        }
      } catch { /* on */ }
      for (const key of Object.keys(obj as object)) {
        let v: unknown
        try { v = (obj as Record<string, unknown>)[key] } catch { continue }
        if (v !== null && typeof v === 'object') visit(v, depth + 1)
        if (found !== null) return
      }
    }
    const walkFiber = (el: Element | null, depth: number): void => {
      if (el === null || depth > 80 || found !== null) return
      const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
      if (fiberKey !== undefined) {
        let f: unknown = (el as unknown as Record<string, unknown>)[fiberKey]
        for (let i = 0; i < 60 && f !== null; i++) {
          const props = (f as { memoizedProps?: unknown }).memoizedProps
          if (props !== null && typeof props === 'object') {
            visit(props, 0)
            if (found !== null) return
          }
          f = (f as { return?: unknown }).return
        }
        return
      }
      for (const child of el.children ?? []) walkFiber(child, depth + 1)
    }
    walkFiber(document.body, 0)
    const rows = found ?? []
    const target = rows.find((row) => norm(row.path) === norm(wtDirNorm)) ?? null
    return { owned: rows.filter((row) => row.sessionIds.length > 0), target }
  }, wtDirNorm)
}

/** 走查截图（非关键路径——失败不阻塞断言链） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧，不影响 AC 断言
  }
}

/** 首条消息落盘取证：官方会话存储按 cwd 分组（目录名 = cwd 路径编码，日志 zstd 压缩——
 *  内容不可文本扫）——找「含 wt-a 的 cwd 分组目录」下新产会话日志即为落树内证据。 */
function findWorktreeSessionDir(userData: string): string | undefined {
  const root = join(userData, 'dsh-home', 'sessions')
  if (!existsSync(root)) return undefined
  let hit: string | undefined
  const visit = (dir: string, depth: number): void => {
    if (hit !== undefined || depth > 6) return
    for (const row of readdirSync(dir)) {
      const full = join(dir, row)
      let stat
      try { stat = statSync(full) } catch { continue }
      if (stat.isDirectory()) visit(full, depth + 1)
      else if (row.endsWith('.jsonl.zstd') && dir.replaceAll('\\', '/').toLowerCase().includes('wt-a')) {
        hit = dir
        return
      }
    }
  }
  visit(root, 0)
  return hit
}

test('1.28 UI：点选确认切行 + 树内会话挂工作区（sessionIds 名单可见）+ 首条消息落树内', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-28-wsmembership-'))
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
    // 前置：选中项目工作区（hero chip 挂载前置）
    await page.locator('button[aria-label="选择工作区"]').first().click()
    await page.locator('.dswf-hero-picker-list').getByText('orch-repo', { exact: false }).first().click()

    // ── 选中语义（设计 A）：点选 feat-a → 点选时点确认框 → 确认后选中态切行 ──
    await chip(page).first().click()
    await heroMenu(page).getByText('feat-a', { exact: false }).first().click()
    await expect(heroRiskDialog(page), '点选跨分支行应立现确认框（点选时点）').toBeVisible({ timeout: 8_000 })
    await snap(page, 'pick-time-risk-dialog.png')
    await acknowledgeAndConfirm(page)
    await expect
      .poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000, message: '确认后选中态应切目标行（1.28 语义）' })
      .toContain('feat-a')

    // ── 发送首条消息（官方 session.create({workspaceId}) 直通——cwd = wt-a 落树）──
    const MARKER = '1-28-workspace-membership-first-message'
    const composer = page.locator('[data-composer-input]').first()
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await composer.click()
      await page.keyboard.insertText(MARKER)
      const echoed = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')
      if (echoed.includes(MARKER)) break
      await page.waitForTimeout(5_000)
    }
    const sendButton = page.getByRole('button', { name: '发送消息' })
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await composer.click()
      if (await sendButton.isEnabled().catch(() => false)) {
        await sendButton.click().catch(() => {})
      } else {
        await page.keyboard.press('Enter')
      }
      const deadline = Date.now() + 20_000
      let landed = false
      while (Date.now() < deadline) {
        if (findWorktreeSessionDir(userData) !== undefined) {
          landed = true
          break
        }
        await page.waitForTimeout(1_000)
      }
      if (landed) break
    }
    const sessionDir = findWorktreeSessionDir(userData)
    if (sessionDir === undefined) {
      await snap(page, 'send-failed-state.png')
      const leftover = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '').catch(() => '<gone>')
      console.log(`[send-debug] composer 残留文本：${JSON.stringify(leftover)}`)
    }
    expect(sessionDir, '首条消息应落会话日志（composer 可发证据）').toBeDefined()
    expect(sessionDir, '会话存储目录应按选中 worktree cwd 分组（cwd = wt-a 根）').toContain('wt-a')

    // ── AC 主断言：官方 workspace 投影出现 wt-a 树工作区节点，sessionIds 名单非空 ──
    await expect
      .poll(async () => {
        const snapshot = await workspaceSnapshot(page, wtDir)
        return (snapshot.target?.sessionIds.length ?? 0) > 0
      }, { timeout: 60_000, message: 'wt-a 树工作区节点 sessionIds 名单应非空（官方 attachSession 挂账）' })
      .toBe(true)
    const membership = await workspaceSnapshot(page, wtDir)
    await snap(page, 'membership-visible.png')
    try {
      writeFileSync(
        join(EVIDENCE_DIR, 'workspace-membership.json'),
        JSON.stringify({ target: membership.target, owned: membership.owned }, null, 1),
        'utf8',
      )
    } catch {
      // 留痕失败不影响断言
    }
  } finally {
    console.log('[renderer-console]\n' + consoleLog.join('\n'))
    try {
      writeFileSync(join(EVIDENCE_DIR, 'renderer-console.log'), consoleLog.join('\n'), 'utf8')
    } catch {
      // 留痕失败不影响清理
    }
    await closeApp(app)
    // userData 留盘取证（MISSING_CREDENTIAL 隔离环境无 LLM 键——用户消息落盘面离线核查；
    // 路径回写证据目录供审计）
    try {
      writeFileSync(join(EVIDENCE_DIR, 'user-data-path.txt'), userData, 'utf8')
    } catch {
      // 留痕失败不影响清理
    }
    rmSync(wsDir, { recursive: true, force: true })
  }
})
