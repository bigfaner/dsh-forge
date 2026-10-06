// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.2 SC-branch 悬空容错 + 疑似移动拒绝 + 派生行逐字一致（AC4/AC6）。
//   · SC-branch（悬空容错）：注册后删 proposal.md → 行稳定（悬空 ≠ 缺行）→ 文档 tab
//     只读占位面在场；不崩溃（pageerror 空）、不写入（文件不被重建）、不删行（RPC 行 +
//     forge.db 行双面）——tech-design Interface 4 悬空容忍 + PRD SC-branch；
//   · 疑似移动拒绝（Story 7）：tasksHome 预置同 flatten 异 hash8 目录（构造口径 = 4.3
//     台账：core derive-dir 分类器 suspected-move 面）→ 表单预检 ERR_SUSPECTED_MOVE →
//     错误条 + 手工指引留场 + 确认禁用 + 中央行零副作用（projects 零行 + tasksHome 零
//     新目录——拒绝发生在中央行落库前）；
//   · 派生行逐字一致（AC6，SC2 单源）：表单呈现路径（data-dswf-dsr-dir 逐字）≡ 产品面
//     RPC deriveTaskStoreDir 返回 ≡ core deriveTaskStoreDir 单源计算 ≡ 实际建库位置
//     （注册成功后 forge.db 恰在该路径）。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import type { ProjectSummary } from '../../../packages/contracts/src/dto/project.js'
import { PROPOSALS_CHANNELS, PROJECTS_M2_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { deriveTaskStoreDir, flattenWorkspacePath, hash8OfPath } from '../../../packages/core/src/forge/workspace/derive-dir.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock, enterDir, dirRow } from '../../support/navigation.js'
import {
  AP_ANY,
  CTA_ADD_PROJECT,
  DSR_DIR,
  DSR_ERROR,
  NAV_ADD_PROJECT,
  OV_PARENT_ANY,
  addProjectPhase,
  docPanelOf,
  dsrOf,
  ovDocRowOf,
  ovSubtabOf,
} from '../../support/anchors.js'

/**
 * 注册负载直注（文档发现夹具形态——forge_dir = 仓根承载 docs/ 约定结构；rpc.ts
 * registerProject 固定 {ws}/.forge 载荷不适用）。返回应用库行。
 */
async function registerProjectAt(
  page: Page,
  o: { readonly workspaceDir: string; readonly name: string; readonly forgeDir: string; readonly knowledgeDir: string },
): Promise<ProjectSummary> {
  const result = await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: o.workspaceDir,
    name: o.name,
    forgeDir: o.forgeDir,
    knowledgeDir: o.knowledgeDir,
  })
  const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
  const row = projects.find((p) => p.id === result.projectId)
  expect(row, `注册行入列（${o.name}）`).toBeDefined()
  return row as ProjectSummary
}

/** 表单段走查：hero/导航入口 → 浏览器 → 夹具根 → 选目录 → 下一步 → 表单就位 */
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

