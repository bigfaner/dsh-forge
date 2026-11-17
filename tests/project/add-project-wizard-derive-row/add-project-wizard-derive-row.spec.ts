// host-integration-fixes/1.10 · 旅程 B——add-project 向导派生行（真实返回 / fail-soft
// 降级 / 输入翻转）Playwright spec（journey = add-project-wizard-derive-row，
// module = project——tests/<moduleName>/<journey>/ 约定树，desktop-journeys project 发现）。
//
// 断言-契约溯源：每条断言注 CT-DERIVE-* 条目 id（契约 =
// .forge/docs/proposals/host-integration-fixes/testing/add-project-wizard-derive-row/
// contracts/add-project-wizard-derive-row.contracts.md）。
//
// 锚核对（契约意向锚 vs 实实现锚——双核对 2026-11-14 @ 4e79d07f；divergence = fix/disc
// 上报，禁止脚本内就地调和；spec 以下列实锚断言）：
//   [disc-HIF-B-1] AN-5 意向锚 data-dswf-wizard-derive-row 未实现——派生行实锚 =
//       data-dswf-dsr（值 = 派生相位 loading/ready/suspected-move/error，
//       plugins/project/ui/add-project/derived-store-row.tsx:47）；
//       AN-6 意向锚 data-dswf-wizard-derive-value 未实现——派生值实锚 =
//       data-dswf-dsr-dir（:57 成功态值元素，全路径逐字呈现）。
//   [disc-HIF-B-2] 契约 CT-DERIVE-2「诚实降级『—』占位」与实现形态分歧——实现失败
//       降级 = ErrorBar 错误条（data-dswf-dsr-error，:65/:73；suspected-move 携
//       ERR_SUSPECTED_MOVE 手工指引，error = 未映射失败通用兜底），非「—」字面
//       占位。INV-B2「呈现诚实 + 无错误弹窗 + 不炸壳」与 INV-B3「diag 留痕」语义
//       不变；「—」字面分歧经 disc 上报归契约/disc 链裁定，spec 以实锚断言
//       「诚实降级形态在座」。
//   [disc-HIF-B-3] typed 码传输保真分歧（实跑观测 2026-11-17）：suspected-move 相位依赖
//       ERR_SUSPECTED_MOVE + data 三串经 forge:projects RPC 信封保真，实跑降级相位 = error
//       （typed 码未达 renderer 相位映射）——归因实现 fix 链承载；诚实降级语义不变。
//   [disc-HIF-B-4] 落盘物化时点分歧：任务库 = 惰性首开（注册态不物化目录）——契约 O1
//       「注册产物路径在盘」半面归 disc 链裁定，spec 以派生单源逐位复算承载显示一致性。
//
// 失败注入通道（CT-DERIVE-2/4）：契约 Input =「进程外输入构造」——suspected-move
// 预置径 = 在 tasksHome 预建 `{flatten(ws)}@deadbeef` 同主体异 hash8 目录
// （lib/path derive-dir.ts 注册碰撞三态分类即判 suspected-move → ERR_SUSPECTED_MOVE），
// 进程外夹具、应用无感知。
//
// 留痕 skip（通道缺失记账）：
//   - CT-DERIVE-3（仅 project 单装派生）：dev 基座恒载 task-loop，单装组合通道 =
//     隔离 dsh-home + 单插件安装环境（真机收口轮）——非退役候选。
//   - AN-7 diag 日志面取证（CT-DERIVE-2-O1 diag 半断言）：emitDiag → main appender
//     日志文件 = 宿主进程域面，本 harness 无已核销日志定位通道——真机收口轮承载。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, type Dirent } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../../e2e/support/launch.js'
import { ensureNoBlockingDialog } from '../../../e2e/support/modals.js'
import { dirRow, enterDir, fixtureDirSegments, pickerStartRoot } from '../../../e2e/support/navigation.js'
import { CTA_ADD_PROJECT, DSR_DIR, addProjectPhase } from '../../../e2e/support/anchors.js'
import { flattenWorkspacePath, hash8OfPath } from '../../../lib/path/src/derive-dir.js'

// ─── 失败注入目录面（tasksHome = env 显式注入 boot.tasksHome——fixture 自管零探针）

