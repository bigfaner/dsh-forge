// @feature dsh-forge-m4 | @web-e2e | @journey project-registration-projection
// Traceability: docs/features/dsh-forge-m4/testing/project-registration-
// projection/contracts/step-2-path-probe.md — Outcomes:
//   success — git 仓路径 → valid 态可添加(侦测陈述 + 预览行 + 项目名自动取
//             文件夹名 ✎ 可改;侦测覆盖 git/forge 树/已注册/父目录多子仓);
//   missing-path — 不存在路径 → missing 态「路径不存在」+ 添加禁用 + 留在卡内;
//   registered-duplicate — 已注册代码根 → registered 态 + 禁用 + 快车道 toast
//             打开既有项目;
//   parent-multi-repo — ≥2 .git 子仓父目录 → parent 态子仓 chips 一键选定;
//   nogit-info — 零 .git 目录 → nogit 信息态 + 预选 = 应用管理主路径 + 可添加
//             (零 git 强制:不以「先 git init」为前置)。
// fixture_spec: CodeRoot 形族(git 仓/缺失/已注册 realpath 归一/父目录/nogit)
// + Project ×1(已注册基线,供 registered 态命中)。
// Techniques: confirm-card.spec.tsx AC1(六态机 + 入口卫生)+ 真链
// probeProjectPath(fs 侦测)。

import { expect, test } from '@playwright/test'
import { M4WorldManager, startAutoDismiss } from '../_lib/m4-world.ts'
import {
  DETECT_COPY, bootRegWorld, buildRegJourneyRoot, openAddCard, submitDisabled,
  typeCodePath, waitDetect,
} from './harness.ts'

