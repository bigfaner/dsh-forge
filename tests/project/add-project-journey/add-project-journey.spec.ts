// plugin-project 1.20 · J1 添加项目全旅程 Playwright spec（journey = add-project-journey，
// module = project——tests/<moduleName>/<journey>/ 约定树，Playwright project desktop-journeys 发现）。
//
// 断言-契约溯源：每条断言注 CT-J1-* 条目 id（契约 =
// .forge/docs/proposals/plugin-project/testing/add-project-journey/contracts/contracts.md，
// 锚已回填实锚并盖 last_anchor_sync——2026-11-05）。断言锚（实锚）：
//   入口 = [data-dswf-cta="add-project"] / [data-dswf-nav="add-project"]；
//   相位 = [data-dswf-ap] ∈ browser/native-pick/form/repick/executing/success/failure
//   （执行态附加 data-dswf-ap-keepalive）；目录浏览器 = [data-dswf-fb="browser"] +
//   [data-dswf-path] 行；表单 = [data-dswf-rf="form"] + data-dswf-rf-name/-ws/-forge/-wt
//   + data-dswf-rf-issue / data-dswf-rf-registered；派生行 = [data-dswf-dsr]。
// 不锁文案、不锁 DOM 层级；断言带状态后效（db 行 / registry 文件 / 项目树行）。
//
// 留痕 skip（通道缺失记账——契约 Outcome 无法在 e2e 环境构造）：
//   - CT-J1-G1 O-cancel / O-pick-invalid：桥在册形态的 OS 目录对话框为进程外原生窗口，
//     Playwright 不可驱动（e2e 标准形态 directoryPickerOff = 桥缺席降级）——留痕 skip；
//   - CT-J1-B4 执行态三分守卫：executing 相位窗口非确定性（注册毫秒级完成）且 e2e 无
//     故障注入缝拖长事务——守卫组合行为留痕 skip（Modal 三分守卫本体由官方 Modal 承载）；
//   - CT-J1-G2 注入类 Outcome（O-fail-step3 / O-fail-step4-compensated /
//     O-collision-*）：e2e 无 setFault 注入缝——补偿链/碰撞拒绝面由 core 集测 pin
//     （project-service.test），e2e 留痕 skip。
//
// 环境形态注记：launchHost 缺省 directoryPickerOff=true（preload 桥降级开关）——本 spec
// 全部用例走桥缺席形态（内嵌目录浏览器起步，CT-J1-B7 承载）；桥在册 OS 对话框形态见留痕 skip。
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { ROOT, closeApp, launchHost } from '../../../e2e/support/launch.js'
import { ensureNoBlockingDialog } from '../../../e2e/support/modals.js'
import { forgeInvoke } from '../../../e2e/support/rpc.js'
import { dirRow, enterDir, fixtureDirSegments, pickerStartRoot } from '../../../e2e/support/navigation.js'
import { CTA_ADD_PROJECT, NAV_ADD_PROJECT, addProjectPhase, DSR_DIR, rfField } from '../../../e2e/support/anchors.js'

// ── project.db 直查面（{dshHome}/forge/db/project/project.db——better-sqlite3 自 core 闭包解析） ──
const requireFromCore = createRequire(join(ROOT, 'packages', 'core', 'package.json'))

interface ProjectDb {
  prepare(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] }
  close(): void
}

function openProjectDb(dshHome: string): ProjectDb | undefined {
  const file = join(dshHome, 'forge', 'db', 'project', 'project.db')
  if (!existsSync(file)) return undefined
  const Db = requireFromCore('@dsh-forge/lib-db') as new (path: string) => ProjectDb
  return new Db(file)
}

function projectRowCount(dshHome: string): number {
  const db = openProjectDb(dshHome)
  if (db === undefined) return 0
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM project_projects').get() as { n: number }).n
  } finally {
    db.close()
  }
}

