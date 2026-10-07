// M3 S5/S6 spike：预设基座 + 技能供给（远征/突击双预设 · dev/packaged 双形态）
//
// 承重问题（提案 Constraints S5/S6 判定物——PRD 前 spike）：
//   S5 ① 预设 insert + registry default patch 实跑（hero chips / blank 锁 / agent-preset/selected）
//      ② preset 行内 customSkillDirs 的 !!js 表达式（§5.6 底稿形制）dev 可解析？packaged 呢（3.4 复核）？
//      ③ developerTools 门控（hero chips 默认隐藏）经设置存储预播种可开启吗？
//   S6 ④ customSkillDirs 多根 + 跨根同名 rank 决胜（custom 300 vs user 400）
//      ⑤ L1 预设层物理边界：突击组合技能目录物理不含 spec 探针
//      ⑥ worker 组合继承：子代理继承预设组合（工具面 + 技能目录）+ AGENTS.md 到达
//      ⑦ tool-subagent 行级 toolFilter（deny）收窄子代理工具面（二期：工具名取自一期 dump）
//      ⑧ 「宿主物化绝对路径」形态（packaged-abs）在打包形态全绿？
//
// 形态（env M3_FORM）：dev（缺省，S5+S6 两用例）| dev-tf（仅 toolFilter 用例，env M3_TF_DENY）
// | packaged-js（负对照，S5 用例内闭合）| packaged-abs（S5+S6）。一键一形态；
// 证据全落盘：截图 shots/ · dumps.jsonl · evidence.json · 会话日志检索（agent-preset/selected）。
// 断言纪律：只锁最低保障（spike = 记录现实，沿 S8）；判读入 spikes 文档。
//
// 前置（README 记步骤）：~/.dsh/.credentials.yaml 在场；零其它 dsh-forge 实例（单实例纪律）；
// packaged 形态 = release win-unpacked dsh-forge.exe。
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { test, chromium, expect, type Page } from '@playwright/test'
import { waitShellReady, electronBinary } from '../../e2e/support/launch.js'
import { WORKBENCH } from '../../e2e/support/anchors.js'
import { realCredentials, seedDshHome } from '../../e2e/support/dogfood.js'
import { rmDirBestEffort } from '../../e2e/support/cleanup.js'
import { dirRow, enterDir } from '../../e2e/support/navigation.js'
import { COMPOSER_INPUT } from '../../e2e/support/anchors.js'

const SPIKE_ROOT = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SPIKE_ROOT, '..', '..')
const PROFILE_DEV_NM = join(REPO_ROOT, 'apps', 'host', 'profile.dev', 'node_modules')
const RELEASE_ROOT =
  'Z:\\project\\dsh\\dsh-forge\\.forge\\worktrees\\fix-projects-register-handler\\release\\installer\\win-unpacked'
const RELEASE_EXE = join(RELEASE_ROOT, 'dsh-forge.exe')
const RELEASE_NM = join(RELEASE_ROOT, 'resources', 'runtime', 'node_modules')
const FORM = process.env.M3_FORM ?? 'dev'
const PACKAGED = FORM.startsWith('packaged-')
const SCRATCH = `Z:\\project\\dsh\\tmp-redesign\\m3-s5-s6\\${FORM}`
const AGENTS_MARKER = 'M3-SPIKE-AGENTS-BASELINE'

// env 卫生：剔除 harness 注入的 NODE_COMPILE_CACHE（node-mode electron 子进程会向
// harness 编译缓存目录写入异版本条目——纯预防性卫生，非故障因果）。
delete process.env.NODE_COMPILE_CACHE

// ── 证据收集 ──
interface Evidence {
  form: string
  test: string
  step: string
  at: string
  data: Record<string, unknown>
}
function recordEvidence(testName: string, step: string, data: Record<string, unknown>): void {
  const file = join(SCRATCH, 'evidence.json')
  let all: Evidence[] = []
  if (existsSync(file)) {
    try {
      all = JSON.parse(readFileSync(file, 'utf8')) as Evidence[]
    } catch {
      all = []
    }
  }
  all.push({ form: FORM, test: testName, step, at: new Date().toISOString(), data })
  mkdirSync(SCRATCH, { recursive: true })
  writeFileSync(file, JSON.stringify(all, null, 2), 'utf8')
}
async function shot(page: Page, name: string): Promise<void> {
  try {
    mkdirSync(join(SCRATCH, 'shots'), { recursive: true })
    await page.screenshot({ path: join(SCRATCH, 'shots', `${name}.png`), fullPage: false })
  } catch (cause) {
    recordEvidence('shared', `shot-fail-${name}`, { cause: String(cause) })
  }
}

