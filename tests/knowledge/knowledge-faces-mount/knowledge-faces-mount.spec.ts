// 旅程 knowledge-faces-mount——knowledge 装载三面正向呈现。
// 契约正本：.forge/docs/proposals/knowledge-plugin-migration/testing/contracts/
//   knowledge-faces-mount.md（CT-M1/CT-M2/CT-M3）+ shared-anchors-channels.md（A-KN-*）。
// 断言-契约溯源逐条标注（[A-KN-n] / [CT-*]）。
// 形态注记：本套件在 dsh-forge 集成态取证（G-A 壳缝）；G-B 官方宿主 whileServed 分支
//（CT-M1.O4/CT-KN-GATE）集成装配不可复现（bootShell 恒发布壳缝）——纯函数两形态由
// plugins/knowledge/ui/faces-gate.test.ts 单测覆盖；O3 单面注册降级无故障注入夹具通道，
// 由 faces-gate.test.ts（safeRegister 降级组）单测覆盖——此处注记留痕，不伪造真机证据。
import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { closeApp, bootWithProject, makeFacesFixture, openKnowledgePanel, errorConsoleEntries, teardownFaces, type FacesLaunch } from '../faces-journey-harness.js'
import {
  COMPOSER_INPUT,
  KNOWLEDGE_ENTRY,
  KNOWLEDGE_VIEW,
  RECALL_PANE,
  WORKBENCH,
  projectRowOf,
} from '../../../e2e/support/anchors.js'
import { realCredentials, seedDshHome, writeDogfoodOverlay } from '../../../e2e/support/dogfood.js'
import { launchHost, type Launched } from '../../../e2e/support/launch.js'
import { rmDirBestEffort, rmFileBestEffort } from '../../../e2e/support/cleanup.js'

test.setTimeout(600_000)

/** A-KN-8 registered 读数行（faces.ts knowledgeClient.apply console.info——registered 面清单） */
function registeredLine(l: FacesLaunch): string | undefined {
  return l.launched.consoleTail.find((line) => line.includes('knowledge faces registered='))
}

test('CT-M1.O1 装载→三面注册落座（GP1–GP3 + A-KN-8 门控诊断 + 零错误呈现）', async () => {
  const fixture = makeFacesFixture()
  let l: FacesLaunch | undefined
  try {
    // GP1 安装并启动（集成态正式装载通道 = dev profile 插件在场）；注册单项目（锚定无歧义前置）
    l = await bootWithProject(fixture)
    const launched = l.launched
    const page = launched.page
    const projectId = l.projectId
    await expect(page.locator(projectRowOf(projectId)).first()).toBeVisible({ timeout: 30_000 })

    // [A-KN-8] registered 读数 = 三面清单（CT-M1 Output）+ enabled=true（CT-KN-GATE G-A）
    expect(registeredLine(l), 'A-KN-8 registered 读数在场').toBeDefined()
    expect(registeredLine(l)).toContain('registered=[dswf-knowledge, panellist:dswf-knowledge, dswf-recall]')
    expect(registeredLine(l)).toContain('enabled=true')
    // [CT-M1 Side-effect/Invariants]：diag 零 error 级 + 无残留 JS 错误
    expect(errorConsoleEntries(launched), 'diag 零 error 级条目').toEqual([])
    expect(launched.pageErrors, '零 pageerror').toEqual([])

    // [GP2 / A-KN-4]：面板行在场可点，且恰好一行（roster 无双行——幂等锚）
    const entry = page.locator(KNOWLEDGE_ENTRY)
    await expect(entry.first()).toBeVisible({ timeout: 30_000 })
    expect(await entry.count(), 'A-KN-4 恰一行').toBe(1)

    // [GP3 / A-KN-1 + A-KN-2 + A-KN-3]：中区知识面板 + 视图态 + 单项目锚定（非 none）
    await openKnowledgePanel(page, projectId)
  } finally {
    if (l !== undefined) await closeApp(l.launched.app)
    await teardownFaces(fixture)
  }
})

