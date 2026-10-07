// M3 3.9 spike 残余补验——S5/S6 工件在 M3 真实装配面（3.4 dispatchTask / 3.7 预设装配 /
// 3.8 host 接线与打包）之上的复跑。四确认件（任务 3.9 AC）：
//   P packaged boot（AC-1）：打包产物（release/win-unpacked，dist:win 重建）首启 →
//     双预设装配在场（boot-overlay.yml 物化 resources 绝对路径 + registry default=远征 +
//     ui-settings 首启预置 + hero 座位自现）+ 目录转录实证技能可达（spec+core 技能名）。
//   N packaged-js 负对照（AC-1 残余名）：外部叠层重述产品远征行、仅 customSkillDirs[core]
//     换 §5.6 !!js 表达式——预期打包形态行 broken（!!js 死刑判决的确认性复核）。
//   D dev-abs（AC-2①）：dev 形态产品装配（renderBootOverlay 物化 repo 绝对路径）+ L1 物理
//     边界（真实突击预设目录物理不含 spec 技能）。
//   W 派发探针（AC-2② dev-tf + AC-3 relay + AC-4 按需加载）：真实 dispatchTask 派发
//     test-run + doc 双夹具任务 → worker dump（deny 收窄）/ worker 会话文件解码（首条 =
//     dispatchPrompt 对账 digest + AGENTS.md 到达 + system 技能目录常驻 + run-tests 按需
//     加载：test 加载 / doc 不加载）。断言通道即 5.2 SC2 消费面。
//
// 形态（env M3R_FORM）：m3-dev（缺省，D+W）| m3-packaged（P）| m3-packaged-js（N）。
// 一键一形态；证据全落盘 Z:\project\dsh\tmp-redesign\m3-3-9\<form>\（evidence.json +
// shots/ + dumps.jsonl）。断言纪律沿 S8/S5：机械面硬断言，叙述面证据级；负对照失效 = loud。
//
// 前置（README 记步骤）：~/.dsh/.credentials.yaml 在场；零其它 dsh-forge 实例（单实例纪律）；
// packaged 形态 = 本工作树 release/installer/win-unpacked/dsh-forge.exe（dist:win 重建）。
// 形态事实（3.9 首轮探针实证）：零项目 hero 无 composer——注册项目后芯片流进会话面
//（composer + agentPreset 座位）；m2 dogfood 同径（rpc.js selectWorkspaceViaChip）。
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { test, chromium, expect, type Page } from '@playwright/test'
import { waitShellReady, electronBinary } from '../../e2e/support/launch.js'
import { WORKBENCH, COMPOSER_INPUT } from '../../e2e/support/anchors.js'
import { realCredentials, seedDshHome } from '../../e2e/support/dogfood.js'
import { rmDirBestEffort } from '../../e2e/support/cleanup.js'
import { decodeSessionFile, type SessionEvent } from '../../e2e/support/session-files.js'
import { openForgeDbAt } from '../../e2e/support/replay/db-insert.js'
import { seedDogfoodTaskRow } from '../../e2e/support/replay/dogfood-record.js'
import { selectWorkspaceViaChip } from '../../e2e/support/rpc.js'

const SPIKE_ROOT = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SPIKE_ROOT, '..', '..')
const PROFILE_DEV_NM = join(REPO_ROOT, 'apps', 'host', 'profile.dev', 'node_modules')
const RELEASE_ROOT = join(REPO_ROOT, 'release', 'installer', 'win-unpacked')
const RELEASE_EXE = join(RELEASE_ROOT, 'dsh-forge.exe')
const RELEASE_NM = join(RELEASE_ROOT, 'resources', 'runtime', 'node_modules')
const FORM = process.env.M3R_FORM ?? 'm3-dev'
const PACKAGED = FORM.startsWith('m3-packaged')
const SCRATCH = `Z:\\project\\dsh\\tmp-redesign\\m3-3-9\\${FORM}`
const AGENTS_MARKER = 'M3-SPIKE-AGENTS-BASELINE'

// env 卫生：剔除 harness 注入的 NODE_COMPILE_CACHE（一版 spike 同款——node-mode electron
// 子进程会向 harness 编译缓存目录写异版本条目）。
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

