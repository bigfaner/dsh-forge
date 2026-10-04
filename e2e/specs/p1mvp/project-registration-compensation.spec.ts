// @feature:dsh-forge-p1-mvp @web-e2e
// gen-test-scripts 产物 —— Journey: project-registration-compensation（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/contracts/step-{1..5}-*.md
// （eval-contract 1015/1150 通过）。每条 test 对应一个（或一组同链）Contract Outcome。
//
// 故障注入通道（fact FAULT_INJECTION_CONTRACT：e2e 无 setFault 注入缝——③ 应用库写入失败在
// 单测经 INSERT ABORT 触发器实现）：fix-27 起 ws_path 冲突行已被服务面自愈消费（重注册 =
// 幂等成功），本套件同口径切换注入载体——{userData}/state.db 预置 INSERT 触发器
// （better-sqlite3 自 packages/core 依赖闭包解析，schema.ts DDL 核实：idx_projects_ws_path
// UNIQUE + workspace_id UNIQUE——挂接分支 ownership 面经 workspace_id 占位行注入）。
//
// 留痕 skip（通道缺失 = 缺陷信号记账，contract fact-note 原文）：
//   - Step 3b host-cancel-in-window：②③ 间窗口非确定性可命中（启动对账触发缝已由 fix-27 接线）
//   - Step 4b compensation-failure-ledger：④ registry.delete 失败注入无缝（FAULT_INJECTION_CONTRACT）
//   - Step 5 success（补偿重放 no-op）：测试开关通道缺失（delete-unknown-id 幂等语义单测 pin）
//
// 观察通道：registry 探针 = {userData}/dsh-home/storages/workspace.json 直读（探针 3 实测）；
// 应用库直读 = forge:projects/list RPC + state.db（better-sqlite3 经 packages/core 闭包解析）；
// workspaceId = register 返回体。
//
// 复启禁令（gen-scripts 实测纪律）：同一 userData 的第二次 boot 存在产品工作台挂载竞态
//  （官方壳/客户端正常、loader=live，产品插件静默不激活——探针 2/4/6 对照 7 次复现，
//  与引导模态挂载/收起时序相关且非确定性）——本套件全部测试取**单 boot 形态**：
//  前置经 RPC 落地、状态转移经 WAL 活写（busy_timeout）、模态收起置于链路末段（无后续 boot）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..')
const HOST_DIR = join(ROOT, 'apps', 'host')
const electronBinary = createRequire(join(HOST_DIR, 'package.json'))('electron') as unknown as string

// ─── better-sqlite3 最小结构面（e2e 侧无 @types——结构化窄接口） ───
interface MinimalStmt {
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
  run(...args: unknown[]): unknown
}
interface MinimalDb {
  prepare(sql: string): MinimalStmt
  exec(sql: string): unknown
  pragma(source: string): unknown
  close(): unknown
}
const requireFromCore = createRequire(join(ROOT, 'packages', 'core', 'package.json'))
type SqliteCtor = new (path: string) => MinimalDb
const openStateDb = (userData: string): MinimalDb =>
  new (requireFromCore('better-sqlite3') as SqliteCtor)(join(userData, 'state.db'))

/** 工作区候选夹具：{root}/<name>（含哨兵文件供目录保留断言） */
function makeWorkspaceFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-'))
  const dir = join(root, name)
  mkdirSync(join(dir, '.knowledge'), { recursive: true })
  writeFileSync(join(dir, 'keep.txt'), 'sentinel', 'utf8')
  return root
}

/** provider 叠层：llm-pi-ai 面（DeepSeek API-key 引导弹窗预免尝试段；welcome 预免 = 产品 boot overlay 内置，fix-12） */
function writeProviderOverlay(): string {
  const target = join(tmpdir(), `dsh-forge-e2e-provider-${process.pid}-${Math.random().toString(36).slice(2, 8)}.yml`)
  writeFileSync(
    target,
    [
      '# e2e provider 叠层：API-key onboarding 弹窗预免（首启告示预免 = 产品 overlay 内置，fix-12）',
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      zai-coding-cn:',
      '        apiKeyEnv: ZAI_CODING_CN_API_KEY',
      '',
    ].join('\n'),
    'utf8',
  )
  return target
}