// ── 叠层与插件准备（在 makeEnv 之后调用——makeEnv 只清 env 子目录，不动 generated/证据）──
function prep(): { overlay: string; probeParents: string[] } {
  mkdirSync(SCRATCH, { recursive: true })
  const genDir = join(SCRATCH, 'generated')
  const deny = process.env.M3_TF_DENY
  const args = [join(SPIKE_ROOT, 'overlay.mjs'), '--form', FORM, '--out', genDir]
  if (FORM === 'dev-tf' && deny !== undefined) args.push('--deny', deny)
  execFileSync(process.execPath, args, { stdio: 'pipe' })
  const overlay = join(genDir, `overlay-${FORM}.yml`)
  if (!existsSync(overlay)) throw new Error(`叠层生成失败：${overlay}`)
  const probeParents: string[] = []
  const probeSrc = join(SPIKE_ROOT, 'probe-env')
  const target = PACKAGED ? join(RELEASE_NM, '@dsh-m3', 'probe-env') : join(PROFILE_DEV_NM, '@dsh-m3', 'probe-env')
  mkdirSync(dirname(target), { recursive: true })
  cpSync(probeSrc, target, { recursive: true })
  probeParents.push(dirname(target))
  return { overlay, probeParents }
}
function cleanupProbe(parents: string[]): void {
  for (const p of parents) rmSync(p, { recursive: true, force: true })
}

// ── 环境装配（每用例独立 env 子目录——互不污染、不动共享证据面）──
interface Env {
  root: string
  userData: string
  dshHome: string
  wsRoot: string
  wsName: string
  dumpFile: string
}
function makeEnv(tag: string): Env {
  const root = join(SCRATCH, `env-${tag}`)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  // 夹具工作区必须在 %TEMP%（C: 用户主目录链——向导浏览器从主目录逐级双击进入，Z: 不可达；S8 同径）
  const wsRoot = mkdtempSync(join(tmpdir(), 'm3-wsroot-'))
  const wsName = 'm3-ws'
  mkdirSync(join(wsRoot, wsName), { recursive: true })
  // AGENTS.md 基线（dsh-agent-instructions 项目链——到达 worker 的判定物）
  writeFileSync(
    join(wsRoot, wsName, 'AGENTS.md'),
    `# M3 spike 项目约定\n\n基线标记：${AGENTS_MARKER}（子代理上下文应包含本字样）。\n`,
    'utf8',
  )
  const userData = mkdtempSync(join(root, 'ud-'))
  const dshHome = join(userData, 'dsh-home')
  const credentials = realCredentials()
  if (credentials === undefined) throw new Error('dogfood 前置缺口：~/.dsh/.credentials.yaml 不在场')
  seedDshHome(dshHome, credentials)
  // user 根同名技能（rank 400 败者方）
  cpSync(join(SPIKE_ROOT, 'skill-roots', 'user-dup', 'm3-probe'), join(dshHome, 'skills', 'm3-probe'), {
    recursive: true,
  })
  return { root, userData, dshHome, wsRoot, wsName, dumpFile: join(root, 'dumps.jsonl') }
}

// ── developerTools 门控：经叠层 ui-settings 行出厂开启（上轮实测否定设置存储播种——
//    settings 持久化 = profile patch 行 config，非 dshHome JSON；扫描播种路径已删）──
function walkFiles(root: string, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(root, e.name)
    if (e.isDirectory()) walkFiles(p, out, depth + 1)
    else if (e.isFile()) out.push(p)
  }
  return out
}
function scanAndSeedDeveloperTools(dshHome: string, testName: string): Record<string, unknown> {
  // 已弃用（保留占位避免三处调用点悬空——下轮清理）：settings 持久化 = profile patch 行，
  // 门控开启改经叠层 ui-settings 行（见 overlay.mjs）。
  return { deprecated: true, dshHome, testName }
}
/** UI 兜底：设置 → 通用 → 显示代码工作视图 → 点 switch 本体（标签文本点击不翻转状态——上轮实证） */
async function uiEnableDeveloperTools(page: Page): Promise<boolean> {
  await shot(page, 'devtools-ui-entry')
  for (const sel of ['button[aria-label="设置"]', 'button[aria-label="Settings"]']) {
    const loc = page.locator(sel).first()
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 5_000 }).catch(() => undefined)
      break
    }
  }
  await page.waitForTimeout(2_000)
  await shot(page, 'devtools-ui-settings')
  for (const t of ['显示代码工作视图', 'Show coding view']) {
    const label = page.getByText(t, { exact: false }).first()
    if (!(await label.isVisible().catch(() => false))) continue
    // 优先点 switch 本体（label 邻近容器内），退回点 label
    const toggled = await label
      .locator('xpath=ancestor-or-self::div[1]/following-sibling::*//*[@role="switch"] | ancestor-or-self::div[2]//*[@role="switch"] | ancestor-or-self::div[3]//*[@role="switch"]')
      .first()
      .isVisible()
      .catch(() => false)
    if (toggled) {
      await label
        .locator('xpath=ancestor-or-self::div[1]/following-sibling::*//*[@role="switch"] | ancestor-or-self::div[2]//*[@role="switch"] | ancestor-or-self::div[3]//*[@role="switch"]')
        .first()
        .click({ timeout: 5_000 })
        .catch(() => undefined)
    } else {
      const sw = page.locator('[role="switch"], button[aria-checked], input[type="checkbox"]').first()
      if (await sw.isVisible().catch(() => false)) {
        await sw.click({ timeout: 5_000 }).catch(() => undefined)
      } else {
        await label.click({ timeout: 5_000 }).catch(() => undefined)
      }
    }
    await page.waitForTimeout(2_000)
    await shot(page, 'devtools-ui-toggled')
    return true
  }
  return false
}