// ── 叠层与探针插件准备 ──
function prep(): { overlay: string; probeParents: string[] } {
  mkdirSync(SCRATCH, { recursive: true })
  const genDir = join(SCRATCH, 'generated')
  execFileSync(process.execPath, [join(SPIKE_ROOT, 'overlay-m3.mjs'), '--form', FORM, '--out', genDir], { stdio: 'pipe' })
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

// ── 环境装配 ──
interface Env {
  root: string
  userData: string
  dshHome: string
  dumpFile: string
}
function makeEnv(tag: string): Env {
  const root = join(SCRATCH, `env-${tag}`)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  const userData = mkdtempSync(join(root, 'ud-'))
  const dshHome = join(userData, 'dsh-home')
  const credentials = realCredentials()
  if (credentials === undefined) throw new Error('dogfood 前置缺口：~/.dsh/.credentials.yaml 不在场')
  seedDshHome(dshHome, credentials)
  return { root, userData, dshHome, dumpFile: join(root, 'dumps.jsonl') }
}

// ── 启动（手动 spawn + CDP 附着——一版 spike 实证形制）──
interface Launched2 {
  page: Page
  child: import('node:child_process').ChildProcess
  cdp: import('@playwright/test').Browser
}
async function launchM3(env: Env, overlay: string): Promise<Launched2> {
  const { spawn } = await import('node:child_process')
  const port = 39610 + (process.pid % 200)
  const exe = PACKAGED ? RELEASE_EXE : electronBinary
  if (PACKAGED && !existsSync(RELEASE_EXE)) throw new Error(`packaged 试验床缺席：${RELEASE_EXE}（先 pnpm dist:win）`)
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

// ── RPC 直注（forgeInvoke 同式——本 spec 自持轻量版）──
async function rpcInvoke<T>(page: Page, channel: string, payload?: unknown): Promise<T> {
  return page.evaluate(
    async ({ ch, args }) => {
      const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> } }).dshForge
      if (forge === undefined) throw new Error('dshForge preload 面缺席')
      const envelope = await forge.invoke(ch, args)
      if (!envelope.ok) throw new Error(`forge RPC ${ch} 失败：${JSON.stringify(envelope)}`)
      return envelope.data
    },
    { ch: channel, args: payload },
  )
}
/** RPC 注册夹具工作区（%TEMP%——会话 cwd 链可达；注册名 = 目录名，芯片按注册名列示） */
async function rpcRegisterWorkspace(page: Page, wsDir: string, name: string): Promise<{ dir: string; projectId: string }> {
  const registered = await rpcInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: wsDir,
    name,
    forgeDir: join(wsDir, '.forge'),
    knowledgeDir: join(wsDir, '.knowledge'),
  })
  const { dir } = await rpcInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })
  return { dir, projectId: registered.projectId }
}
/** 夹具工作区物理件：AGENTS.md 基线 + 无害四门 justfile（powershell 面——m2 dogfood 同径） */
function makeFixtureWorkspace(wsParent: string, wsName: string): string {
  const wsDir = join(wsParent, wsName)
  mkdirSync(wsDir, { recursive: true })
  writeFileSync(
    join(wsDir, 'AGENTS.md'),
    `# M3 3.9 项目约定\n\n基线标记：${AGENTS_MARKER}（worker 上下文应包含本字样）。\n`,
    'utf8',
  )
  writeFileSync(
    join(wsDir, 'justfile'),
    [
      '# m3 3.9 fixture workspace — quality gates as honest no-ops',
      'set shell := ["powershell", "-NoProfile", "-Command"]',
      '',
      'compile:',
      '    @echo compile-ok',
      'fmt:',
      '    @echo fmt-ok',
      'lint:',
      '    @echo lint-ok',
      'unit-test:',
      '    @echo unit-test-ok',
      'test: unit-test',
      '',
    ].join('\n'),
    'utf8',
  )
  return wsDir
}

// ── seat 交互（一版 spike 五轮实证定形：座位 = conversation.hero.agentPreset 槽内菜单按钮，
//    折叠 label 显预设 id；healthy 显 display name、broken 回退 id）──
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
/** 座位 label 轮询（远征/突击名册 RPC 异步水化——瞬时读空非异常；空串窗口内重读） */
async function awaitSeatLabel(page: Page, timeoutMs = 25_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let label = ''
  while (Date.now() < deadline) {
    label = await seatLabel(page)
    if (label !== '') return label
    await page.waitForTimeout(1_000)
  }
  return label
}
/** 经 seat 菜单选预设（菜单项组合「显示名+描述」文本——容器过滤 + 包含匹配；失败取证） */
async function selectPresetViaSeat(page: Page, displayName: string, id: string): Promise<boolean> {
  await seatRoot(page).locator('button').first().click({ timeout: 10_000 })
  await page.waitForTimeout(1_500)
  const inMenu = (text: string) =>
    page
      .locator('[role="menu"] [role="menuitem"], [role="menu"] li, [role="menu"] button, [class*="menu"] [role="menuitem"]')
      .filter({ hasText: text })
      .first()
  for (const [text, loc] of [
    [displayName, inMenu(displayName)],
    [id, inMenu(id)],
    [displayName, page.getByText(displayName, { exact: false }).last()],
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
  recordEvidence('seat', 'preset-menu-failure', { displayName, id, menu: menuDump })
  await shot(page, `preset-menu-failure-${id}`)
  return false
}
async function selectPreset(page: Page, name: string): Promise<void> {
  const id = name === '突击模式' ? 'blitz' : name === '远征模式' ? 'expedition' : name === '标准模式' ? 'standard' : name
  const ok = await selectPresetViaSeat(page, name, id)
  if (!ok) throw new Error(`预设菜单选不到 ${name}/${id}`)
}

// ── 会话面 ──
async function sendPrompt(page: Page, text: string): Promise<void> {
  const composer = page.locator(COMPOSER_INPUT).last()
  await composer.click()
  await page.keyboard.insertText(text)
  await page.keyboard.press('Enter')
}
async function transcript(page: Page): Promise<string> {
  return (await page.locator('[data-conversation-content]').first().textContent({ timeout: 10_000 }).catch(() => '')) ?? ''
}
/** 目录类完成判定（一版 spike 同款：提示词不含字面 DONE——指示模型回复四字母单词） */
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
function catalogOf(reply: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of reply.split('\n')) {
    const m = line.match(/^\s*[-*\d.\s>*]*([A-Za-z0-9_-]+)[*\s]*\|\s*(.+)$/)
    if (m !== null) map.set(m[1], m[2].trim())
  }
  return map
}
async function newSession(page: Page): Promise<void> {
  for (const sel of ['button[aria-label="新会话"]', 'button[aria-label="New session"]', 'button[aria-label="New chat"]']) {
    const loc = page.locator(sel).first()
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 5_000 })
      await page.waitForTimeout(2_000)
      return
    }
  }
  const byText = page.getByText('新会话', { exact: true }).first()
  if (await byText.isVisible().catch(() => false)) {
    await byText.click({ timeout: 5_000 }).catch(() => undefined)
    await page.waitForTimeout(2_000)
  }
}
/** 注册 + 芯片绑定 + composer/座位就绪（零项目 hero 无 composer——3.9 首轮探针实证） */
async function bindWorkspace(page: Page, wsDir: string, wsName: string, testName: string): Promise<void> {
  await rpcRegisterWorkspace(page, wsDir, wsName)
  await selectWorkspaceViaChip(page, wsName)
  await page.locator(COMPOSER_INPUT).last().waitFor({ state: 'visible', timeout: 60_000 })
  recordEvidence(testName, 'workspace-bound', { wsDir, wsName })
}
/** 后续会话工作区选择（宽容形）：「选择一个工作区开始」卡片在场则选（一版 spike 实证锚），
 *  缺席 = 会话已继承绑定（新会话沿用前工作区形态）——直通。 */