async function dismissOnboardingModals(page: Page): Promise<void> {
  // 窗口 30s：模态挂载可晚于工作台可见数十秒（boot 后 kit 收敛）——15s 窗口实测漏收
  const deadline = Date.now() + 30_000
  for (let dismissed = 0; dismissed < 3; dismissed++) {
    const dismissButton = page.locator('[role="dialog"] button', { hasText: /^稍后配置$/ }).first()
    while (!(await dismissButton.isVisible().catch(() => false))) {
      if (Date.now() > deadline) return
      await page.waitForTimeout(500)
    }
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
  }
}

/** UI 走查前置防复发：模态若在收起后再度挂载（晚到），点掉再走（点击面防拦截） */
async function ensureNoBlockingDialog(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const dismissButton = page.locator('[role="dialog"] button', { hasText: /^稍后配置$|^继续$/ }).first()
    if (!(await dismissButton.isVisible().catch(() => false))) return
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
  }
}

interface Launched {
  readonly app: ElectronApplication
  readonly page: Page
  readonly providerOverlay: string
}

/** 同 userData 复启序号（端口错峰——前序 boot 的 dsh child 收尾竞态不占新 boot 端口） */
let bootSeq = 0

/** 关闭宿主并等待主进程退出 + dsh child 级联收尾（句柄/端口复用竞态防护——4.2 探针同源坑） */
async function closeApp(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  await app.close().catch(() => undefined)
  if (proc.exitCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000)
      proc.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}

/** 目录删除重试（句柄释放竞态；终态兜底不掩盖用例结论——mkdtemp 唯一名不外溢） */
async function rmDirBestEffort(dir: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // 残留兜底（句柄长期占用）——不掩盖用例结论
  }
}

/**
 * 启动薄宿主（同一 userData 可复启——补偿/对账场景的重启载体）。
 * dismiss = 是否收起官方首启引导模态：任何形式的收起（点击「稍后配置」/Esc）都会写
 * dsh 侧客户态（设置写路径 quirk 家族），实证导致同 userData 的下一 boot 产品工作台
 * 不挂载（探针 4 对照：不收模态 = 复启正常）——因此**仅链路最后一个 UI boot** 允许
 * dismiss=true；RPC-only boot 保持 false（模态在场不阻塞 evaluate/RPC，仅拦截指针）。
 */
async function launch(userData: string, options?: { readonly dismiss?: boolean }): Promise<Launched> {
  const dismiss = options?.dismiss ?? true
  const { _electron } = await import('@playwright/test')
  const providerOverlay = writeProviderOverlay()
  const port = 19830 + (process.pid % 150) + (bootSeq++ % 20)
  const app = await _electron.launch({
    executablePath: electronBinary,
    args: ['.'],
    cwd: HOST_DIR,
    env: {
      ...process.env,
      DSH_FORGE_DEV_PROFILE: 'dev',
      DSH_FORGE_PATCH_FILES: providerOverlay,
      DSH_FORGE_USER_DATA: userData,
      DSH_FORGE_PORT: String(port),
      DSH_FORGE_DIRECTORY_PICKER: 'off', // fix-14：向导走查归回退面（OS 对话框不可 e2e——preload 桥降级开关）
    } as Record<string, string>,
  })
  const page = await app.firstWindow()
  const consoleLogs: string[] = []
  page.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`
    consoleLogs.push(text.slice(0, 300))
    if (consoleLogs.length > 60) consoleLogs.shift()
  })
  await page.waitForFunction(
    () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: 60_000 },
  )
  await page.waitForFunction(
    () => {
      const g = globalThis as { __ModuleLoader__?: { mode: string }; __DSH_FORGE_CLIENT__?: unknown }
      return g.__ModuleLoader__?.mode === 'live' && g.__DSH_FORGE_CLIENT__ !== undefined
    },
    undefined,
    { timeout: 90_000 },
  )
  await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 60_000 })
  if (dismiss) await dismissOnboardingModals(page)
  // 相位稳定门（复启链路上 settling 收敛偶有慢尾——60s 采样轮询 + 逐拍留痕）
  const settleDeadline = Date.now() + 60_000
  for (;;) {
    const probe = await page.evaluate(() => ({
      phase: document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase') ?? null,
      workbenchCount: document.querySelectorAll('[data-dswf-workbench]').length,
      bodyText: document.body.innerText.slice(0, 200),
      rootHtmlLen: document.getElementById('root')?.innerHTML.length ?? -1,
      clientLive: (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ !== undefined,
      loaderMode: (globalThis as { __ModuleLoader__?: { mode: string } }).__ModuleLoader__?.mode ?? null,
    }))
    if (probe.phase === 'hero' || probe.phase === 'session') break
    if (Date.now() > settleDeadline) {
      throw new Error(
        `相位稳定超时（60s）：phase=${String(probe.phase)} workbench=${String(probe.workbenchCount)} clientLive=${String(probe.clientLive)} loader=${String(probe.loaderMode)} rootLen=${String(probe.rootHtmlLen)} windows=${String(app.windows().length)} body=${probe.bodyText}\nconsoleTail=${consoleLogs.slice(-25).join(' || ')}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  return { app, page, providerOverlay }
}