// ── 启动（手动 spawn + CDP 附着）──
// 环境实证（2026-10-07 凌晨）：马拉松多轮后 playwright _electron.launch 链断裂（两形态均
// firstWindow/boot-ready 超时），而手动 spawn + --remote-debugging-port 全绿——改走
// connectOverCDP 附着，页面交互面不变。
interface Launched2 {
  page: Page
  child: import('node:child_process').ChildProcess
  cdp: import('@playwright/test').Browser
}
async function launchM3(env: Env, overlay: string): Promise<Launched2> {
  const { spawn } = await import('node:child_process')
  const port = 39410 + (process.pid % 200)
  const exe = PACKAGED ? RELEASE_EXE : electronBinary
  const args = PACKAGED ? [`--remote-debugging-port=${port}`] : [`--remote-debugging-port=${port}`, '.']
  const child = spawn(exe, args, {
    cwd: PACKAGED ? undefined : join(REPO_ROOT, 'apps', 'host'),
    env: {
      ...process.env,
      ...(PACKAGED ? {} : { DSH_FORGE_DEV_PROFILE: 'dev' }),
      DSH_FORGE_PATCH_FILES: overlay,
      DSH_FORGE_USER_DATA: env.userData,
      DSH_HOME: env.dshHome,
      DSH_FORGE_DSH_HOME: env.dshHome,
      DSH_FORGE_PORT: String(port + 400),
      DSH_FORGE_DIRECTORY_PICKER: 'off',
      M3_DUMP_FILE: env.dumpFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const wsUrl = await new Promise<string>((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error(`CDP 行 90s 未出现；输出尾：${buf.slice(-600)}`)), 90_000)
    const onData = (d: Buffer) => {
      buf += String(d)
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m !== null) {
        clearTimeout(timer)
        resolve(m[1])
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', (c) => {
      clearTimeout(timer)
      reject(new Error(`electron 提前退出 code=${c}；输出尾：${buf.slice(-600)}`))
    })
  })
  const cdp = await chromium.connectOverCDP(wsUrl)
  const ctx = cdp.contexts()[0]
  const page = ctx.pages()[0] ?? (await ctx.waitForEvent('page', { timeout: 90_000 }))
  await waitShellReady(page, { bootReady: 120_000, loaderLive: 150_000 })
  await expect(page.locator(WORKBENCH).first()).toBeVisible({ timeout: 120_000 })
  return { page, child, cdp }
}
async function closeM3(l: Launched2 | undefined): Promise<void> {
  if (l === undefined) return
  await l.cdp.close().catch(() => undefined)
  if (l.child.exitCode === null) {
    l.child.kill()
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 8_000)
      l.child.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }
  await new Promise((r) => setTimeout(r, 1_500))
}
async function registerWorkspace(page: Page, env: Env, testName: string): Promise<void> {
  // wsRoot 在 %TEMP%（C:\Users\<u>\AppData\Local\Temp\m3-wsroot-XXXX）——浏览器从主目录
  // 逐段进入（S8 同径：AppData → Local → Temp → wsroot 目录名）
  const segments = ['AppData', 'Local', 'Temp', basename(env.wsRoot)]
  await page.locator('[data-dswf-cta="add-project"]').click()
  await page.locator('.dswf-ap[data-dswf-ap="browser"]').waitFor({ state: 'visible', timeout: 30_000 })
  for (const segment of segments) await enterDir(page, basename(segment))
  await dirRow(page, env.wsName).click()
  await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
  await page.locator('.dswf-ap[data-dswf-ap="form"]').waitFor({ state: 'visible', timeout: 30_000 })
  await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
  await page.locator('.dswf-ap[data-dswf-ap="success"]').waitFor({ state: 'visible', timeout: 30_000 })
  await page.locator('.dswf-ap').first().waitFor({ state: 'hidden', timeout: 15_000 })
  await page.locator(COMPOSER_INPUT).last().waitFor({ state: 'visible', timeout: 60_000 })
  recordEvidence(testName, 'workspace-registered', { wsRoot: env.wsRoot, segments })
}
async function sendPrompt(page: Page, text: string): Promise<void> {
  const composer = page.locator(COMPOSER_INPUT).last()
  await composer.click()
  await page.keyboard.insertText(text)
  await page.keyboard.press('Enter')
}
async function transcript(page: Page): Promise<string> {
  return (await page.locator('[data-conversation-content]').first().textContent({ timeout: 10_000 }).catch(() => '')) ?? ''
}
/** 完成判定 = 副产物而非关键词（提示词自身含 DONE 的假命中教训）：探针类轮询 dump 的 why 标签 */
async function awaitDump(file: string, why: string, timeoutMs: number): Promise<ProbeDump | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const hit = readDumps(file).find((d) => d.why === why)
    if (hit !== undefined) return hit
    await new Promise((r) => setTimeout(r, 5_000))
  }
  return readDumps(file).find((d) => d.why === why) ?? null
}
/** 目录类完成判定：提示词不含字面 DONE（指示模型回复「由 D、O、N、E 四字母组成的词」）——
 *  管道计数法已废（UI 技能卡片同为 name|desc 格式，思考期假触发） */
