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
// M3 drift 台账（5.2 落定）：4.6 行头多动作迁移——提案/feature 父行整行点击退役，
// 展开命中面 = [data-dswf-ov-parent-toggle]（v22 行语言——零嵌套按钮纪律）。
// e2e-fast-shared-launch 存量迁移（1.16 补迁移）：两用例全迁共享 launch 形态（冷启 2 → 1）。
// 适配点：①T1 悬空容错夹具 docs 置 forge_dir（{ws}/.forge）之下经 seedWorkspace 播种
// （首启注册相位即发现链建行——与原始「注册时文件在场」时序同构；rel_path 相对 forge_dir
// 不变）；②T2 tasksHome 不再预知（共享 fixture userData 自管不外露）——预置孤儿目录改
// 第一轮干净注册后、moved-ws 预检前经产品面单源 RPC 派生路径反解 tasksHome 惰性播种
// （分类器活体读 fs——预检时点在场即触发，与原始 launch 前播种语义等价）；中央行零副作用
// 断言按夹具子树收敛作用域（共享 fixture 自注册行不属被测面——批次二a slug 收敛同径）；
// pageErrors 断言面改 sharedLaunch 整 spec 累计（批次一同径，语义收紧）。

import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import type { ProjectSummary } from '../../../packages/contracts/src/dto/project.js'
import { PROPOSALS_CHANNELS, PROJECTS_M2_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { deriveTaskStoreDir, flattenWorkspacePath, hash8OfPath } from '../../../packages/core/src/forge/workspace/derive-dir.js'
import { createSharedLaunchFixture } from '../../support/fixtures.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock, enterDir, dirRow, fixtureDirSegments, pickerStartRoot } from '../../support/navigation.js'
import {
  AP_ANY,
  CTA_ADD_PROJECT,
  DOC_PATH_LABEL,
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

// ── 共享 launch fixture：T1 悬空容错夹具 docs 经 seedWorkspace 播种进 forge_dir 之下 ──
const { test } = createSharedLaunchFixture({
  seedWorkspace: (dir) => {
    const put = (rel: string, content: string): void => {
      const abs = join(dir, rel)
      if (existsSync(abs)) return
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content, 'utf8')
    }
    put('.forge/docs/proposals/gone/proposal.md', '---\ntitle: "悬空容错演示"\nstatus: draft\n---\n\n# 悬空容错\n\n正文。\n')
    // M3 数据源分治（2.3 提案文档区 = 活体 fs 扫描——删除后文档行缺席为设计行为）：
    // 悬空占位面板的行稳定断言面迁至 feature 文档（feature_documents 库行——注册时建档）
    put('.forge/docs/features/branch-float/design/tech-design.md', '# 悬空容错 feature 设计文档\n\n正文（删除后 feature_documents 行稳定）。\n')
  },
  workspaceName: 'SC-branch 演示',
  launch: { expectPhase: 'hero' },
})

/** 表单段走查：hero/导航入口 → 浏览器 → 夹具根 → 选目录 → 下一步 → 表单就位 */
async function selectWorkspaceAndNext(page: Page, fixtureRoot: string, dirName: string, viaHeroCta: boolean): Promise<void> {
  if (viaHeroCta) {
    await page.locator(CTA_ADD_PROJECT).click()
  } else {
    await page.locator(NAV_ADD_PROJECT).first().click()
  }
  await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
  for (const segment of fixtureDirSegments(fixtureRoot, pickerStartRoot())) {
    await enterDir(page, segment)
  }
  await dirRow(page, dirName).click()
  await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
  await expect(page.locator(addProjectPhase('form'))).toBeVisible()
}

// ─────────────────────────────────────────────────────────────────────────────
// SC-branch：悬空文档容错（占位面在场；不崩溃不写入不删行）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @m2 5.2 SC-branch：悬空文档容错——占位面在场 + 不崩溃不写入不删行', async ({ sharedLaunch }) => {
  test.setTimeout(360_000)
  const { page, pageErrors, wsDir } = sharedLaunch
  const proposalPath = join(wsDir, '.forge', 'docs', 'proposals', 'gone', 'proposal.md')
  const featureDocPath = join(wsDir, '.forge', 'docs', 'features', 'branch-float', 'design', 'tech-design.md')
  const featureDocRel = 'docs/features/branch-float/design/tech-design.md'

  // 注册（fixture 项目——发现链建行于首启注册相位完成，此处幂等重取项目行）
  const project = await registerProject(page, wsDir, 'SC-branch 演示')
  const projectId = project.id
  const docRel = 'docs/proposals/gone/proposal.md'
  const rowsBefore = await forgeInvoke<readonly { slug: string; relPath?: string }[]>(page, PROPOSALS_CHANNELS.list, { projectId })
  expect(rowsBefore.find((p) => p.slug === 'gone')?.relPath, '发现面建行（注册时文件在场）').toBe(docRel)

  // 分支切换模拟：文件移除（提案行此后稳定——悬空 ≠ 缺行；feature 文档同步删除）
  rmSync(proposalPath)
  rmSync(featureDocPath)

  // 提案面（M3 语义）：提案行稳定在场 + 文档区活体扫描归零（文件系统为事实源——设计行为）
  await openOverviewDock(page)
  await page.locator(ovSubtabOf('proposals')).click()
  await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
  const proposalRow = page.locator(OV_PARENT_ANY, { hasText: '悬空容错演示' }).first()
  await expect(proposalRow, '悬空后提案行仍在列（行稳定——悬空不缺行）').toBeVisible({ timeout: 30_000 })
  await proposalRow.locator('[data-dswf-ov-parent-toggle]').click()
  await expect(proposalRow.locator('xpath=following-sibling::div[@data-dswf-ov-meta]'), '展开元数据在场').toBeVisible({ timeout: 15_000 })
  await expect(proposalRow.locator('xpath=following-sibling::div[@data-dswf-ov-meta]')).toContainText('文档（0 篇）')

  // 悬空占位面板：feature 文档行（库行稳定）→ 点击 → dock 文档 tab 悬空分支
  await page.locator(ovSubtabOf('features')).click()
  await expect(page.locator(ovSubtabOf('features'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
  const featureRow = page.locator(OV_PARENT_ANY, { hasText: 'branch-float' }).first()
  await expect(featureRow, 'feature 行在场（文件删除后行稳定）').toBeVisible({ timeout: 30_000 })
  const featureToggle = featureRow.locator('[data-dswf-ov-parent-toggle]')
  await featureToggle.click()
  await expect(featureToggle).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })
  const docRow = page.locator(ovDocRowOf(featureDocRel)).first()
  await expect(docRow, '悬空后 feature 文档行仍在列（库行稳定——悬空不缺行）').toBeVisible({ timeout: 30_000 })
  await docRow.click()
  const panel = page.locator(docPanelOf(projectId, featureDocRel)).first()
  await expect(panel).toBeVisible({ timeout: 30_000 })
  // 悬空标记 = panel 级属性（data-dswf-doc-dangling 与 doc-key 同元素——docs/index 悬空分支；
  // 属性名断言面非选择器，锚台账 selector DOC_DANGLING 的元素即本 panel）
  await expect(panel, '悬空占位面在场（SC-branch 容错锚）').toHaveAttribute('data-dswf-doc-dangling', '')
  await expect(panel).toContainText('文档引用悬空')
  await expect(panel.locator(DOC_PATH_LABEL), '单行头路径保留（悬空态不崩页面——1.6 官方 PathLabel 载体）').toBeVisible()

  // 不崩溃：renderer 零未捕获异常
  expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])

  // 不写入：文件不被重建（应用对悬空只读）
  expect(existsSync(proposalPath), '悬空文件不被重建（只读容错零写入）').toBe(false)
  expect(existsSync(featureDocPath), 'feature 悬空文件不被重建').toBe(false)

  // 不删行：RPC 行 + forge.db 行双面（行此后稳定）
  const rowsAfter = await forgeInvoke<readonly { slug: string; relPath?: string }[]>(page, PROPOSALS_CHANNELS.list, { projectId })
  expect(rowsAfter.find((p) => p.slug === 'gone')?.relPath, '悬空读后 RPC 行仍在（不删行）').toBe(docRel)
  const derived = await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: wsDir })
  const db = openForgeDbAt(derived.dir)
  try {
    const row = db.prepare<unknown[], { slug: string; rel_path: string }>(`SELECT slug, rel_path FROM proposals WHERE slug = 'gone'`).get()
    expect(row?.rel_path, '悬空读后 forge.db 行仍在（盘级不删行）').toBe(docRel)
    const featureDocRow = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM feature_documents WHERE rel_path = ?`).get(featureDocRel)
    expect(featureDocRow?.n, 'feature 文档库行不删（悬空面板行稳定源）').toBe(1)
  } finally {
    db.close()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 疑似移动拒绝 + 派生行逐字一致（Story 7 / AC6：表单呈现 = 实际建库位置）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @m2 5.2 疑似移动拒绝（ERR_SUSPECTED_MOVE 错误条 + 指引留场 + 中央行零副作用）+ 派生行逐字一致', async ({ sharedLaunch }) => {
  test.setTimeout(420_000)
  const { page, pageErrors, wsDir: fixtureRoot } = sharedLaunch
  const cleanWs = join(fixtureRoot, 'clean-ws')
  const movedWs = join(fixtureRoot, 'moved-ws')
  mkdirSync(cleanWs, { recursive: true })
  mkdirSync(movedWs, { recursive: true })

  // ── 第一轮（干净目录）：正常注册 + 派生行逐字一致三面对照（入口走导航径——共享序列
  //    收口后相位 = session，hero CTA 载体不在场；两入口同语义，断言面零改）──
  await selectWorkspaceAndNext(page, fixtureRoot, 'clean-ws', false)
  await expect(page.locator(dsrOf('ready')), '派生行 ready（干净目录正常推导）').toBeVisible({ timeout: 30_000 })
  const literal = ((await page.locator(DSR_DIR).textContent()) ?? '').trim()
  expect(literal, '派生行路径非空（全路径逐字呈现面）').not.toBe('')
  // 面① 产品 RPC 单源：deriveTaskStoreDir 返回 ≡ 表单呈现
  const derivedRpc = await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: cleanWs })
  expect(derivedRpc.dir, '表单呈现 ≡ 产品面 RPC 下发（AC6 ①）').toBe(literal)
  // 面② core 单源计算：deriveTaskStoreDir(tasksHome, canonical(ws)) ≡ 表单呈现
  //（tasksHome 自产品面单源 RPC 派生路径反解——共享 fixture userData 自管不外露）
  const tasksHome = dirname(derivedRpc.dir)
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

  // ── 疑似移动构造（4.3 台账口径）：tasksHome 预置同 flatten 异 hash8 目录（8 位小写 hex
  //    ≠ 真 hash）。惰性播种时点 = 第一轮注册后、moved-ws 预检前——分类器活体读 fs，
  //    预检时点在场即触发（与原始 launch 前播种语义等价；原始形态 userData 预知故可前置）。
  const movedFlatten = flattenWorkspacePath(realpathSync(movedWs))
  const fakeDir = join(tasksHome, `${movedFlatten}@deadbeef`)
  mkdirSync(fakeDir, { recursive: true })

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

  // ── 中央行零副作用（拒绝发生在落库前；断言按夹具子树收敛作用域——共享 fixture 自注册
  //    行（fixtureRoot 本体）不属被测面，批次二a slug 收敛同径）──
  const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
  const fixtureSubtreeRows = projects.filter((p) => p.wsPath !== fixtureRoot && p.wsPath.startsWith(fixtureRoot))
  expect(fixtureSubtreeRows, '中央行零副作用：夹具子树仅第一轮干净注册一行').toHaveLength(1)
  expect(fixtureSubtreeRows[0]?.wsPath).toBe(cleanWs)
  const homeEntries = readdirSync(tasksHome).sort()
  const cleanCanonical = realpathSync(cleanWs)
  // fixture 项目自持目录（首启注册 + T1 forge 域触达所建）排除后对照——被测语义 =
  // moved-ws 拒绝注册零建库
  const fixtureEntry = `${flattenWorkspacePath(realpathSync(fixtureRoot))}@${hash8OfPath(realpathSync(fixtureRoot))}`
  expect(
    homeEntries.filter((e) => e !== fixtureEntry),
    'tasksHome 零新目录（排除 fixture 项目自持目录后 = 干净注册 + 预置孤儿两目录）',
  ).toEqual([`${flattenWorkspacePath(cleanCanonical)}@${hash8OfPath(cleanCanonical)}`, `${movedFlatten}@deadbeef`].sort())

  expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
})
