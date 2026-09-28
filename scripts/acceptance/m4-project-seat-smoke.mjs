#!/usr/bin/env node
// 真链路冒烟(M4 任务 1.6 P1 集成面): 真壳 + 真 vendored host + 真 web dist,
// 但 userData 走 DSH_FORGE_USER_DATA 隔离临时目录(单实例锁与用户真实
// workbench.db 均不受扰)。逐腿断言:
//   1. 座位注入渲染 —— sidebar.workspaces 座位 = forge 项目树
//      ([data-dsh-forge-project-seat]);panellist「项目」行存在且为首项。
//   2. 空态引导可达 —— 隔离注册表为空 → [data-dsh-forge-project-empty]
//      引导卡 + 同一 C7 确认卡([data-dsh-forge-confirm-code])。
//   3. 创建成功原位生效 —— 注册临时项目 → 树出现项目行 + 活跃指针切换。
//   4. 切换指针写入 —— 点击另一项目行 → activateProject 写指针
//      (树行 aria-current 迁移)。
// 全程采集 console/pageerror;任一腿失败退出码 1。
// 用法(在 apps/desktop 下运行):
//   node ../../scripts/acceptance/m4-project-seat-smoke.mjs
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron } from '@playwright/test'

const repoRoot = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const mainPath = `${repoRoot}/apps/desktop/dist/main.cjs`

const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-m4-smoke-'))
const projectOne = join(userData, 'proj-alpha')
const projectTwo = join(userData, 'proj-beta')
mkdirSync(projectOne)
mkdirSync(projectTwo)

const results = []
let failed = false
const noise = []
let currentStep = 'boot'
const collectNoise = () => { const n = [...noise]; noise.length = 0; return n }

async function step(name, fn) {
  currentStep = name
  const started = Date.now()
  try {
    await fn()
    const n = collectNoise()
    results.push({ step: name, status: n.length === 0 ? 'PASS' : 'PASS(warn)', ms: Date.now() - started, noise: n })
    console.log(`PASS ${name} (${Date.now() - started}ms)${n.length === 0 ? '' : ` — ${n.length} 条渲染侧告警`}`)
  } catch (error) {
    failed = true
    const n = collectNoise()
    results.push({ step: name, status: 'FAIL', ms: Date.now() - started, error: String(error).slice(0, 400), noise: n })
    console.log(`FAIL ${name} (${Date.now() - started}ms): ${String(error).slice(0, 400)}`)
  }
}