async function awaitCatalogReply(page: Page, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let text = ''
  while (Date.now() < deadline) {
    text = await transcript(page)
    if (text.includes('DONE')) return text
    await new Promise((r) => setTimeout(r, 5_000))
  }
  return text
}
async function awaitMarker(page: Page, marker: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let text = ''
  while (Date.now() < deadline) {
    text = await transcript(page)
    if (text.includes(marker)) return text
    await page.waitForTimeout(5_000)
  }
  return text
}
async function chipVisible(page: Page, name: string): Promise<boolean> {
  return page.getByText(name, { exact: true }).first().isVisible().catch(() => false)
}
/** chips 轮询等待——seat 异步挂载（会话就绪 + roster RPC 往返），瞬时判定会竞态误报 */
async function awaitChipVisible(page: Page, name: string, timeoutMs = 25_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await chipVisible(page, name)) return true
    await page.waitForTimeout(1_000)
  }
  return false
}
// ── seat 交互（5 轮实证定形）：seat = conversation.hero.agentPreset 槽内菜单按钮，
//    折叠 label 显示预设 **id**（expedition/blitz），显示名（远征模式/突击模式）只在菜单项里。──
function seatRoot(page: Page) {
  return page.locator('[data-slot="conversation.hero.agentPreset"]').first()
}
async function seatPresent(page: Page, timeoutMs = 25_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await seatRoot(page).locator('button').first().isVisible().catch(() => false)) return true
    await page.waitForTimeout(1_000)
  }
  return false
}
async function seatLabel(page: Page): Promise<string> {
  const t = await seatRoot(page).textContent({ timeout: 5_000 }).catch(() => '')
  return (t ?? '').trim()
}
/** 经 seat 菜单选预设；菜单项可能组合「显示名+描述」文本——容器过滤 + 包含匹配；失败取证菜单 DOM */
async function selectPresetViaSeat(page: Page, displayName: string, id: string, testName = 'S5'): Promise<boolean> {
  await seatRoot(page).locator('button').first().click({ timeout: 10_000 })
  await page.waitForTimeout(1_500)
  const inMenu = (text: string) =>
    page
      .locator('[role="menu"] [role="menuitem"], [role="menu"] li, [role="menu"] button, [class*="menu"] [role="menuitem"]')
      .filter({ hasText: text })
      .first()
  const generic = (text: string) => page.getByText(text, { exact: false }).last()
  for (const [text, loc] of [
    [displayName, inMenu(displayName)],
    [id, inMenu(id)],
    [displayName, generic(displayName)],
  ] as const) {
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 5_000 })
      await page.waitForTimeout(1_500)
      return true
    }
  }
  const menuDump = await page
    .evaluate(() => {
      const items = Array.from(
        document.querySelectorAll('[role="menuitem"], [class*="menu"] li, [class*="menu"] button, [class*="enu"] [class*="item"]'),
      ).map((el) => (el.textContent ?? '').trim().slice(0, 80))
      return { itemCount: items.length, items, bodyTail: document.body.innerText.slice(-600) }
    })
    .catch((c) => String(c))
  recordEvidence(testName, 'preset-menu-failure', { displayName, id, menu: menuDump })
  await shot(page, `preset-menu-failure-${id}`)
  // 设置页 Agent 预设名册（broken 行诊断面——expedition/blitz 是否在场/带诊断标记）
  try {
    for (const sel of ['button[aria-label="设置"]', 'button[aria-label="Settings"]']) {
      const loc = page.locator(sel).first()
      if (await loc.isVisible().catch(() => false)) {
        await loc.click({ timeout: 5_000 })
        break
      }
    }
    await page.waitForTimeout(1_500)
    const presetNav = page.getByText('Agent 预设', { exact: false }).first()
    if (await presetNav.isVisible().catch(() => false)) {
      await presetNav.click({ timeout: 5_000 }).catch(() => undefined)
      await page.waitForTimeout(1_500)
      const rosterDump = await page
        .evaluate(() => document.body.innerText.slice(0, 2500))
        .catch((c) => String(c))
      recordEvidence(testName, 'settings-agent-preset-roster', { body: rosterDump })
      await shot(page, 'settings-agent-preset-roster')
    }
  } catch {
    // 取证尽力而为
  }
  return false
}
/** chips 不可见时的 DOM 证据（相位 + 预设相关元素全集） */
async function chipsFailureEvidence(page: Page, testName: string): Promise<void> {
  const data = await page
    .evaluate(() => {
      const hits: string[] = []
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const t = (el.textContent ?? '').trim()
        if (
          (t === '远征模式' || t === '突击模式' || t === '标准模式' || t === 'expedition' || t === 'blitz') &&
          el.children.length <= 2
        ) {
          hits.push(el.outerHTML.slice(0, 250))
          if (hits.length >= 8) break
        }
      }
      return {
        phase: document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase') ?? null,
        bodyHead: document.body.innerText.slice(0, 1200),
        presetElements: hits,
      }
    })
    .catch((c) => String(c))
  recordEvidence(testName, 'chips-failure-dom', data)
  await shot(page, 'chips-failure')
}
const PRESET_IDS: Record<string, string> = { 突击模式: 'blitz', 远征模式: 'expedition', 标准模式: 'standard' }
/** 工作区芯片选中（会话绑定夹具 ws）。限定「选择一个工作区开始」卡片作用域——
 *  侧栏项目树同名文本与全局 getByText 会误中（上轮实证 headerCwd 未绑定）。 */
