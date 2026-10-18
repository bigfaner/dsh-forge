// bug 复现旅程（用户报障 2026-10-18）：新建项目 → hero 切换项目 → 发送消息 →
// UI toast「Cannot read properties of undefined (reading 'throwIfAborted') (gateway/internal)」。
// 复现旅程（对照：项目行 + 钮新会话径正常）：
//   ① 注册 git 项目 A + B → 选中工作区 A（chip 挂载前置）；
//   ② 侧栏顶部「新会话」→ hero 弹层 → 点选项目 B 行（切换项目）；
//   ③ composer 键入首条消息 → 发送；
//   ④ 判读：消息落盘 B 工作区 + renderer 控制台零 throwIfAborted。
// data 锚沿用 1-27/k3：chip = [data-dswt-hero-trigger]；弹层 = .dswf-hero-picker-list；
// composer = [data-composer-input]；发送钮 = role button「发送消息」。
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { realCredentials, seedDshHome, writeDogfoodOverlay } from '../support/dogfood.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/bug-hero-switch-send'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；Z: 盘变体对齐用户现场盘符） */
function makeGitRepo(tag: string): string {
  const base = process.env.BUGREP_Z_DRIVE === '1' && existsSync('Z:/tmp-forge-tmp')
    ? 'Z:/tmp-forge-tmp'
    : tmpdir()
  const dir = mkdtempSync(join(base, `dsh-forge-bugrep-${tag}-`))
  const opts: ExecFileSyncOptions = { cwd: dir, stdio: 'pipe' }
  const git = (args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=bugrep@test', '-c', 'user.name=bugrep', ...args], opts)
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), `bug-repro fixture ${tag}\n`)
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  return dir
}