const app = await _electron.launch({
  args: [mainPath],
  env: { ...process.env, DSH_FORGE_USER_DATA: userData },
})
let page
try {
  // 主进程侧诊断:host-supervisor/shellLog 走 stdout。
  const mainProcess = app.process()
  if (mainProcess !== undefined) {
    mainProcess.stdout?.on('data', chunk => console.log(`[main] ${String(chunk).trim()}`))
    mainProcess.stderr?.on('data', chunk => console.log(`[main:err] ${String(chunk).trim()}`))
  }
  page = await app.firstWindow()
  const allConsole = []
  page.on('console', (msg) => {
    const text = msg.text()
    allConsole.push(`${msg.type()}: ${text.slice(0, 400)}`)
    if (text.startsWith('Download the React DevTools')) return
    if (text.includes('Electron Security Warning')) return
    if (msg.type() === 'error' || msg.type() === 'warning') noise.push(`${msg.type()}: ${text.slice(0, 300)}`)
  })
  page.on('pageerror', error => { noise.push(`pageerror: ${String(error).slice(0, 300)}`); failed = true })

  try {
    await page.waitForURL(url => url.href.startsWith('dsh-app://app/'), { timeout: 30_000 })
    await page.getByRole('button', { name: '新建会话' })
      .or(page.getByRole('button', { name: 'New Session' }))
      .first().waitFor({ state: 'visible', timeout: 60_000 })
  } catch (error) {
    // 诊断腿:boot 未达 ready —— 落截图 + console 全量 + body 摘要后重抛。
    try {
      await page.screenshot({ path: join(userData, 'boot-failure.png'), timeout: 5_000 }).catch(() => {})
      console.log('BOOT FAILURE diagnostics — console tail:')
      for (const line of allConsole.slice(-40)) console.log(`  ${line}`)
      console.log(`BOOT FAILURE diagnostics — url: ${page.url()}`)
      console.log(`BOOT FAILURE diagnostics — body: ${(await page.evaluate(() => document.body.innerText).catch(() => '<evaluate failed>')).slice(0, 400)}`)
      console.log(`BOOT FAILURE diagnostics — screenshot: ${join(userData, 'boot-failure.png')}`)
    } catch {
      // Diagnostics are best-effort.
    }
    throw error
  }

  const q = selector => page.locator(selector)
  /** Wait for a data-attr'd submit button to exist AND be enabled. */
  const awaitSubmitEnabled = async () => {
    await q('[data-dsh-forge-confirm-submit]').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-dsh-forge-confirm-submit]')
      return button !== null && !(button).disabled
    }, { timeout: 20_000 })
    return q('[data-dsh-forge-confirm-submit]')
  }

  await step('seat: sidebar.workspaces = forge 项目树座位', async () => {
    await q('[data-dsh-forge-project-seat]').waitFor({ state: 'visible', timeout: 15_000 })
  })

  await step('panellist: 「项目」行为首项', async () => {
    // The upstream panel nav (aria-label 新建会话 column's panel rows) — the
    // project row must exist and precede the other panel rows in DOM order.
    const row = q('[aria-label="项目"], [aria-label="Project"]').first()
    await row.waitFor({ state: 'attached', timeout: 15_000 })
    const nav = row.locator('xpath=ancestor::nav[1]')
    const labels = await nav.locator('button').evaluateAll(buttons =>
      buttons.map(button => button.getAttribute('aria-label') ?? ''))
    const projectIndex = labels.findIndex(label => label === '项目' || label === 'Project')
    if (projectIndex !== 0) throw new Error(`项目 row not first: ${JSON.stringify(labels)}`)
  })

  await step('空态引导: 引导卡可达 + 同一 C7 卡打开', async () => {
    await q('[data-dsh-forge-project-empty]').waitFor({ state: 'visible', timeout: 15_000 })
    await q('[data-dsh-forge-project-empty-add]').click()
    await q('[data-dsh-forge-confirm-code]').waitFor({ state: 'visible', timeout: 10_000 })
  })

  await step('注册 p1: 提交后树出现项目行且为活跃', async () => {
    await q('[data-dsh-forge-confirm-code]').fill(projectOne)
    const submit = await awaitSubmitEnabled()
    await submit.click()
    await q('[data-dsh-forge-project-toast]').waitFor({ state: 'visible', timeout: 15_000 })
    const row = q('[data-dsh-forge-tree-project]').first()
    await row.waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForFunction(() => {
      const row = document.querySelector('[data-dsh-forge-tree-project][aria-current="true"]')
      return row !== null
    }, { timeout: 15_000 })
  })

  await step('注册 p2: 第二项目原位注册', async () => {
    await q('[data-dsh-forge-tree-add-btn]').click()
    await q('[data-dsh-forge-confirm-code]').waitFor({ state: 'visible', timeout: 10_000 })
    await q('[data-dsh-forge-confirm-code]').fill(projectTwo)
    const submit = await awaitSubmitEnabled()
    await submit.click()
    await page.waitForFunction(() =>
      document.querySelectorAll('[data-dsh-forge-tree-project]').length >= 2, { timeout: 15_000 })
  })

  await step('原位换台: 点击 p1 行 → 指针写入(活跃迁移)', async () => {
    const firstRow = page.locator('[data-dsh-forge-tree-project]').first()
    const targetId = await firstRow.getAttribute('data-dsh-forge-tree-project')
    await firstRow.click()
    await page.waitForFunction((id) => {
      const active = document.querySelector('[data-dsh-forge-tree-project][aria-current="true"]')
      return active !== null && active.getAttribute('data-dsh-forge-tree-project') === id
    }, targetId, { timeout: 15_000 })
  })

  await step('boot 首屏: conversation 默认落点(无 workbench 面板被选中)', async () => {
    // The persisted-workbench boot restore is normalized: the shell's main
    // panel stays the conversation (no [data-dsh-forge-shell] mounted at
    // rest) unless the user opens the escape hatch.
    const shellMounted = await q('[data-dsh-forge-shell]').count()
    if (shellMounted !== 0) throw new Error('workbench shell mounted at boot (expected conversation default)')
  })
} finally {
  await app.close().catch(() => {})
}

console.log(JSON.stringify({ userData, results }, null, 2))
if (!failed) {
  rmSync(userData, { recursive: true, force: true })
  console.log('SMOKE PASSED: M4 project seat legs all green (isolated userData cleaned)')
} else {
  console.log(`SMOKE FAILED — isolated userData kept for diagnosis: ${userData}`)
  process.exit(1)
}