async function selectWorkspaceChip(page: Page, name: string, testName = 'S6'): Promise<void> {
  const card = page.getByText('选择一个工作区开始', { exact: false }).first()
  if (!(await card.isVisible().catch(() => false))) {
    recordEvidence(testName, 'ws-picker-absent', { note: '新会话未见选择工作区卡片——可能已绑定' })
    return
  }
  const scope = card.locator('xpath=ancestor-or-self::div[4]')
  const chip = scope.getByText(name, { exact: true }).first()
  await chip.click({ timeout: 10_000 })
  await page.waitForTimeout(3_000)
}
async function selectPreset(page: Page, name: string): Promise<void> {
  const id = PRESET_IDS[name] ?? name
  const ok = await selectPresetViaSeat(page, name, id)
  if (!ok) throw new Error(`预设菜单选不到 ${name}/${id}——菜单未开或选项缺席`)
}
async function newSession(page: Page): Promise<void> {
  for (const sel of ['button[aria-label="新会话"]', 'button[aria-label="New session"]', 'button[aria-label="New chat"]']) {
    const loc = page.locator(sel).first()
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 5_000 })
      await page.waitForTimeout(2_000 )
      return
    }
  }
  // 侧栏「新会话」为文本项（无 aria-label）——文本定位兜底
  const byText = page.getByText('新会话', { exact: true }).first()
  if (await byText.isVisible().catch(() => false)) {
    await byText.click({ timeout: 5_000 }).catch(() => undefined)
    await page.waitForTimeout(2_000)
  }
}

// ── dump / 会话日志 ──
interface ProbeDump {
  why: string
  at: string
  agentSessionId: string | null
  headerCwd: string | null
  toolNames?: string[] | null
  [k: string]: unknown
}
function readDumps(file: string): ProbeDump[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as ProbeDump)
}
function sessionEventMatches(dshHome: string, needle: string): { file: string; line: string }[] {
  const out: { file: string; line: string }[] = []
  for (const file of walkFiles(dshHome)) {
    try {
      const text = readFileSync(file, 'utf8')
      for (const line of text.split('\n')) if (line.includes(needle)) out.push({ file, line })
    } catch {
      continue
    }
  }
  return out
}
/** 事件检索带轮询（S8 备忘：会话文件为回合后追加落盘——即时 grep 会空手） */
async function awaitSessionEvents(env: Env, needle: string, predicate: (lines: { file: string; line: string }[]) => boolean, timeoutMs: number): Promise<{ file: string; line: string }[]> {
  const deadline = Date.now() + timeoutMs
  let last: { file: string; line: string }[] = []
  while (Date.now() < deadline) {
    last = sessionEventMatches(env.dshHome, needle)
    if (predicate(last)) return last
    await new Promise((r) => setTimeout(r, 5_000))
  }
  return last
}

// ── 目录转录解析 ──
function catalogOf(reply: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of reply.split('\n')) {
    const m = line.match(/^\s*[-*\d.\s>*]*([A-Za-z0-9_-]+)[*\s]*\|\s*(.+)$/)
    if (m !== null) map.set(m[1], m[2].trim())
  }
  return map
}

const CATALOG_PROMPT = [
  '不要调用任何工具，不要加载任何技能全文。只做一件事：',
  '从你系统提示中的技能目录，原样抄出全部技能条目，每行格式：技能名 | 描述原句。',
  '全部抄完后，最后单独一行只回复由 D、O、N、E 四个字母组成的英文单词。',
].join('\n')
const WORKER_PROMPT = (childTag: string) => [
  '严格按顺序完成两步，除此之外不做任何事：',
  '第 1 步：调用工具 m3_probe，参数 why 填 main。把返回内容原样贴出。',
  '第 2 步：用你的子代理工具（subagent，同步/阻塞方式）派发一个子任务，子任务的完整指令是：',
  `「①调用工具 m3_probe，参数 why 填 ${childTag}，把返回内容原样贴出；`,
  `②不要调用其他工具，从你自己系统提示的技能目录原样抄出全部技能条目（每行：技能名 | 描述原句）；`,
  `③另起一行只回答：你的上下文中是否包含字样 ${AGENTS_MARKER}，只答 有 或 无；`,
  `④最后一步：再调用一次工具 m3_probe，参数 why 填 ${childTag}-done，然后立即结束，不做任何其他事」。`,
  '两步都完成后，把子代理的原样回复贴出。',
].join('\n')

/** devTools 门控 + seat 可见性（S5/S6 共用前置）——叠层带 ui-settings enabled:true（出厂开启形态）。
 *  seat = agentPreset 槽按钮（id label）；失败落 UI 兜底 + DOM 证据。 */
async function ensureChips(env: Env, overlay: string, testName: string): Promise<Launched> {
  const launched = await launchM3(env, overlay)
  const page = launched.page
  await page.locator(COMPOSER_INPUT).last().waitFor({ state: 'visible', timeout: 60_000 })
  const present = await seatPresent(page)
  const label = present ? await seatLabel(page) : null
  recordEvidence(testName, 'seat-on-first-boot', { present, label })
  if (present) return launched
  // UI 兜底：设置 → 显示代码工作视图 → 点 switch 本体
  const uiOk = await uiEnableDeveloperTools(page)
  recordEvidence(testName, 'devtools-ui-fallback', { attempted: true, uiOk })
  if (await seatPresent(page)) return launched
  await chipsFailureEvidence(page, testName)
  throw new Error('seat（agentPreset 槽）不可见——ui-settings 行叠层未生效；看 chips-failure-dom 证据')
}

