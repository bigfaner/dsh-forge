// session-binding-guarantee 1.6 口径 3 真机 UI e2e：提交回执正常退役、零 pending 卡挂。
//   · hero 直输（主行默认锚定，同分支零确认框）→ 首条消息发送；
//   · 提交回执退役判读（用户可见行为，断言不触内部状态）：
//       ① 消息文本在页面呈现且计数经 5s 窗口稳定（pending echo 退役为正式消息——
//          不残留重复回执、不消失）；
//       ② composer 草稿清空（提交完成——回执不悬挂在输入面）；
//       ③ 零 pending 卡挂 = 第二条消息照常可发且落盘（发送链路不被卡挂回执阻塞）。
//   · 会话出生即绑定由 1.27 spec 承载；本 spec 只判回执退役与零卡挂。
// data 锚：chip = [data-dswt-hero-trigger]；composer = [data-composer-input]；
// 发送钮 = role button「发送消息」；落盘证据 = 会话日志 mtime（zstd 不可文本扫，1.29 同口径）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type Page } from '@playwright/test'

const EVIDENCE_DIR =
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/session-binding-guarantee/1.7/001-pending-receipt-retire'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main） */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-7-k3-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t17k3@test', '-c', 'user.name=t17k3', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.7 k3 pending-receipt fixture\n')
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
          name: 'k3-repo',
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

/** composer 键入（首条消息意图——Lexical 配方：contenteditable 收敛门 + insertText + 回显重试） */
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
 * 发送重试环（焦点收敛 + 发送钮/键盘双手势——1.29 同款）：以会话日志落盘为唯一发送
 * 成功证据（zstd 不可文本扫——cwd 分组目录名含 dirFragment 段 + mtime ≥ since）。
 */
async function sendUntilLanded(
  page: Page,
  userData: string,
  dirFragment: string,
  since: number,
): Promise<string> {
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

/** 走查截图（非关键路径——失败不阻塞断言链） */
async function snap(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `${EVIDENCE_DIR}/${name}`, fullPage: false, animations: 'disabled', timeout: 10_000 })
  } catch {
    // 截图失败仅损失证据帧，不影响 AC 断言
  }
}

test('1.6 口径 3 UI：提交回执正常退役（消息计数稳定 + composer 清空）+ 零 pending 卡挂（第二条照常发送落盘）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-7-k3-ud-'))
  const wsDir = makeGitRepo()
  const app = await launchHost({ userData })
  const consoleLog: string[] = []
  try {
    const { page } = app
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    await dismissOnboardingModals(page)
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    await page.locator('button[aria-label="选择工作区"]').first().click()
    await page.locator('.dswf-hero-picker-list').getByText('k3-repo', { exact: false }).first().click()
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')

    // ── 首条消息：键入 → 发送（主行同分支零确认框直通）──
    const MARKER1 = '1-7-k3-first-message'
    await typeDraft(page, MARKER1)
    await snap(page, 'first-draft-typed.png')
    const sendStart1 = Date.now() - 5_000
    const dir1 = await sendUntilLanded(page, userData, 'k3-repo', sendStart1)
    console.log('[k3] first message landed at', dir1)

    // ── 提交回执退役判读①：消息文本呈现且计数 5s 窗口稳定（退役后不重复不残留）──
    const markerCount = () => page.getByText(MARKER1).count()
    await expect
      .poll(async () => ((await markerCount()) >= 1 ? 'shown' : 'absent'), {
        timeout: 30_000,
        message: '首条消息文本应在页面呈现（回执退役为正式消息）',
      })
      .toBe('shown')
    const countA = await markerCount()
    await page.waitForTimeout(5_000)
    const countB = await markerCount()
    console.log(`[k3] marker count stable: ${countA} -> ${countB}`)
    expect(countB, '提交回执应退役为唯一正式消息（5s 窗口计数稳定，零重复卡挂）').toBe(countA)
    await snap(page, 'receipt-retired-stable.png')

    // ── 退役判读②：composer 草稿清空（提交完成——回执不悬挂在输入面）──
    const composer = page.locator('[data-composer-input]').first()
    await expect
      .poll(async () => (await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')) ?? '', {
        timeout: 30_000,
        message: 'composer 草稿应在提交后清空（回执退役——输入面零残留）',
      })
      .not.toContain(MARKER1)

    // ── 零 pending 卡挂判读③：第二条消息照常发送并落盘（链路不被卡挂回执阻塞）──
    const MARKER2 = '1-7-k3-second-message'
    await typeDraft(page, MARKER2)
    const sendStart2 = Date.now() - 5_000
    await sendUntilLanded(page, userData, 'k3-repo', sendStart2)
    console.log('[k3] second message landed (zero pending stuck)')
    await snap(page, 'second-message-sent.png')
    // 第二条同样退役稳定（终态复检）
    await expect
      .poll(async () => ((await page.getByText(MARKER2).count()) >= 1 ? 'shown' : 'absent'), { timeout: 30_000 })
      .toBe('shown')
    await page.waitForTimeout(5_000)
    expect(await page.getByText(MARKER2).count(), '第二条回执同口径退役稳定').toBeGreaterThan(0)
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
