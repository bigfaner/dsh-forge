// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: overview-entry-new-session（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/contracts/
//   step-{1..5}-*.md（eval-contract 961/1100 通过）。
//
// 用例构成（主会话裁决，plugin-spec/fix-3）：
//   - T1 保留：概览子 tab 族 + worktree-picker slug 候选 features 单源；
//   - T2/T3 正式退役（原 test.fixme 挂起用例整删）：断言面（任务容器 pill/工具栏诊断
//     toast/任务抽屉「诊断失败」链）随概览 dock 被 task-loop 任务概览整面接管
//     （dswf-overview 同 kind shadow）而退役；承接测试归 task-loop 自有 e2e，
//     按接管版概览重设计断言面挂 M5 归档批。
//
// 载体纪律（Hard Rule）：零真实模型——feature 行经回放主径建行。提案域已整域下线
// （plugin-spec 1.11）——夹具 features 域单源构造，提案域写动词零引用。
//
// Fact Table 摘录（源码核实，仅 T1 断言面）：
//   - 概览 dock = task-loop 任务概览（接管版）：tab = 任务概览，body = AC 核销板
//     （[data-dswf-ov-panel]）；子 tab 栏零渲染（proposals 等随域退役/接管退役）；
//   - worktree-picker 新建弹窗：[data-dswt-hero-trigger] → 「新建 worktree…」菜单项 →
//     [data-dswt-branch-input] 分支组合框；slug 候选浮层 .dswt-branch-slug-menu
//     （projects.list → features.list 往返异步装载，输入即过滤）——候选 = features 域单源；
//   - 会话语义（fix-3② 裁决，上游 0.2.0-rc.2 源码核实）：openWorkspace = reuse-or-create
//     blank（同工作区 blank 会话被复用）；侧栏行可见判据 = 非 blank 常显 + 仅当前选中
//     blank 可见（官方浏览器口径 sidebar-model sessionVisible）。
//
// Outcome → 测试映射（features 域单源承载）：
//   概览子 tab 族（默认 = 任务、proposals 子 tab 零渲染）………………………………「T1」
//   worktree-picker slug 候选（features 域单源——唯一候选 = feature slug）…………「T1」
//   Step4 success / diag-success-toast / proposal 容器零渲染（诊断链）……………已退役（T2）
//   Step4 task-failure-diag-autosend / no-diag-entry-for-nonfailed（任务抽屉）…已退役（T3）
//   Step5 全族（派发按钮四态）………………………………………………………………交叉引用 uf3
//
// 诚实映射 / 交叉引用：
//   - Step5 success / all-terminal-disabled / running-task-jumps-session /
//     no-single-task-execution-entry（派发按钮四 Outcome）→ uf3-dispatch-entry.spec.ts
//     全量承载（旅程分工）；mode-selection-alignment T3 另有派发零阻断面断言；
//   - T2/T3 原 Step4 Outcome 的退役承接面：task-loop e2e（接管版概览断言）+ M5 归档批
//     重设计，见文件头「用例构成」裁决注。
//
// Assertion depth: 7 behavioral（全保留断言），其中 deep 2（候选命中 slug / 候选唯一性）。

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { FEATURES_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { createSharedLaunchFixture } from '../../support/fixtures.js'
import { openOverviewDock } from '../../support/navigation.js'
import { registerProject, selectWorkspaceViaChip, forgeInvoke } from '../../support/rpc.js'
import { DOCKKIT_STRIP_TAB } from '../../support/anchors.js'

const WS_NAME = 'ws-joes'

// e2e-fast-shared-launch 存量迁移（批次四a）：共享 launch fixture——launchHost 整 spec 一次；
// 夹具工作区 = 隔离 git 仓（worktree-picker 面依赖真 git）；T1 概览子 tab 族 /
// worktree-picker 候选用例内显式导航。
const { test } = createSharedLaunchFixture({
  seedWorkspace: (dir) => {
    // 夹具工作区 = 隔离 git 仓（worktree-picker 面依赖真 git——hero chip/创建弹窗装载前提；
    // worktree-hero-chip makeGitRepo 同配方收窄：无 upstream，主树单提交即够）
    mkdirSync(dir, { recursive: true })
    const git = (args: string[]): void => {
      execFileSync('git', ['-c', 'user.email=joes@test', '-c', 'user.name=joes', ...args], { cwd: dir, stdio: 'pipe' })
    }
    writeFileSync(join(dir, 'README.md'), 'joes fixture\n')
    git(['init', '-b', 'main'])
    git(['add', '.'])
    git(['commit', '-m', 'init'])
  },
  workspaceName: WS_NAME,
  launch: { expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } },
})

test('@web-e2e @m3 概览入口·T1：概览子 tab 族（默认=任务、proposals 零渲染）+ worktree-picker slug 候选 features 单源', async ({ sharedLaunch }) => {
  test.setTimeout(480_000)
  const { page, pageErrors, wsDir } = sharedLaunch
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    // 工作区开局选定（hero 期芯片流——worktree-picker 第二 chip 挂载前置）
    await selectWorkspaceViaChip(page, WS_NAME)
    // features 域夹具构造（proposal 域整域下线——提案域写动词不可达）
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'joe-feat', title: 'Joe 恒远征 feature' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: 'joe-feat', docKind: 'prd-spec', relPath: 'docs/features/joe-feat/prd/prd-spec.md', summary: 'Joe feature PRD' })

    // ── 概览 dock（任务域接管版）：默认概览 tab = 任务概览；子 tab 栏零渲染（含
    // proposals——proposal 域整域下线；接管版主指标 = AC 核销进度）──
    await openOverviewDock(page)
    await expect(page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '任务概览' }).first(), '概览 dock tab = 任务概览（任务域接管）').toBeVisible()
    await expect(page.locator('[data-dswf-ov-panel]').first(), '任务概览 body 挂载（AC 核销板）').toBeVisible()
    await expect(page.locator('[data-dswf-ov-subtab]'), '子 tab 栏零渲染（proposals 等子 tab 随域退役/接管退役）').toHaveCount(0)

    // ── worktree-picker 新建弹窗：slug 候选 = features 域单源（唯一候选 = joe-feat）──
    await page.locator('[data-dswt-hero-trigger]').click()
    const createItem = page.getByRole('menuitem', { name: '新建 worktree…' })
    await expect(createItem, 'worktree-picker 弹层「新建 worktree…」入口在场').toBeVisible({ timeout: 15_000 })
    await createItem.click()
    const branchInput = page.locator('[data-dswt-branch-input]')
    await expect(branchInput, '新建 worktree 弹窗开（分支组合框在场）').toBeVisible({ timeout: 15_000 })
    await branchInput.click()
    const slugMenu = page.locator('.dswt-branch-slug-menu')
    // 候选异步装载（projects.list → features.list 往返）——输入即过滤轮询至浮层开
    const menuDeadline = Date.now() + 30_000
    let menuVisible = false
    while (Date.now() < menuDeadline) {
      await branchInput.fill('joe')
      menuVisible = await slugMenu.isVisible().catch(() => false)
      if (menuVisible) break
      await page.waitForTimeout(1_000)
    }
    expect(menuVisible, 'slug 候选浮层开（输入即过滤——features 域候选）').toBe(true)
    await expect(slugMenu, '候选命中 feature slug（features 单源）').toContainText('joe-feat')
    await expect(slugMenu.getByRole('menuitem'), '候选唯一（proposal 域候选源已退役）').toHaveCount(1)

    if (pageErrors.length > 0) console.log(`[joes-t1-diagnostic] pageerror：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})
