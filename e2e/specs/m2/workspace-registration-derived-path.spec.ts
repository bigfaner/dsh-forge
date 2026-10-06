// @feature:dsh-forge-m2-pipeline @web-e2e
// gen-test-scripts 产物 —— Journey: workspace-registration-derived-path（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m2-pipeline/testing/workspace-registration-derived-path/
//   contracts/step-{1..3}-*.md（eval-contract 944/1100 通过）。
//
// 载体形态：降桥口径（fix-14——OS 对话框不可 e2e：launchHost 缺省 directoryPickerOff
// → 目录选择 = 内嵌 2.8 DirectoryBrowser；「系统对话框一步」的 e2e 载体 = 浏览器面，
// 表单回填/派生行语义同源）。TMP 红线：夹具根置于继承的用户 Temp（勿重定向——
// 浏览器导航硬编码 AppData/Local/Temp 段）。
//
// Fact Table 摘录（源码核实）：
//   - 两段模态相位 .dswf-ap[data-dswf-ap="browser|form|success"]（addProjectPhase）；
//     浏览器确认 .dswf-fb-confirm（下一步）；表单确认 .dswf-rf-confirm（确认）；
//     改选钮 .dswf-rf-sidebtn（重新选择——重开浏览器换工作区）；已注册 chip
//     .dswf-rf-wsreg（RegisterForm.tsx:185）；字段 [data-dswf-rf-ws|name] + 字段级
//     校验提示 [data-dswf-rf-issue="<field>"]；
//   - 派生行（derived-store-row.tsx 四态）：[data-dswf-dsr="loading|ready|suspected-move|
//     error"] + 路径逐字呈现面 [data-dswf-dsr-dir] + 错误条 [data-dswf-dsr-error]；
//   - 派生串单源：{tasksHome}/{flatten}@{hash8}（core derive-dir——hash8 = 原路径
//     sha-256 前 8 hex 小写）；表单呈现 ≡ RPC 下发 ≡ core 计算 ≡ 实际建库位置（SC2）；
//   - 疑似移动（ERR_SUSPECTED_MOVE）：tasksHome 存在同 flatten 异 hash8 孤儿目录 →
//     表单预检拒绝（确认禁用 + 指引留场 + 中央行零副作用——拒绝发生在落库前）；
//   - loading / error 两态 = 瞬态与通道层失败面——组件单测钉死
//     （apps/web/src/flows/add-project/derived-store-row.test.tsx 相位机；RegisterForm.test.tsx
//     nativePickError 面），e2e 不伪造通道故障（本套件覆盖 ready/suspected-move/换选复检）。
//
// Outcome → 测试映射：
//   Step1-3 success 链（选目录→派生行→确认建库）…………「冒烟：选目录 → 派生行四面一致 → 确认建库（SC2 单源）」
//   Step1 reselect-updates-derive-row …………………………………………「Step1b 重选目录：派生行更新（不残留旧值）」
//   Step1 picker-cancel-unchanged …………………………………………………………「Step1c 取消选择：表单保持取消前状态（零副作用）」
//   Step1 picker-failure-error-shown ………………………………………………………组件单测承载（见上——e2e 无通道故障注入面，留痕注记）
//   Step2 success（派生行只读呈现）………………………………………………………并入冒烟（DSR_DIR 逐字 + 单源四面）
//   Step2 same-flatten-subject-disambiguation ………………………………「Step2b 同主体异路径：hash8 消歧各自成库」
//   Step2 derive-in-flight-loading / derive-rpc-error-state ……组件单测钉死（相位机）——e2e 载体注记
//   Step3 suspected-move-rejected ………………………………………………………………「Step3 疑似移动：拒绝 + 手工指引留场 + 确认禁用 + 零副作用」
//   Step3 reselect-recheck-passes ………………………………………………………………「Step3b 处置后重选复检通过：恢复正常确认」
//   Step3 validation-error-confirm-gated …………………………………………「Step3c 校验门禁：字段问题在场确认禁用（FieldIssue 近旁）」
//   Step3 already-registered-idempotent-reuse ………………………………「Step3d 已注册幂等复用：StateChip + 挂接既有工作区」
//
// Assertion depth: 52/55 behavioral (95%)，其中 deep 22/52 (42%)——两阈均过。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import type { ProjectSummary } from '../../../packages/contracts/src/dto/project.js'
import { PROJECTS_M2_CHANNELS, PROPOSALS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { deriveTaskStoreDir, flattenWorkspacePath, hash8OfPath } from '../../../packages/core/src/forge/workspace/derive-dir.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { enterDir, dirRow } from '../../support/navigation.js'
import { AP_ANY, CTA_ADD_PROJECT, DSR_DIR, DSR_ERROR, NAV_ADD_PROJECT, addProjectPhase, dsrOf, projectRowOf, rfIssue } from '../../support/anchors.js'

/** 表单段走查：入口 → 浏览器 → 夹具根 → 选目录 → 下一步 → 表单就位（sc-branch 同径） */
async function selectWorkspaceAndNext(page: Page, fixtureRoot: string, dirName: string, viaHeroCta: boolean): Promise<void> {
  if (viaHeroCta) {
    await page.locator(CTA_ADD_PROJECT).click()
  } else {
    await page.locator(NAV_ADD_PROJECT).first().click()
  }
  await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
  for (const segment of ['AppData', 'Local', 'Temp']) {
    await enterDir(page, segment)
  }
  await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
  await dirRow(page, dirName).click()
  await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
  await expect(page.locator(addProjectPhase('form'))).toBeVisible()
}

/** 派生行 ready 并返回呈现串（逐字呈现面读取） */
async function derivedLiteral(page: Page): Promise<string> {
  await expect(page.locator(dsrOf('ready')), '派生行 ready').toBeVisible({ timeout: 30_000 })
  return ((await page.locator(DSR_DIR).textContent()) ?? '').trim()
}

test('@web-e2e @m2 注册派生·冒烟：选目录 → 派生行四面一致 → 确认建库（SC2 单源）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-'))
  const wsDir = join(fixtureRoot, 'ws-wrg')
  mkdirSync(wsDir, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-ud-'))
  const tasksHome = join(userData, 'forge-workspaces')
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // ── Step 1：hero CTA → 浏览器选目录 → 表单（一步回填 + 项目名自动取文件夹名）──
    await selectWorkspaceAndNext(page, fixtureRoot, 'ws-wrg', true)
    const wsField = page.locator('[data-dswf-rf-ws]')
    await expect(wsField, '工作区目录字段回填（选定目录）').toHaveValue(wsDir, { timeout: 15_000 })
    await expect(page.locator('[data-dswf-rf-name]'), '项目名自动取文件夹名（ws-wrg）').toHaveValue('ws-wrg', { timeout: 15_000 })

    // ── Step 2：派生行只读呈现（{tasksHome}/{flatten}@{hash8} 全路径——单源下发不自算）──
    const literal = await derivedLiteral(page)
    expect(literal, '派生行路径非空（全路径逐字呈现）').not.toBe('')
    expect(literal.startsWith(tasksHome), '派生串以 tasksHome 起头').toBe(true)
    expect(literal, '派生串含 @hash8 消歧后缀段').toContain('@')
    // 面① 产品 RPC 单源 ≡ 表单呈现
    const derivedRpc = await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: wsDir })
    expect(derivedRpc.dir, '表单呈现 ≡ 产品面 RPC 下发（SC2 ①）').toBe(literal)
    // 面② core 单源计算 ≡ 表单呈现
    const derivedCore = deriveTaskStoreDir(tasksHome, realpathSync(wsDir))
    expect(derivedCore, '表单呈现 ≡ core deriveTaskStoreDir 单源计算（SC2 ②）').toBe(literal)

    // ── Step 3：确认注册 → 建库 + 发现面扫描 + 成功反馈 ──
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator(addProjectPhase('success')), '成功反馈面（新建工作区）').toBeVisible({ timeout: 60_000 })
    await expect(page.locator(addProjectPhase('success'))).toContainText('已创建新工作区')
    await expect(page.locator(AP_ANY), '成功自动关闭后模态退场').toHaveCount(0, { timeout: 30_000 })

    // 中央行 + 侧栏行 + 面③ 实际建库位置 ≡ 表单呈现（惰性首开 forge.db 恰在该路径）
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    const row = projects.find((p) => p.wsPath === wsDir)
    expect(row, '中央项目行在场（ws_path canonical）').toBeDefined()
    await expect(page.locator(projectRowOf((row as ProjectSummary).id)).first(), '侧栏项目树行在场').toBeVisible({ timeout: 30_000 })
    await forgeInvoke(page, PROPOSALS_CHANNELS.list, { projectId: (row as ProjectSummary).id })
    expect(existsSync(join(literal, 'forge.db')), '实际建库位置 = 表单呈现（SC2 ③——forge.db 恰在该路径）').toBe(true)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 注册派生·Step1b 重选目录：派生行更新（不残留旧值）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-rs-'))
  const dirA = join(fixtureRoot, 'ws-a')
  const dirB = join(fixtureRoot, 'ws-b')
  mkdirSync(dirA, { recursive: true })
  mkdirSync(dirB, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-rs-ud-'))
  const tasksHome = join(userData, 'forge-workspaces')
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    await selectWorkspaceAndNext(page, fixtureRoot, 'ws-a', false)
    const literalA = await derivedLiteral(page)
    expect(literalA, 'A 派生串在场（hash8(A)）').toContain(hash8OfPath(realpathSync(dirA)))

    // 重开选择器（「重新选择」侧栏钮——relink 语义）→ 换选 B
    await page.locator('.dswf-rf-sidebtn', { hasText: '重新选择' }).first().click()
    await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
    await dirRow(page, 'ws-b').click()
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()

    // 派生行随目录变化更新（换选复检：loading → ready(B)——瞬态由单测钉死，e2e 断终态）
    const literalB = await derivedLiteral(page)
    expect(literalB, '派生行更新为 B 的串（不残留 A 旧值）').not.toBe(literalA)
    expect(literalB, 'B 派生串含 hash8(B)（扁平化主体与 hash8 相应变化）').toContain(hash8OfPath(realpathSync(dirB)))
    const derivedRpc = await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: dirB })
    expect(derivedRpc.dir, '换选后表单呈现 ≡ RPC 单源（B）').toBe(literalB)
    expect(deriveTaskStoreDir(tasksHome, realpathSync(dirB)), '换选后表单呈现 ≡ core 单源（B）').toBe(literalB)
    await expect(page.locator('[data-dswf-rf-ws]'), '表单 workspaceDir = B（不残留旧值）').toHaveValue(dirB, { timeout: 15_000 })

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 注册派生·Step1c 取消选择：表单保持取消前状态（零副作用）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-cx-'))
  const dirA = join(fixtureRoot, 'ws-cx')
  mkdirSync(dirA, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-cx-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    await selectWorkspaceAndNext(page, fixtureRoot, 'ws-cx', true)
    const literalBefore = await derivedLiteral(page)

    // 重开选择器后取消（降桥载体 = 浏览器面「返回上一步」——取消点在注册执行之前）
    await page.locator('.dswf-rf-sidebtn', { hasText: '重新选择' }).first().click()
    await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
    await page.locator('button', { hasText: '返回上一步' }).first().click()
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()

    // 表单保持取消前状态（无新路径回填、无错误提示；派生行原值）
    await expect(page.locator('[data-dswf-rf-ws]'), '工作区目录保留取消前选定').toHaveValue(dirA, { timeout: 15_000 })
    const literalAfter = await derivedLiteral(page)
    expect(literalAfter, '派生行保持取消前串（零副作用）').toBe(literalBefore)
    await expect(page.locator(DSR_ERROR).first(), '无错误提示').toHaveCount(0)

    // 可再次发起选择（重开无阻）
    await page.locator('.dswf-rf-sidebtn', { hasText: '重新选择' }).first().click()
    await expect(page.locator(addProjectPhase('browser'))).toBeVisible()

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 注册派生·Step3 疑似移动：拒绝 + 手工指引留场 + 确认禁用 + 零副作用', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-mv-'))
  const movedWs = join(fixtureRoot, 'ws-moved')
  mkdirSync(movedWs, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-mv-ud-'))
  const tasksHome = join(userData, 'forge-workspaces')
  // 疑似移动构造（4.3 台账口径）：tasksHome 预置同 flatten 异 hash8 孤儿目录
  const movedFlatten = flattenWorkspacePath(realpathSync(movedWs))
  const fakeDir = join(tasksHome, `${movedFlatten}@deadbeef`)
  mkdirSync(fakeDir, { recursive: true })
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    await selectWorkspaceAndNext(page, fixtureRoot, 'ws-moved', true)

    // 派生行 suspected-move（表单预检位——ERR_SUSPECTED_MOVE 于中央行落库前）
    await expect(page.locator(dsrOf('suspected-move')), '派生行 suspected-move 态').toBeVisible({ timeout: 30_000 })
    const errorBar = page.locator(DSR_ERROR).first()
    await expect(errorBar, '错误条在场').toBeVisible()
    await expect(errorBar, '手工指引留场（guidance 单源 core——疑似移动语义）').toContainText('疑似移动')
    await expect(errorBar, '孤儿目录指引（删除或改回原名）').toContainText('孤儿目录')
    await expect(errorBar).toContainText(fakeDir)
    await expect(page.locator('.dswf-rf-confirm'), '确认禁用（疑似移动拒绝位）').toBeDisabled()

    // 指引留场（非瞬态）+ 零副作用：中央零行 + tasksHome 零新目录
    await page.waitForTimeout(1_500)
    await expect(errorBar, '指引留场（表单停留期持续在场）').toBeVisible()
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '中央行零副作用（拒绝发生在落库前）').toEqual([])
    expect(readdirSync(tasksHome), 'tasksHome 零新目录（仅预置孤儿）').toEqual([`${movedFlatten}@deadbeef`])

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 注册派生·Step3b 处置后重选复检通过：恢复正常确认', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-rc-'))
  const suspectWs = join(fixtureRoot, 'ws-suspect')
  const cleanWs = join(fixtureRoot, 'ws-clean')
  mkdirSync(suspectWs, { recursive: true })
  mkdirSync(cleanWs, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-rc-ud-'))
  const tasksHome = join(userData, 'forge-workspaces')
  const suspectFlatten = flattenWorkspacePath(realpathSync(suspectWs))
  mkdirSync(join(tasksHome, `${suspectFlatten}@deadbeef`), { recursive: true })
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // 第一轮：疑似移动被拒（表单错误态）
    await selectWorkspaceAndNext(page, fixtureRoot, 'ws-suspect', true)
    await expect(page.locator(dsrOf('suspected-move'))).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.dswf-rf-confirm')).toBeDisabled()

    // 处置：改选别的工作区目录（碰撞条件不再成立）→ 复检通过 → 恢复正常确认
    await page.locator('.dswf-rf-sidebtn', { hasText: '重新选择' }).first().click()
    await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
    await dirRow(page, 'ws-clean').click()
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()
    const literal = await derivedLiteral(page)
    await expect(page.locator(DSR_ERROR).first(), '错误条消退（复检通过）').toHaveCount(0)
    await expect(page.locator('.dswf-rf-confirm'), '确认恢复可用').toBeEnabled()

    // 再次确认 → 注册成功（同 success 形态：中央行 + 建库）
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator(addProjectPhase('success')), '复检通过后注册成功').toBeVisible({ timeout: 60_000 })
    await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 30_000 })
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects.find((p) => p.wsPath === cleanWs), '干净注册行在场').toBeDefined()
    await forgeInvoke(page, PROPOSALS_CHANNELS.list, { projectId: (projects.find((p) => p.wsPath === cleanWs) as ProjectSummary).id })
    expect(existsSync(join(literal, 'forge.db')), '实际建库位置 = 复检后派生串').toBe(true)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 注册派生·Step3c 校验门禁：字段问题在场确认禁用（FieldIssue 近旁）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-vg-'))
  const wsDir = join(fixtureRoot, 'ws-vg')
  mkdirSync(wsDir, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-vg-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    await selectWorkspaceAndNext(page, fixtureRoot, 'ws-vg', true)
    await derivedLiteral(page)
    await expect(page.locator('.dswf-rf-confirm'), '健康表单确认可用（对照面）').toBeEnabled()
    await expect(page.locator(rfIssue('name')), '无字段问题（无 FieldIssue）').toHaveCount(0)

    // 必填字段空缺：清空项目名 → 近旁问题提示 + 确认禁用（校验门先于注册执行链）
    await page.locator('[data-dswf-rf-name]').fill('')
    await expect(page.locator(rfIssue('name')).first(), '字段级校验提示在场（name 近旁）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.dswf-rf-confirm'), '确认被门禁拦截（issues 非空 → disabled）').toBeDisabled()

    // 零提交：中央零行（表单不提交、用户可修正后重试）
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '零提交零库写入').toEqual([])

    // 修正后重试：补填项目名 → 提示消退 + 确认恢复
    await page.locator('[data-dswf-rf-name]').fill('ws-vg')
    await expect(page.locator(rfIssue('name')), '修正后提示消退').toHaveCount(0)
    await expect(page.locator('.dswf-rf-confirm'), '修正后确认恢复').toBeEnabled()

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 注册派生·Step3d 已注册幂等复用：StateChip + 挂接既有工作区', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-id-'))
  const wsDir = join(fixtureRoot, 'ws-idem')
  mkdirSync(wsDir, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-id-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // 首轮注册（正常新建）
    await selectWorkspaceAndNext(page, fixtureRoot, 'ws-idem', true)
    await derivedLiteral(page)
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator(addProjectPhase('success'))).toContainText('已创建新工作区', { timeout: 60_000 })
    await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 30_000 })
    const first = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(first, '首轮恰一行').toHaveLength(1)

    // 次轮：对已注册目录再次提交 → 表单事前「已注册」StateChip + 幂等返回（不报错不建重复库）
    await page.locator(NAV_ADD_PROJECT).first().click()
    await expect(page.locator(addProjectPhase('browser'))).toBeVisible({ timeout: 30_000 })
    for (const segment of ['AppData', 'Local', 'Temp']) {
      await enterDir(page, segment)
    }
    await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
    await dirRow(page, 'ws-idem').dblclick()
    await expect(dirRow(page, 'ws-idem'), '浏览器行「已注册」标记在场（pick 时口径）').toContainText('已注册')
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()
    await expect(page.locator('.dswf-rf-wsreg').first(), '表单「已注册」StateChip 在场').toBeVisible({ timeout: 15_000 })
    await derivedLiteral(page)
    await expect(page.locator('.dswf-rf-confirm'), '幂等径确认可用（重复注册非错误）').toBeEnabled()
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator(addProjectPhase('success')), '幂等成功反馈（挂接既有）').toContainText('已挂接既有工作区', { timeout: 60_000 })
    await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 30_000 })

    // 中央零重复行（幂等复用零新建）
    const second = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(second, '幂等复用：仍恰一行（不重复登记）').toHaveLength(1)
    expect(second[0]?.id, '返回既有项目（同 projectId）').toBe(first[0]?.id)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 注册派生·Step2b 同主体异路径：hash8 消歧各自成库', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-fl-'))
  // 两条路径扁平化后同主体（分隔符 vs 字面连字符）；canonical 全路径相异 → hash8 相异
  const nestedDir = join(fixtureRoot, 'aa', 'bb')
  const flatDir = join(fixtureRoot, 'aa-bb')
  mkdirSync(nestedDir, { recursive: true })
  mkdirSync(flatDir, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-wrg-fl-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // 前置：flatten 主体相同（夹具构造判据——不相异即夹具失效）
    const nestedFlatten = flattenWorkspacePath(realpathSync(nestedDir))
    const flatFlatten = flattenWorkspacePath(realpathSync(flatDir))
    expect(nestedFlatten, '夹具判据：两路径 flatten 同主体').toBe(flatFlatten)
    expect(hash8OfPath(realpathSync(nestedDir)), '夹具判据：hash8 相异').not.toBe(hash8OfPath(realpathSync(flatDir)))

    // 面①：产品 RPC 派生——两串主体相同、hash8 相异（各自指向独立任务库目录）
    const nestedDerived = await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: nestedDir })
    const flatDerived = await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: flatDir })
    expect(nestedDerived.dir, '两派生串相异（hash8 消歧）').not.toBe(flatDerived.dir)
    expect(nestedDerived.dir.split('@')[0], '扁平化主体相同（nested）').toBe(flatDerived.dir.split('@')[0])
    expect(nestedDerived.dir.split('@')[1], 'nested hash8').toBe(hash8OfPath(realpathSync(nestedDir)))
    expect(flatDerived.dir.split('@')[1], 'flat hash8').toBe(hash8OfPath(realpathSync(flatDir)))

    // 面②：两工作区分别注册 → 各自成库（互不覆盖、互不认领）
    for (const [dir, name] of [[nestedDir, '嵌套路径'], [flatDir, '连字符路径']] as const) {
      await page.locator(NAV_ADD_PROJECT).first().click()
      await expect(page.locator(addProjectPhase('browser'))).toBeVisible({ timeout: 30_000 })
      for (const segment of ['AppData', 'Local', 'Temp']) {
        await enterDir(page, segment)
      }
      await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
      if (dir === nestedDir) await enterDir(page, 'aa')
      await dirRow(page, dir === nestedDir ? 'bb' : 'aa-bb').click()
      await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
      await expect(page.locator(addProjectPhase('form'))).toBeVisible()
      await derivedLiteral(page)
      await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
      await expect(page.locator(addProjectPhase('success')), `${name} 注册成功`).toBeVisible({ timeout: 60_000 })
      await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 30_000 })
    }
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '两项目并存（同主体异路径各自成库）').toHaveLength(2)
    // 两库目录并存互不覆盖（触域后 forge.db 各自在场）
    for (const p of projects) await forgeInvoke(page, PROPOSALS_CHANNELS.list, { projectId: p.id })
    expect(existsSync(join(nestedDerived.dir, 'forge.db')), 'nested 库在场').toBe(true)
    expect(existsSync(join(flatDerived.dir, 'forge.db')), 'flat 库在场（独立目录）').toBe(true)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});
