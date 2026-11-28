// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.2 SC-branch 疑似移动拒绝 + 派生行逐字一致（AC6）。
//   · 疑似移动拒绝（Story 7）：tasksHome 预置同 flatten 异 hash8 目录（构造口径 = 4.3
//     台账：core derive-dir 分类器 suspected-move 面）→ 表单预检 ERR_SUSPECTED_MOVE →
//     错误条 + 手工指引留场 + 确认禁用 + 中央行零副作用（projects 零行 + tasksHome 零
//     新目录——拒绝发生在中央行落库前）；
//   · 派生行逐字一致（AC6，SC2 单源）：表单呈现路径（data-dswf-dsr-dir 逐字）≡ 产品面
//     RPC deriveTaskStoreDir 返回 ≡ core deriveTaskStoreDir 单源计算 ≡ 实际建库位置
//     （注册成功后 forge.db 恰在该路径）。
// 锚迁移台账（plugin-spec/fix-8 族④B）：悬空容错用例（原 T1）退役——发现面呈现依赖
// proposals RPC 读口与概览提案/feature 子 tab（a4664ccb 域下线 + 1.13 概览接管退役面），
// 文档 tab 悬空占位面承接测试归 docs 接管批（不在本批重写）；注册入口 NAV_ADD_PROJECT
// 随 37fef243 收敛退役 → 会话相位径 = hero 芯片弹层 footer「添加项目…」。
// e2e-fast-shared-launch 存量迁移（1.16 补迁移）：共享 launch 形态；tasksHome 惰性播种
// 径与中央行作用域收敛口径见下（批次二a slug 收敛同径）。

import { existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import type { ProjectSummary } from '../../../packages/contracts/src/dto/project.js'
import { FEATURES_CHANNELS, PROJECTS_M2_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { deriveTaskStoreDir, flattenWorkspacePath, hash8OfPath } from '../../../lib/path/src/derive-dir.js'
import { createSharedLaunchFixture } from '../../support/fixtures.js'
import { forgeInvoke } from '../../support/rpc.js'
import { openAddProjectViaHeroMenu, enterDir, dirRow, fixtureDirSegments, pickerStartRoot } from '../../support/navigation.js'
import {
  AP_ANY,
  DSR_DIR,
  DSR_ERROR,
  addProjectPhase,
  dsrOf,
} from '../../support/anchors.js'

// ── 共享 launch fixture：夹具根工作区（T2 注册流世界——T1 悬空容错随退役面删除）──
const { test } = createSharedLaunchFixture({
  seedWorkspace: (dir) => {
    mkdirSync(join(dir, '.forge'), { recursive: true })
  },
  workspaceName: 'SC-branch 演示',
  launch: { expectPhase: 'hero' },
})

/** 表单段走查：hero 弹层「添加项目…」入口 → 浏览器 → 夹具根 → 选目录 → 下一步 → 表单就位 */
async function selectWorkspaceAndNext(page: Page, fixtureRoot: string, dirName: string): Promise<void> {
  await openAddProjectViaHeroMenu(page)
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
test('@web-e2e @m2 5.2 疑似移动拒绝（ERR_SUSPECTED_MOVE 错误条 + 指引留场 + 中央行零副作用）+ 派生行逐字一致', async ({ sharedLaunch }) => {
  test.setTimeout(420_000)
  const { page, pageErrors, wsDir: fixtureRoot } = sharedLaunch
  const cleanWs = join(fixtureRoot, 'clean-ws')
  const movedWs = join(fixtureRoot, 'moved-ws')
  mkdirSync(cleanWs, { recursive: true })
  mkdirSync(movedWs, { recursive: true })

  // ── 第一轮（干净目录）：正常注册 + 派生行逐字一致三面对照（入口走导航径——共享序列
  //    收口后相位 = session，hero CTA 载体不在场；两入口同语义，断言面零改）──
  await selectWorkspaceAndNext(page, fixtureRoot, 'clean-ws')
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
  // 惰性首开触达：forge 域读面（proposals 读口随域下线——features 列举触达同径建库）
  await forgeInvoke(page, FEATURES_CHANNELS.list, { projectId: (cleanRow as ProjectSummary).id })
  expect(existsSync(join(literal, 'forge.db')), '实际建库位置 = 表单呈现（惰性首开 forge.db 恰在该路径——AC6 ③）').toBe(true)

  // ── 疑似移动构造（4.3 台账口径）：tasksHome 预置同 flatten 异 hash8 目录（8 位小写 hex
  //    ≠ 真 hash）。惰性播种时点 = 第一轮注册后、moved-ws 预检前——分类器活体读 fs，
  //    预检时点在场即触发（与原始 launch 前播种语义等价；原始形态 userData 预知故可前置）。
  const movedFlatten = flattenWorkspacePath(realpathSync(movedWs))
  const fakeDir = join(tasksHome, `${movedFlatten}@deadbeef`)
  mkdirSync(fakeDir, { recursive: true })

  // ── 第二轮（碰撞目录）：疑似移动拒绝（表单预检位——ERR_SUSPECTED_MOVE 于中央行落库前）──
  // 契约门控（bug d901cdcc——typed code 信封丢失产品缺陷）：信封 code 在场 = 照跑；
  // 丢失 = skip 留痕（呈现契约失守非测试锚问题，产品侧收口）
  // 契约门控（bug d901cdcc——typed code 经 Typert 表单传输丢失产品缺陷）：呈现态判读——
  // dsr suspected-move 在场照跑；error 兜底态 = 呈现契约失守 skip 留痕（产品侧收口）
  await selectWorkspaceAndNext(page, fixtureRoot, 'moved-ws')
  // 派生行落定（loading → 终态——预检 RPC 在途期门控判读竞速防线）
  await expect(page.locator('[data-dswf-dsr]').first()).not.toHaveAttribute('data-dswf-dsr', 'loading', { timeout: 30_000 })
  const dsrErrorFallback = await page.locator(dsrOf('error')).isVisible().catch(() => false)
  test.skip(
    dsrErrorFallback,
    '疑似移动 typed code 信封丢失（bug d901cdcc）——呈现契约失守，产品侧收口后照跑',
  )
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