test('CT-M3.O1 无项目锚相位（B4）——面板挂载 + 锚定空态引导 + 不虚挂数据', async () => {
  const fixture = makeFacesFixture()
  let launched: Launched | undefined
  try {
    // 零项目 fresh boot（B4 相位的零项目半边——无注册动作）
    launched = await launchHost({ userData: fixture.userData, collectConsole: true })
    const page = launched.page

    // [A-KN-4] 面板行在场（插件门控与项目态正交——B4 前置）
    await expect(page.locator(KNOWLEDGE_ENTRY).first()).toBeVisible({ timeout: 30_000 })
    await page.locator(KNOWLEDGE_ENTRY).first().click()

    // [A-KN-1 + A-KN-2] 面板挂载；[A-KN-3] = "none"（锚定空态引导）
    await expect(page.locator('[data-dswf-view="knowledge"]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(KNOWLEDGE_VIEW).first()).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(async () => page.locator(KNOWLEDGE_VIEW).first().getAttribute('data-dswf-kn-anchor'), { timeout: 30_000 })
      .toBe('none')
    // [CT-M3.O2 FAIL 预期守卫]：空态不虚发数据请求——浏览数据面（卡片网格）零在场
    await expect(page.locator('[data-dswf-kn-cards]').first()).toHaveCount(0)
    // [CT-M3 Invariants]：diag 无 error、UI 无错误提示态
    expect(errorConsoleEntries(launched), 'diag 零 error 级条目').toEqual([])
    expect(launched.pageErrors, '零 pageerror').toEqual([])
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    await teardownFaces(fixture)
  }
})

test('CT-M1 GP4 + CT-M2.O1 会话召回页签正向呈现（A-KN-5/6/7——真实会话链 dogfood）', async () => {
  // 真实会话上下文 = composer 首消息建档（真实模型往返面）——零凭据环境留痕 skip（不伪造），
  // 口径沿 session-workbench 冒烟组；真机取证归 test-run 收口。
  const credentials = realCredentials()
  test.skip(credentials === undefined, 'dogfood 前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip')
  test.skip(process.env.DSH_FORGE_DOGFOOD_RECORD !== '1', '去模型化门：真实往返须显式 DSH_FORGE_DOGFOOD_RECORD=1')

  const fixture = makeFacesFixture()
  let l: FacesLaunch | undefined
  let overlay: string | undefined
  try {
    seedDshHome(join(fixture.userData, 'dsh-home'), credentials as string)
    overlay = writeDogfoodOverlay()
    l = await bootWithProject(fixture, { overlay })
    const launched = l.launched
    const page = launched.page
    const projectId = l.projectId

    // [GP3/A-KN-1..3 前置] 三面正向呈现 = CT-M1.O1 态
    await openKnowledgePanel(page, projectId)
    await expect(page.locator(WORKBENCH).first()).toBeVisible()

    // 发起会话上下文（composer 首消息建档——会话作用域页签行渲染前置）
    const composer = page.locator(COMPOSER_INPUT).last()
    await composer.click()
    await composer.fill('mount-journey GP4 会话上下文探针')
    await composer.press('Enter')
    await expect(page.locator('[data-conversation-tabs]').first(), '会话页签行出现（会话建档）').toBeVisible({ timeout: 120_000 })

    // [A-KN-5]：召回页签行在场（conversation.view roster 行 id dswf-recall = 官方 TAB_ITEM）
    const recallTab = page.locator('[data-conversation-tabs] [role="tab"]', { hasText: '知识召回' })
    await expect(recallTab).toBeVisible({ timeout: 30_000 })
    expect(await recallTab.count(), 'A-KN-5 恰一行').toBe(1)
    await recallTab.click()

    // [A-KN-6]：召回视图区在场；[A-KN-7]：内容态可辨——空态 face="empty" 或数据态统计面在场，
    // 且错误态 face="error" 不在场（实锚形态：face 属性仅 empty/loading/error 三态渲染，ready
    // 态 = face 属性缺席 + 统计面在场——契约 last_anchor_sync 回填注记同口径）
    await expect(page.locator(RECALL_PANE).first()).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(async () => {
        const faceEl = page.locator('[data-dswf-recall-face]').first()
        const face = (await faceEl.count()) > 0 ? await faceEl.getAttribute('data-dswf-recall-face') : null
        const statsPresent = (await page.locator('[data-dswf-recall-stats]').count()) > 0
        return (face === 'empty' || statsPresent) && face !== 'error'
      }, { timeout: 30_000 })
      .toBe(true)
    // [CT-M2.O1]：数据请求经 forge:knowledge/* 通道应答在位（浏览数据面就绪 = 通道应答代理）
    await page.locator(KNOWLEDGE_ENTRY).first().click()
    await expect(page.locator('[data-dswf-kn-browse]').first()).toBeVisible({ timeout: 30_000 })
    expect(errorConsoleEntries(launched), 'diag 零 error 级条目').toEqual([])
    expect(launched.pageErrors, '零 pageerror').toEqual([])
  } finally {
    if (l !== undefined) await closeApp(l.launched.app)
    if (overlay !== undefined) rmFileBestEffort(overlay)
    await rmDirBestEffort(fixture.userData)
    await rmDirBestEffort(fixture.root)
  }
})