test.describe.serial('project-registration-projection / step 2: 给定代码区路径并侦测', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — valid 态:git 仓 + forge 树命中(repo-existing 语料)。
  test('step2/success: git 仓路径 → valid 态可添加(侦测陈述 + 文档位置预览行 + 项目名自动 + ✎ 可改)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'main', built)
    const { page } = world
    const fixtures = built.fixtures
    stopAutoDismiss = startAutoDismiss(page)
    await openAddCard(page)

    // 给定 .git + forge 树仓(侦测覆盖 git + 仓内 forge 树特征)。
    await typeCodePath(page, fixtures.forgeRepo)
    await waitDetect(page, DETECT_COPY.gitForge, 'git + forge 树(repo-existing 语料)')
    expect(await submitDisabled(page), 'valid 态:添加可用').toBe(false)
    // 项目名自动取文件夹名(✎ 可改 = name 输入在场可编辑)。
    const nameInput = page.locator('[data-dsh-forge-confirm-name]')
    await expect(nameInput, '项目名输入在场(✎ 可改)').toBeVisible()
    await expect(nameInput).toHaveValue('probe-forge-repo')
    // 换 gitOnly 仓(无 forge 树):侦测陈述切 git-only 形 —— 逐路径纯计算。
    await typeCodePath(page, fixtures.gitOnlyRepo)
    await waitDetect(page, DETECT_COPY.git, 'git-only(repo-new 语料)')
    expect(await submitDisabled(page), 'valid 态:添加可用(repo-new)').toBe(false)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "missing-path" — missing 态:即时提示 + 禁用 + 留在卡内。
  test('step2/missing-path: 路径不存在 → missing 态「路径不存在」+ 添加禁用 + 留在卡内可修正', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'main', built)
    const { page } = world
    stopAutoDismiss = startAutoDismiss(page)
    await openAddCard(page)

    await typeCodePath(page, built.fixtures.missingPath)
    await waitDetect(page, DETECT_COPY.missing, 'missing(路径不存在)')
    expect(await submitDisabled(page), 'missing 态:添加禁用').toBe(true)
    // 留在卡内可修正:卡仍在场,修正为合法路径后转 valid。
    await expect(page.locator('[data-dsh-forge-dialog="confirm-card"]'), '留在卡内(不跳页不关闭)').toBeVisible()
    await typeCodePath(page, built.fixtures.gitOnlyRepo)
    await waitDetect(page, DETECT_COPY.git, '修正后重侦测(即时校验可修正)')
    expect(await submitDisabled(page), '修正后添加恢复可用').toBe(false)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "registered-duplicate" — registered 态:禁用 + 快车道 toast。
  test('step2/registered-duplicate: 已注册代码根 → registered 态 + 禁用 + 快车道 toast 打开既有项目', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await openAddCard(page)

    // 提交基线项目的代码根(realpath 归一命中)。
    // 快车道(§5.4):registered 侦测【即自动落位】—— 卡收起 + 原位换台 +
    // toast「{name}」已注册 · 已打开;卡内 registered 态/禁用面为瞬态
    // (ConfirmCard 单测权威),e2e 以终态三元组承载(卡收起 + toast + 指针)。
    await typeCodePath(page, kernel.codeRoot)
    await expect(page.locator('[data-dsh-forge-dialog="confirm-card"]'),
      '快车道:卡收起(不出卡流程)').toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-project-toast]'),
      '快车道 toast(已注册 · 已打开)').toContainText(/已注册 · 已打开/, { timeout: 15_000 })
    // 指针落既有项目(快车道打开语义)。
    const state = await page.evaluate(async () => {
      const bridge = (globalThis as { dshForge?: { workbench?: { getState(): Promise<{ activeProjectId: string | null }> } } }).dshForge?.workbench
      return await bridge?.getState()
    })
    expect(state?.activeProjectId, '快车道:指针 = 既有项目(打开语义)').toBe(kernel.projectId)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "parent-multi-repo" — parent 态:子仓 chips 一键选定。
  test('step2/parent-multi-repo: 父目录误选 → parent 态子仓 chips 一键选择具体子仓(不误注册父目录)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'main', built)
    const { page } = world
    const fixtures = built.fixtures
    stopAutoDismiss = startAutoDismiss(page)
    await openAddCard(page)

    await typeCodePath(page, fixtures.parentDir)
    await waitDetect(page, DETECT_COPY.parent, 'parent(多子仓提示)')
    // 子仓 chips 在场(chips suggest, never block —— 添加仍可用)。
    await expect(page.locator('[data-dsh-forge-confirm-chips]'),
      '子仓 chips 区在场(parent 态)').toBeVisible({ timeout: 10_000 })
    const chips = page.locator('[data-dsh-forge-confirm-chip]')
    expect(await chips.count(), 'chips = 子仓数(≥2)').toBeGreaterThanOrEqual(2)
    // 一键选定第一个子仓 → 回填代码区 + 重侦测(不误注册父目录)。
    await chips.first().click()
    await waitDetect(page, DETECT_COPY.git, 'chips 选定 → 子仓重侦测(valid)')
    await expect(page.locator('[data-dsh-forge-confirm-code]'),
      '代码区回填子仓路径(一键选定;含子仓名)').toHaveValue(new RegExp(`${fixtures.parentChildren[0] as string}`), { timeout: 10_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "nogit-info" — nogit 信息态:零 git 一等公民。
  test('step2/nogit-info: 无 .git 目录 → nogit 信息态(非错误)+ 预选 = 应用管理主路径 + 可添加', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'main', built)
    const { page } = world
    stopAutoDismiss = startAutoDismiss(page)
    await openAddCard(page)

    await typeCodePath(page, built.fixtures.nogitDir)
    await waitDetect(page, DETECT_COPY.nogit, 'nogit(未检测到 git — 应用管理)')
    // 信息态(非错误):data-tone = info。
    await expect(page.locator('[data-dsh-forge-confirm-detect]'),
      'nogit = 信息态(data-tone=info,非错误)').toHaveAttribute('data-tone', 'info')
    // 文档位置预选 = 应用管理主路径(app 档:无路径行)。
    await expect(page.locator('[data-dsh-forge-confirm-preview-note]'),
      '预览行预选 = 应用管理(app 档)').toContainText('应用管理', { timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-confirm-preview-path]'),
      'app 档无路径行(应用数据目录,不进 git)').toHaveCount(0)
    // 零 git 强制:添加可用(不以 git init 为前置)。
    expect(await submitDisabled(page), 'nogit 态:添加可用(零 git 强制)').toBe(false)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
