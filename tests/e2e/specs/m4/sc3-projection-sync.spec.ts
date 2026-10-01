// @feature dsh-forge-m4 | @web-e2e | @journey forge-m4-sc3
// Traceability: docs/features/dsh-forge-m4/tasks/3.6-sc3-sync-e2e.md
// Authorities: tech-design §Testing Strategy·Key Test Scenarios(SC3 前半)、
// §Interfaces·Interface 2(投影通道 + 会话归组零代码 = DF002 原生承载)、
// prd-spec §Success Criteria SC3、§归档与删除语义(必答⑤ 三行表)、
// prd-user-stories Story 4/Story 5、BIZ-workbench-006(归档 ≠ 删除)。
//
// SC3 前半(同步语义)e2e 腿 —— 单向投影四操作在真链上的实况断言:
//
//   语料    ≥3 项目锚点 + 每锚一个「派发会话」语料(2.9 纪律:dispatch 通道
//           是 stub,真核心会话经 REAL session-persistence 预种 —— 派发会话
//           以 cwd=anchor 的语料承载,SESS_GAMMA 用正斜杠写法考 canonical
//           折叠)。host child boot 期 workspaceRegistry bootstrap 按 canonical
//           cwd 归组(DF002 原生承载,零 forge 代码)。
//   ① 注册同名同序:3 项目经真动词 registerProject v2 注册(内核 hook →
//           projection_push_required → renderer relay → 上游四动词)→ 实况
//           workspace 快照 = forge 项目列表同名且顺序一致(sort_order 权威)。
//   ② 改名同步:左栏 ⋯ 菜单行内编辑(3.5 C8 GUI 入口)→ dsh 侧同名。
//   ③ 归档语义:⋯ 菜单 归档 + 确认 Dialog(必答⑤ copy 断言)→ dsh 侧
//           workspace 保留(title/path/sessionIds/序全不变)+ 会话仍按项目
//           分组;forge 侧项目入归档分区且项目会话列表不再展示。
//   ④ 删除语义:归档行 ⋯ 删除 + 确认 Dialog → dsh 侧 workspace 移除;会话
//           退未分组(任何 workspace sessionIds 均不含)+ 历史不删除(会话
//           artifact 经 REAL backend 二次可读);forge 树未分组块呈现该会话。
//   ⑤ 派发归组:SESS_GAMMA(cwd=anchor 正斜杠写法)在实况 registry 归组到
//           对应 workspace(sessionIds 命中)+ forge 树项目组行在座且未分组
//           不含之(归组生效)。
//
// 实况断言取数(Hard Rule:实况 = dsh 侧 workspace 快照,非 forge 侧状态行)
//   = 原生 registry 读 —— `$DSH_HOME/storages/workspace.json`(storage-json
//   single-layout KV unit `workspace`:global.workspaceIds = 注册表序权威,
//   tables.workspaces[id] = { path, title, sessionIds };宿主单写者原子重写,
//   测试进程读 = 同源实况,relay follow 流物化的 durable 面)。「手改不回流」
//   断言归 3.7(偏差/降级腿),本腿不触。
//
// 实例锁纪律(Hard Rule):launch 前 assertNoActiveDshForgeInstances。

import { rmSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { readCorpusSession, seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import { bridgeInvoke, captureMainStdout, freshRoot, normPath } from '../_lib/journey-world.ts'
import type { PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'

// ---------------------------------------------------------------------------
// The corpus vocabulary (3 project anchors + their dispatched-session seeds)
// ---------------------------------------------------------------------------

/** 注册序(= sort_order 权威)下的三项目语料:锚点目录名 + 期望展示名。 */
const PROJECTS = [
  { dir: 'repo-alpha', displayName: 'sc3-project-alpha' },
  { dir: 'repo-beta', displayName: 'sc3-project-beta' },
  { dir: 'repo-gamma', displayName: 'sc3-project-gamma' },
] as const

const ALPHA = 0
const BETA = 1
const GAMMA = 2

/** 改名腿的新名(② 的断言目标;≠ 目录 basename,同名断言才有效力)。 */
const ALPHA_RENAMED = 'sc3-alpha-renamed'

/** 派发会话语料 id(2.9 纪律:真核心 artifact,dispatch 通道 stub 的替身)。 */
const SESS_ALPHA = 'sc3-sess-alpha'
const SESS_BETA = 'sc3-sess-beta'
/** gamma 会话 = ⑤ 的 DF002 语料:cwd 用正斜杠写法,考 canonical 折叠归组。 */
const SESS_GAMMA = 'sc3-sess-gamma'

// ---------------------------------------------------------------------------
// The live native registry reader ($DSH_HOME/storages/workspace.json — the
// host child's single-writer durable medium; relay follow 流同源实况)
// ---------------------------------------------------------------------------

/** 实况 workspace 行(注册表序中的消费面三列 + 归组账)。 */
interface LiveWorkspaceRow {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly string[]
}

/** 一次实况读取(缺文件 = null:bootstrap 未落笔)。 */
interface LiveRegistry {
  readonly initialized: boolean
  /** global.workspaceIds 序(注册表序权威)物化的行序列。 */
  readonly order: readonly LiveWorkspaceRow[]
}

/** path 折叠键(与 seat 的 codeRoot↔workspace.path 配对同口径:小写 + 正斜杠)。 */
const foldPath = (path: string): string => normPath(path).toLowerCase().replace(/\/+$/, '')

/** 读实况注册表(原子重写的 durable 面;文件缺席 = null)。 */
function readLiveRegistry(dshHome: string): LiveRegistry | null {
  const file = join(dshHome, 'storages', 'workspace.json')
  if (!existsSync(file)) return null
  let parsed: {
    unit?: { name?: string }
    global?: { initialized?: boolean; workspaceIds?: string[] } | null
    tables?: { workspaces?: Record<string, { path: string; title: string; sessionIds: string[] }> } | null
  }
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as typeof parsed
  } catch {
    return null // 原子重写窗口的旧/新完整文档之外不该有形态;防御读取面
  }
  if (parsed.unit?.name !== 'workspace') return null
  const records = parsed.tables?.workspaces ?? {}
  const order = (parsed.global?.workspaceIds ?? [])
    .map(id => {
      const record = records[id]
      return record === undefined ? undefined : { workspaceId: id, ...record, sessionIds: [...record.sessionIds] }
    })
    .filter((row): row is LiveWorkspaceRow => row !== undefined)
  return { initialized: parsed.global?.initialized === true, order }
}

/** 轮询实况直到谓词成立(投影 push → relay → 上游动词 → durable 落笔全异步)。 */
async function waitForRegistry(
  page: Page, dshHome: string,
  predicate: (registry: LiveRegistry) => boolean,
  label: string, timeoutMs = 20_000,
): Promise<LiveRegistry> {
  for (let attempt = 0; attempt < Math.ceil(timeoutMs / 200); attempt += 1) {
    const registry = readLiveRegistry(dshHome)
    if (registry !== null && predicate(registry)) return registry
    await page.waitForTimeout(200)
  }
  const last = readLiveRegistry(dshHome)
  throw new Error(`live workspace registry never reached: ${label} — last read ${JSON.stringify(last)}`)
}

/** 实况内按锚点路径定位行(canonical 折叠匹配;缺 = undefined)。 */
const rowAtAnchor = (registry: LiveRegistry, anchor: string): LiveWorkspaceRow | undefined =>
  registry.order.find(row => foldPath(row.path) === foldPath(anchor))

// ---------------------------------------------------------------------------
// Renderer helpers (tree faces + C8 lifecycle GUI entry points + onboarding)
// ---------------------------------------------------------------------------

/**
 * Dismiss the upstream onboarding modal CHAIN(sc7 同款:隔离 DSH_HOME 的首启
 * 链,到达时刻不定;排除 forge 自有 DialogFrame 与任务详情 dock)。 Opportunistic:
 * absent = no-op.
 */
async function dismissOnboarding(page: Page): Promise<void> {
  const acted = await page.evaluate(() => {
    const modal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([data-dsh-forge-dialog])')]
      .find(candidate => candidate.closest('[data-dsh-forge-task-detail]') === null)
    if (modal === undefined) return false
    const buttons = [...modal.querySelectorAll('button')]
    const defer = buttons.find(button => /稍后|跳过|以后|skip|later/i.test(button.textContent ?? ''))
    const target = defer ?? buttons[buttons.length - 1]
    if (target === undefined) return false
    ;(target as HTMLElement).click()
    return true
  }).catch(() => false)
  void acted
}

/** The onboarding chain's background dismisser(sc7 同款;forge 对话框不受扰)。 */
function startAutoDismiss(page: Page): () => void {
  let stopped = false
  void (async () => {
    while (!stopped) {
      await dismissOnboarding(page).catch(() => {})
      await page.waitForTimeout(500).catch(() => {})
    }
  })()
  return () => { stopped = true }
}

/** One project tree row's session ids(the keyed block wrapper scoping)。 */
async function sessionsInProjectBlock(page: Page, projectId: string): Promise<string[]> {
  return await page.evaluate((id: string) => {
    const row = document.querySelector(`[data-dsh-forge-tree-project="${id}"]`)
      ?? document.querySelector(`[data-dsh-forge-tree-archived-row="${id}"]`)
    if (row === null) return null
    const block = row.parentElement
    if (block === null) return []
    return [...block.querySelectorAll('[data-dsh-forge-tree-session]')]
      .map(el => el.getAttribute('data-dsh-forge-tree-session') ?? '')
  }, projectId)
}

/** The 未分组 block's session ids(块缺席 = null:仅在块在场时有意义)。 */
async function ungroupedSessionIds(page: Page): Promise<string[] | null> {
  return await page.evaluate(() => {
    const header = document.querySelector('[data-dsh-forge-tree-ungrouped]')
    if (header === null) return null
    const block = header.parentElement
    if (block === null) return []
    return [...block.querySelectorAll('[data-dsh-forge-tree-session]')]
      .map(el => el.getAttribute('data-dsh-forge-tree-session') ?? '')
  })
}

/**
 * 打开一行的 C8 生命周期 ⋯ 菜单(3.5 GUI 入口:active 行与归档行同一组件面)。
 * hover 揭示 ⋯(hovered || menuOpen 渲染条件)→ 点击 → 菜单在座。
 */
async function openLifecycleMenu(page: Page, projectId: string): Promise<void> {
  const row = page.locator(
    `[data-dsh-forge-tree-project="${projectId}"], [data-dsh-forge-tree-archived-row="${projectId}"]`,
  ).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.hover()
  const more = page.locator(`[data-dsh-forge-tree-project-more="${projectId}"]`)
  await expect(more, '⋯ 尾动作在场(hover 揭示)').toBeVisible({ timeout: 5_000 })
  await more.click()
  await expect(page.locator(`[data-dsh-forge-tree-project-menu="${projectId}"]`),
    '生命周期菜单在座(renamed/archive/remove 词汇)').toBeVisible({ timeout: 5_000 })
}

/** 菜单项点击(词面 = zh locale 键值;菜单一次仅一行持有)。 */
async function clickMenuItem(page: Page, projectId: string, label: RegExp): Promise<void> {
  const item = page.locator(`[data-dsh-forge-tree-project-menu="${projectId}"] [role="menuitem"]`, { hasText: label })
  await expect(item).toBeVisible({ timeout: 5_000 })
  await item.click()
}

// ---------------------------------------------------------------------------
// The SC3 sync-semantics leg (one sequential lifecycle: ① → ⑤ → ② → ③ → ④)
// ---------------------------------------------------------------------------

test('sc3/projection-sync: 注册同名同序 / 改名同步 / 归档保留+forge 归档分区 / 删除移除+会话退未分组 / 派发归组(DF002)', async ({ }, testInfo) => {
  testInfo.setTimeout(480_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc3-sync')
  const anchors = PROJECTS.map(project => join(root, project.dir))
  for (const anchor of anchors) {
    mkdirSync(anchor, { recursive: true })
    mkdirSync(join(anchor, 'docs'), { recursive: true }) // 仓内 docs 在位(repo-existing 落位)
  }
  const dshHome = join(root, 'dsh-home')
  const userDataDir = join(root, 'user-data')
  mkdirSync(userDataDir, { recursive: true })

  // 语料预种(boot 前:bootstrap 在 host 启动期一次性索引存量头):三锚点
  // 各一「派发会话」;gamma 用正斜杠写法(DF002 canonical 折叠语料)。
  const now = Date.now()
  await seedLineageCorpus({
    dshHome,
    seeds: [
      { sessionId: SESS_ALPHA, cwd: anchors[ALPHA], createdAt: now - 30_000, title: 'SC3 会话 alpha' },
      { sessionId: SESS_BETA, cwd: anchors[BETA], createdAt: now - 20_000, title: 'SC3 会话 beta' },
      { sessionId: SESS_GAMMA, cwd: anchors[GAMMA].replaceAll('\\', '/'), createdAt: now - 10_000, title: 'SC3 派发会话 gamma' },
    ],
  })

  let shell: PluginShell | undefined
  let stopAutoDismiss: () => void = () => {}
  try {
    // 空注册表 boot(零预注册:三项目全部经真动词注册,「注册 → push」链同源)
    // + DSH_HOME 隔离(实况 registry 与语料同根)。
    shell = await launchWorkbenchShell({
      userDataDir,
      rootDir: root,
      env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'sc3-e2e-stub-key' },
    })
    const { page } = shell
    await shell.uiReady()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    stopAutoDismiss = startAutoDismiss(page)
    // 日志级活性锚点(快照竞态门):follow 流首次上报落笔(WORKBENCH_PROJECTION_
    // SNAPSHOT = 内核对账输入就位)先于注册 —— 否则 plan 在实况未知(snapshot=
    // null)下组装,ensure/条件 rename 可达而 reorder op 缺席(实况序不收敛;
    // 该竞态面属 3.7 偏差腿,本腿 = 同步语义确定性 happy path)。
    const mainLog = captureMainStdout(shell)
    for (let round = 0; round < 120; round += 1) {
      if (mainLog.some(line => line.includes('WORKBENCH_PROJECTION_SNAPSHOT'))) break
      await page.waitForTimeout(500)
    }
    expect(mainLog.some(line => line.includes('WORKBENCH_PROJECTION_SNAPSHOT')),
      'follow 流 boot 上报在座(对账输入就位;注册 push 的 reorder op 前提)').toBe(true)

    // ---- 语料消费面(活性锚点):座位在座 + 空态引导(零项目世界)-------------
    // 注:零项目世界无 project_list_changed 推送,座位首渲染的 lazy 上游面
    // 未解析(2.9 纪律:face 懒解析随渲染刷新)—— 会话/工作区行在下方注册
    // 动词(推 project_list_changed → store 重拉 → 重渲染)后进入消费面;
    // 注册前未分组对照面因此非本腿断言(⑤ 断言 = 注册后归组态)。
    await expect(page.locator('[data-dsh-forge-project-seat]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-project-empty]'),
      '零项目空态引导在座(注册后即消失)').toBeVisible({ timeout: 15_000 })

    // ---- ① 注册同名同序(真动词 v2:内核 hook → plan → relay → 上游)-------
    const registered: Array<{ id: string; displayName: string; codeRoot: string; sortOrder: number }> = []
    for (const project of PROJECTS) {
      const row = await bridgeInvoke<{ id: string; displayName: string; codeRoot: string; sortOrder: number }>(
        page, 'registerProject',
        [{ anchor: join(root, project.dir), displayName: project.displayName, docsPlacement: 'repo-existing' }],
      )
      expect(row.id, `注册成功:${project.displayName}`).toBeTruthy()
      registered.push(row)
    }
    // forge 侧权威序(getState = listProjects 的 sort_order 投影)。
    const state = await bridgeInvoke<{
      projects: Array<{ id: string; displayName: string; sortOrder: number; archived: boolean }>
    }>(page, 'getState', [])
    const forgeOrder = state.projects.map(row => row.displayName)
    expect(forgeOrder, 'forge 项目列表序 = 注册序(sort_order 权威)').toEqual(PROJECTS.map(p => p.displayName))
    const sortOrders = state.projects.map(row => row.sortOrder)
    expect(sortOrders, 'sort_order 严格递增 = 注册序(顺序权威,非绝对值)').toEqual([...sortOrders].sort((a, b) => a - b))
    expect(new Set(sortOrders).size, 'sort_order 无并列(注册序全序)').toBe(sortOrders.length)

    // 实况收敛断言:每锚恰一 workspace,title = displayName,注册表序 = forge 序
    // (隔离 DSH_HOME 零外来 workspace → 全等断言;global.initialized 在座)。
    const expectConverged = (registry: LiveRegistry): boolean =>
      registry.initialized
      && registry.order.length === PROJECTS.length
      && registry.order.every((row, index) =>
        foldPath(row.path) === foldPath(anchors[index])
        && row.title === PROJECTS[index].displayName)
    await waitForRegistry(page, dshHome, expectConverged,
      '① 注册同名同序:实况序 = [alpha, beta, gamma] 且 title = displayName')
    // 逐锚复核(诊断面展开:失败信息携带逐行事实)。
    const afterRegister = readLiveRegistry(dshHome) as LiveRegistry
    for (let index = 0; index < PROJECTS.length; index += 1) {
      const row = rowAtAnchor(afterRegister, anchors[index])
      expect(row, `锚点 ${String(index)} 在实况有恰一 workspace`).toBeDefined()
      expect(row?.title, `同名:workspace title = ${PROJECTS[index].displayName}`).toBe(PROJECTS[index].displayName)
      expect(afterRegister.order.indexOf(row as LiveWorkspaceRow),
        `同序:${PROJECTS[index].displayName} 位次 = 注册序位`).toBe(index)
    }
    // GUI 面:三项目行在座(project_list_changed 推送后的树刷新)。
    for (const project of registered) {
      await expect(page.locator(`[data-dsh-forge-tree-project="${project.id}"]`),
        `项目行在座:${project.displayName}`).toBeVisible({ timeout: 15_000 })
    }

    // ---- ⑤ 派发归组(DF002:cwd=anchor 经 canonical 匹配归组到对应 workspace)-
    // 实况:gamma 锚 workspace 的 sessionIds 命中语料(正斜杠写法已折叠)。
    const gammaRow = rowAtAnchor(afterRegister, anchors[GAMMA])
    expect(gammaRow?.sessionIds, 'DF002:派发会话(cwd=anchor 正斜杠写法)归组进对应 workspace 账')
      .toContain(SESS_GAMMA)
    // GUI:点 gamma 行激活(激活即自动展开:expandedProjects 随 activeProjectId
    // 追加)→ 会话行在项目组;未分组不再含之。不再补点 caret —— 激活已展开,
    // 再点即收起(展开态翻转)反而藏起会话块。
    await page.locator(`[data-dsh-forge-tree-project="${registered[GAMMA].id}"]`).click()
    await expect(page.locator(`[data-dsh-forge-tree-project="${registered[GAMMA].id}"]`),
      'gamma 行激活(aria-current)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    let gammaBlock: string[] | null = null
    for (let round = 0; round < 30; round += 1) {
      gammaBlock = await sessionsInProjectBlock(page, registered[GAMMA].id)
      if (gammaBlock !== null && gammaBlock.includes(SESS_GAMMA)) break
      await page.waitForTimeout(500)
    }
    expect(gammaBlock, '⑤ 派发归组:gamma 项目组呈现派发会话行(树消费面)').toContain(SESS_GAMMA)
    const ungroupedAfterRegister = await ungroupedSessionIds(page)
    expect(ungroupedAfterRegister === null || !(ungroupedAfterRegister as string[]).includes(SESS_GAMMA),
      '⑤ 派发会话不再落未分组(归组生效)').toBe(true)

    // ---- ② 改名同步(⋯ 菜单行内编辑 → renameProject → plan rename op)-------
    await openLifecycleMenu(page, registered[ALPHA].id)
    await clickMenuItem(page, registered[ALPHA].id, /重命名/)
    const renameInput = page.locator(`[data-dsh-forge-tree-project-rename-input="${registered[ALPHA].id}"]`)
    await expect(renameInput, '行内编辑输入在座').toBeVisible({ timeout: 5_000 })
    await renameInput.fill(ALPHA_RENAMED)
    await renameInput.press('Enter')
    await expect(page.locator(`[data-dsh-forge-tree-project="${registered[ALPHA].id}"]`),
      'forge 树行呈现新名').toContainText(ALPHA_RENAMED, { timeout: 15_000 })
    await waitForRegistry(page, dshHome, registry => {
      const row = rowAtAnchor(registry, anchors[ALPHA])
      return row !== undefined && row.title === ALPHA_RENAMED
    }, `② 改名同步:alpha workspace title = ${ALPHA_RENAMED}`)
    expect(rowAtAnchor(readLiveRegistry(dshHome) as LiveRegistry, anchors[ALPHA])?.title,
      '必答⑤ 第三行:forge 改名 → dsh 侧 workspace 同名').toBe(ALPHA_RENAMED)

    // ---- ③ 归档语义(⋯ 菜单 归档 + 确认 Dialog;必答⑤:归档 ≠ 删除)--------
    const beforeArchive = readLiveRegistry(dshHome) as LiveRegistry
    await openLifecycleMenu(page, registered[BETA].id)
    await clickMenuItem(page, registered[BETA].id, /归档项目/)
    const archiveDialog = page.locator('[data-dsh-forge-dialog="project-archive-confirm"]')
    await expect(archiveDialog, '归档确认 Dialog 在座').toBeVisible({ timeout: 5_000 })
    await expect(archiveDialog.locator('[data-dsh-forge-project-promise]'),
      '必答⑤ copy:「workspace 保留,会话仍按项目分组」').toContainText('workspace 保留,会话仍按项目分组')
    await archiveDialog.locator('[data-dsh-forge-project-archive-confirm]').click()
    await expect(archiveDialog).toHaveCount(0, { timeout: 5_000 })
    // forge 侧:项目入归档分区(降透明只读行)+ 会话行从展示面消失。
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${registered[BETA].id}"]`),
      '归档分区行在座(C8 只读分区)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(`[data-dsh-forge-tree-project="${registered[BETA].id}"]`),
      '活跃分区行退场').toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator(`[data-dsh-forge-tree-session="${SESS_BETA}"]`),
      '项目会话列表不再展示(已归档会话行消失)').toHaveCount(0, { timeout: 15_000 })
    const ungroupedDuringArchive = await ungroupedSessionIds(page)
    expect(ungroupedDuringArchive === null || !(ungroupedDuringArchive as string[]).includes(SESS_BETA),
      '归档 ≠ 退组:beta 会话不落未分组(dsh 侧仍按项目分组,仅 forge 展示隐藏)').toBe(true)
    // dsh 侧实况:workspace 保留 —— title/path/sessionIds/注册表序全不变。
    await page.waitForTimeout(1_200) // 零投影 op 的「不动」面:跨过任何潜在抖动窗口再读
    const afterArchive = readLiveRegistry(dshHome) as LiveRegistry
    const betaRowAfter = rowAtAnchor(afterArchive, anchors[BETA])
    expect(betaRowAfter, '③ 归档 → dsh 侧 workspace 保留(行仍在)').toBeDefined()
    const betaRowBefore = rowAtAnchor(beforeArchive, anchors[BETA]) as LiveWorkspaceRow
    expect(betaRowAfter?.title, 'title 不变').toBe(betaRowBefore.title)
    expect(betaRowAfter?.sessionIds, '会话仍按项目分组(sessionIds 账不动)').toEqual(betaRowBefore.sessionIds)
    expect(afterArchive.order.map(row => foldPath(row.path)),
      '注册表序不变(归档零投影 op)').toEqual(beforeArchive.order.map(row => foldPath(row.path)))

    // ---- ④ 删除语义(归档行 ⋯ 删除 + 确认 Dialog → delete op + FK cascade)--
    await openLifecycleMenu(page, registered[BETA].id)
    await clickMenuItem(page, registered[BETA].id, /删除项目/)
    const removeDialog = page.locator('[data-dsh-forge-dialog="project-remove-confirm"]')
    await expect(removeDialog, '删除确认 Dialog 在座').toBeVisible({ timeout: 5_000 })
    await expect(removeDialog.locator('[data-dsh-forge-project-promise]'),
      '必答⑤ copy:「投影移除,会话退未分组(历史不删除)」').toContainText('投影移除,会话退未分组')
    await removeDialog.locator('[data-dsh-forge-project-remove-confirm]').click()
    await expect(removeDialog).toHaveCount(0, { timeout: 5_000 })
    // dsh 侧实况:workspace 移除 + 余序 = forge 余序;会话退未分组(账面)。
    await waitForRegistry(page, dshHome, registry =>
      rowAtAnchor(registry, anchors[BETA]) === undefined
      && registry.order.length === 2
      && foldPath(registry.order[0]?.path ?? '') === foldPath(anchors[ALPHA])
      && registry.order[0]?.title === ALPHA_RENAMED
      && foldPath(registry.order[1]?.path ?? '') === foldPath(anchors[GAMMA]),
    '④ 删除:beta workspace 移除,余序 = [alpha-renamed, gamma]')
    const afterRemove = readLiveRegistry(dshHome) as LiveRegistry
    for (const row of afterRemove.order) {
      expect(row.sessionIds, '退未分组:beta 会话不在任何 workspace 账上').not.toContain(SESS_BETA)
    }
    // 历史不删除:会话 artifact 经 REAL persistence backend 二次可读(头仍在)。
    const reread = await readCorpusSession({ dshHome, sessionId: SESS_BETA })
    expect(reread.header.id, '会话文件仍在(历史不删除,REAL backend 可读)').toBe(SESS_BETA)
    // forge 面:beta 行(活跃 + 归档分区)全退场;会话行回未分组块呈现。
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${registered[BETA].id}"]`),
      '归档分区行退场').toHaveCount(0, { timeout: 15_000 })
    let ungroupedAfterRemove: string[] | null = null
    for (let round = 0; round < 30; round += 1) {
      ungroupedAfterRemove = await ungroupedSessionIds(page)
      if (ungroupedAfterRemove !== null && ungroupedAfterRemove.includes(SESS_BETA)) break
      await page.waitForTimeout(500)
    }
    expect(ungroupedAfterRemove, '④ GUI 面:退未分组的 beta 会话在未分组块呈现(树消费面)')
      .toContain(SESS_BETA)

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
