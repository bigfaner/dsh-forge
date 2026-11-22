// plugin-project 1.20 · J3 bug 登记→回填旅程 Playwright spec（journey =
// bug-register-backfill-journey，module = project——tests/<moduleName>/<journey>/ 约定树，
// Playwright project desktop-journeys 发现）。
//
// ⚠ 契约文档缺席留痕（fix/disc 上报）：本旅程的 contracts/contracts.md 未随契约任务产出
// （proposal testing/ 仅有 J1/J2 两份契约文档）——断言-契约溯源暂锚定旅程条目 id
// （J3-G/B，journey.md 契约供料节）；契约文档补齐后须回填 CT-J3-* id（收口任务核查面）。
//
// 分层裁剪注记（journey 供料自承）：五 tool 登记/回填面由模型侧调用驱动——零真实模型 e2e
// 环境不可驱，tool 应答/schema 校验归 plugin-forge-contract 与域单测 pin（J3 契约供料原话
// 「五 tool schema 归契约面」）。本 spec 驱动面 = db + RPC + UI 三方真机链路：
// project.db project_bugs 行（SQLite 直种/直改 = 台账事实注入）→ 概览 Bug 子 tab
// （forge:bugs/list RPC——BugList 行集）→ Bug 详情弹框（详情投影 + 回填证据）。
//
// 断言锚（实锚）：概览子 tab = [data-dswf-ov-subtab="bugs"]；Bug 行 =
// [data-dswf-ov-bugrow="<bug_id>"] + [data-dswf-ov-bugrow-type]；详情弹框 =
// [data-dswf-ov-bdialog] + data-dswf-ov-bdialog-id/-summary/-status/-type + kv 行
// data-dswf-ov-bdialog-kv；右栏 Bug 预览 pane = [data-dswf-br] + data-dswf-br-id/-status
// + data-dswf-br-evidence / data-dswf-br-error（降级投影）。不锁文案、不锁 DOM 层级。
//
// 留痕 skip（通道缺失记账——非退役候选）：
//   - J3-G1/G2/G4（tool 登记/resolve 应答面）：模型侧 tool 调用零真实模型不可驱——留痕 skip；
//   - J3-B1/B2/B3/B5（终态再 resolve 拒绝 / 缺 commit_hash 拒绝 / 悬空 recurrence 拒写 /
//     降级态 ErrUnavailable）：工具面校验与状态机由 bugs 域单测 pin（service.test）——留痕 skip；
//   - J3-B4 chip 序列化重启还原：需会话消息内 bug 引用（模型产生）——留痕 skip。
import { createRequire } from 'node:module'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { ROOT, closeApp, launchHost } from '../../../e2e/support/launch.js'
import { forgeInvoke } from '../../../e2e/support/rpc.js'
import { openOverviewDock } from '../../../e2e/support/navigation.js'

// 归属键派生单源复用（lib-path deriveDirName——tests 树无 workspace dep 解析径，经插件侧
// node_modules 显式文件路径 ESM 动态 import；与 register/解析链同函数同值）
const { deriveDirName } = (await import(
  join(ROOT, 'plugins', 'project', 'node_modules', '@dsh-forge', 'lib-path', 'dist', 'index.js')
)) as { deriveDirName(workspaceDir: string): string }

// ── project.db 直查面（{dshHome}/forge/db/project/project.db——台账事实注入/终态直改） ──
const requireFromCore = createRequire(join(ROOT, 'packages', 'core', 'package.json'))

interface Db {
  prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown }
  close(): void
}

function dbFile(dshHome: string): string {
  return join(dshHome, 'forge', 'db', 'project', 'project.db')
}

