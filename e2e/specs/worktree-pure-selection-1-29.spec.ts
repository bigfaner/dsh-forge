// worktree-branch-management 1.29 真机 UI e2e：点选 worktree 去编排化——只改选中态，
// 会话创建唯一时机 = 首条消息。
//   · 挂载/默认锚定回填：零会话副作用（attachedSessions = 0）；
//   · 点选 worktree 行（feat-a ≠ main）：纯选中态——chip 回填 + 零确认框 + 零新会话
//     （sessions 目录零新 jsonl——1.14「点选即建会话」即时编排语义废除）；
//   · 首条消息意图（composer 草稿非空）→ 1.19 跨分支确认框（时机随编排后移）→ 确认才
//     预铸编排（cwd = wt-a）→ 草稿搬运到产物会话（确认前消息不发出）；
//   · 发送 → 首条消息落选中树（会话日志落 wt-a cwd 分组目录）。
// data 锚：chip = [data-dswt-hero-trigger]；菜单 = .dswt-hero-menu；新会话钮 =
// [data-dswf-project-action="new-session"]；composer = [data-composer-input]。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchElectron } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.29/001-pure-selection'

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

/** 风险框交互：勾选知悉 → 确认继续（1.19 同款） */
async function acknowledgeAndConfirm(page: Page): Promise<void> {
  const dialog = heroRiskDialog(page)
  const box = dialog.locator('input[type="checkbox"]')
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

/** sessions 目录 jsonl 总数（点选零会话副作用的落盘面证据） */
function countSessionJsonl(userData: string): number {
  let count = 0
  const visit = (dir: string, depth: number): void => {
    if (depth > 8) return
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
      if (stat.isDirectory()) visit(full, depth + 1)
      else if (row.endsWith('.jsonl')) count += 1
    }
  }
  for (const root of [join(userData, 'dsh-home'), userData]) {
    if (existsSync(root)) visit(root, 0)
  }
  return count
}

/** 走查截图（非关键路径——失败不阻塞断言链） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧，不影响 AC 断言
  }
}

/**
 * 首条消息落盘取证：在 userData 下找含 marker 文本的会话日志文件，返回其所在存储目录
 * （官方按会话 cwd 分组——目录名含 worktree 名即 cwd 语义面证据）。
 */
function findSessionDirByMarker(userData: string, marker: string): string | undefined {
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
      if (!row.endsWith('.jsonl')) continue
      try {
        if (readFileSync(full, 'utf8').includes(marker)) return dir
      } catch {
        continue
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

test('1.29 UI：点选纯选中态零会话副作用——首条消息按选中树落 cwd（唯一时机）', async () => {
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
    // 默认锚定：主树检出 main → chip = 主行（回填态）；1.29 零会话副作用——挂载/回填不建会话
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')
    await expect
      .poll(async () => attachedSessions(page, wsDir, wsDir), {
        timeout: 30_000,
        message: '挂载/默认锚定回填不应产生主树挂靠会话（1.29 会话创建唯一时机 = 首条消息）',
      })
      .toBe(0)
    const baselineJsonl = countSessionJsonl(userData)

    // ── 点选 worktree（跨分支 feat-a）：纯选中态——零确认框、chip 回填、零新会话 ──
    await chip(page).first().click()
    await heroMenu(page).getByText('feat-a', { exact: false }).first().click()
    await expect(heroRiskDialog(page), '点选不应弹跨分支确认框（1.19 时机随编排后移至首条消息）')
      .not.toBeVisible({ timeout: 8_000 })
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('feat-a')
    await page.waitForTimeout(2_000)
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: '点选不应产生 wt-a 挂靠会话' })
      .toBe(0)
    expect(countSessionJsonl(userData), '点选后 sessions 目录零新 jsonl（纯选中态）').toBe(baselineJsonl)
    await snap(page, 'pure-selection-no-session.png')

    // ── 首条消息意图（键入）：1.19 确认框在首条消息时点出现 → 确认 → 预铸编排 ──
    // 前置：composer 键入配方（1.26 同径：contenteditable 收敛门 + insertText + 回显重试）
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
    const MARKER = '1-29-pure-selection-first-message'
    const composer = page.locator('[data-composer-input]').first()
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await composer.click()
      await page.keyboard.insertText(MARKER)
      const echoed = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')
      if (echoed.includes(MARKER)) break
      await page.waitForTimeout(5_000)
    }
    // 确认框出现本身 = 首条消息时点消费的证据；确认前消息不发出（草稿留在 composer）
    await expect(heroRiskDialog(page), '首条消息意图应触发跨分支确认框（时机后移）').toBeVisible({ timeout: 30_000 })
    await snap(page, 'first-message-intent-risk-dialog.png')
    await acknowledgeAndConfirm(page)
    // arm 收敛：选中树挂靠会话唯一（预铸编排产物——非复用即新建一次，之后零重复）
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 60_000, message: '确认后应产生 wt-a 挂靠会话（首条消息时点编排）' })
      .toBe(1)
    // 草稿搬运：已键入首条消息出现在 arm 后的产物会话 composer（确认前不发出、不丢失）
    await expect
      .poll(async () => (await composer.evaluate((el) => (el as HTMLElement).textContent ?? '').catch(() => '')) ?? '', {
        timeout: 30_000,
        message: '草稿应搬运到 arm 产物会话（首条消息不丢）',
      })
      .toContain(MARKER)
    await snap(page, 'armed-draft-carried.png')

    // ── 发送：首条消息落选中树（会话存储按 wt-a cwd 分组）──
    const inertPlaceholder = page.getByText('选择工作区开始', { exact: false })
    if ((await inertPlaceholder.count()) > 0) {
      await page.getByRole('button', { name: '选择工作区' }).first().click()
      await page.locator('.dswf-hero-picker-list').getByText('orch-repo', { exact: false }).first().click()
    }
    // 发送重试环（焦点收敛 + 发送钮/键盘双手势——Lexical 绑定收敛竞态吃首次手势，
    // 1.26 同症状判例）：以会话日志落盘为唯一发送成功证据
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
        if (findSessionDirByMarker(userData, MARKER) !== undefined) {
          landed = true
          break
        }
        await page.waitForTimeout(1_000)
      }
      if (landed) break
    }
    const sessionDir = findSessionDirByMarker(userData, MARKER)
    expect(sessionDir, '首条消息应落会话日志（落盘 = 发送成功证据）').toBeDefined()
    expect(sessionDir, '会话存储目录应按选中 worktree cwd 分组（cwd = wt-a 根）').toContain('wt-a')
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
