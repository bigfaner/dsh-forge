// @feature dsh-forge-m4 | @web-e2e | @journey project-registration-projection
// Traceability: docs/features/dsh-forge-m4/testing/project-registration-
// projection/contracts/step-3-doc-placement-preview.md — Outcomes:
//   success — 证据三档门控:仓内 forge 树命中 = 沿用仓内(repo-existing)/
//             有 .git = 仓内新建 <root>\docs 懒物化(repo-new)/无 .git = 应用
//             管理主路径(app);✎ 展开才见模式+路径;过程留痕灰字告知;
//   reprobe-reevaluate — 换路径即重估(黏性禁令:预选只由本仓证据决定,
//             不跨项目携带);
//   custom-outside-authorization — 高级折叠仓外自定义路径 → 显式授权行
//             (未授权不可用;仓外授权收窄至高级自定义)。
// fixture_spec: CodeRoot 形族(forgeTreeHit=true / 仅 .git / 零 git)+ 仓外
// DocLocation 目录。
// Techniques: confirm-card.spec.tsx AC2(三档门控 + ✎ 默认收起)/ AC3(黏性
// 禁令)/ AC5(高级折叠授权行)。

import { expect, test } from '@playwright/test'
import { clickStable, M4WorldManager, startAutoDismiss } from '../_lib/m4-world.ts'
import {
  DETECT_COPY, bootRegWorld, buildRegJourneyRoot, openAddCard, typeCodePath, waitDetect,
} from './harness.ts'