/** 非 git 项目夹具（纯目录 + .forge/.knowledge——annotutor 形态对照面） */
function makePlainDir(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-forge-bugrep-${tag}-`))
  writeFileSync(join(dir, 'README.md'), `bug-repro plain fixture ${tag}\n`)
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
async function registerProject(page: Page, wsDir: string, name: string): Promise<void> {
  await expect
    .poll(async () => {
      try {
        const raw = (await forgeRpc(page, 'forge:projects/register', {
          workspaceDir: wsDir,
          name,
          forgeDir: join(wsDir, '.forge'),
          knowledgeDir: join(wsDir, '.knowledge'),
        })) as { ok?: boolean; data?: { projectId?: string }; projectId?: string } | null
        const projectId = raw?.data?.projectId ?? raw?.projectId
        return typeof projectId === 'string'
      } catch {
        return false
      }
    }, { timeout: 60_000, message: `项目注册未就绪（${name}）` })
    .toBe(true)
}

const chip = (page: Page) => page.locator('[data-dswt-hero-trigger]')

/** composer 键入（Lexical 配方——contenteditable 收敛门 + insertText + 回显重试） */
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
  visit(root)
  return hit
}

async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧
  }
}

test('bug 复现：hero 切换项目后首条消息发送（throwIfAborted 在场判读）', async () => {
  test.setTimeout(300_000)
  // 真实发送条件（崩溃点疑似在凭据依赖的 assistant 流打开——隔离环境零凭据不可达）：
  // dogfood 口径播种真实凭据 + 低成本模型叠层；凭据缺席 = 留痕 skip（不伪造）
  const credentials = realCredentials()
  test.skip(credentials === undefined, '复现前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-bugrep-ud-'))
  seedDshHome(join(userData, 'dsh-home'), credentials as string)
  const overlay = writeDogfoodOverlay()
  const wsA = makeGitRepo('a')
  // 用户现场 = annotutor 非 git 注册项目 × 真实凭据——非 git B 对齐（BUGREP_PLAIN_B=1）
  const wsB = process.env.BUGREP_PLAIN_B === '1' ? makePlainDir('b') : makeGitRepo('b')
  const app = await launchHost({ userData, overlay })
  const consoleLog: string[] = []
  try {
    const { page } = app
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`))
    await dismissOnboardingModals(page)
    await registerProject(page, wsA, 'bugrep-a')
    await registerProject(page, wsB, 'bugrep-b')

    // ① 选中工作区 A（chip 挂载前置）→ + 径建 A 活跃会话（对齐用户现场：A 有会话再开 hero）
    await page.locator('button[aria-label="选择工作区"]').first().click()
    await page.locator('.dswf-hero-picker-list').getByText('bugrep-a', { exact: false }).first().click()
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    await page
      .locator('.dswf-sidebar-project-row', { hasText: 'bugrep-a' })
      .first()
      .hover()
    await page.locator('[data-dswf-project-action="new-session"]').first().click()
    await snap(page, '01a-session-in-a.png')

    // ② 侧栏顶部「新会话」→ 新会话引导态（hero 草稿相位）→ 切换前先键入草稿（跨切换携带）
    await page.getByRole('button', { name: /新会话|新建会话/ }).first().click({ timeout: 30_000 })
    await expect(chip(page), '引导态 chip 在场').toBeVisible({ timeout: 30_000 })
    const MARKER = 'bug-repro-hero-switch-send'
    await typeDraft(page, MARKER)
    await snap(page, '02-hero-draft-typed.png')
    await page.locator('button[aria-label="选择工作区"]').first().click()
    await expect(page.locator('.dswf-hero-picker-list'), 'chip 弹层应打开').toBeVisible({ timeout: 15_000 })
    await page.locator('.dswf-hero-picker-list').getByText('bugrep-b', { exact: false }).first().click()
    await expect(page.locator('.dswf-hero-picker-list')).toHaveCount(0, { timeout: 15_000 })
    // 非 git B：worktree chip 按能力位条件渲染——缺席即为零注入形态（不判败，仅留痕）
    const chipCount = await chip(page).count()
    console.log('[bugrepro] chip count after switch =', chipCount)
    await snap(page, '03-switched-to-b.png')

    // ③ 发送（草稿已在——若切换清空则重键入）
    await typeDraft(page, MARKER)
    const sendStart = Date.now() - 5_000
    const composer = page.locator('[data-composer-input]').first()
    const sendButton = page.getByRole('button', { name: '发送消息' })
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await composer.click()
      const enabled = await sendButton.isEnabled().catch(() => false)
      if (enabled) await sendButton.click().catch(() => {})
      else await page.keyboard.press('Enter')
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        if (findSessionDir(userData, 'bugrep-b', sendStart) !== undefined) break
        await page.waitForTimeout(1_000)
      }
      if (findSessionDir(userData, 'bugrep-b', sendStart) !== undefined) break
    }
    await snap(page, '04-after-send.png')

    // ④ 判读：消息落盘 B + 控制台零 throwIfAborted（复现判读双落盘）
    const landed = findSessionDir(userData, 'bugrep-b', sendStart)
    const abortedHit = consoleLog.filter((l) => l.includes('throwIfAborted'))
    try {
      writeFileSync(join(EVIDENCE_DIR, 'renderer-console.log'), consoleLog.join('\n'), 'utf8')
    } catch {
      // 留痕失败不影响判读
    }
    console.log('[bugrepro] landed =', landed ?? '<none>')
    console.log('[bugrepro] throwIfAborted hits =', abortedHit.length)
    if (abortedHit.length > 0) console.log('[bugrepro] hits:\n' + abortedHit.join('\n'))
    expect(abortedHit, 'renderer 控制台不应出现 throwIfAborted 崩溃').toEqual([])
    expect(landed, '首条消息应落 B 工作区（发送链路存活）').toBeDefined()
  } finally {
    console.log('[renderer-console]\n' + consoleLog.join('\n'))
    try {
      writeFileSync(join(EVIDENCE_DIR, 'renderer-console.log'), consoleLog.join('\n'), 'utf8')
    } catch {
      // 留痕失败不影响清理
    }
    await closeApp(app.app)
    rmSync(userData, { recursive: true, force: true })
    rmSync(wsA, { recursive: true, force: true })
    rmSync(wsB, { recursive: true, force: true })
  }
})