function dirRow(page: Page, name: string): ReturnType<Page['locator']> {
  // 边界口径（探针 7 实测）：「已注册」标记与目录名零空白拼接（行文本 = "comp-a已注册"），
  // 尾界放宽为 空白|行尾|非名字字符（防 'Local' 误中 'LocalLow' 的前缀碰撞保持不变）
  return page.locator('.dswf-fb-item', { hasText: new RegExp(`(?:^|\\s)${name}(?=\\s|$|[^\\w.-])`) }).first()
}

async function enterDir(page: Page, name: string): Promise<void> {
  await dirRow(page, name).dblclick()
  await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(name, { timeout: 15_000 })
}

async function forgeInvoke<T>(page: Page, channel: string, payload?: unknown): Promise<T> {
  const data = await page.evaluate(async ({ ch, args }) => {
    const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> } }).dshForge
    if (forge === undefined) throw new Error('dshForge preload 面缺席')
    const envelope = await forge.invoke(ch, args)
    if (!envelope.ok) throw new Error(`forge RPC ${ch} 失败：${JSON.stringify(envelope)}`)
    return envelope.data
  }, { ch: channel, args: payload })
  return data as T
}

interface ProjectSummaryLike {
  readonly id: string
  readonly name: string
  readonly wsPath: string
  readonly workspaceId: string
}

interface RegisterResultLike {
  readonly projectId: string
  readonly workspaceId: string
  readonly attachedToExisting: boolean
  readonly compensated?: { readonly workspaceId: string; readonly reason: string }
}

/** UI 走查注册指定工作区目录（两段式全链——返回表单终态后续由调用侧断言） */
async function registerViaUi(page: Page, fixtureRoot: string, dirName: string): Promise<void> {
  await ensureNoBlockingDialog(page)
  await page.locator('[data-dswf-nav="add-project"]').first().click()
  await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]')).toBeVisible()
  for (const segment of ['AppData', 'Local', 'Temp']) {
    await enterDir(page, segment)
  }
  await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
  await dirRow(page, dirName).click()
  await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
  await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()
  await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
}

/** fix-27 后 ③ 应用库写入失败注入载体：INSERT 触发器恒 ABORT——ws_path 冲突行已被服务面
 *  自愈消费（重注册 = 幂等成功），补偿链失败源改经触发器注入（单测 failProjectInserts 同
 *  口径；WAL 活写兼容 app 在场） */
function installInsertFailure(userData: string): void {
  const db = openStateDb(userData)
  try {
    db.pragma('busy_timeout = 5000')
    db.exec(
      `CREATE TRIGGER IF NOT EXISTS e2e_fail_projects_insert BEFORE INSERT ON projects BEGIN SELECT RAISE(ABORT, 'e2e 注入：③ 应用库写入失败'); END`,
    )
  } finally {
    db.close()
  }
}

/** 注入复位（DROP TRIGGER——「上一次已完整补偿」的干净前置） */
function removeInsertFailure(userData: string): void {
  const db = openStateDb(userData)
  try {
    db.pragma('busy_timeout = 5000')
    db.exec('DROP TRIGGER IF EXISTS e2e_fail_projects_insert')
  } finally {
    db.close()
  }
}

/** 预置 workspace_id 占位行（挂接分支 ③ 失败注入载体——fix-27 后 ws_path 冲突面已自愈，
 *  唯一残余冲突 = workspace_id UNIQUE：他行占住既有工作区 id；路径随机错开不进左栏） */
function seedWorkspaceIdConflictRow(userData: string, workspaceId: string): void {
  const db = openStateDb(userData)
  try {
    db.pragma('busy_timeout = 5000')
    const other = `Z:\\dsh-forge-e2e-other-${Math.random().toString(36).slice(2, 10)}`
    db
      .prepare(
        `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, archived, created_at, updated_at)
         VALUES (?, ?, ?, 'seed-own', ?, 0, ?, 0, ?, ?)`,
      )
      .run(
        `seed-${Math.random().toString(36).slice(2, 10)}`,
        workspaceId,
        other,
        `${other}\\.forge`,
        `${other}\\.knowledge`,
        new Date().toISOString(),
        new Date().toISOString(),
      )
  } finally {
    db.close()
  }
}