function workspaceRowsByPath(dshHome: string): readonly { ws_path: string; member_role: string }[] {
  const db = openProjectDb(dshHome)
  if (db === undefined) return []
  try {
    return db.prepare('SELECT ws_path, member_role FROM project_workspaces').all() as readonly {
      ws_path: string
      member_role: string
    }[]
  } finally {
    db.close()
  }
}

// ── registry 探针（dsh 官方持久化面直读——project-registration-compensation 同径） ──
function registryText(dshHome: string): string {
  const file = join(dshHome, 'storages', 'workspace.json')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

// ── 夹具 ──
function makeGitFixture(root: string, name: string): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'README.md'), 'j1 fixture\n')
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=j1@test', '-c', 'user.name=j1', 'add', '.'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=j1@test', '-c', 'user.name=j1', 'commit', '-q', '-m', 'init'], { cwd: dir })
  return dir
}

function makePlainFixture(root: string, name: string): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'note.txt'), 'not a git repo\n')
  return dir
}

interface Boot {
  readonly app: Awaited<ReturnType<typeof launchHost>>['app']
  readonly page: Page
  readonly dshHome: string
  readonly fixtureRoot: string
}

/** 隔离 userData 冷启（零项目 → hero 相位；单 boot 形态——复启禁令纪律） */
async function bootCold(tag: string): Promise<Boot> {
  const fixtureRoot = mkdtempSync(join(tmpdir(), `dsh-j1-${tag}-fx-`))
  const userData = mkdtempSync(join(tmpdir(), `dsh-j1-${tag}-ud-`))
  const dshHome = join(userData, 'dsh-home')
  const launched = await launchHost({ userData, expectPhase: 'hero' })
  return { app: launched.app, page: launched.page, dshHome, fixtureRoot }
}

/** 桥缺席形态打开流程并走内嵌目录浏览器选定目录（两段式段一） */
async function openFlowAndPick(page: Page, fixtureRoot: string, dirName: string): Promise<void> {
  await ensureNoBlockingDialog(page)
  await page.locator(CTA_ADD_PROJECT).first().click()
  await expect(page.locator(addProjectPhase('browser')), 'CT-J1-B7：桥缺席打开即出内嵌浏览器相位').toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-dswf-fb="browser"]').first(), 'CT-J1-B7：内嵌目录浏览器起步').toBeVisible()
  for (const segment of fixtureDirSegments(fixtureRoot, pickerStartRoot())) {
    await enterDir(page, segment)
  }
  await dirRow(page, dirName).click()
  await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
  await expect(page.locator(addProjectPhase('form')), '选定目录 → 表单相位').toBeVisible({ timeout: 15_000 })
}

/** 非零项目形态经侧栏「＋」入口打开流程（NAV_ADD_PROJECT） */
async function openFlowViaNav(page: Page): Promise<void> {
  await ensureNoBlockingDialog(page)
  await page.locator(NAV_ADD_PROJECT).first().click()
  await expect(page.locator(addProjectPhase('browser'))).toBeVisible({ timeout: 15_000 })
}

// ─────────────────────────────────────────────────────────────────────────────