async function rebindWorkspaceIfNeeded(page: Page, wsName: string, testName: string): Promise<void> {
  const card = page.getByText('选择一个工作区开始', { exact: false }).first()
  if (!(await card.isVisible().catch(() => false))) {
    recordEvidence(testName, 'ws-rebind-skipped', { note: '新会话已继承工作区绑定（无选择卡片）' })
    return
  }
  const scope = card.locator('xpath=ancestor-or-self::div[4]')
  await scope.getByText(wsName, { exact: true }).first().click({ timeout: 10_000 })
  await page.waitForTimeout(3_000)
  recordEvidence(testName, 'ws-rebound', { wsName })
}

// ── dump / 会话文件 ──
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
async function awaitDump(file: string, why: string, timeoutMs: number): Promise<ProbeDump | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const hit = readDumps(file).find((d) => d.why === why)
    if (hit !== undefined) return hit
    await new Promise((r) => setTimeout(r, 5_000))
  }
  return readDumps(file).find((d) => d.why === why) ?? null
}
/** dsh 会话目录遍历（{dshHome}/sessions/<ws>/<session-id>/） */
function sessionDirs(dshHome: string): string[] {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return []
  const out: string[] = []
  for (const ws of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!ws.isDirectory()) continue
    for (const s of readdirSync(join(sessionsDir, ws.name), { withFileTypes: true })) {
      if (s.isDirectory()) out.push(join(sessionsDir, ws.name, s.name))
    }
  }
  return out
}
/** 会话现行日志文件（canonical generation 名——session.jsonl[.zstd]/session.vN.*，取最高代） */
function bestSessionLog(sessionDir: string): string | undefined {
  if (!existsSync(sessionDir)) return undefined
  const files = readdirSync(sessionDir).filter((f) => /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/.test(f))
  if (files.length === 0) return undefined
  const versionOf = (f: string): number => Number(/^session(?:\.v([1-9]\d*))?\.jsonl/.exec(f)?.[1] ?? 0)
  return join(sessionDir, files.sort((a, b) => versionOf(b) - versionOf(a))[0] as string)
}
/** 全会话目录内按谓词找日志（worker 定位：首条用户消息含 TASK_ID 标记） */
function findSessionBy(dshHome: string, needle: string): { dir: string; file: string; events: readonly SessionEvent[] } | undefined {
  for (const dir of sessionDirs(dshHome)) {
    const file = bestSessionLog(dir)
    if (file === undefined) continue
    try {
      const events = decodeSessionFile(file)
      if (events.some((e) => JSON.stringify(e).includes(needle))) return { dir, file, events }
    } catch {
      continue
    }
  }
  return undefined
}
/** 会话首条用户消息文本（user/message 事件 data 即消息本体——content 块拼接；
 *  fix-1 复跑修正：0.2.0-rc.2 事件面 user/message 载荷在 data 直位非 data.message，
 *  兼容两形以防上游形态演进） */
function firstUserText(events: readonly SessionEvent[], needle: string): string | undefined {
  for (const e of events) {
    if (e.type !== 'user/message') continue
    const blocks = e.data?.message?.content ?? e.data?.content
    if (!Array.isArray(blocks)) continue
    const text = blocks.map((b) => (b?.type === 'text' ? (b.text ?? '') : '')).join('\n')
    if (text.includes(needle)) return text
  }
  return undefined
}
/** 会话 system/message 事件文本拼接（模型实收系统提示词——技能目录/AGENTS.md 判定面；
 *  fix-1 复跑修正：事件类型 = 'system/message'（非 'system'——p1mvp flywheel 验证面同源） */
function systemText(events: readonly SessionEvent[]): string {
  const parts: string[] = []
  for (const e of events) {
    if (e.type !== 'system/message') continue
    const blocks = e.data?.message?.content
    if (Array.isArray(blocks)) {
      for (const b of blocks) if (b?.type === 'text' && typeof b.text === 'string') parts.push(b.text)
    }
  }
  return parts.join('\n')
}
/** 上下文注入通道文本（fix-1 复跑二轮修正：AGENTS.md 基线与技能目录均以 user/message
 *  上下文消息承载——source.kind = 'agent-instructions' | 'skill-catalog'（0.2.0-rc.2
 *  实测面；worker 自答在 assistant/message——排除，判定面 = 注入通道非应答转述）；
 *  system/developer message 事件并入同池（提示词面兼容）。 */
function contextInjectionText(events: readonly SessionEvent[]): string {
  const parts: string[] = []
  for (const e of events) {
    if (e.type === 'system/message' || e.type === 'developer/message') {
      const blocks = e.data?.message?.content
      if (Array.isArray(blocks)) {
        for (const b of blocks) if (b?.type === 'text' && typeof b.text === 'string') parts.push(b.text)
      }
      continue
    }
    if (e.type !== 'user/message') continue
    const source = (e.data as { source?: { kind?: string } } | undefined)?.source?.kind
    if (source !== 'agent-instructions' && source !== 'skill-catalog') continue
    const blocks = e.data?.message?.content ?? (e.data as { content?: unknown[] } | undefined)?.content
    if (Array.isArray(blocks)) {
      for (const b of blocks) if ((b as { type?: string })?.type === 'text' && typeof (b as { text?: unknown }).text === 'string') parts.push((b as { text: string }).text)
    }
  }
  return parts.join('\n')
}
/** 会话工具调用轨迹（name + arguments 文本对——按需加载/收窄行为判定面） */
function toolCalls(events: readonly SessionEvent[]): { name: string; args: string }[] {
  const out: { name: string; args: string }[] = []
  for (const e of events) {
    if (e.type !== 'tool' && e.type !== 'tool/call') continue
    const name = e.data?.name ?? ''
    const args = typeof e.data?.arguments === 'string' ? e.data.arguments : JSON.stringify(e.data?.arguments ?? '')
    out.push({ name, args })
  }
  return out
}
/** dispatchPrompt 指纹（core digest.ts 同式：sha-256(全文) 前 12 hex） */
function digestOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)
}