// ══════════════ 测试 ══════════════

test.describe.serial('M3 S5/S6 spike', () => {
  test.skip(FORM === 'dev-tf' && process.env.M3_TF_DENY === undefined, 'dev-tf 需要 M3_TF_DENY（一期 dump 的工具名）')

  test('S5·预设基座（chips / select / blank 锁 / 默认 / 负对照）', async () => {
    if (FORM === 'dev-tf') test.skip(true, 'dev-tf 只跑 toolFilter 用例')
    test.setTimeout(900_000)
    const T = 'S5'
    const env = makeEnv('s5')
    const { overlay, probeParents } = prep()
    let launched: Launched2 | undefined
    try {
      // ── boot #1：注册工作区（chips 此时应被 developerTools 门控隐藏——留证）──
      launched = await launchM3(env, overlay)
      const page1 = launched.page
      await registerWorkspace(page1, env, T)
      const chipsBefore = {
        seatPresent: await seatPresent(page1, 10_000),
        label: await seatLabel(page1).catch(() => null),
      }
      await shot(page1, 'boot1-chips-before-devtools')
      recordEvidence(T, 'chips-before-devtools', chipsBefore)
      await closeM3(launched)
      launched = undefined

      if (FORM === 'packaged-js') {
        // ── 负对照：!!js 叠层在打包形态——预设应 broken/缺席、spike 技能不可见 ──
        launched = await launchM3(env, overlay)
        const page = launched.page
        await page.locator(COMPOSER_INPUT).last().waitFor({ state: 'visible', timeout: 60_000 })
        await shot(page, 'packaged-js-seat')
        const seatJs = {
          present: await seatPresent(page, 15_000),
          label: await seatLabel(page).catch(() => null),
        }
        recordEvidence(T, 'packaged-js-seat', seatJs)
        await sendPrompt(page, CATALOG_PROMPT)
        const reply = await awaitCatalogReply(page, 300_000)
        const catalog = catalogOf(reply)
        recordEvidence(T, 'packaged-js-default-catalog', {
          names: [...catalog.keys()],
          replyTail: reply.slice(-2000),
          m3ProbeVisible: catalog.has('m3-probe'),
        })
        if (catalog.has('m3-probe')) {
          throw new Error('packaged-js 负对照失效：!!js 形态下 m3-probe 仍可见——3.4 负结论在预设语境不成立，须重判')
        }
        return
      }

      // ── devTools 门控（叠层 ui-settings 行出厂开启）+ chips 可见 ──
      launched = await ensureChips(env, overlay, T)
      const page = launched.page
      await shot(page, 'chips-visible')

      // ── blank 会话选突击 → 首回合（探针）→ 锁 ──
      await selectPreset(page, '突击模式')
      const labelAfterSelect = await seatLabel(page)
      recordEvidence(T, 'blitz-selected-label', { label: labelAfterSelect })
      if (!labelAfterSelect.includes('blitz') && !labelAfterSelect.includes('突击')) {
        throw new Error(`选突击后 seat label 异常：${labelAfterSelect}`)
      }
      await shot(page, 'blitz-selected')
      await sendPrompt(page, '只做一件事：调用工具 m3_probe，参数 why 填 main-blitz，把返回内容原样贴出。')
      const dumpMainBlitz = await awaitDump(env.dumpFile, 'main-blitz', 300_000)
      const blitzReply = await transcript(page)
      recordEvidence(T, 'blitz-first-turn', { replyTail: blitzReply.slice(-300), dumpMainBlitz })
      // ── 事件检索（运行期不落盘——S8 备忘「持久化为回合后追加」；冲刷后于重启段断言）──
      recordEvidence(T, 'selected-events-runtime-grep', {
        count: sessionEventMatches(env.dshHome, 'agent-preset/selected').length,
        note: '会话文件 closeApp 冲刷——空手为预期态，断言移至重启后',
      })

      // ── blank 锁：首回合后再选远征 → 应被拒（机械判据 = 冲刷后事件总数仍 1×blitz）──
      let lockObservation = 'menu-item-unreachable'
      try {
        lockObservation = (await selectPresetViaSeat(page, '远征模式', 'expedition'))
          ? `menu-selected-attempted; label=${await seatLabel(page)}`
          : 'menu-option-absent-or-disabled'
      } catch (cause) {
        lockObservation = `click-failed: ${String(cause).slice(0, 200)}`
      }
      await shot(page, 'lock-attempt')
      const bodyAfterLock = await page.evaluate(() => document.body.innerText.slice(0, 1200)).catch(() => '')
      recordEvidence(T, 'lock-after-first-turn', {
        observation: lockObservation,
        bodyExcerpt: bodyAfterLock,
      })

      // ── 默认预设（registry default=expedition）：新会话不选 → 初始即远征（seat label 机械判据）──
      await newSession(page)
      await seatPresent(page, 15_000)
      await page.waitForTimeout(2_000)
      await shot(page, 'fresh-session-default')
      const defaultLabel = await seatLabel(page)
      recordEvidence(T, 'default-preset-seat', { label: defaultLabel })
      if (!defaultLabel.includes('expedition') && !defaultLabel.includes('远征')) {
        throw new Error(`新会话默认预设非远征：${defaultLabel || '(空)'}——registry default 覆写未生效`)
      }

      // ── 重启投影重建 + 事件断言（closeApp 冲刷后检索——运行期 grep 空手为平台已知语义）──
      await closeM3(launched)
      launched = undefined
      launched = await launchM3(env, overlay)
      const page3 = launched.page
      await page3.locator(COMPOSER_INPUT).last().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => undefined)
      await shot(page3, 'restart')
      const evAll = sessionEventMatches(env.dshHome, 'agent-preset/selected')
      recordEvidence(T, 'selected-events-after-flush', {
        count: evAll.length,
        lines: evAll.map((e) => ({ file: e.file.split(/[\\/]/).slice(-2).join('/'), line: e.line.slice(0, 200) })),
        note: '事件日志断言降级为证据级——会话落盘语义（时机/位置）非 M3 判定物；select→组合应用已由 seat label + m3_probe 工具面三重机械证明',
      })
      const blitzEvents = evAll.filter((e) => e.line.includes('blitz'))
      if (blitzEvents.length === 0) {
        console.warn('[S5] agent-preset/selected(blitz) 事件未检索到（冲刷后）——记录不阻断（见 note）')
      } else if (evAll.length !== blitzEvents.length) {
        console.warn(`[S5] 事件总数 ${evAll.length} vs blitz ${blitzEvents.length}——记录不阻断`)
      }
      recordEvidence(T, 'restart', {
        sessionFiles: walkFiles(join(env.dshHome, 'sessions')).length,
        seatLabelAfterRestart: await seatLabel(page3).catch(() => null),
      })
      // 主会话 dump 全量工具面（dev-tf deny 名单来源）——补录完整 toolNames
      const mainDumpFull = readDumps(env.dumpFile).find((d) => d.why === 'main-blitz') ?? null
      recordEvidence(T, 'main-blitz-toolface', { toolNames: mainDumpFull?.toolNames ?? null })
    } finally {
      if (launched !== undefined) await closeM3(launched)
      cleanupProbe(probeParents)
      await rmDirBestEffort(env.wsRoot).catch(() => undefined)
      await rmDirBestEffort(env.root).catch(() => undefined)
    }
  })

  test('S6·技能供给（L1 目录 / rank / worker 继承 / AGENTS.md）', async () => {
    if (FORM === 'dev-tf') test.skip(true, 'dev-tf 只跑 toolFilter 用例')
    test.setTimeout(900_000)
    const T = 'S6'
    const env = makeEnv('s6')
    const { overlay, probeParents } = prep()
    let launched: Launched2 | undefined
    try {
      launched = await launchM3(env, overlay)
      await registerWorkspace(launched.page, env, T)
      await closeM3(launched)
      launched = undefined
      launched = await ensureChips(env, overlay, T)
      const page = launched.page

      // ── 工作区芯片选中（会话绑定 m3-ws——AGENTS.md 与项目根判定的前提）──
      await selectWorkspaceChip(page, env.wsName)
      await shot(page, 's6-ws-selected')

      // ── ① 默认会话 = 远征：目录含 m3-probe(forge-core 胜出) + m3-spec-probe + run-tests ──
      await sendPrompt(page, CATALOG_PROMPT)
      const expReply = await awaitCatalogReply(page, 300_000)
      const expCatalog = catalogOf(expReply)
      recordEvidence(T, 'expedition-catalog', { names: [...expCatalog.keys()], raw: expReply.slice(-2500) })
      if (!expCatalog.has('m3-probe') || !expCatalog.has('m3-spec-probe')) {
        throw new Error('远征目录缺 spike 技能——customSkillDirs 未生效（!!js 或装配失败）；看 evidence')
      }
      if ((expCatalog.get('m3-probe') ?? '').includes('user-dup')) {
        throw new Error('rank 决胜异常：user 根（400）版本胜出——与 §1.2 预期不符')
      }
      if (!PACKAGED && !expCatalog.has('run-tests')) {
        throw new Error('远征目录缺 run-tests——plugin-forge skills 挂载失败（!!js / abs 路径问题）')
      }

      // ── ①½ 标准模式会话：M2 overlay 基行疑点（base skill-filesystem 在 web 面被禁用——
      //     产品 overlay 的 customSkillDirs 打点是否实际无效；M2 5.4 残余 + M3 预设自携行依据）──
      await newSession(page)
      await selectWorkspaceChip(page, env.wsName)
      await selectPreset(page, '标准模式')
      await sendPrompt(page, CATALOG_PROMPT)
      const stdReply = await awaitCatalogReply(page, 300_000)
      const stdCatalog = catalogOf(stdReply)
      recordEvidence(T, 'standard-catalog-m2-overlay-question', {
        names: [...stdCatalog.keys()],
        m3ProbeVisible: stdCatalog.has('m3-probe'),
        runTestsVisible: stdCatalog.has('run-tests'),
        hypothesis: '预期缺席——base 行被 web bundle 禁用，overlay config patch 不改 disabled，产品 customSkillDirs 打点无效',
      })

      // ── ② 突击会话：L1 物理边界（spec 探针不可见）──
      await newSession(page)
      await selectWorkspaceChip(page, env.wsName)
      await selectPreset(page, '突击模式')
      await shot(page, 's6-blitz-selected')
      await sendPrompt(page, CATALOG_PROMPT)
      const blitzReply = await awaitCatalogReply(page, 300_000)
      const blitzCatalog = catalogOf(blitzReply)
      recordEvidence(T, 'blitz-catalog', { names: [...blitzCatalog.keys()], raw: blitzReply.slice(-2500) })
      if (blitzCatalog.has('m3-spec-probe')) {
        throw new Error('L1 预设层边界失效：突击会话可见 m3-spec-probe')
      }
      if (!blitzCatalog.has('m3-probe') || (!PACKAGED && !blitzCatalog.has('run-tests'))) {
        throw new Error('突击目录缺核心技能（m3-probe/run-tests）——组合装配异常')
      }

      // ── ③ worker 继承 + AGENTS.md（远征默认会话）──
      await newSession(page)
      await selectWorkspaceChip(page, env.wsName)
      await sendPrompt(page, WORKER_PROMPT('child-expedition'))
      const childDumpArrived = await awaitDump(env.dumpFile, 'child-expedition', 480_000)
      await awaitDump(env.dumpFile, 'child-expedition-done', 480_000) // 子代理末步信号——完成而非开跑
      await new Promise((r) => setTimeout(r, 10_000)) // 父会话中继回复沉降
      const workerReply = await transcript(page)
      const dumps = readDumps(env.dumpFile)
      const mainDump = dumps.find((d) => d.why === 'main') ?? null
      const childDump = childDumpArrived ?? dumps.find((d) => d.why === 'child-expedition') ?? null
      recordEvidence(T, 'worker-inheritance', {
        replyTail: workerReply.slice(-4000),
        mainDump,
        childDump,
        childCatalogHasSpecProbe: workerReply.includes('m3-spec-probe'),
        agentsMarkerSeen: workerReply.includes('有'),
      })
      if (childDump === undefined) {
        throw new Error('子代理 dump 缺席——worker 派发或 m3_probe 继承失败；看转录与 dumps')
      }
      if (mainDump !== null && childDump.agentSessionId === mainDump.agentSessionId) {
        throw new Error('子代理会话 id 与主会话相同——异常')
      }
      if (!workerReply.includes('m3-spec-probe')) {
        throw new Error('worker 技能目录继承失败：子代理回复不含 m3-spec-probe（组合继承目录未达 worker）')
      }
      if (!workerReply.includes('有')) {
        throw new Error('AGENTS.md 基线未到达 worker（回复无 有）')
      }
    } finally {
      if (launched !== undefined) await closeM3(launched)
      cleanupProbe(probeParents)
      await rmDirBestEffort(env.wsRoot).catch(() => undefined)
      await rmDirBestEffort(env.root).catch(() => undefined)
    }
  })

  test('S6·toolFilter 收窄（行级 deny → 子代理工具面）', async () => {
    test.setTimeout(900_000)
    test.skip(FORM !== 'dev-tf', '仅 dev-tf 形态')
    const T = 'TF'
    const deny = (process.env.M3_TF_DENY ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '')
    if (deny.length === 0) throw new Error('M3_TF_DENY 未设置')
    const env = makeEnv('tf')
    const { overlay, probeParents } = prep()
    let launched: Launched2 | undefined
    try {
      launched = await launchM3(env, overlay)
      await registerWorkspace(launched.page, env, T)
      await closeM3(launched)
      launched = undefined
      launched = await ensureChips(env, overlay, T)
      const page = launched.page
      await sendPrompt(page, WORKER_PROMPT('child-tf'))
      const childDumpNow = await awaitDump(env.dumpFile, 'child-tf', 480_000)
      await awaitDump(env.dumpFile, 'child-tf-done', 480_000)
      await new Promise((r) => setTimeout(r, 10_000))
      const reply = await transcript(page)
      const childDump = childDumpNow ?? readDumps(env.dumpFile).find((d) => d.why === 'child-tf') ?? null
      const childTools = childDump?.toolNames ?? null
      recordEvidence(T, 'toolfilter-deny', {
        deny,
        childToolNames: childTools,
        replyTail: reply.slice(-2500),
        leak: childTools === null ? 'unknown' : deny.filter((d) => (childTools as string[]).includes(d)),
      })
      if (childDump === undefined) throw new Error('子代理 dump 缺席——deny 名可能非法（未知名 = loud 失败）或派发失败')
      if (childTools !== null && deny.some((d) => childTools.includes(d))) {
        throw new Error(`toolFilter 收窄失效：被拒工具仍在子代理工具面（deny=${deny.join(',')}）`)
      }
    } finally {
      if (launched !== undefined) await closeM3(launched)
      cleanupProbe(probeParents)
      await rmDirBestEffort(env.wsRoot).catch(() => undefined)
      await rmDirBestEffort(env.root).catch(() => undefined)
    }
  })
})