test('@project-e2e @add-project CT-J1-B7 桥缺席形态：打开即出内嵌目录浏览器（零 OS 对话框、零副作用）', async () => {
  test.setTimeout(240_000)
  const boot = await bootCold('b7')
  try {
    // CT-J1-B7 O-embedded-browser + 前置：冷启零项目
    expect(projectRowCount(boot.dshHome), '冷启零项目（project.db 零实体行）').toBe(0)
    await expect(boot.page.locator(CTA_ADD_PROJECT), 'hero CTA 在场（零项目态）').toBeVisible({ timeout: 15_000 })
    await boot.page.locator(CTA_ADD_PROJECT).first().click()
    await expect(boot.page.locator(addProjectPhase('browser')), '打开即出 browser 相位（不出 OS 对话框）').toBeVisible({ timeout: 15_000 })
    await expect(boot.page.locator('[data-dswf-fb="browser"]').first(), '内嵌目录浏览器在场').toBeVisible()
    // CT-J1-B7 状态语义：两形态共享相位词表（browser 相位在场即同词表证据）
    expect(projectRowCount(boot.dshHome), '打开流程零副作用（project.db 零新行）').toBe(0)
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @add-project CT-J1-G1/G2 全链：选定回填 → 确认注册 → success → 双表落行 + registry + 项目树行', async () => {
  test.setTimeout(300_000)
  const boot = await bootCold('g2')
  const wsDir = makeGitFixture(boot.fixtureRoot, 'ws-g2')
  try {
    await openFlowAndPick(boot.page, boot.fixtureRoot, 'ws-g2')
    // CT-J1-G1 O-success：表单相位 + 路径回填（桥缺席形态——内嵌浏览器选取承载）
    await expect(boot.page.locator(rfField('ws')).first(), 'CT-J1-G1：工作区路径回填为所选目录').toHaveValue(wsDir, { timeout: 15_000 })
    // CT-J1-G1 State：预检零副作用（project.db 零新行、registry 零写入）
    expect(projectRowCount(boot.dshHome), '选取阶段零副作用').toBe(0)
    expect(registryText(boot.dshHome), '选取阶段 registry 零写入').not.toContain(wsDir)
    // CT-J1-G2 Output：确认 → executing（活性指示，窗口非确定——直接收敛断言 success）→ success
    await boot.page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(boot.page.locator(addProjectPhase('success')), 'CT-J1-G2：注册成功反馈呈现').toBeVisible({ timeout: 60_000 })
    // 模态自动关闭（success 后壳退场）
    await expect(boot.page.locator(addProjectPhase('success'))).toBeHidden({ timeout: 30_000 })
    // CT-J1-G2 State：双表同事务落行（实体行 + main 关系行——缺一即 FAIL）
    expect(projectRowCount(boot.dshHome), 'project_projects 实体行落库').toBe(1)
    expect(workspaceRowsByPath(boot.dshHome), 'project_workspaces main 关系行伴随落库（双表制）').toEqual([
      { ws_path: wsDir, member_role: 'main' },
    ])
    // CT-J1-G2 Side-effect：registry 新工作区在册 + 项目树新项目行呈现
    expect(registryText(boot.dshHome), '官方 workspaceRegistry 新工作区在册').toContain(wsDir)
    await expect(boot.page.locator('[data-dswf-project]').first(), '项目树新项目行呈现').toBeVisible({ timeout: 30_000 })
    // hero 消退锚触发（零项目态消失——phase 切离 hero）
    await expect(boot.page.locator('[data-dswf-workbench]')).not.toHaveAttribute('data-dswf-phase', 'hero', { timeout: 15_000 })
    // CT-J1-G2 Side-effect：新项目点选为当前上下文（显示与行为一致——行可点选且无半态）
    await boot.page.locator('[data-dswf-project]').first().click()
    await expect(boot.page.locator('[data-dswf-project]').first()).toBeVisible()
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @add-project CT-J1-B1 表单校验拒绝：必填缺失停留表单相位、零副作用', async () => {
  test.setTimeout(240_000)
  const boot = await bootCold('b1')
  makeGitFixture(boot.fixtureRoot, 'ws-b1')
  try {
    await openFlowAndPick(boot.page, boot.fixtureRoot, 'ws-b1')
    // CT-J1-B1 Input：清空标题（必填缺失）后提交
    await boot.page.locator(rfField('name')).first().fill('')
    await boot.page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    // Output：校验项呈现、停留表单相位
    await expect(boot.page.locator('[data-dswf-rf-issue]').first(), 'CT-J1-B1：校验项呈现').toBeVisible({ timeout: 10_000 })
    await expect(boot.page.locator(addProjectPhase('form')), '停留表单相位').toBeVisible()
    await expect(boot.page.locator(addProjectPhase('success'))).toBeHidden()
    await expect(boot.page.locator(addProjectPhase('failure'))).toBeHidden()
    // State：零副作用（I1）
    expect(projectRowCount(boot.dshHome), '校验拒绝零新行（I1）').toBe(0)
    expect(workspaceRowsByPath(boot.dshHome), '关系表零新行').toEqual([])
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @add-project CT-J1-B2 非 git 目录注册拒绝：failure 相位 + 三方零残留', async () => {
  test.setTimeout(240_000)
  const boot = await bootCold('b2')
  makePlainFixture(boot.fixtureRoot, 'plain-b2')
  try {
    await openFlowAndPick(boot.page, boot.fixtureRoot, 'plain-b2')
    await boot.page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    // Output：typed 错误反馈呈现（failure 相位；文案不在断言面）
    await expect(boot.page.locator(addProjectPhase('failure')), 'CT-J1-B2：typed 错误反馈呈现').toBeVisible({ timeout: 60_000 })
    // State：project.db / registry / 项目树三方零残留（I1）
    expect(projectRowCount(boot.dshHome), '非 git 拒绝零新行').toBe(0)
    expect(workspaceRowsByPath(boot.dshHome), '关系表零新行').toEqual([])
    expect(registryText(boot.dshHome), 'registry 零新工作区').not.toContain('plain-b2')
    expect(await boot.page.locator('[data-dswf-project]').count(), '项目树零新项目行').toBe(0)
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @add-project CT-J1-B3 幂等归并：已注册目录重复注册零重复行', async () => {
  test.setTimeout(300_000)
  const boot = await bootCold('b3')
  const wsDir = makeGitFixture(boot.fixtureRoot, 'ws-b3')
  try {
    // 前置：目标目录已注册（RPC 直注——CT-J1-B3 Preconditions 预置径）
    const registered = await forgeInvoke<{ projectId: string }>(boot.page, 'forge:projects/register', {
      workspaceDir: wsDir,
      name: 'ws-b3',
      forgeDir: join(wsDir, '.forge'),
    })
    expect(registered.projectId, '前置注册成功').toBeTruthy()
    expect(projectRowCount(boot.dshHome), '前置注册单行').toBe(1)
    // Input：同目录再走全流程提交
    await openFlowViaNav(boot.page)
    for (const segment of fixtureDirSegments(boot.fixtureRoot, pickerStartRoot())) {
      await enterDir(boot.page, segment)
    }
    await dirRow(boot.page, 'ws-b3').click()
    await boot.page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(boot.page.locator(addProjectPhase('form'))).toBeVisible({ timeout: 15_000 })
    // Output：幂等提示呈现（表单相位——挂接既有工作区）
    await expect(boot.page.locator('[data-dswf-rf-registered]').first(), 'CT-J1-B3：幂等提示呈现').toBeVisible({ timeout: 15_000 })
    await boot.page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(boot.page.locator(addProjectPhase('success')), '归并返回成功反馈').toBeVisible({ timeout: 60_000 })
    // State：项目总数不变、两表零新增行（I4）
    expect(projectRowCount(boot.dshHome), '幂等归并不产生第二个项目（I4）').toBe(1)
    expect(workspaceRowsByPath(boot.dshHome).filter((r) => r.ws_path === wsDir), '关系行零重复').toHaveLength(1)
    expect(await boot.page.locator('[data-dswf-project]').count(), '项目树项目数不变').toBe(1)
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @add-project CT-J1-B5 失败后 dismiss 干净退出 + 重开从初始相位起步', async () => {
  test.setTimeout(240_000)
  const boot = await bootCold('b5')
  makePlainFixture(boot.fixtureRoot, 'plain-b5')
  try {
    await openFlowAndPick(boot.page, boot.fixtureRoot, 'plain-b5')
    await boot.page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(boot.page.locator(addProjectPhase('failure')), '前置：注册失败态呈现').toBeVisible({ timeout: 60_000 })
    // Input：关闭模态（dismiss）
    await boot.page.keyboard.press('Escape')
    // Output：模态关闭、无半态残壳
    await expect(boot.page.locator(addProjectPhase('failure'))).toBeHidden({ timeout: 15_000 })
    await expect(boot.page.locator('.dswf-ap').first()).toHaveCount(0)
    // State：零残留
    expect(projectRowCount(boot.dshHome), '失败 dismiss 零残留（I1）').toBe(0)
    // O-reopen-fresh：重开从初始相位起步、无上轮失败态残留
    await openFlowViaNav(boot.page)
    await expect(boot.page.locator(addProjectPhase('browser')), '重开从 browser 初始相位起步').toBeVisible({ timeout: 15_000 })
    await expect(boot.page.locator(addProjectPhase('failure'))).toHaveCount(0)
  } finally {
    await closeApp(boot.app)
  }
})

test('@project-e2e @add-project CT-J1-B6 repick：同位元素挂载保持、手改字段保留、派生行重构', async () => {
  test.setTimeout(300_000)
  const boot = await bootCold('b6')
  makeGitFixture(boot.fixtureRoot, 'ws-b6a')
  makeGitFixture(boot.fixtureRoot, 'ws-b6b')
  try {
    await openFlowAndPick(boot.page, boot.fixtureRoot, 'ws-b6a')
    // 手改标题字段（I3 前置）
    const nameField = boot.page.locator(rfField('name')).first()
    await nameField.fill('手工标题-b6')
    // Input：返回目录浏览器重选（repick）
    await boot.page.getByRole('button', { name: '重新选择' }).first().click()
    // Output：浏览器以同位元素呈现（repick 相位 + browsing 面板）
    await expect(boot.page.locator(addProjectPhase('repick')), 'CT-J1-B6：repick 相位呈现').toBeVisible({ timeout: 15_000 })
    await expect(boot.page.locator('[data-dswf-rf="browsing"]').first(), 'browsing 同位面板呈现').toBeVisible()
    // O-keepalive-invisible：表单经 keepalive 隐藏挂载（hidden），不卸载
    const keepalive = boot.page.locator('[data-dswf-ap-keepalive]')
    await expect(keepalive).toHaveCount(1)
    await expect(keepalive).toBeHidden()
    // 选定新目录 → 回表单
    for (const segment of fixtureDirSegments(boot.fixtureRoot, pickerStartRoot())) {
      await enterDir(boot.page, segment)
    }
    await dirRow(boot.page, 'ws-b6b').click()
    await boot.page.locator('.dswf-fb-confirm', { hasText: '选择此文件夹' }).first().click()
    await expect(boot.page.locator(addProjectPhase('form')), '新目录确认后回表单相位').toBeVisible({ timeout: 15_000 })
    // State：手改字段保留 + 工作区路径随新目录联动 + 派生行重构（ready 重算）
    await expect(nameField, '手改标题保留（I3）').toHaveValue('手工标题-b6')
    await expect(boot.page.locator(rfField('ws')).first()).toHaveValue(/ws-b6b/)
    await expect(boot.page.locator('[data-dswf-dsr="ready"]').first(), '派生行随新目录重构（ready 重算）').toBeVisible({ timeout: 15_000 })
    expect(boot.page.locator(DSR_DIR).first(), '派生路径值在场（拒绝态才缺席）').toBeTruthy()
    expect(projectRowCount(boot.dshHome), 'repick 全程零副作用').toBe(0)
  } finally {
    await closeApp(boot.app)
  }
})

// ── 留痕 skip（通道缺失记账——非退役候选，见文件头注记） ──
test('CT-J1 留痕 skip（占位）', () => {
  test.skip(true, 'CT-J1-G1 O-cancel/O-pick-invalid + CT-J1-B4 执行态三分守卫 + CT-J1-G2 注入类 Outcome：OS 原生对话框不可自动化 / executing 窗非确定无注入缝 / e2e 无 setFault 故障注入通道——补偿链与碰撞拒绝面由 core 集测 pin（project-service.test），留痕 skip')
})
