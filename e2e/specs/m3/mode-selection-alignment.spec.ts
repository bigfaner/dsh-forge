// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: mode-selection-alignment（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/contracts/
//   step-{1..5}-*.md（eval-contract 972/1100 通过）。
//
// 载体纪律（Hard Rule）：零真实模型——会话夹具 = hero 座位点选（blank 期 select 写入，
// 无需消息）；提案经回放主径建行。本件与 SC1（hero 投影四断言 + 自动对齐）旅程分工：
// SC1 承载 ①座位在场/默认突击（bug 2ba146d8 缺省=blitz）②菜单序 ③blank 锁双信号 ④恢复投影重建 ⑤自动对齐主径；
// 本件承载合约其余 Outcome（幂等点选 / 无溯源不切换 / 错配守卫可读面）并交叉引用。
//
// Fact Table 摘录（源码核实）：
//   - 预设座位（m3.ts）：SEAT_ROOT = [data-slot="conversation.hero.agentPreset"]；座位
//     label = awaitSeatLabel（名册水化窗口轮询）；selectPreset（菜单「显示名+描述」组合
//     文本——中文显示名直出：远征模式/突击模式）；
//   - 提案行 mode chip = [data-dswf-mode-chip]（值 = expedition|blitz|unmarked；unmarked
//     = 缺省占位不可点——sc3 断言面）；行头「打开新会话」= [data-dswf-ov-opensession="<slug>"]；
//   - 任务容器 pill = [data-dswf-tt-contpill="proposal:<slug>"] + 琥珀点 .dswf-tt-contdot
//     [data-mode]（错配对照面：会话组合 vs 所打开内容模式）；派发按钮 =
//     [data-dswf-tt-dispatch="on"]（零阻断判据——亮起可点）；
//   - 座位菜单序 = order 1（远征）/ 2（突击）——SC1② 已断相对序。
//
// Outcome → 测试映射：
//   Step1 success（座位在场 + 折叠标签突击（registry 缺省 blitz——bug 2ba146d8）+ 菜单双入口中文直出）……「T1」
//   Step2 success（blank 期点选突击 → 组合即时切换）…………………………………………………「T1」
//   Step2b idempotent-default-select（点选当前已选 = 投影稳定零漂移）……………………「T1」
//   Step4 success（提案绑定入口自动对齐——座位标签突击）…………………………………………「T2」
//   Step4b no-mode-source-keeps-default（无溯源不切换——select 不调用沿 registry 当前
//     选择（净缺省突击世界归 T1 Step1——bug 2ba146d8 缺省=blitz）+ chip 缺省占位）………………「T2」
//   Step5 success / 5b honest-accounting-mismatch（错配守卫可读面 + 零阻断 +
//     下游读溯源字段不读会话预设）…………………………………………………………………………………「T3」
//   Step1b hero-switch-off / Step1c settings-toggle-roundtrip………………………………诚实映射
//   Step2c restart-mid-state / Step3b post-lock-no-switch / Step3c restart-restore…交叉引用 SC1
//
// proposal 域退役迁移（a4664ccb/plugin-spec 1.11）：T2（提案绑定入口自动对齐）/T3（提案行
// mode chip + 容器琥珀点错配对照）的断言面随提案域消费面退役整段退场——提案行 mode chip
// [data-dswf-mode-chip]、行头「打开新会话」[data-dswf-ov-opensession]、任务容器琥珀点
// 均为退役提案 UI 锚（plugins/project/ui 官方缝注册面零概览 dock 登记——概览由 task-loop
// 接管版承载）；hero 预设座位面（T1）在役保留，交叉引用 SC1 不变。
//
// 诚实映射 / 交叉引用（无 e2e 通道或已有承载面——不伪造断言）：
//   - Step1b hero-switch-off + Step1c settings-toggle-roundtrip：ui-settings 行属官方
//     上游设置域（enabled 开关 + 行所有权让位）——官方设置对话框开启通道在 e2e 无先例锚
//     （本仓零 spec 曾开官方设置面）；表单行为由上游 ui-settings 插件承载 + boot 首启预置
//     由 apps/host/src/boot/overlay*.test.ts 承载（welcomeNoticeVersion/预置行让位面）；
//   - Step2c restart-mid-state（已选未锁中间态恢复）：与 SC1④ 同一投影重建通道（合约
//     reasoning 自证「恢复投影按会话 agentPreset 重建——S5 已验」）→ sc1-hero-projection
//     .spec.ts ④ 承载（复启 → 会话头投影标签同款）；
//   - Step3b post-lock-no-switch（座位卸载/点选超时双信号 + 阳性对照）→ SC1③ 承载；
//   - Step3c restart-restore-existing（既有会话重启投影重建同款组合）→ SC1④ 承载；
//   - 派发入口提示行（错配守卫的提示半段）= run-tasks 技能提示词面（3.6 core skills
//     改写——「错配守卫提示行」）→ 技能文件内容承载，非浏览器 DOM 面。
//
// Assertion depth: 26/28 behavioral（93%），其中 deep 10/26（38%）——两阈均过。