// ─── registry 探针（dsh 官方持久化面直读——探针 3 实测：{dshHome}/storages/workspace.json） ───
// 注：不経 composer 工作区菜单探针——菜单交互会污染 dsh 侧客户态，同 userData 复启链路上
// 实证导致下一 boot 工作台不挂载（探针 2/冒烟对照）；文件直读零交互零状态变更。

/** registry 持久化文本（缺席 = 空串——零注册态） */
function registryFileText(dshHome: string): string {
  const file = join(dshHome, 'storages', 'workspace.json')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** registry 是否含指定 canonical path（JSON 转义双向容错） */
function registryContains(dshHome: string, wsPath: string): boolean {
  const text = registryFileText(dshHome)
  return text.includes(wsPath) || text.includes(wsPath.replaceAll('\\', '\\\\'))
}

/** registry 文本快照（前后比对 = 「registry 不变」断言的载体——挂接分支不写 registry） */
function registrySnapshot(dshHome: string): string {
  return registryFileText(dshHome)
}

// ─────────────────────────────────────────────────────────────────────────────
// 旅程冒烟：新建注册成功（Step1/2）→ ③注入失败补偿（Step3/4）→ 重试成功（Step5b）→ 孤儿=0
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·冒烟：③写入失败 → ④补偿删除 → 失败反馈 → 重试成功孤儿归零', async () => {
  test.setTimeout(600_000)
  const fixtureRoot = makeWorkspaceFixture('comp-a')
  mkdirSync(join(fixtureRoot, 'comp-b'), { recursive: true })
  writeFileSync(join(fixtureRoot, 'comp-b', 'keep.txt'), 'sentinel', 'utf8')
  const dirA = join(fixtureRoot, 'comp-a')
  const dirB = join(fixtureRoot, 'comp-b')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-ud-'))
  let launched: Launched | undefined
  try {
    // ── 单 boot 链路（同 userData 复启在实测中存在产品工作台挂载竞态——见文件头注）：
    //    RPC 前置（模态在场不阻塞 evaluate）→ WAL 活写注入 → 收模态 → UI 走查 ──

    // Step 1/2 success：①预检未命中 = 新建分支 → ②dsh create + 补偿登记（RPC 面）
    launched = await launch(userData, { dismiss: false })
    const first = await forgeInvoke<RegisterResultLike>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'comp-a',
      forgeDir: `${dirA}\\.forge`,
      knowledgeDir: `${dirA}\\.knowledge`,
    })
    expect(first.attachedToExisting, '①预检未命中 = 新建分支（非挂接）').toBe(false)
    expect(first.workspaceId, '②workspaceId 在场（uuid——应用库外键素材）').toBeTruthy()
    expect(registryContains(join(userData, 'dsh-home'), dirA), '②dsh create 落地：registry 含新工作区').toBe(true)

    // 注入：WAL 活写预置 INSERT ABORT 触发器（③ INSERT 必失败——单测同口径；fix-27 后
    // ws_path 冲突行已被自愈面消费，注入载体改触发器）
    installInsertFailure(userData)

    // 收模态（boot 内唯一 dismiss——链路无后续 boot，毒化面不适用）
    await dismissOnboardingModals(launched.page)

    // Step 3/4 success：③应用库写入失败 → ④补偿自动执行 → 失败反馈
    await registerViaUi(launched.page, fixtureRoot, 'comp-b')
    const failure = launched.page.locator('.dswf-ap[data-dswf-ap="failure"]')
    await expect(failure, '失败反馈（UF-3 失败态）').toBeVisible({ timeout: 30_000 })
    await expect(failure).toContainText('注册失败')
    await expect(failure, '补偿结果说明在场（④=registry.delete 补偿已执行）').toContainText('补偿')
    // fix-28 typed code 过桥保真：标题命中 ERR_PROJECT_WRITE(compensated) 分支文案——
    // 桥灭失期标题恒落「注册失败（未预期错误）」默认分支（「注册失败」Tag 常驻，旧断言
    // 不具判别力；补偿细节旧由 .dswf-ap-raw 原始 message 文本携带）
    await expect(failure.locator('.dswf-ap-feedback-title')).toHaveText('应用库写入失败（补偿已执行）')
    // Step 3 Output 终态：该路径无注册（registry 探针）+ 应用侧无残留 + 目录与日志保留
    expect(registryContains(join(userData, 'dsh-home'), dirB), '④补偿后 registry 无 comp-b（孤儿 = 0）').toBe(false)
    await expect(launched.page.locator('.dswf-sidebar-project', { hasText: 'comp-b' })).toHaveCount(0)
    expect(existsSync(join(dirB, 'keep.txt')), '补偿只删注册记录——工作区目录保留').toBe(true)
    // 失败态可关闭退出（事后关闭非取消）
    await launched.page.locator('.dswf-ap-dismiss', { hasText: '关闭' }).first().click()
    await expect(launched.page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })

    // 注入复位：WAL 活删触发器（「上一次已完整补偿」的干净前置——5b 前提）
    removeInsertFailure(userData)

    // Step 5b retry-registration-same-path：补偿后重注册同一路径成功
    await registerViaUi(launched.page, fixtureRoot, 'comp-b')
    await expect(launched.page.locator('.dswf-ap[data-dswf-ap="success"]')).toBeVisible({ timeout: 30_000 })
    await expect(launched.page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
    expect(registryContains(join(userData, 'dsh-home'), dirB), '重试成功：registry 重新含 comp-b').toBe(true)
    await expect(launched.page.locator('.dswf-sidebar-project', { hasText: 'comp-b' }).first()).toBeVisible({ timeout: 30_000 })
    const projects = await forgeInvoke<readonly ProjectSummaryLike[]>(launched.page, 'forge:projects/list')
    const compB = projects.filter((p) => p.wsPath === dirB)
    expect(compB, '重试落库恰一行').toHaveLength(1)
    expect(compB[0]!.workspaceId, '外键一致（registry 按 path 反查同 id）').toBeTruthy()
    // 场景终态孤儿 = 0（全流程后 dsh 侧注册与挂接一一对应）
    expect(registryContains(join(userData, 'dsh-home'), dirA)).toBe(true)
    expect(registryContains(join(userData, 'dsh-home'), dirB)).toBe(true)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.providerOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 "attach-branch-selected" + Step 2 "create-idempotent-existing-path"
// （挂接分支判定 + registry 幂等）。挂接可达前置 = registry 在场 / 应用库零行
// （两侧均在场的重复登记走 ③ 冲突失败——ownership 保护，归 Step3c）——删应用侧行预置。
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·Step1/2 attach-branch + create-idempotent：同路径复注册幂等挂接', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = makeWorkspaceFixture('idem-a')
  const dirA = join(fixtureRoot, 'idem-a')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-ud-'))
  let launched: Launched | undefined
  try {
    // 单 boot：新建注册（RPC）→ WAL 活删应用侧行（预置挂接态）→ 收模态 → UI 挂接走查
    launched = await launch(userData, { dismiss: false })
    const first = await forgeInvoke<RegisterResultLike>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'idem-a',
      forgeDir: `${dirA}\\.forge`,
      knowledgeDir: `${dirA}\\.knowledge`,
    })
    expect(first.attachedToExisting, '①预检未命中 = 新建分支').toBe(false)
    const registryBefore = registrySnapshot(join(userData, 'dsh-home'))
    // WAL 活删应用侧行（registry 保留——②幂等实体验证锚；挂接可达前置 = 应用库零行）
    {
      const db = openStateDb(userData)
      try {
        db.pragma('busy_timeout = 5000')
        db.prepare('DELETE FROM projects WHERE ws_path = ?').run(dirA)
      } finally {
        db.close()
      }
    }
    await dismissOnboardingModals(launched.page)

    // 同一 canonical path 再次注册（UI——注册成功回调锚刷新工作台）
    await registerViaUi(launched.page, fixtureRoot, 'idem-a')
    // ①预检命中 → 挂接分支（②create 整步跳过——幂等返回既有实体、不登记补偿）
    await expect(launched.page.locator('.dswf-ap[data-dswf-ap="success"]')).toContainText('已挂接既有工作区', { timeout: 30_000 })
    await expect(launched.page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
    // State：registry 不变（挂接零写）+ 应用库恰一行（挂接既有外键）
    expect(registrySnapshot(join(userData, 'dsh-home')), '挂接不写 registry（文件零变更）').toBe(registryBefore)
    const projects = await forgeInvoke<readonly ProjectSummaryLike[]>(launched.page, 'forge:projects/list')
    expect(projects.filter((p) => p.wsPath === dirA), '挂接登记恰一行').toHaveLength(1)
    expect(projects[0]!.workspaceId, '同路径幂等：workspaceId 稳定不变（既有实体返回）').toBe(first.workspaceId)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.providerOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 Outcome "existing-workspace-protected"（journey Step 3c：ownership 保护）
// 注：fix-27 起同路径既有注册的二次登记 = 幂等成功（attachExistingRow 按 ws_path 消费
// 在场行——自愈防御，不再炸 ws_path UNIQUE），挂接分支 ③ 失败的可达注入 = workspace_id
// UNIQUE 占位行（他行占住既有工作区 id）。**占位前须活删 own-a 应用侧行**（挂接可达
// 前置 = 应用库零行，同 Step1/2 口径）：fix-28 走查实证 fix-27 版缺此删——seed 自撞
// UNIQUE(workspace_id) 恒红（own-a 行已持同 id），且不删则重注册幂等成功永不达 ③。
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·Step3c existing-workspace-protected：挂接分支失败不误删既有', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = makeWorkspaceFixture('own-a')
  const dirA = join(fixtureRoot, 'own-a')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-ud-'))
  let launched: Launched | undefined
  try {
    // 单 boot：既有注册（RPC）→ WAL 活删 own-a 应用侧行（挂接可达前置——attachExistingRow
    // 幂等面按 ws_path 消费在场行，不删则重注册幂等成功永不达 ③）→ WAL 活写 workspace_id
    // 占位行（挂接分支上的 ③ 失败源——路径随机错开：占位行不进左栏、不与 dirA 抢 ws_path）
    launched = await launch(userData, { dismiss: false })
    const first = await forgeInvoke<RegisterResultLike>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'own-a',
      forgeDir: `${dirA}\\.forge`,
      knowledgeDir: `${dirA}\\.knowledge`,
    })
    expect(first.attachedToExisting).toBe(false)
    {
      const db = openStateDb(userData)
      try {
        db.pragma('busy_timeout = 5000')
        db.prepare('DELETE FROM projects WHERE ws_path = ?').run(dirA)
      } finally {
        db.close()
      }
    }
    seedWorkspaceIdConflictRow(userData, first.workspaceId)
    const registryBefore = registrySnapshot(join(userData, 'dsh-home'))
    await dismissOnboardingModals(launched.page)

    // 行使：注册同一既有路径 → ①命中（挂接，无补偿登记）→ ③写入失败（workspace_id 冲突）
    await registerViaUi(launched.page, fixtureRoot, 'own-a')
    const failure = launched.page.locator('.dswf-ap[data-dswf-ap="failure"]')
    await expect(failure, '挂接分支上的失败反馈在场').toBeVisible({ timeout: 30_000 })
    // fix-28 typed code 过桥保真：挂接分支 ③ 失败 = ERR_PROJECT_WRITE 无补偿——标题命中
    // 「挂接既有，未补偿」分支（非默认「未预期错误」分支）
    await expect(failure.locator('.dswf-ap-feedback-title')).toHaveText('应用库写入失败（挂接既有，未补偿）')
    // Output：既有工作区不被删除——registry 探针断言既有注册仍在（幂等命中不误删）
    expect(
      registryContains(join(userData, 'dsh-home'), dirA),
      'ownership 保护：既有工作区注册保持（幂等命中不误删）',
    ).toBe(true)
    expect(existsSync(join(dirA, 'keep.txt')), '工作区目录与内容不受波及').toBe(true)
    // State：挂接分支零补偿（registry 文本不变——delete 零调用）+ 应用侧本次登记未落库
    expect(registrySnapshot(join(userData, 'dsh-home')), '补偿 delete 零调用（registry 文本不变）').toBe(registryBefore)
    const projects = await forgeInvoke<readonly ProjectSummaryLike[]>(launched.page, 'forge:projects/list')
    expect(
      projects.filter((p) => p.wsPath === dirA),
      '挂接分支失败 = 本次登记未落库（own-a 行已为挂接前置活删）',
    ).toHaveLength(0)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.providerOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 Outcome "drift-repair-on-startup"（journey Step 5c：引用漂移修复）
