// 旅程 knowledge-faces-unmount——knowledge 卸载三面干净消失。
// 契约正本：.forge/docs/proposals/knowledge-plugin-migration/testing/contracts/
//   knowledge-faces-unmount.md（CT-U1/CT-U2/CT-U3）+ shared-anchors-channels.md（A-KN-*）。
// 断言-契约溯源逐条标注（[A-KN-n] / [CT-*]）；缺席断言锚缺失即通过（契约头注）。
// 卸载通道形态注记：集成装配无运行期卸载通道——CT-U1「正式卸载通道」在集成态的等价
// 夹具 = 装载位移除 + 宿主按卸载语义重载（junction 农场 profile，faces-journey-harness
// makeUninstalledProfile；与 boot.ts knowledgePlugin 门控消费链同源）。
// CT-U2 G-B 官方宿主半边：集成装配不可复现（bootShell 恒发布壳缝）——两形态纯函数由
// plugins/knowledge/ui/faces-gate.test.ts 覆盖；CT-U3 better-sqlite3 原生 binding 重装载
// 以重装后服务数据面（浏览网格经 forge:knowledge/* 通道应答）承载。
import { expect, test } from '@playwright/test'
import {
  closeApp,
  bootWithProject,
  makeFacesFixture,
  openKnowledgePanel,
  errorConsoleEntries,
  teardownFaces,
  makeUninstalledProfile,
  removeProfileFarm,
  KN_PANEL_ROOT,
  type FacesLaunch,
} from '../faces-journey-harness.js'
import {
  KNOWLEDGE_ENTRY,
  KNOWLEDGE_VIEW,
  RECALL_PANE,
  projectRowOf,
} from '../../../e2e/support/anchors.js'
import { launchHost, type Launched } from '../../../e2e/support/launch.js'

test.setTimeout(600_000)

test('CT-U1.O1 卸载→三面干净消失（GP1–GP3 + 非knowledge面零连带 + registered 收敛空）', async () => {
  const fixture = makeFacesFixture()
  let mountBoot: FacesLaunch | undefined
  let uninstalledProfile: string | undefined
  let unmountLaunched: Launched | undefined
  try {
    // 前置：装载态三面在场（= mount 契约 CT-M1.O1 态——GP3 锚定断言）
    mountBoot = await bootWithProject(fixture)
    const projectId = mountBoot.projectId
    await openKnowledgePanel(mountBoot.launched.page, projectId)
    await closeApp(mountBoot.launched.app)
    mountBoot = undefined

    // GP1 卸载（装载位移除）+ 宿主按卸载语义重载（同 userData——账本/项目注册存活）
    uninstalledProfile = makeUninstalledProfile(fixture.root)
    unmountLaunched = await launchHost({
      userData: fixture.userData,
      collectConsole: true,
      env: { DSH_FORGE_PROFILE_DIR: uninstalledProfile },
    })
    const page = unmountLaunched.page

    // [GP1 / CT-U1 Side-effect/Invariants]：宿主正常运行 + diag 零 error 级 + 零 pageerror
    expect(errorConsoleEntries(unmountLaunched), 'diag 零 error 级条目').toEqual([])
    expect(unmountLaunched.pageErrors, '零 pageerror').toEqual([])
    // [A-KN-8 卸载形态]：registered 读数收敛为空（无 faces 注册里程碑行）
    expect(
      unmountLaunched.consoleTail.some((line: string) => line.includes('knowledge faces registered=')),
      'A-KN-8 registered 收敛为空（卸载态零注册读数）',
    ).toBe(false)

    // [GP2 / A-KN-4]：面板行零在场；非 knowledge 面零连带——项目树行存活
    await expect(page.locator(KNOWLEDGE_ENTRY).first()).toHaveCount(0)
    await expect(page.locator(projectRowOf(projectId)).first()).toBeVisible({ timeout: 30_000 })

    // [GP3 / A-KN-1 + A-KN-2 + A-KN-6]：知识面板/视图态/召回视图区全部零在场
    await expect(page.locator(KN_PANEL_ROOT).first()).toHaveCount(0)
    await expect(page.locator(KNOWLEDGE_VIEW).first()).toHaveCount(0)
    await expect(page.locator(RECALL_PANE).first()).toHaveCount(0)
  } finally {
    if (mountBoot !== undefined) await closeApp(mountBoot.launched.app)
    if (unmountLaunched !== undefined) await closeApp(unmountLaunched.app)
    if (uninstalledProfile !== undefined) removeProfileFarm(uninstalledProfile)
    await teardownFaces(fixture)
  }
})

test('CT-U1.O4 + CT-U3.O1 重装回路——三面重新正向呈现 + 服务数据面经通道应答（幂等无双行）', async () => {
  const fixture = makeFacesFixture()
  let mountBoot: FacesLaunch | undefined
  let uninstalledProfile: string | undefined
  let unmountLaunched: Launched | undefined
  let relaunch: FacesLaunch | undefined
  try {
    // 序列：装载 → 卸载 → 重装（同 userData——CT-U1.O4 幂等回归）
    mountBoot = await bootWithProject(fixture)
    await openKnowledgePanel(mountBoot.launched.page, mountBoot.projectId)
    await closeApp(mountBoot.launched.app)
    mountBoot = undefined

    uninstalledProfile = makeUninstalledProfile(fixture.root)
    unmountLaunched = await launchHost({
      userData: fixture.userData,
      collectConsole: true,
      env: { DSH_FORGE_PROFILE_DIR: uninstalledProfile },
    })
    await expect(unmountLaunched.page.locator(KNOWLEDGE_ENTRY).first()).toHaveCount(0)
    await closeApp(unmountLaunched.app)
    unmountLaunched = undefined

    // 重装（默认 profile 回归——knowledge 装载位回场）
    relaunch = await bootWithProject(fixture)
    const launched = relaunch.launched
    const page = launched.page
    const projectId = relaunch.projectId

    // [A-KN-4] 恰一行（roster 无重复条目——CT-U1.O4 幂等判定）+ [GP3 三面] 重新正向呈现
    const entry = page.locator(KNOWLEDGE_ENTRY)
    await expect(entry.first()).toBeVisible({ timeout: 30_000 })
    expect(await entry.count(), 'A-KN-4 恰一行（无双行）').toBe(1)
    await openKnowledgePanel(page, projectId)
    // [CT-U3.O1 / CT-M2.O1 判定]：原生 binding 重装载——服务数据面经 forge:knowledge/* 通道应答在位
    await expect(page.locator('[data-dswf-kn-browse]').first()).toBeVisible({ timeout: 30_000 })
    // Invariants：重装后 diag 零 error 级
    expect(errorConsoleEntries(launched), 'diag 零 error 级条目').toEqual([])
    expect(launched.pageErrors, '零 pageerror').toEqual([])
  } finally {
    if (mountBoot !== undefined) await closeApp(mountBoot.launched.app)
    if (unmountLaunched !== undefined) await closeApp(unmountLaunched.app)
    if (relaunch !== undefined) await closeApp(relaunch.launched.app)
    if (uninstalledProfile !== undefined) removeProfileFarm(uninstalledProfile)
    await teardownFaces(fixture)
  }
})