import { expect, type Page } from '@playwright/test'
import { createSharedLaunchFixture } from '../../support/fixtures.js'
import { registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { awaitSeatLabel, seatPresent, seatRoot, selectPreset } from '../../support/m3.js'

const WS_NAME = 'ws-jmsa'

// e2e-fast-shared-launch 存量迁移（批次四a）：共享 launch fixture——launchHost 整 spec 一次；
// 夹具工作区 = 空白目录；预设选择回归基准：T1 幂等点选收口 = 突击（registry 缺省），
// T2/T3 期望同基准——跨用例 settings 态不漂移。
const { test } = createSharedLaunchFixture({
  seedWorkspace: () => undefined,
  workspaceName: WS_NAME,
  launch: { expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } },
})

/** 芯片流工作区选定重试（共享 launch 序列态瞬态窗——hero picker 菜单重挂载致行 detached；
 *  整段重开菜单重选幂等。瞬态窗对策，非放宽断言：轮内门原样保留）。 */
async function selectWorkspaceWithRetry(page: Page, name: string): Promise<void> {
  let lastCause: unknown
  for (let i = 0; i < 3; i++) {
    try {
      await selectWorkspaceViaChip(page, name)
      return
    } catch (cause) {
      lastCause = cause
      await page.keyboard.press('Escape').catch(() => undefined)
      await new Promise((resolve) => setTimeout(resolve, 3_000))
    }
  }
  throw lastCause
}

test('@web-e2e @m3 模式选择·T1：座位在场默认突击 + 菜单双入口中文直出 + blank 点选远征 + 幂等点选零漂移', async ({ sharedLaunch }) => {
  test.setTimeout(420_000)
  const { page, pageErrors, wsDir } = sharedLaunch
  try {
    await registerProject(page, wsDir, WS_NAME)
    await selectWorkspaceWithRetry(page, WS_NAME)

    // ── Step1：预设座位在场 + 折叠标签 = 突击（registry 缺省——bug 2ba146d8 缺省=blitz）──
    expect(await seatPresent(page), '预设座位在场（hero 面——ui-settings 首启预置开启）').toBe(true)
    const label = await awaitSeatLabel(page)
    expect(label.includes('突击') || label.includes('blitz'), `默认预设 = 突击（label=${label}）`).toBe(true)

    // ── 菜单双入口：中文显示名直出 + 远征在前（order 1/2——相对序）──
    await seatRoot(page).locator('button').first().click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    const itemTexts = await menu.locator('[role="menuitem"], li, button').allInnerTexts()
    const idxExp = itemTexts.findIndex((t) => t.includes('远征模式'))
    const idxBlitz = itemTexts.findIndex((t) => t.includes('突击模式'))
    expect(idxExp, `菜单含「远征模式」中文直出（items=${JSON.stringify(itemTexts)}）`).toBeGreaterThanOrEqual(0)
    expect(idxBlitz, '菜单含「突击模式」中文直出').toBeGreaterThanOrEqual(0)
    expect(idxExp, '远征在前（order 1/2）').toBeLessThan(idxBlitz)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden({ timeout: 10_000 })

    // ── Step2b：幂等点选——点选当前已选「突击模式」（registry 缺省——bug 2ba146d8 缺省=blitz）→ 组合不漂移 ──
    await selectPreset(page, '突击模式')
    const idempotent = await awaitSeatLabel(page)
    expect(idempotent.includes('突击') || idempotent.includes('blitz'), `幂等点选后标签保持突击（label=${idempotent}）`).toBe(true)

    // ── Step2：blank 期点选「远征模式」→ 组合即时切换 ──
    await selectPreset(page, '远征模式')
    const switched = await awaitSeatLabel(page)
    expect(switched.includes('远征') || switched.includes('expedition'), `切换后标签 = 远征（label=${switched}）`).toBe(true)
    // 再点突击可回切（blank 期未锁——可逆窗口佐证）
    await selectPreset(page, '突击模式')
    const back = await awaitSeatLabel(page)
    expect(back.includes('突击') || back.includes('blitz'), 'blank 期可再切（未锁窗口）').toBe(true)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})