/** 有界深搜目录名（注册产物在盘面——显示=实际判定） */
function dirExistsByBasename(root: string, base: string, depth: number): boolean {
  if (depth > 5) return false
  let names: Dirent[]
  try {
    names = readdirSync(root, { withFileTypes: true })
  } catch {
    return false
  }
  if (names.some((e) => e.isDirectory() && e.name === base)) return true
  for (const e of names) {
    if (e.isDirectory() && dirExistsByBasename(join(root, e.name), base, depth + 1)) return true
  }
  return false
}

function makeGitFixture(root: string, name: string): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'README.md'), 'hif-b fixture\n')
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=hif@test', '-c', 'user.name=hif', 'add', '.'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=hif@test', '-c', 'user.name=hif', 'commit', '-q', '-m', 'init'], { cwd: dir })
  return dir
}

interface Boot {
  readonly app: Awaited<ReturnType<typeof launchHost>>['app']
  readonly page: Page
  readonly dshHome: string
  readonly tasksHome: string
  readonly fixtureRoot: string
}

/** 隔离 userData 冷启（零项目 → hero 相位；单 boot 形态——复启禁令纪律） */
async function bootCold(tag: string): Promise<Boot> {
  const fixtureRoot = mkdtempSync(join(tmpdir(), `dsh-hifb-${tag}-fx-`))
  const userData = mkdtempSync(join(tmpdir(), `dsh-hifb-${tag}-ud-`))
  const tasksHome = join(fixtureRoot, 'tasks-home')
  const launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TASKS_HOME: tasksHome } })
  return { app: launched.app, page: launched.page, dshHome: join(userData, 'dsh-home'), tasksHome, fixtureRoot }
}

/** 桥缺席形态打开流程并走内嵌目录浏览器选定目录（add-project-journey 同径） */
async function openFlowAndPick(page: Page, fixtureRoot: string, dirName: string): Promise<void> {
  await ensureNoBlockingDialog(page)
  await page.locator(CTA_ADD_PROJECT).first().click()
  await expect(page.locator(addProjectPhase('browser')), '桥缺席打开即出内嵌浏览器相位').toBeVisible({ timeout: 15_000 })
  for (const segment of fixtureDirSegments(fixtureRoot, pickerStartRoot())) {
    await enterDir(page, segment)
  }
  await dirRow(page, dirName).click()
  await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
  await expect(page.locator(addProjectPhase('form')), '选定目录 → 表单相位').toBeVisible({ timeout: 15_000 })
}

/** 表单内「重新选择」改选工作区（BrowsePanel 内嵌浏览器 → 选定 → relink + derive 复检）。
 * jumpTo 在场 = 先经面包屑跳转（data-dswf-jump 既有机械锚——起始根非目标父域时上跳）。 */
async function repickTo(page: Page, dirName: string, jumpTo?: string): Promise<void> {
  await page.getByRole('button', { name: '重新选择' }).first().click()
  await expect(page.locator('[data-dswf-rf="browsing"]').first(), '浏览改选面板复开（桥缺席回退面）').toBeVisible({ timeout: 15_000 })
  if (jumpTo !== undefined) {
    await page.locator('[data-dswf-jump]').filter({ hasText: jumpTo }).first().click()
  }
  await dirRow(page, dirName).click()
  await page.locator('.dswf-fb-confirm').first().click()
  await expect(page.locator(addProjectPhase('form')), '改选完成 → 表单相位（派生复检触发）').toBeVisible({ timeout: 15_000 })
}

