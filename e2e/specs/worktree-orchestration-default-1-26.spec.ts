// worktree-branch-management 1.26 真机 UI e2e：hero 选中态升级编排默认——chip 显示哪，
// 首条消息就落哪（所见即所得）。
//   · 默认回填 = 主行（isMain）→ arm 效应跳过（官方原流零变化，attachedSessions = 0）；
//   · 点选 worktree 行（feat-a ≠ main）→ 1.19 风险确认框 → 确认才走预铸编排（cwd = wt-a）；
//   · 编排默认 arm（记忆选中 ≠ 当前会话 cwd）：官方新会话流落回主树后，回填/记忆态自动
//     arm 回选中树（复用既有空白挂靠会话——双路不重复建会话）；
//   · 首条消息在 arm 后的树内空白会话发出 → 会话 cwd = worktree 根。
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
  'C:/Users/panda/AppData/Roaming/dsh-forge/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/worktree-branch-management/1.26/001-orchestration-default'

/** 隔离 git 仓库夹具（真 git CLI——主树检出 main；wt-a 检出 feat-a） */
function makeGitRepo(): { dir: string; wtDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-1-26-orch-repo-'))
  const git = (args: string[], cwd = dir): void => {
    execFileSync('git', ['-c', 'user.email=t126@test', '-c', 'user.name=t126', ...args], { cwd, stdio: 'pipe' })
  }
  git(['init', '-b', 'main'])
  writeFileSync(join(dir, 'README.md'), '1.26 orchestration-default fixture\n')
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
}

/** 在 hero 菜单里点选含指定文案的行（1.19 同配方） */
async function pickMenuRow(page: Page, text: string): Promise<void> {
  await chip(page).first().click()
  await heroMenu(page).getByText(text, { exact: false }).first().click()
}