// 注记：fact RECONCILE_NOT_AUTO_INVOKED 已由 fix-27 解除（boot 链接线 main.ts——启动期
// 自动触发）；本测试保留单 boot 口径（漂移后置注入 + 通道显式触发），boot 期自动修复
// 由下方 fix-27 专项测试覆盖（双 boot：悬空引用夹具 → 启动即修）。
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·Step5c drift-repair-on-startup：失配按 path 找回（通道显式触发）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = makeWorkspaceFixture('drift-a')
  const dirA = join(fixtureRoot, 'drift-a')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-ud-'))
  let launched: Launched | undefined
  try {
    // 单 boot（RPC-only）：正常注册 → WAL 活写漂移 → reconcile 通道显式行使
    launched = await launch(userData, { dismiss: false })
    const first = await forgeInvoke<RegisterResultLike>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'drift-a',
      forgeDir: `${dirA}\\.forge`,
      knowledgeDir: `${dirA}\\.knowledge`,
    })
    const projects1 = await forgeInvoke<readonly ProjectSummaryLike[]>(launched.page, 'forge:projects/list')
    const projectId = projects1.find((p) => p.wsPath === dirA)!.id

    // 漂移预置（注入契约）：projects.workspace_id 与 registry 实际注册失配
    {
      const db = openStateDb(userData)
      try {
        db.pragma('busy_timeout = 5000')
        const res = db.prepare('UPDATE projects SET workspace_id = ? WHERE id = ?').run('bogus-workspace-id', projectId)
        expect(res, '漂移预置生效（UPDATE 命中）').toBeTruthy()
      } finally {
        db.close()
      }
    }

    // Input「重启应用」注记：fix-27 起启动对账已接线（boot 期自动触发）；本测试漂移为
    // boot 后注入（自动对账已先行跑过）——经已暴露通道 forge:projects/reconcile 显式
    // 行使对账语义（boot 期自动修复归下方 fix-27 专项测试）。
    const report = await forgeInvoke<{ repaired: readonly unknown[]; orphans: readonly unknown[] }>(
      launched.page,
      'forge:projects/reconcile',
    )
    expect(report.repaired, '对账报告含 repaired 条目（失配按 path 找回）').toHaveLength(1)
    // State：projects 行 workspace_id 更新为按 ws_path 找回的注册 id（单向修引用）
    const project = await forgeInvoke<{ id: string; workspaceId: string } | null>(launched.page, 'forge:projects/get', { id: projectId })
    expect(project, '项目记录在场').not.toBeNull()
    expect(project!.workspaceId, '引用修复 = registry 按 ws_path 反查的实际 id').toBe(first.workspaceId)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.providerOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 Outcome "no-drift-startup-silent"（对账提示特异性反断言——防 vacuous-pass）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·Step5d no-drift-startup-silent：一致终态对账静默通过', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeWorkspaceFixture('silent-a')
  const dirA = join(fixtureRoot, 'silent-a')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-ud-'))
  let launched: Launched | undefined
  try {
    // 单 boot（RPC-only）：一致终态（注册即一致）→ 对账报告双空（口径同 5c 头注）
    launched = await launch(userData, { dismiss: false })
    await forgeInvoke<RegisterResultLike>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'silent-a',
      forgeDir: `${dirA}\\.forge`,
      knowledgeDir: `${dirA}\\.knowledge`,
    })
    const report = await forgeInvoke<{ repaired: readonly unknown[]; orphans: readonly unknown[] }>(
      launched.page,
      'forge:projects/reconcile',
    )
    expect(report.repaired, '无失配 = 零修复条目').toHaveLength(0)
    expect(report.orphans, '无孤儿 = 零提示条目').toHaveLength(0)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.providerOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// fix-27 专项（任务验收 1/2/4）：boot 接线启动对账 + register 链自愈/幂等——