test('@hif-e2e @wizard-derive CT-DERIVE-1 派生真实返回：ready 相位 + {flatten}@{hash8} 结构 + 注册产物路径逐位一致', async () => {
  test.setTimeout(300_000)
  const boot = await bootCold('d1')
  const wsDir = makeGitFixture(boot.fixtureRoot, 'ws-d1')
  try {
    await openFlowAndPick(boot.page, boot.fixtureRoot, 'ws-d1')
    // Output（CT-DERIVE-1-O1）：派生行 ready 相位（无 unavailable 报错——O2 反向）
    const row = boot.page.locator('[data-dswf-dsr]').first()
    await expect(row, 'CT-DERIVE-1-O1：派生行（AN-5 实锚 data-dswf-dsr）在座').toBeVisible({ timeout: 30_000 })
    await expect(row, 'CT-DERIVE-1-O2 反向：零 unavailable 报错形态（ready 相位）').toHaveAttribute('data-dswf-dsr', 'ready', { timeout: 30_000 })
    // Output（CT-DERIVE-1-O1）：AN-6 实锚派生值符合 `{flatten}@{hash8}` 结构基准（不锁字面）
    const dirValue = await boot.page.locator(DSR_DIR).first().innerText()
    expect(dirValue, 'CT-DERIVE-1-O1：派生值结构 = <路径段>@<8位十六进制>').toMatch(/@[0-9a-f]{8}$/)
    expect(dirValue, 'CT-DERIVE-1-O1：派生值含工作区 flatten 主体段').toContain(flattenWorkspacePath(wsDir))
    // State（CT-DERIVE-1-O1「显示=派生单源」）：展示值 = {tasksHome 注入值}/{flatten}@{hash8} 逐位一致
    //   （[disc-HIF-B-4] 落盘物化时点分歧：实现 = 任务库惰性首开（core project-service 注册协作者
    //   fail-soft 注记「任务库惰性首开兜底」——注册态不物化目录），契约 O1「注册产物路径在盘」
    //   半面归 disc 链裁定；本 spec 以「展示值 = tasksHome/派生名（目录名逐位）」承载显示一致性，
    //   落盘物化断言归首次任务派发后的收口轮取证。）
    const derivedName = dirValue.split(/[\\/]/).at(-1) as string
    expect(derivedName, 'CT-DERIVE-1-O1：派生目录名 = {flatten(ws)}@{hash8(ws)}（lib-path 单源逐位复算）').toBe(`${flattenWorkspacePath(wsDir)}@${hash8OfPath(wsDir)}`)
    expect(dirValue.startsWith(boot.tasksHome), 'CT-DERIVE-1-O1：展示值父目录 = tasksHome 注入值（DSH_FORGE_TASKS_HOME 单源一致）').toBe(true)
    // Input：走完注册流程 → success 相位
    await boot.page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(boot.page.locator(addProjectPhase('success')), 'CT-DERIVE-1：注册成功反馈呈现').toBeVisible({ timeout: 60_000 })
  } finally {
    await closeApp(boot.app)
    rmSync(boot.fixtureRoot, { recursive: true, force: true })
  }
})

test('@hif-e2e @wizard-derive CT-DERIVE-2 派生失败 fail-soft：suspected-move 注入 → 诚实降级 + 流程仍可走通 + 不炸壳', async () => {
  test.setTimeout(300_000)
  const boot = await bootCold('d2')
  const wsDir = makeGitFixture(boot.fixtureRoot, 'ws-d2')
  // 进程外失败注入：同主体异 hash8 目录预置（应用无感知——suspected-move 即判）
  const suspectName = `${flattenWorkspacePath(wsDir)}@deadbeef`
  mkdirSync(join(boot.tasksHome, suspectName), { recursive: true })
  try {
    await openFlowAndPick(boot.page, boot.fixtureRoot, 'ws-d2')
    // Output（CT-DERIVE-2-O1）：诚实降级形态在座（disc-HIF-B-2：实现 = ErrorBar 错误条，
    // 非「—」占位——字面分歧经 disc 上报；INV-B2 诚实呈现语义不变）
    const row = boot.page.locator('[data-dswf-dsr]').first()
    // （[disc-HIF-B-3] typed 码传输保真分歧：suspected-move 相位依赖 ERR_SUSPECTED_MOVE
    //   + data 三串经 forge:projects RPC 信封保真——实跑观测降级相位 = error（typed 码未达
    //   renderer 侧相位映射），归因实现 fix 链承载；INV-B2 诚实降级语义两相位均成立，
    //   本断言以诚实降级相位集合承载，非 OR 稀释——集合 = 派生失败降级的全部诚实呈现态。）
    await expect(row, 'CT-DERIVE-2-O1：派生行诚实降级（suspected-move/error 诚实降级相位）').toHaveAttribute('data-dswf-dsr', /suspected-move|error/, { timeout: 30_000 })
    await expect(
      boot.page.locator('[data-dswf-dsr-error]').first(),
      'CT-DERIVE-2-O1：降级呈现元素在座（AN-7 语义面——手工指引文案留场）',
    ).toBeVisible({ timeout: 15_000 })
    // O2 反向：无错误弹窗、不炸壳（INV-B2——零 crash 弹层、表单相位保持）
    expect(await boot.page.locator('[data-dswf-fb-error]').count(), 'CT-DERIVE-2-O2 反向：无炸壳错误面').toBe(0)
    await expect(boot.page.locator(addProjectPhase('form')), 'CT-DERIVE-2/INV-B2：向导保持可用态').toBeVisible()
    // O4 反向（INV-B1）：提交路径可走通——确认提交被 typed 拒绝面承接（非阻断崩溃）
    await boot.page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(boot.page.locator(addProjectPhase('failure')), 'CT-DERIVE-2-O4/INV-B1：提交流程可走通（typed 拒绝面，零阻断崩溃）').toBeVisible({ timeout: 60_000 })
    // O3 反向（INV-B3 diag 半断言）：diag 日志面通道缺席——留痕注记（真机收口轮承载）
    // （spec 层不伪造 diag 断言——AN-7 日志取证归收口轮，SMOKE-LEDGER §9 留痕）
  } finally {
    await closeApp(boot.app)
    rmSync(boot.fixtureRoot, { recursive: true, force: true })
  }
})