/** 挂靠会话计数（checks RPC——编排/封存判定共用源） */
async function attachedSessions(page: Page, wsDir: string, path: string): Promise<number> {
  const raw = (await forgeRpc(page, 'forge:worktree/checks', { projectRoot: wsDir, path })) as {
    data?: { attachedSessions?: number }
    attachedSessions?: number
  } | null
  return raw?.data?.attachedSessions ?? raw?.attachedSessions ?? -1
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

test('1.26 UI：hero 选中态编排默认——首条消息按 chip 选中树落 cwd（所见即所得）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-1-26-orch-'))
  const { dir: wsDir, wtDir } = makeGitRepo()
  const app = await launchElectron({
    env: { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData },
  })
  // 渲染进程 console/pageerror 采集（arm 判读留痕——finally 落盘证据目录 + runner stdout）
  const consoleLog: string[] = []
  try {
    const page: Page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await dismissOnboardingModals(page)
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`))
    page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`))
    await registerProject(page, wsDir)
    await expect(chip(page), 'hero worktree chip 未注入').toBeVisible({ timeout: 30_000 })
    // 默认锚定：主树检出 main → chip = 主行（回填态；主行不进 arm——官方原流）
    await expect.poll(async () => (await chip(page).count()) > 0 ? await chip(page).first().textContent() : '', {
      timeout: 30_000,
    }).toContain('main')
    expect(await attachedSessions(page, wsDir, wsDir), '主行回填态零编排（官方原流零破坏）').toBe(0)

    // ── 选中 worktree（跨分支）：1.19 风险确认框 → 确认才走预铸编排（cwd = wt-a）。
    // 确认后采纳可能引发整域重载（cwd 未落选中树前 arm 或再弹确认框）——循环确认至收敛。
    await pickMenuRow(page, 'feat-a')
    await expect(heroRiskDialog(page), '跨分支选中应先弹官方 RiskConfirmation').toBeVisible()
    await snap(page, 'pick-risk-dialog.png')
    await acknowledgeAndConfirm(page)
    await expect(heroRiskDialog(page)).toBeHidden()
    for (let round = 0; round < 4; round += 1) {
      const appeared = await heroRiskDialog(page)
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => true)
        .catch(() => false)
      if (!appeared) break
      await acknowledgeAndConfirm(page)
      await expect(heroRiskDialog(page)).toBeHidden()
    }
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('feat-a')
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: '确认后应产生挂靠会话' })
      .toBe(1)

    // ── 编排默认 arm：官方新会话流落回主树（memory = feat-a ≠ 当前 cwd）→ 自动 arm 回
    // 选中树；复用既有空白挂靠会话（attachedSessions 恒 1——双路不重复建会话）。
    // 注：挂靠会话采纳会引发会话面整域重载（sessionStorage 记忆跨重载存活），确认后
    // 可能再弹一次确认框（cwd 尚未落选中树）——循环确认至收敛（上限 4 轮）。──
    const expandSidebar = page.locator('button[aria-label="打开侧边栏"], button[title="打开侧边栏"]')
    if ((await expandSidebar.count()) > 0) await expandSidebar.first().click()
    await page.locator('[data-dswf-project]').first().hover()
    await page.locator('[data-dswf-project-action="new-session"]').first().click()
    // 官方新会话流落主树 → cwd 离开选中树 → arm 即刻消费（确认框出现本身 = 「当前会话
    // 已不在选中树」的判定证据；chip 呈现由确认后的回填承载，不落中间态断言）
    for (let round = 0; round < 4; round += 1) {
      const appeared = await heroRiskDialog(page)
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => true)
        .catch(() => false)
      if (!appeared) break
      await snap(page, round === 0 ? 'arm-risk-dialog.png' : `arm-risk-dialog-${round}.png`)
      await acknowledgeAndConfirm(page)
      await expect(heroRiskDialog(page)).toBeHidden()
    }
    await expect.poll(async () => (await chip(page).first().textContent()) ?? '', { timeout: 30_000 })
      .toContain('feat-a')
    await expect
      .poll(async () => attachedSessions(page, wsDir, wtDir), { timeout: 30_000, message: 'arm 应复用既有挂靠会话（不重复建）' })
      .toBe(1)

    // ── 首条消息：arm 后当前会话 = 选中树空白会话 → 消息落树内（会话存储按 wt-a cwd 分组） ──
    // 前置：上下文切换后官方恢复可能缺当前会话（inert composer「选择工作区开始」）——经
    // hero 工作区 chip 重选项目（官方 selectWorkspace 链）激活 composer
    const inertPlaceholder = page.getByText('选择工作区开始', { exact: false })
    if ((await inertPlaceholder.count()) > 0) {
      await page.getByRole('button', { name: '选择工作区' }).first().click()
      await page.locator('.dswf-hero-picker-list').getByText('orch-repo', { exact: false }).first().click()
      // 重选项目后 cwd 回主树 → arm 再消费一轮（确认框循环至收敛）
      for (let round = 0; round < 4; round += 1) {
        const appeared = await heroRiskDialog(page)
          .waitFor({ state: 'visible', timeout: 8_000 })
          .then(() => true)
          .catch(() => false)
        if (!appeared) break
        await acknowledgeAndConfirm(page)
        await expect(heroRiskDialog(page)).toBeHidden()
      }
    }
    const MARKER = '1-26-orch-default-first-message'
    // Lexical contenteditable 键入配方（installer-smoke 同径：input binding 收敛门 +
    // insertText + 回显重试收敛——重挂后绑定收敛竞态吃首次键入）
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
      await page.keyboard.insertText(MARKER)
      const echoed = await composer.evaluate((el) => (el as HTMLElement).textContent ?? '')
      if (echoed.includes(MARKER)) break
      await page.waitForTimeout(5_000)
    }
    const sendButton = page.getByRole('button', { name: '发送消息' })
    const enabled = await sendButton.isEnabled().catch(() => false)
    if (!enabled) {
      // 发送钮未收敛 = 走键盘提交（Lexical 绑定收敛后的等价提交手势）
      await page.keyboard.press('Enter')
    } else {
      await sendButton.click()
    }
    // 转录呈现 = 发送链路证据；落盘目录 = cwd 分组证据
    await expect
      .poll(async () => (await page.locator('[data-conversation-content]').first().textContent().catch(() => '')) ?? '', {
        timeout: 60_000,
        message: '首条消息应呈现于当前会话转录',
      })
      .toContain(MARKER)
    await expect
      .poll(async () => findSessionDirByMarker(userData, MARKER) ?? '', {
        timeout: 60_000,
        message: '首条消息应落会话日志',
      })
      .not.toBe('')
    const sessionDir = findSessionDirByMarker(userData, MARKER)
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