// 悬空引用夹具（行指向不存在 workspaceId，走查人 Z:\learn 同型）→ 重启 boot 即修 →
// 重复注册 = 幂等成功（不炸、不删工作区、返回既有项目）。
// 双 boot 形态：两次 boot 均 dismiss:false（「不收模态 = 复启正常」探针口径——文件头注）。
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·fix-27 boot 自愈 + 重注册幂等：悬空引用启动即修 → 重复注册幂等成功', async () => {
  test.setTimeout(600_000)
  const fixtureRoot = makeWorkspaceFixture('fix27-a')
  const dirA = join(fixtureRoot, 'fix27-a')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-ud-'))
  let launched: Launched | undefined
  try {
    // boot 1（RPC-only，不收模态）：正常注册建立基线（registry 实体 + 应用侧行）
    launched = await launch(userData, { dismiss: false })
    const first = await forgeInvoke<RegisterResultLike>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'fix27-a',
      forgeDir: `${dirA}\\.forge`,
      knowledgeDir: `${dirA}\\.knowledge`,
    })
    const projects1 = await forgeInvoke<readonly ProjectSummaryLike[]>(launched.page, 'forge:projects/list')
    const projectId = projects1.find((p) => p.wsPath === dirA)!.id
    await closeApp(launched.app)
    rmSync(launched.providerOverlay, { force: true })
    launched = undefined

    // 悬空引用夹具（app 关闭后直写——行指向不存在 workspaceId，fix-18 home 翻转遗留同型）
    {
      const db = openStateDb(userData)
      try {
        db.pragma('busy_timeout = 5000')
        const res = db.prepare('UPDATE projects SET workspace_id = ? WHERE id = ?').run('bogus-workspace-id', projectId)
        expect(res, '悬空夹具生效（UPDATE 命中）').toBeTruthy()
      } finally {
        db.close()
      }
    }

    // boot 2：启动对账接线（fix-27 main.ts boot 面 fire-and-forget）→ 引用启动即修
    launched = await launch(userData, { dismiss: false })
    const deadline = Date.now() + 60_000
    let repaired: { readonly workspaceId: string } | undefined
    for (;;) {
      const probe = await forgeInvoke<{ id: string; workspaceId: string } | null>(launched.page, 'forge:projects/get', { id: projectId })
      if (probe !== null && probe.workspaceId === first.workspaceId) {
        repaired = probe
        break
      }
      if (Date.now() > deadline) throw new Error('boot 启动对账超时（60s）：悬空引用未修复')
      await new Promise((done) => setTimeout(done, 2_000))
    }
    expect(repaired.workspaceId, '悬空引用 boot 即修（relinked——registry 按 ws_path 找回原实体）').toBe(first.workspaceId)
    // 对账记账在场（relink = 关键一致性事件 → warn 单条，scope=reconcile）
    {
      const db = openStateDb(userData)
      try {
        db.pragma('busy_timeout = 5000')
        const row = db
          .prepare(`SELECT COUNT(*) AS n FROM app_key_logs WHERE scope = 'reconcile' AND level = 'warn'`)
          .get() as { n: number }
        expect(row.n, '对账修复记账在场（relinked warn）').toBeGreaterThanOrEqual(1)
      } finally {
        db.close()
      }
    }

    // 重复注册 = 幂等成功（fix-27 自愈防御：健康行 → 既有项目返回，不炸 UNIQUE、不删工作区）
    const again = await forgeInvoke<RegisterResultLike>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'fix27-a',
      forgeDir: `${dirA}\\.forge`,
      knowledgeDir: `${dirA}\\.knowledge`,
    })
    expect(again, '重注册幂等成功（返回既有项目）').toMatchObject({
      projectId,
      workspaceId: first.workspaceId,
      attachedToExisting: true,
    })
    expect(again.compensated, '幂等成功零补偿').toBeUndefined()
    // 终态：应用库恰一行 + registry 实体保持（不删）
    const projects2 = await forgeInvoke<readonly ProjectSummaryLike[]>(launched.page, 'forge:projects/list')
    expect(projects2.filter((p) => p.wsPath === dirA), '重注册不落第二行').toHaveLength(1)
    expect(registryContains(join(userData, 'dsh-home'), dirA), '既有工作区注册保持（幂等不删）').toBe(true)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.providerOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 留痕 skip：注入/触发通道缺失（缺陷信号记账——转正条件 = 缝落地）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·Step3b host-cancel-in-window（留痕 skip）', async () => {
  test.skip(
    true,
    '②③ 间流程窗口（毫秒级本地链）非确定性可命中，且宿主级中断注入缝缺失（启动对账触发缝已由 fix-27 接线，取消窗口注入仍无通道）——留痕 skip，转正条件 = 注入缝落地',
  )
})

test('@web-e2e @p1mvp compensation·Step4b compensation-failure-ledger（留痕 skip）', async () => {
  test.skip(
    true,
    '④ registry.delete 失败注入通道缺失（fact FAULT_INJECTION_CONTRACT：e2e 无故障注入设施）——留痕 skip，转正条件 = 注入缝落地（记账日志/对账提示断言随缝转正）',
  )
})

test('@web-e2e @p1mvp compensation·Step5 success 补偿重放 no-op（留痕 skip）', async () => {
  test.skip(
    true,
    '对同一 workspaceId 重放补偿的测试开关通道缺失（fact FAULT_INJECTION_CONTRACT）；delete-unknown-id 幂等语义由 core 单测 pin——留痕 skip',
  )
})