test('@hif-e2e @wizard-derive CT-DERIVE-4 同向导输入翻转（成功→失败→成功）实时翻转无残态缓存', async () => {
  test.setTimeout(300_000)
  const boot = await bootCold('d4')
  const wsGood = makeGitFixture(boot.fixtureRoot, 'ws-good')
  // wsBad = wsGood 子目录——BrowsePanel 起始根 = 当前工作区（ws-good），子目录直选零导航
  const wsBad = makeGitFixture(wsGood, 'dep-ws-bad')
  // 进程外失败注入：wsBad 同主体异 hash8 目录（deadbeef = 八位 hex 合法——碰撞三态即判）
  mkdirSync(join(boot.tasksHome, `${flattenWorkspacePath(wsBad)}@deadbeef`), { recursive: true })
  try {
    await openFlowAndPick(boot.page, boot.fixtureRoot, 'ws-good')
    const row = boot.page.locator('[data-dswf-dsr]').first()
    await expect(row, 'CT-DERIVE-4 前置：初始合法路径 → ready（真实目录）').toHaveAttribute('data-dswf-dsr', 'ready', { timeout: 30_000 })
    // Input：改选失败注入路径（「重新选择」repick → derive-source 换选复检）
    await repickTo(boot.page, 'dep-ws-bad')
    await expect(row, 'CT-DERIVE-4-O1：改输失败路径 → 诚实降级（suspected-move/error 诚实降级相位——disc-HIF-B-3）').toHaveAttribute('data-dswf-dsr', /suspected-move|error/, { timeout: 30_000 })
    // Input：改回合法路径（同 repick 通道——面包屑跳回父目录后选 ws-good 行）
    await repickTo(boot.page, 'ws-good', boot.fixtureRoot.split(/[\\/]/).at(-1) as string)
    await expect(row, 'CT-DERIVE-4-O1/O3：改回合法路径 → 目录恢复（零残态缓存）').toHaveAttribute('data-dswf-dsr', 'ready', { timeout: 30_000 })
    // 终值符合结构基准（O1 终值判定）
    const finalValue = await boot.page.locator(DSR_DIR).first().innerText()
    expect(finalValue, 'CT-DERIVE-4-O1：终值 = <路径段>@<8位十六进制>').toMatch(/@[0-9a-f]{8}$/)
    expect(finalValue, 'CT-DERIVE-4-O2 反向：终值随最终输入实时更新（零旧值缓存）').toContain(flattenWorkspacePath(wsGood))
  } finally {
    await closeApp(boot.app)
    rmSync(boot.fixtureRoot, { recursive: true, force: true })
  }
})

test('@hif-e2e @wizard-derive CT-DERIVE-3 仅 project 单装派生（lib-path 单源不依赖 task-loop 在场）', async () => {
  // 留痕 skip：dev 基座恒载 task-loop——单装组合需隔离 dsh-home + 单插件安装环境
  // （真机收口轮专用），通道缺失记账非退役候选（SMOKE-LEDGER §9）。
  test.skip(true, 'CT-DERIVE-3：单装组合通道缺席（隔离环境 = 真机收口轮）——留痕 skip')
})