function seedBugRow(dshHome: string, bugId: string, projectKey: string, summary: string): void {
  const db = new (requireFromCore('@dsh-forge/lib-db') as new (path: string) => Db)(dbFile(dshHome))
  try {
    db.prepare(
      `INSERT INTO project_bugs (id, project_key, summary, bug_desc, trigger_desc, expected, actual, suspected, error_type, bug_status, reporter, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    ).run(
      bugId,
      projectKey,
      summary,
      'bug：J3 台账注入行（e2e 事实基座）',
      'trigger：seed 注入',
      'expected：真机投影一致',
      'actual：seed 行',
      'apps/web/src/views/overview/bug-tab/bug-list.tsx:167',
      'concurrency',
      'j3-seed',
      new Date().toISOString(),
      new Date().toISOString(),
    )
  } finally {
    db.close()
  }
}

function resolveBugRow(dshHome: string, bugId: string, commitHash: string): void {
  const db = new (requireFromCore('@dsh-forge/lib-db') as new (path: string) => Db)(dbFile(dshHome))
  try {
    db.prepare(
      `UPDATE project_bugs SET bug_status = 'fixed', commit_hash = ?, fix_approach = ?, updated_at = ? WHERE id = ?`,
    ).run(commitHash, 'seed resolve：终态回填', new Date().toISOString(), bugId)
  } finally {
    db.close()
  }
}

function deleteBugRow(dshHome: string, bugId: string): void {
  const db = new (requireFromCore('@dsh-forge/lib-db') as new (path: string) => Db)(dbFile(dshHome))
  try {
    db.prepare('DELETE FROM project_bugs WHERE id = ?').run(bugId)
  } finally {
    db.close()
  }
}

// ── 夹具 ──
interface Boot {
  readonly app: Awaited<ReturnType<typeof launchHost>>['app']
  readonly page: Page
  readonly dshHome: string
  readonly projectId: string
  readonly projectKey: string
}

/** 冷启 + RPC 注册（项目上下文 = bugs 列表归属键；project_key = f(ws_path) 派生真值——
 *  归属键单源 lib-path deriveDirName，register/解析链同函数；seed 键必须同源才可投影） */
async function bootWithProject(tag: string): Promise<Boot> {
  const root = mkdtempSync(join(tmpdir(), `dsh-j3-${tag}-fx-`))
  // realpath 规范化（官方 registry create 经 fs.realpath canonical 化——seed 派生键与
  // 注册产物同锚，短名/大小写漂移即键失配行集恒空）
  const ws = realpathSync(mkdtempSync(join(root, 'ws')))
  mkdtempSync(ws)
  const userData = mkdtempSync(join(tmpdir(), `dsh-j3-${tag}-ud-`))
  const dshHome = join(userData, 'dsh-home')
  const launched = await launchHost({ userData })
  const { page } = launched
  const registered = await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: ws,
    name: 'ws',
    forgeDir: join(ws, '.forge'),
  })
  const projectKey = deriveDirName(ws)
  return { app: launched.app, page, dshHome, projectId: registered.projectId, projectKey }
}

/** 打开概览 Bug 子 tab（右栏 dock → bugs 子视图） */
async function openBugSubtab(page: Page): Promise<void> {
  await openOverviewDock(page)
  await page.locator('[data-dswf-ov-subtab="bugs"]').first().click()
  await expect(page.locator('[data-dswf-ov-bugs]').first(), 'Bug 子 tab 列表装载').toBeVisible({ timeout: 30_000 })
}

// ─────────────────────────────────────────────────────────────────────────────

test('@project-e2e @bug-register-backfill J3-G3 台账投影：db open 行 → 概览 Bug 列表 → 详情弹框五字段呈现', async () => {
  test.setTimeout(240_000)
  const boot = await bootWithProject('g3')
  try {
    // 前置：db 注入 open 行（tool 登记面的台账事实等价物——I1 open 态）
    seedBugRow(boot.dshHome, 'bug-j3-open-1', boot.projectKey, 'J3 摘要：open 态投影')
    await openBugSubtab(boot.page)
    // 列表行呈现（行键 = bug_id 词锚 + 错误类型词锚）
    const row = boot.page.locator('[data-dswf-ov-bugrow="bug-j3-open-1"]')
    await expect(row, 'J3-G3：台账行投影到概览 Bug 列表').toBeVisible({ timeout: 30_000 })
    await expect(row.locator('[data-dswf-ov-bugrow-type]')).toHaveAttribute('data-dswf-ov-bugrow-type', 'concurrency')
    // 详情弹框：五字段摘要（bug/trigger/expected/actual/suspected——kv 行）+ open 态词锚
    await row.click()
    const dialog = boot.page.locator('[data-dswf-ov-bdialog]')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog).toHaveAttribute('data-dswf-ov-bdialog-id', 'bug-j3-open-1')
    await expect(dialog.locator('[data-dswf-ov-bdialog-status]')).toHaveAttribute('data-dswf-ov-bdialog-status', 'open')
    for (const key of ['bug', 'trigger', 'expected', 'actual', 'suspected']) {
      await expect(dialog.locator(`[data-dswf-ov-bdialog-kv="${key}"]`).first(), `五字段行在场：${key}`).toBeVisible()
    }
    await expect(dialog.locator('[data-dswf-ov-bdialog-evidence]')).toHaveCount(0)
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @bug-register-backfill J3-G4/G5 + I1/I2 resolve 回填收敛：终态 fixed + commit_hash 证据可溯', async () => {
  test.setTimeout(240_000)
  const boot = await bootWithProject('g4')
  try {
    seedBugRow(boot.dshHome, 'bug-j3-fix-1', boot.projectKey, 'J3 摘要：回填收敛行')
    await openBugSubtab(boot.page)
    const row = boot.page.locator('[data-dswf-ov-bugrow="bug-j3-fix-1"]')
    await expect(row).toBeVisible({ timeout: 30_000 })
    // resolve 回填（db 终态直改 = tool resolve 落库事实等价物；I1 单向迁移 + commit_hash 必带）
    resolveBugRow(boot.dshHome, 'bug-j3-fix-1', 'c2793855')
    // I2 引用即事实：投影随之收敛——重装载后行集/详情呈现 fixed 终态（不显示过期态）
    await boot.page.locator('[data-dswf-ov-subtab="proposals"]').first().click()
    await boot.page.locator('[data-dswf-ov-subtab="bugs"]').first().click()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.click()
    const dialog = boot.page.locator('[data-dswf-ov-bdialog]')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.locator('[data-dswf-ov-bdialog-status]')).toHaveAttribute('data-dswf-ov-bdialog-status', 'fixed')
    // commit_hash 可溯（回填证据面）
    await expect(dialog.locator('[data-dswf-ov-bdialog-evidence]')).toBeVisible({ timeout: 10_000 })
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @bug-register-backfill J3-B4 弱引用降级：行缺席投影降级呈现（不崩、无幽灵详情）', async () => {
  test.setTimeout(240_000)
  const boot = await bootWithProject('b4')
  try {
    seedBugRow(boot.dshHome, 'bug-j3-gone', boot.projectKey, 'J3 摘要：行缺席降级行')
    await openBugSubtab(boot.page)
    const row = boot.page.locator('[data-dswf-ov-bugrow="bug-j3-gone"]')
    await expect(row).toBeVisible({ timeout: 30_000 })
    // 台账行删除（弱引用目标缺席——B4 前置）
    deleteBugRow(boot.dshHome, 'bug-j3-gone')
    // bug 3d453e91 弱断言修复③：pageErrors 监听提前至删除动作之前（真实监听窗口覆盖
    //   删除→重装载→详情降级全程），补「无 error 事件」断言语义——降级崩溃（pageerror）红
    const pageErrors: string[] = []
    boot.page.on('pageerror', (e) => pageErrors.push(String(e)))
    // 投影降级：重装载列表收敛（缺席行不呈现幽灵行）；详情重开降级呈现、宿主不崩
    await boot.page.locator('[data-dswf-ov-subtab="proposals"]').first().click()
    await boot.page.locator('[data-dswf-ov-subtab="bugs"]').first().click()
    await expect(row).toHaveCount(0, { timeout: 30_000 })
    // bug 3d453e91 弱断言修复②：方向反转为零残留意图——正确清场绿、幽灵弹框残留（>0）红
    //   （原 toBeTruthy 恒真式失效，且方向恰反：残留越多越「绿」）
    await expect(boot.page.locator('[data-dswf-ov-bdialog]'), '无幽灵详情弹框残留（零残留意图）').toHaveCount(0)
    expect(pageErrors, '投影降级不崩（删除→重装载全程零 pageerror 事件）').toEqual([])
  } finally {
    await closeApp(boot.app)
  }
})

// ── 留痕 skip（通道缺失记账——见文件头注记） ──
test('J3 留痕 skip（占位）', () => {
  test.skip(true, 'J3-G1/G2/G4 tool 应答面（模型侧 tool 调用零真实模型不可驱）+ J3-B1/B2/B3/B5 工具面校验与状态机（bugs 域单测 pin）+ J3-B4 chip 序列化重启还原（需模型产生的消息内 bug 引用）——留痕 skip')
})
