// @web-e2e @probe
// 过程件（不进 git——worker-lean-execution/fix-8 case4 取证）：installer composer 回显
// 空定性探针——复刻冒烟后半链（NSIS 安装 → 启动 → 注册 → 芯片流 → 会话面），在键入前后
// 采样 composer 状态（数量/可编辑/焦点/内容/元素身份存续），定位「insertText 零回显」归属
// （焦点未落 / 元素重挂 / 锁定态 / 事件通道）。零产品源码改动。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { closeApp } from '../../support/launch.js'
import { launchHost } from '../../support/launch.js'
import { forgeInvoke } from '../../support/rpc.js'
import { COMPOSER_INPUT, CONVERSATION_CONTENT, CONVERSATION_HEADER, MAIN_CONVERSATION, WORKBENCH } from '../../support/anchors.js'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..')
const INSTALLER_DIR = join(ROOT, 'release', 'installer')
const ASSEMBLE_SCRIPT = join(ROOT, 'scripts', 'assemble-installer-resources.mjs')
const SMOKE_ROOT = join(`${ROOT.split('\\')[0]}\\`, 'dsh-forge-smoke')
const WALKTHROUGH = join('.forge', 'docs', 'proposals', 'worker-lean-execution', 'walkthrough')

const installState: { exe?: string; installDir?: string; tmp?: string } = {}

test.beforeAll(async () => {
  test.setTimeout(900_000)
  const installerExe = existsSync(INSTALLER_DIR)
    ? readdirSync(INSTALLER_DIR).find((f) => /^dsh-forge-.+-win-x64\.exe$/.test(f))
    : undefined
  test.skip(installerExe === undefined, 'NSIS 安装包未构建——留痕 skip')
  const base = join(SMOKE_ROOT, `probe-composer-${process.pid}-${Math.random().toString(36).slice(2, 8)}`)
  const installDir = join(base, 'app')
  const zTmp = join(base, 'tmp')
  mkdirSync(zTmp, { recursive: true })
  const install = spawnSync(join(INSTALLER_DIR, installerExe as string), ['/S', `/D=${installDir}`], {
    timeout: 600_000,
    env: { ...process.env, TEMP: zTmp, TMP: zTmp },
  })
  expect(install.status, 'NSIS 静默安装退出码 0').toBe(0)
  await expect
    .poll(() => existsSync(join(installDir, 'resources', 'staging-manifest.json')), { timeout: 480_000, intervals: [3_000] })
    .toBe(true)
  const check = spawnSync('node', [ASSEMBLE_SCRIPT, '--check', join(installDir, 'resources')], {
    cwd: ROOT, encoding: 'utf8', timeout: 60_000,
  })
  expect(check.status, 'resources --check OK').toBe(0)
  installState.exe = join(installDir, 'dsh-forge.exe')
  installState.installDir = installDir
  installState.tmp = zTmp
})