// ─────────────────────────────────────────────────────────────────────────────
// SC-branch：悬空文档容错（占位面在场；不崩溃不写入不删行）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @m2 5.2 SC-branch：悬空文档容错——占位面在场 + 不崩溃不写入不删行', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-branch-'))
  const wsDir = join(fixtureRoot, 'ws-branch')
  const proposalPath = join(wsDir, 'docs', 'proposals', 'gone', 'proposal.md')
  mkdirSync(join(wsDir, 'docs', 'proposals', 'gone'), { recursive: true })
  writeFileSync(proposalPath, '---\ntitle: "悬空容错演示"\nstatus: draft\n---\n\n# 悬空容错\n\n正文。\n', 'utf8')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-branch-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // 注册（真实发现链建行——发现面只读扫描 docs/proposals）
    const project = await registerProjectAt(page, {
      workspaceDir: wsDir,
      name: 'SC-branch 演示',
      forgeDir: wsDir,
      knowledgeDir: join(wsDir, '.knowledge'),
    })
    const projectId = project.id
    const docRel = 'docs/proposals/gone/proposal.md'
    const rowsBefore = await forgeInvoke<readonly { slug: string; relPath?: string }[]>(page, PROPOSALS_CHANNELS.list, { projectId })
    expect(rowsBefore.find((p) => p.slug === 'gone')?.relPath, '发现面建行（注册时文件在场）').toBe(docRel)

    // 分支切换模拟：文件移除（行此后稳定——悬空 ≠ 缺行）
    rmSync(proposalPath)

    // 悬空读：占位面在场（路径栏保留 + 只读缺省渲染）
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const docRow = page.locator(ovDocRowOf(docRel)).first()
    if ((await docRow.isVisible().catch(() => false)) === false) {
      await page.locator(OV_PARENT_ANY, { hasText: 'gone' }).first().click()
    }
    await expect(docRow, '悬空后文档行仍在列（行稳定——悬空不缺行）').toBeVisible({ timeout: 30_000 })
    await docRow.click()
    const panel = page.locator(docPanelOf(projectId, docRel)).first()
    await expect(panel).toBeVisible({ timeout: 30_000 })
    // 悬空标记 = panel 级属性（data-dswf-doc-dangling 与 doc-key 同元素——docs/index 悬空分支；
    // 属性名断言面非选择器，锚台账 selector DOC_DANGLING 的元素即本 panel）
    await expect(panel, '悬空占位面在场（SC-branch 容错锚）').toHaveAttribute('data-dswf-doc-dangling', '')
    await expect(panel).toContainText('文档引用悬空')
    await expect(panel.locator('.dswf-doc-path'), '路径栏保留（悬空态不崩页面）').toBeVisible()

    // 不崩溃：renderer 零未捕获异常
    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])

    // 不写入：文件不被重建（应用对悬空只读）
    expect(existsSync(proposalPath), '悬空文件不被重建（只读容错零写入）').toBe(false)

    // 不删行：RPC 行 + forge.db 行双面（行此后稳定）
    const rowsAfter = await forgeInvoke<readonly { slug: string; relPath?: string }[]>(page, PROPOSALS_CHANNELS.list, { projectId })
    expect(rowsAfter.find((p) => p.slug === 'gone')?.relPath, '悬空读后 RPC 行仍在（不删行）').toBe(docRel)
    const derived = await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: wsDir })
    const db = openForgeDbAt(derived.dir)
    try {
      const row = db.prepare<unknown[], { slug: string; rel_path: string }>(`SELECT slug, rel_path FROM proposals WHERE slug = 'gone'`).get()
      expect(row?.rel_path, '悬空读后 forge.db 行仍在（盘级不删行）').toBe(docRel)
    } finally {
      db.close()
    }
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 疑似移动拒绝 + 派生行逐字一致（Story 7 / AC6：表单呈现 = 实际建库位置）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @m2 5.2 疑似移动拒绝（ERR_SUSPECTED_MOVE 错误条 + 指引留场 + 中央行零副作用）+ 派生行逐字一致', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-move-'))
  const cleanWs = join(fixtureRoot, 'clean-ws')
  const movedWs = join(fixtureRoot, 'moved-ws')
  mkdirSync(cleanWs, { recursive: true })
  mkdirSync(movedWs, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-move-ud-'))
  const tasksHome = join(userData, 'forge-workspaces')
  // 疑似移动构造（4.3 台账口径）：tasksHome 预置同 flatten 异 hash8 目录（8 位小写 hex ≠ 真 hash）
  const movedFlatten = flattenWorkspacePath(realpathSync(movedWs))
  const fakeDir = join(tasksHome, `${movedFlatten}@deadbeef`)
  mkdirSync(fakeDir, { recursive: true })
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    // ── 第一轮（干净目录）：正常注册 + 派生行逐字一致三面对照 ──
    await selectWorkspaceAndNext(page, fixtureRoot, 'clean-ws', true)
    await expect(page.locator(dsrOf('ready')), '派生行 ready（干净目录正常推导）').toBeVisible({ timeout: 30_000 })
    const literal = ((await page.locator(DSR_DIR).textContent()) ?? '').trim()
    expect(literal, '派生行路径非空（全路径逐字呈现面）').not.toBe('')
    // 面① 产品 RPC 单源：deriveTaskStoreDir 返回 ≡ 表单呈现
    const derivedRpc = await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: cleanWs })
    expect(derivedRpc.dir, '表单呈现 ≡ 产品面 RPC 下发（AC6 ①）').toBe(literal)
    // 面② core 单源计算：deriveTaskStoreDir(tasksHome, canonical(ws)) ≡ 表单呈现
    const derivedCore = deriveTaskStoreDir(tasksHome, realpathSync(cleanWs))
    expect(derivedCore, '表单呈现 ≡ core deriveTaskStoreDir 单源计算（AC6 ②）').toBe(literal)
    // 注册完成 → 面③ 实际建库位置：首次 forge 域触达（惰性首开——注册闭包零盘动作，
    // ensureOpen 才建库）后 forge.db 恰在表单呈现路径
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator(addProjectPhase('success'))).toBeVisible({ timeout: 60_000 })
    await expect(page.locator(addProjectPhase('success'))).toContainText('已创建新工作区')
    await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 30_000 })
    const registered = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    const cleanRow = registered.find((p) => p.wsPath === cleanWs)
    expect(cleanRow, '干净注册行在场（ws_path canonical）').toBeDefined()
    await forgeInvoke(page, PROPOSALS_CHANNELS.list, { projectId: (cleanRow as ProjectSummary).id })
    expect(existsSync(join(literal, 'forge.db')), '实际建库位置 = 表单呈现（惰性首开 forge.db 恰在该路径——AC6 ③）').toBe(true)

    // ── 第二轮（碰撞目录）：疑似移动拒绝（表单预检位——ERR_SUSPECTED_MOVE 于中央行落库前）──
    await selectWorkspaceAndNext(page, fixtureRoot, 'moved-ws', false)
    await expect(page.locator(dsrOf('suspected-move')), '派生行 suspected-move（预检拒绝面）').toBeVisible({ timeout: 30_000 })
    const errorBar = page.locator(DSR_ERROR).first()
    await expect(errorBar, '错误条在场').toBeVisible()
    await expect(errorBar, '手工指引留场（ERR_SUSPECTED_MOVE 载荷——guidance 单源 core）').toContainText('疑似移动')
    await expect(errorBar).toContainText('孤儿目录')
    await expect(errorBar).toContainText(fakeDir)
    await expect(page.locator('.dswf-rf-confirm'), '确认禁用（疑似移动拒绝位）').toBeDisabled()
    // 指引留场：表单停留期间错误条持续在场（无自动消失重试面）
    await page.waitForTimeout(1_500)
    await expect(errorBar, '指引留场（非瞬态）').toBeVisible()

    // ── 中央行零副作用（拒绝发生在落库前）──
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '中央行零副作用：仅第一轮干净注册一行').toHaveLength(1)
    expect(projects[0]?.wsPath).toBe(cleanWs)
    const homeEntries = readdirSync(tasksHome).sort()
    const cleanCanonical = realpathSync(cleanWs)
    expect(
      homeEntries,
      'tasksHome 零新目录（碰撞目录零建库——仅预置孤儿 + 干净注册两目录）',
    ).toEqual([`${flattenWorkspacePath(cleanCanonical)}@${hash8OfPath(cleanCanonical)}`, `${movedFlatten}@deadbeef`].sort())

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