// ── boot-overlay.yml 断言素材 ──
function overlayText(env: Env): string {
  return readFileSync(join(env.userData, 'boot-overlay.yml'), 'utf8')
}
function customSkillDirEntries(text: string): string[] {
  const out: string[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*customSkillDirs:\s*$/.test(lines[i] as string)) continue
    for (let j = i + 1; j < lines.length; j++) {
      const m = /^\s*-\s+"(.+)"\s*$/.exec(lines[j] as string)
      if (m === null) break
      // YAML 双引号标量反转义（overlay.ts yamlQuote 对称面：\\ → \，\" → "）
      out.push((m[1] as string).replace(/\\(.)/g, '$1'))
    }
  }
  return out
}

const CATALOG_PROMPT = [
  '不要调用任何工具，不要加载任何技能全文。只做一件事：',
  '从你系统提示中的技能目录，原样抄出全部技能条目，每行格式：技能名 | 描述原句。',
  '全部抄完后，最后单独一行只回复由 D、O、N、E 四个字母组成的英文单词。',
].join('\n')

// ══════════════ 测试 ══════════════

test.describe.serial('M3 3.9 spike 残余补验', () => {
  test('P·packaged boot 双预设装配（AC-1）', async () => {
    test.skip(FORM !== 'm3-packaged', '仅 m3-packaged 形态')
    test.setTimeout(900_000)
    const T = 'P'
    const env = makeEnv('p')
    const { overlay, probeParents } = prep()
    let launched: Launched2 | undefined
    const wsRoot = mkdtempSync(join(tmpdir(), 'm3-wsroot-'))
    try {
      launched = await launchM3(env, overlay)
      const page = launched.page
      const wsDir = makeFixtureWorkspace(wsRoot, 'm3-ws')

      // ── ① 注册 + 芯片绑定 → composer/座位自现（ui-settings 首启预置——零 UI 开关动作）──
      await bindWorkspace(page, wsDir, 'm3-ws', T)
      const present = await seatPresent(page)
      const label = present ? await awaitSeatLabel(page) : null
      recordEvidence(T, 'seat-on-first-boot', { present, label })
      await shot(page, 'packaged-first-boot')
      expect(present, 'hero 座位自现（ui-settings 预置开启）').toBe(true)
      expect(label !== null && (label.includes('远征') || label.includes('expedition')), `默认预设 = 远征（label=${label}）`).toBe(true)

      // ── ② boot-overlay.yml 物化断言：双预设在场 + resources 绝对路径 + 零 !!js ──
      const otext = overlayText(env)
      const dirs = customSkillDirEntries(otext)
      const coreExpect = join(RELEASE_ROOT, 'resources', 'runtime', 'node_modules', '@dsh-forge', 'plugin-forge', 'skills')
      const specExpect = join(RELEASE_ROOT, 'resources', 'runtime', 'node_modules', '@dsh-forge', 'plugin-forge-spec', 'skills')
      recordEvidence(T, 'boot-overlay', {
        hasExpedition: otext.includes('preset-expedition'),
        hasBlitz: otext.includes('preset-blitz'),
        registryDefaultExpedition: /default:\s*expedition/.test(otext),
        customSkillDirs: dirs,
        jsExpressionResidue: otext.includes('!!js'),
        platformGateRows: otext.split('\n').filter((l) => l.includes('disabled:')).slice(0, 4),
      })
      expect(otext.includes('preset-expedition'), '远征预设行在场').toBe(true)
      expect(otext.includes('preset-blitz'), '突击预设行在场').toBe(true)
      expect(/default:\s*expedition/.test(otext), 'registry default = expedition').toBe(true)
      expect(otext.includes('!!js'), '物化输出零 !!js 残留').toBe(false)
      expect(dirs.some((d) => d.toLowerCase() === coreExpect.toLowerCase()), 'core 目录 = resources 绝对路径').toBe(true)
      expect(dirs.some((d) => d.toLowerCase() === specExpect.toLowerCase()), 'spec 目录 = resources 绝对路径').toBe(true)

      // ── ③ ui-settings 首启预置（profile 用户层 cordis.patch.yml）──
      const patchPath = join(env.userData, 'profile', 'cordis.patch.yml')
      const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
      recordEvidence(T, 'profile-ui-settings-row', { patchPath, present: existsSync(patchPath), hasRow: /^-\s+id:\s*ui-settings\s*$/m.test(patchText), enabledTrue: /enabled:\s*true/.test(patchText) })
      expect(existsSync(patchPath), 'profile cordis.patch.yml 首启落地').toBe(true)
      expect(/^-\s+id:\s*ui-settings\s*$/m.test(patchText), 'ui-settings 开关行预置').toBe(true)
      expect(/enabled:\s*true/.test(patchText), '开关预置为开').toBe(true)

      // ── ④ 双预设菜单在场 ──
      await selectPreset(page, '远征模式') // 打开菜单 + 幂等重选（取证菜单项）
      const menuOkBlitz = await selectPresetViaSeat(page, '突击模式', 'blitz')
      recordEvidence(T, 'menu-contains-blitz', { menuOkBlitz })
      await shot(page, 'menu-dual-presets')
      if (!menuOkBlitz) throw new Error('突击菜单项缺席——packaged 装配面异常（看 preset-menu-failure 证据）')
      await selectPreset(page, '远征模式')

      // ── ⑤ 目录转录：resources 绝对路径真实解析（spec + core 技能名可见）──
      await sendPrompt(page, CATALOG_PROMPT)
      const reply = await awaitCatalogReply(page, 300_000)
      const catalog = catalogOf(reply)
      recordEvidence(T, 'expedition-catalog', { names: [...catalog.keys()], replyTail: reply.slice(-2500) })
      expect(catalog.has('run-tests'), '远征目录含 run-tests（core skills 目录解析）').toBe(true)
      expect(catalog.has('write-prd'), '远征目录含 write-prd（spec skills 目录解析）').toBe(true)
      expect(catalog.has('submit-task'), '远征目录含 submit-task（core 四技能）').toBe(true)
    } finally {
      if (launched !== undefined) await closeM3(launched)
      cleanupProbe(probeParents)
      await rmDirBestEffort(wsRoot).catch(() => undefined)
      await rmDirBestEffort(env.root).catch(() => undefined)
    }
  })

  test('N·packaged-js 负对照（AC-1 残余名确认）', async () => {
    test.skip(FORM !== 'm3-packaged-js', '仅 m3-packaged-js 形态')
    test.setTimeout(900_000)
    const T = 'N'
    const env = makeEnv('n')
    const { overlay, probeParents } = prep()
    let launched: Launched2 | undefined
    const wsRoot = mkdtempSync(join(tmpdir(), 'm3-wsroot-'))
    try {
      launched = await launchM3(env, overlay)
      const page = launched.page
      const wsDir = makeFixtureWorkspace(wsRoot, 'm3-ws')
      await bindWorkspace(page, wsDir, 'm3-ws', T)
      const present = await seatPresent(page, 20_000)
      const label = present ? await awaitSeatLabel(page) : null
      await shot(page, 'packaged-js-seat')
      // 负对照主判据 = 目录面：远征（!!js 行）组合 spec 技能不可见（行 broken 或目录不解析）
      await sendPrompt(page, CATALOG_PROMPT)
      const reply = await awaitCatalogReply(page, 300_000)
      const catalog = catalogOf(reply)
      recordEvidence(T, 'packaged-js-catalog', {
        seat: { present, label },
        names: [...catalog.keys()],
        writePrdVisible: catalog.has('write-prd'),
        runTestsVisible: catalog.has('run-tests'),
        replyTail: reply.slice(-2000),
      })
      if (catalog.has('write-prd')) {
        throw new Error('packaged-js 负对照失效：!!js 形态下 spec 技能仍可见——!!js 死刑判决在打包语境不成立，须重判（drift 记账）')
      }
      // 证据级：座位/菜单呈现形态（broken 回退/缺席均为有效观察）
      const menuOkExp = await selectPresetViaSeat(page, '远征模式', 'expedition').catch(() => false)
      recordEvidence(T, 'packaged-js-menu', { menuOkExp, note: 'broken 预设不上菜单/标签回退 id = 预期观察' })
      await shot(page, 'packaged-js-menu')
    } finally {
      if (launched !== undefined) await closeM3(launched)
      cleanupProbe(probeParents)
      await rmDirBestEffort(wsRoot).catch(() => undefined)
      await rmDirBestEffort(env.root).catch(() => undefined)
    }
  })

  test('D·dev-abs 绝对路径装配 + L1 物理边界（AC-2①）', async () => {
    test.skip(FORM !== 'm3-dev', '仅 m3-dev 形态')
    test.setTimeout(900_000)
    const T = 'D'
    const env = makeEnv('d')
    const { overlay, probeParents } = prep()
    let launched: Launched2 | undefined
    const wsRoot = mkdtempSync(join(tmpdir(), 'm3-wsroot-'))
    try {
      launched = await launchM3(env, overlay)
      const page = launched.page
      const wsDir = makeFixtureWorkspace(wsRoot, 'm3-ws')

      // ── ① dev 形态物化 = repo 绝对路径（dev-abs 判定物——renderBootOverlay 无 !!js）──
      // dev 解析形 = installAnchor 树上溯首中 apps/host/node_modules/@dsh-forge/<pkg>/skills
      //（workspace junction 面——paths.ts resolvePackageSkillsDir 无 realpath；字面绝对路径成立）
      const otext = overlayText(env)
      const dirs = customSkillDirEntries(otext)
      const repoRootLc = REPO_ROOT.toLowerCase()
      const isRepoAbs = (pkg: string) =>
        dirs.some((d) => d.toLowerCase().startsWith(repoRootLc) && d.toLowerCase().includes(`@dsh-forge\\${pkg}\\skills`))
      recordEvidence(T, 'boot-overlay-dev', {
        customSkillDirs: dirs,
        jsExpressionResidue: otext.includes('!!js'),
        coreIsRepoAbs: isRepoAbs('plugin-forge'),
        specIsRepoAbs: isRepoAbs('plugin-forge-spec'),
      })
      expect(otext.includes('!!js'), '物化输出零 !!js').toBe(false)
      expect(isRepoAbs('plugin-forge'), 'core 目录 = repo 绝对路径（dev junction 形）').toBe(true)
      expect(isRepoAbs('plugin-forge-spec'), 'spec 目录 = repo 绝对路径（dev junction 形）').toBe(true)

      // ── ② 座位 + 默认远征（dev 形态首启预置同径）──
      await bindWorkspace(page, wsDir, 'm3-ws', T)
      const present = await seatPresent(page)
      const label = present ? await awaitSeatLabel(page) : null
      recordEvidence(T, 'seat-dev', { present, label })
      await shot(page, 'dev-first-boot')
      expect(present, 'dev hero 座位在场').toBe(true)
      expect(label !== null && (label.includes('远征') || label.includes('expedition')), `默认 = 远征（label=${label}）`).toBe(true)

      // ── ③ 远征目录（spec+core 全量）──
      await sendPrompt(page, CATALOG_PROMPT)
      const expReply = await awaitCatalogReply(page, 300_000)
      const expCatalog = catalogOf(expReply)
      recordEvidence(T, 'expedition-catalog', { names: [...expCatalog.keys()], raw: expReply.slice(-2500) })
      expect(expCatalog.has('run-tests'), '远征含 run-tests').toBe(true)
      expect(expCatalog.has('write-prd'), '远征含 write-prd（spec 全量挂载）').toBe(true)
      expect(expCatalog.has('tech-design'), '远征含 tech-design（spec 8 技能之一）').toBe(true)

      // ── ④ L1 物理边界：突击目录物理不含 spec 技能（真实预设）──
      await newSession(page)
      await rebindWorkspaceIfNeeded(page, 'm3-ws', T)
      await page.locator(COMPOSER_INPUT).last().waitFor({ state: 'visible', timeout: 60_000 })
      await selectPreset(page, '突击模式')
      await shot(page, 'dev-blitz-selected')
      const blitzLabel = await seatLabel(page)
      recordEvidence(T, 'blitz-selected', { label: blitzLabel })
      expect(blitzLabel.includes('blitz') || blitzLabel.includes('突击'), `选突击后 label=${blitzLabel}`).toBe(true)
      await sendPrompt(page, CATALOG_PROMPT)
      const blitzReply = await awaitCatalogReply(page, 300_000)
      const blitzCatalog = catalogOf(blitzReply)
      recordEvidence(T, 'blitz-catalog', { names: [...blitzCatalog.keys()], raw: blitzReply.slice(-2500) })
      expect(blitzCatalog.has('write-prd'), '突击不应见 write-prd（L1 物理边界）').toBe(false)
      expect(blitzCatalog.has('tech-design'), '突击不应见 tech-design').toBe(false)
      expect(blitzCatalog.has('run-tests'), '突击仍含 run-tests（core 同携）').toBe(true)
    } finally {
      if (launched !== undefined) await closeM3(launched)
      cleanupProbe(probeParents)
      await rmDirBestEffort(wsRoot).catch(() => undefined)
      await rmDirBestEffort(env.root).catch(() => undefined)
    }
  })

  test('W·派发探针：dev-tf 收窄 + relay 对账 + 按需加载（AC-2②/AC-3/AC-4）', async () => {
    test.skip(FORM !== 'm3-dev', '仅 m3-dev 形态')
    test.setTimeout(1_500_000)
    const T = 'W'
    const env = makeEnv('w')
    const { overlay, probeParents } = prep()
    let launched: Launched2 | undefined
    // 夹具：ws（AGENTS.md + 四门 justfile）+ feature 任务文件（探针指令载体——worker 经
    // slug 目录约定 fs 读取；M3 dispatchPrompt 不携 desc、worker 面 queryTask 被收窄）
    const WS = { slug: 'm39-probe', docLocal: '1.1', testLocal: '2.1' }
    const wsRoot = mkdtempSync(join(tmpdir(), 'm3-wsroot-'))
    const wsDir = makeFixtureWorkspace(wsRoot, 'm39-ws')
    const taskDir = join(wsDir, 'docs', 'features', WS.slug, 'tasks')
    mkdirSync(taskDir, { recursive: true })
    writeFileSync(
      join(taskDir, '1.1-relay-doc.md'),
      [
        '---',
        `id: "${WS.docLocal}"`,
        'title: "relay 文本探针（doc）"',
        'type: doc',
        '---',
        '',
        `# ${WS.docLocal}: relay 文本探针（doc）`,
        '',
        '## Description',
        '',
        'M3 3.9 补验的最小 doc 探针：证明 worker 继承的工具面与上下文（AGENTS.md 到达）。',
        '',
        '## Acceptance Criteria',
        '',
        '- [ ] 调用工具 m3_probe，参数 why 填 child-doc，把返回内容原样贴出',
        `- [ ] 回答一行：你的上下文中是否包含字样 ${AGENTS_MARKER}（只答 有 或 无）`,
        '- [ ] 在工作区根创建 notes-1.1.md，内容恰为一行：M3-3-9 doc probe ok',
        '',
        '## Hard Rules',
        '',
        '- MUST NOT 调用 run-tests 技能或任何测试相关技能（本任务为文档任务）',
        '- MUST NOT 新建修复任务；如受阻直接 submitTask result=blocked 并写明原因',
      ].join('\n'),
      'utf8',
    )
    writeFileSync(
      join(taskDir, '2.1-load-test.md'),
      [
        '---',
        `id: "${WS.testLocal}"`,
        'title: "按需加载探针（test-run）"',
        'type: test-run',
        '---',
        '',
        `# ${WS.testLocal}: 按需加载探针（test-run）`,
        '',
        '## Description',
        '',
        'M3 3.9 补验的最小 test-run 探针：证明 test 任务 worker 按需加载 run-tests 技能。',
        '',
        '## Acceptance Criteria',
        '',
        '- [ ] 调用工具 m3_probe，参数 why 填 child-test，把返回内容原样贴出',
        '- [ ] 按类型政策调用 run-tests 技能执行测试面',
        '- [ ] 测试面缺席/技能报错时如实记录，submitTask result=blocked（reason 写明测试面缺席）',
        '',
        '## Hard Rules',
        '',
        '- MUST 经 Skill(skill="run-tests") 执行测试（类型政策既定）',
        '- MUST NOT 新建修复任务；如受阻直接 submitTask result=blocked 并写明原因',
      ].join('\n'),
      'utf8',
    )
    let forgeDir: string | undefined
    try {
      launched = await launchM3(env, overlay)
      const page = launched.page

      // ── ① 注册 + 种双任务（RPC register → feature register → dogfood 种行 + 相位对齐）──
      const registered = await rpcRegisterWorkspace(page, wsDir, 'm39-ws')
      forgeDir = registered.dir
      await rpcInvoke(page, 'forge:features/register', { projectId: registered.projectId, slug: WS.slug, title: 'M3 3.9 探针特性' })
      const db = openForgeDbAt(forgeDir)
      seedDogfoodTaskRow(db, WS.slug, WS.docLocal, {
        title: 'relay 文本探针（doc）',
        taskType: 'doc',
        taskDesc: '任务定义文件：docs/features/m39-probe/tasks/1.1-relay-doc.md（探针指令在其内——按 slug 目录约定读取）',
      })
      seedDogfoodTaskRow(db, WS.slug, WS.testLocal, {
        title: '按需加载探针（test-run）',
        taskType: 'test-run',
        taskDesc: '任务定义文件：docs/features/m39-probe/tasks/2.1-load-test.md（探针指令在其内——按 slug 目录约定读取）',
      })
      // 相位不动点对齐（m2 dogfood 实证：register 缺省 prd vs 四 pending 任务推导 tasks——
      // claim 事务内增量断言非不动点即红）
      db.prepare(`UPDATE features SET feature_status = 'tasks', updated_at = ? WHERE slug = ?`).run(
        new Date().toISOString(),
        WS.slug,
      )
      db.close()
      recordEvidence(T, 'fixture-seeded', { wsDir, forgeDir, tasks: [`${WS.slug}/${WS.docLocal} doc`, `${WS.slug}/${WS.testLocal} test-run`] })

      // ── ② 绑定工作区 + 派发指令（真实 dispatchTask——模型调用）──
      // fix-1 后回默认远征会话直派（3.9 期的标准模式绕行径已拆除）：预设行内 plugin-forge
      // 增量行携带 bindingsFile 同 config（drift #9 处置 = 行内行携带同 config）→ 预设会话
      // 行内实例 cwd 路由自足；worker spawn deny 名表 = 上游实面实名（drift #10 重映射）。
      // 默认远征 = 派发主形态正面判定场（dispatcher 与 worker 继承同组合）。
      await selectWorkspaceViaChip(page, 'm39-ws')
      await page.locator(COMPOSER_INPUT).last().waitFor({ state: 'visible', timeout: 60_000 })
      const expLabel = await awaitSeatLabel(page)
      recordEvidence(T, 'dispatcher-default-preset', {
        label: expLabel,
        note: 'fix-1 后默认远征会话直派（标准模式绕行径拆除——预设会话 forge 路由修复的正面判定场）',
      })
      await shot(page, 'w-ws-selected')
      expect(expLabel.includes('远征') || expLabel.includes('expedition'), `默认远征会话派发（label=${expLabel}）`).toBe(true)
      await sendPrompt(
        page,
        [
          '严格按顺序完成，除此之外不做任何事：',
          '第 1 步：调用工具 m3_probe，参数 why 填 main，把返回内容原样贴出。',
          '第 2 步：调用工具 dispatchTask 派发下一个就绪任务，等它完成。',
          '第 3 步：再次调用工具 dispatchTask 派发下一个就绪任务，等它完成。',
          '第 4 步：把两次 dispatchTask 的返回原样贴出。不要自己执行任务内容。',
        ].join('\n'),
      )

      // ── ③ 等双 worker 结算（dumps = 起跑信号；task-worker-done 事件 = 终态信号——
      //     fix-1 复跑修正：worker 真跑后 dump 早于终态落地，closeApp 前不等终态会杀活
      //     worker（in_progress 悬置 + 会话文件缺尾）——logs/{slug}.jsonl 双 done 行 = 齐）──
      const mainDump = await awaitDump(env.dumpFile, 'main', 300_000)
      const childDoc = await awaitDump(env.dumpFile, 'child-doc', 600_000)
      const childTest = await awaitDump(env.dumpFile, 'child-test', 600_000)
      const spawnLogOf = () => join(forgeDir as string, 'logs', `${WS.slug}.jsonl`)
      const workerDoneCount = () =>
        existsSync(spawnLogOf())
          ? readFileSync(spawnLogOf(), 'utf8').split('\n').filter((l) => l.includes('"task-worker-done"')).length
          : 0
      const settleDeadline = Date.now() + 600_000
      while (workerDoneCount() < 2 && Date.now() < settleDeadline) {
        await new Promise((r) => setTimeout(r, 5_000))
      }
      await new Promise((r) => setTimeout(r, 20_000)) // 父会话末步（第 4 步贴返）沉降
      const transcriptText = await transcript(page)
      recordEvidence(T, 'dispatch-round', {
        mainDump,
        childDoc,
        childTest,
        workerDoneEvents: workerDoneCount(),
        replyTail: transcriptText.slice(-4000),
      })

      // ── ④ 关停（worker 会话全文 = 运行期内存 closeApp 后落盘——tech-design 三层存放）──
      await closeM3(launched)
      launched = undefined

      // ── ⑤ worker 会话定位 + 解码（relay 对账 / AGENTS.md / 按需加载）──
      const docSession = findSessionBy(env.dshHome, `TASK_ID: ${WS.slug}/${WS.docLocal}`)
      const testSession = findSessionBy(env.dshHome, `TASK_ID: ${WS.slug}/${WS.testLocal}`)
      // deny 期望面 = contracts WORKER_GLOBAL_DENY_TOOLS 实面实名（fix-1/drift #10）+ forge
      // 闭环四动词（deriveWorkerToolFilter FORGE_DENY_IN_WORKER）——独立硬编码（非引常量：
      // 泄漏检查须对插件源独立，不与被检面同源）
      const denyExpect = [
        'ask_user_question',
        'subagent_fork',
        'list_agents',
        'send_message',
        'interrupt_agent',
        'workflow',
        'todo_write',
        'present',
        'queryTask',
        'createProposal',
        'transitionProposal',
        'dispatchTask',
      ]
      const analyze = (
        name: string,
        s: { dir: string; file: string; events: readonly SessionEvent[] } | undefined,
        localId: string,
        dump: ProbeDump | null,
      ) => {
        const promptText = s === undefined ? undefined : firstUserText(s.events, `TASK_ID: ${WS.slug}/${localId}`)
        const sys = s === undefined ? '' : systemText(s.events)
        const ctxText = s === undefined ? '' : contextInjectionText(s.events)
        const calls = s === undefined ? [] : toolCalls(s.events)
        const tools = dump?.toolNames ?? null
        return {
          name,
          sessionFound: s !== undefined,
          sessionId: s === undefined ? null : basename(s.dir),
          promptDigest: promptText === undefined ? null : digestOf(promptText),
          promptHead: promptText?.slice(0, 200) ?? null,
          personaBlockInPrompt: promptText?.includes('You are a focused task executor.') ?? false,
          typePolicyInPrompt: promptText?.includes('type-policy') ?? false,
          agentsMarkerInSystem: sys.includes(AGENTS_MARKER),
          catalogRunTestsInSystem: sys.includes('run-tests'),
          catalogWritePrdInSystem: sys.includes('write-prd'),
          // 上下文注入通道（agent-instructions / skill-catalog user 消息）——AGENTS.md/目录的实际承载面
          agentsMarkerInContext: ctxText.includes(AGENTS_MARKER),
          catalogRunTestsInContext: ctxText.includes('run-tests'),
          runTestsSkillInvoked: calls.some((c) => (c.name + ' ' + c.args).includes('run-tests')),
          skillCalls: calls.filter((c) => /skill/i.test(c.name)).map((c) => ({ name: c.name, args: c.args.slice(0, 120) })),
          submitTaskCalled: calls.some((c) => c.name === 'submitTask'),
          workerToolNames: tools,
          denyLeak: tools === null ? ['<dump-absent>'] : denyExpect.filter((d) => tools.includes(d)),
        }
      }
      const docAnalysis = analyze('doc-worker', docSession, WS.docLocal, childDoc)
      const testAnalysis = analyze('test-worker', testSession, WS.testLocal, childTest)
      recordEvidence(T, 'worker-analysis', { doc: docAnalysis, test: testAnalysis, denyExpect })

      // ── ⑥ claim/事件对账素材（forge.db task_records + logs/{slug}.jsonl；submit 行
      //     reason/summary 附读——blocked 终态的诊断面）──
      const db2 = openForgeDbAt(forgeDir as string)
      const claimRows = db2
        .prepare(
          `SELECT r.dispatch_digest AS digest, t.slug || '/' || t.local_id AS taskKey, t.task_status AS status
             FROM task_records r JOIN tasks t ON t.id = r.task_id WHERE r.verb = 'claim' ORDER BY r.id`,
        )
        .all() as { digest: string | null; taskKey: string; status: string }[]
      const submitRows = db2
        .prepare(
          `SELECT t.slug || '/' || t.local_id AS taskKey, t.task_status AS status, r.reason AS reason, r.summary AS summary
             FROM task_records r JOIN tasks t ON t.id = r.task_id WHERE r.verb = 'submit' ORDER BY r.id`,
        )
        .all() as { taskKey: string; status: string; reason: string | null; summary: string | null }[]
      db2.close()
      const spawnLogPath = join(forgeDir as string, 'logs', `${WS.slug}.jsonl`)
      const spawnLog = existsSync(spawnLogPath) ? readFileSync(spawnLogPath, 'utf8') : ''
      const spawnedLines = spawnLog.split('\n').filter((l) => l.includes('task-spawned') || l.includes('task-claimed'))
      recordEvidence(T, 'claim-digest-recon', { claimRows, submitRows, spawnedLines })

      // 对账：worker 首条用户消息 == dispatchPrompt——结构面硬断言（人格段/type-policy/TASK_ID），
      // digest 等值 = 证据级（会话持久化包裹等平台细节不以红灯误报；不等值即 drift 候选，落证据）
      expect(docAnalysis.sessionFound, 'doc worker 会话文件在场').toBe(true)
      expect(testAnalysis.sessionFound, 'test worker 会话文件在场').toBe(true)
      const digestRecon: Record<string, { worker: string | null; claim: string | null; equal: boolean }> = {}
      for (const [key, a] of [
        [`${WS.slug}/${WS.docLocal}`, docAnalysis],
        [`${WS.slug}/${WS.testLocal}`, testAnalysis],
      ] as const) {
        const claims = claimRows.filter((r) => r.taskKey === key)
        expect(claims.length > 0, `claim record 在场（${key}）`).toBe(true)
        expect(claims.every((c) => c.digest !== null && c.digest !== ''), `claim digest 在场（${key}）`).toBe(true)
        expect(a.promptDigest, `worker 首条 = dispatchPrompt（digest 可算，${key}）`).toBeTruthy()
        expect(a.personaBlockInPrompt && a.typePolicyInPrompt, `dispatchPrompt 四段组成（${key}）`).toBe(true)
        // 幂等重入会产生多 claim 行（简报重合成 digest 新值）——worker 实收 prompt 对账任一 claim 即证同源
        const equal = a.promptDigest !== null && claims.some((c) => c.digest === a.promptDigest)
        digestRecon[key] = { worker: a.promptDigest, claims: claims.map((c) => c.digest), equal }
        if (!equal) console.warn(`[W] digest 对账不等值（${key}）：worker=${a.promptDigest} claims=${JSON.stringify(claims.map((c) => c.digest))}——证据级记录（drift 候选）`)
      }
      recordEvidence(T, 'digest-reconciliation', digestRecon)
      // relay：AGENTS.md 基线 + 技能目录到达 worker（上下文注入通道——agent-instructions/
      // skill-catalog user 消息；system/message 面留证据级双记）
      expect(docAnalysis.agentsMarkerInContext, 'AGENTS.md 基线到达 doc worker（上下文注入通道）').toBe(true)
      expect(testAnalysis.agentsMarkerInContext, 'AGENTS.md 基线到达 test worker（上下文注入通道）').toBe(true)
      expect(docAnalysis.catalogRunTestsInContext, 'doc worker 技能目录常驻 run-tests 行（skill-catalog 通道）').toBe(true)
      // dev-tf 收窄：worker 工具面 deny 零泄漏（真实 deriveWorkerToolFilter）
      expect(docAnalysis.denyLeak, `doc worker deny 零泄漏（leak=${JSON.stringify(docAnalysis.denyLeak)}）`).toEqual([])
      expect(testAnalysis.denyLeak, `test worker deny 零泄漏（leak=${JSON.stringify(testAnalysis.denyLeak)}）`).toEqual([])
      expect(docAnalysis.workerToolNames?.includes('submitTask') ?? false, 'doc worker 面含 submitTask（矩阵放行）').toBe(true)
      // 按需加载：test 任务加载 run-tests；doc 任务不加载（目录行常驻、内容不加载）
      expect(testAnalysis.runTestsSkillInvoked, 'test worker 调用 run-tests 技能（按需加载发生）').toBe(true)
      expect(docAnalysis.runTestsSkillInvoked, 'doc worker 不调用 run-tests（非测试不加载）').toBe(false)
      // 容器日志：task-spawned 事件携带 toolFilter（dispatchTask 组装面机械证据）
      expect(spawnedLines.some((l) => l.includes('task-spawned')), 'logs/{slug}.jsonl 含 task-spawned 行').toBe(true)
    } finally {
      if (launched !== undefined) await closeM3(launched)
      cleanupProbe(probeParents)
      await rmDirBestEffort(wsRoot).catch(() => undefined)
      await rmDirBestEffort(env.root).catch(() => undefined)
    }
  })
})