test.afterAll(async () => {
  const installDir = installState.installDir
  const zTmp = installState.tmp
  if (installDir === undefined) return
  const uninstaller = existsSync(installDir)
    ? readdirSync(installDir).find((f) => f.startsWith('Uninstall') && f.endsWith('.exe'))
    : undefined
  if (uninstaller !== undefined) {
    spawnSync(join(installDir, uninstaller), ['/S'], { timeout: 120_000, env: { ...process.env, TEMP: zTmp, TMP: zTmp } })
    const deadline = Date.now() + 240_000
    while (existsSync(installDir) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 3_000))
  }
  rmSync(join(installDir, '..'), { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
})

test('@web-e2e @probe installer composer 回显定性探针', async () => {
  test.setTimeout(900_000)
  const exe = installState.exe as string
  const tmp = installState.tmp as string
  const userData = mkdtempSync(join(SMOKE_ROOT, 'probe-composer-ud-'))
  let app: Awaited<ReturnType<typeof launchHost>>['app'] | undefined
  const result: Record<string, unknown> = { at: new Date().toISOString(), samples: [] }
  try {
    const launched = await launchHost({
      userData,
      executablePath: exe,
      devProfile: false,
      // 取证截图（page.screenshot）需真实绘制面——显式逃逸回可见窗（隐藏窗口无合成帧，
      // 截图挂起；opts.env 覆盖 launch 层缺省注入的 WINDOW_HIDDEN=1）
      env: { TEMP: tmp, TMP: tmp, DSH_FORGE_WINDOW_HIDDEN: '0' },
      timeouts: { firstWindow: 120_000, bootReady: 120_000, loaderLive: 120_000, workbenchVisible: 60_000 },
    })
    app = launched.app
    const page = launched.page
    const projDir = join(userData, '..', 'probe-composer-fixture')
    mkdirSync(projDir, { recursive: true })
    const registered = await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
      workspaceDir: projDir, name: 'probe-composer', forgeDir: join(projDir, '.forge'), knowledgeDir: join(projDir, '.knowledge'),
    })
    expect(registered.projectId).toBeTruthy()
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 60_000 })
    await expect(page.locator(MAIN_CONVERSATION).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(CONVERSATION_HEADER).first()).toBeAttached()
    const composer = page.locator(COMPOSER_INPUT).last()
    await expect(composer).toBeVisible({ timeout: 30_000 })
    const chip = page.locator('button', { hasText: /^默认工作区$|^选择工作区$/ }).first()
    await expect(chip).toBeVisible({ timeout: 30_000 })
    const menu = page.locator('[role="menu"]').first()
    const wsItem = menu
      .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
      .filter({ hasText: 'probe-composer' })
      .first()
    let listed = false
    for (let i = 0; i < 9 && !listed; i++) {
      await chip.click()
      await expect(menu).toBeVisible({ timeout: 15_000 })
      listed = await wsItem.isVisible().catch(() => false)
      if (!listed) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(4_000)
      }
    }
    expect(listed, '注册工作区在列').toBe(true)
    await wsItem.click()
    await expect(page.locator(CONVERSATION_CONTENT).first()).toBeAttached({ timeout: 30_000 })
    await page
      .waitForFunction(() => {
        const els = document.querySelectorAll<HTMLElement>('[data-composer-input]')
        return els.length > 0 && [...els].every((el) => el.isContentEditable)
      }, undefined, { timeout: 30_000 })
      .catch(() => undefined)

    const sample = async (label: string): Promise<void> => {
      const s = await page.evaluate(() => {
        const els = [...document.querySelectorAll<HTMLElement>('[data-composer-input]')]
        return els.map((el, i) => ({
          i,
          contentEditable: el.isContentEditable,
          active: document.activeElement === el,
          text: (el.textContent ?? '').slice(0, 80),
          htmlLen: el.innerHTML.length,
          tag: el.tagName,
          cls: el.className.slice(0, 120),
          ariaDisabled: el.getAttribute('aria-disabled'),
          rect: (() => { const r = el.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}` })(),
        }))
      })
      ;(result.samples as unknown[]).push({ label, at: Date.now() - (result.t0 as number), composers: s })
    }
    ;(result as { t0?: number }).t0 = Date.now()
    await sample('after-guard')
    // 元素身份存续标记
    await composer.evaluate((el) => ((el as HTMLElement).dataset.probeMark = 'mark1'))
    await composer.click()
    await sample('after-click')
    const activeDesc = await page.evaluate(() => {
      const a = document.activeElement
      return a ? `${a.tagName}${a.hasAttribute('data-composer-input') ? '[composer]' : ''}.${(a.className || '').toString().slice(0, 60)}` : 'none'
    })
    ;(result as { activeAfterClick?: string }).activeAfterClick = activeDesc
    await page.keyboard.insertText('回显探针')
    await sample('after-insertText')
    await page.waitForTimeout(1_500)
    await sample('after-1.5s')
    // 备选径：keyboard.type
    await page.keyboard.type('typed-text')
    await sample('after-type')
    const markSurvives = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-composer-input][data-probe-mark="mark1"]')
      return el !== null
    })
    ;(result as { markSurvives?: boolean }).markSurvives = markSurvives
    await page.screenshot({ path: join(WALKTHROUGH, 'probe-composer.png') })
    result.verdict = 'DONE'
  } catch (error) {
    result.verdict = 'FAIL'
    result.error = String(error instanceof Error ? error.message : error)
    throw error
  } finally {
    writeFileSync(join(WALKTHROUGH, 'probe-composer-result.json'), JSON.stringify(result, null, 2), 'utf8')
    if (app !== undefined) await closeApp(app)
    rmSync(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 })
  }
})