test.describe.serial('project-registration-projection / step 3: 核查文档位置预览行(证据三档门控)', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 三档门控逐档 + ✎ 展开才见模式+路径。
  test('step3/success: 证据三档门控 —— repo-existing 沿用仓内 / repo-new 仓内新建 docs / app 应用管理 + ✎ 默认收起', async ({ }, testInfo) => {
    testInfo.setTimeout(360_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'main', built)
    const { page } = world
    const fixtures = built.fixtures
    stopAutoDismiss = startAutoDismiss(page)
    await openAddCard(page)

    // ---- 档一:仓内 forge 树命中 → 沿用仓内(repo-existing)--------------
    await typeCodePath(page, fixtures.forgeRepo)
    await waitDetect(page, DETECT_COPY.gitForge, 'repo-existing 语料')
    await expect(page.locator('[data-dsh-forge-confirm-preview-note]'),
      '预览行 = 沿用仓内已检出的 forge 文档(repo-existing)').toContainText('沿用仓内', { timeout: 15_000 })
    // ✎ 展开才见模式+路径(默认收起:模式面未渲染)。
    await expect(page.locator('[data-dsh-forge-confirm-mode="repo-existing"]'),
      '✎ 默认收起(模式 radio 未渲染)').toHaveCount(0)
    await clickStable(page, '[data-dsh-forge-confirm-edit]')
    await expect(page.locator('[data-dsh-forge-confirm-mode="repo-existing"]'),
      '✎ 展开后模式面在场(沿用仓内档)').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-confirm-preview-path]'),
      'repo-existing 预览路径 = 仓内 docs').toContainText('docs')

    // ---- 档二:仅 .git → 仓内新建 <root>/docs(repo-new 懒物化)----------
    await typeCodePath(page, fixtures.gitOnlyRepo)
    await waitDetect(page, DETECT_COPY.git, 'repo-new 语料')
    await expect(page.locator('[data-dsh-forge-confirm-preview-note]'),
      '预览行 = 仓内(repo-new;懒物化告知)').toContainText('仓内', { timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-confirm-preview-path]'),
      'repo-new 预览路径 = <root>/docs').toContainText(/[/\\]docs$/)

    // ---- 档三:无 .git → 应用管理主路径(app)---------------------------
    await typeCodePath(page, fixtures.nogitDir)
    await waitDetect(page, DETECT_COPY.nogit, 'app 语料')
    await expect(page.locator('[data-dsh-forge-confirm-preview-note]'),
      '预览行 = 应用管理(app 档)').toContainText('应用管理', { timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-confirm-preview-path]'),
      'app 档无路径行(应用数据目录,不进 git)').toHaveCount(0)

    // 过程留痕灰字告知(卡形态纪律)。
    await expect(page.locator('[data-dsh-forge-confirm-trace]'),
      '过程留痕灰字在场(三档门控过程可追溯)').toBeVisible()
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "reprobe-reevaluate" — 换路径即重估(黏性禁令)。
  test('step3/reprobe-reevaluate: 换路径即重估 —— 预选仅由新路径本仓证据决定(黏性禁令)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'main', built)
    const { page } = world
    const fixtures = built.fixtures
    stopAutoDismiss = startAutoDismiss(page)
    await openAddCard(page)

    // P1 = forge 树仓(repo-existing)→ 预览 = 沿用仓内。
    await typeCodePath(page, fixtures.forgeRepo)
    await expect(page.locator('[data-dsh-forge-confirm-preview-note]'),
      'P1 预选 = 沿用仓内(forge 树证据)').toContainText('沿用仓内', { timeout: 15_000 })
    // P2 = 仅 .git 仓(repo-new)→ 预览即时重估(不携带 P1 的档位)。
    await typeCodePath(page, fixtures.gitOnlyRepo)
    await waitDetect(page, DETECT_COPY.git, 'P2 重侦测')
    await expect(page.locator('[data-dsh-forge-confirm-preview-note]'),
      'P2 预选重估 = 仓内(仅 .git 证据;P1 档位零携带)').toContainText('仓内', { timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-confirm-preview-note]'),
      'P2 预选 ≠ 沿用仓内(黏性禁令)').not.toContainText('沿用仓内')
    // P3 = 零 git → 预选再重估为应用管理(逐路径纯计算)。
    await typeCodePath(page, fixtures.nogitDir)
    await waitDetect(page, DETECT_COPY.nogit, 'P3 重侦测')
    await expect(page.locator('[data-dsh-forge-confirm-preview-note]'),
      'P3 预选重估 = 应用管理').toContainText('应用管理', { timeout: 15_000 })
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "custom-outside-authorization" — 仓外自定义显式授权行。
  test('step3/custom-outside-authorization: 高级折叠仓外路径 —— 显式授权行在场 + 未授权不可用', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const built = await buildRegJourneyRoot()
    const world = await bootRegWorld(manager, 'main', built)
    const { page } = world
    const fixtures = built.fixtures
    stopAutoDismiss = startAutoDismiss(page)
    await openAddCard(page)

    // 就位:valid 态(git 仓)→ 高级折叠在场。
    await typeCodePath(page, fixtures.gitOnlyRepo)
    await waitDetect(page, DETECT_COPY.git, 'valid 态就位')
    await expect(page.locator('[data-dsh-forge-confirm-advanced]'),
      '高级折叠在场(仓外自定义入口收窄于此)').toBeVisible({ timeout: 10_000 })
    // 展开折叠(native details)→ 自定义输入面在场。
    await page.locator('[data-dsh-forge-confirm-advanced] summary').click()
    await expect(page.locator('[data-dsh-forge-confirm-custom]'),
      '高级折叠展开:自定义路径输入在场').toBeVisible({ timeout: 10_000 })
    // 授权行默认不在(未输入仓外路径)。
    await expect(page.locator('[data-dsh-forge-confirm-authrow]'),
      '授权行默认不在(未自定义仓外路径)').toHaveCount(0)
    // 输入仓外自定义路径 → 显式授权行(未授权不可用)。
    await page.locator('[data-dsh-forge-confirm-custom]').fill(fixtures.outsideDir)
    await expect(page.locator('[data-dsh-forge-confirm-authrow]'),
      '仓外路径 → 显式授权行在场').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-confirm-authrow]'),
      '授权行状态 = 待授权(未授权不可用)').toHaveAttribute('data-auth', 'pending', { timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-confirm-auth-outside]'),
      '仓外授权提示词(仓外需授权,BIZ-001/003 收窄)').toContainText('仓外')
    // 未授权:提交禁用(canSubmit 的自定义已授权条件)。
    expect(await page.locator('[data-dsh-forge-confirm-submit]').isDisabled(),
      '未授权仓外路径:添加禁用').toBe(true)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
