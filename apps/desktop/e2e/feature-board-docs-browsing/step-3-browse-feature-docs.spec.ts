// @feature dsh-forge-m2 | @web-e2e | @journey feature-board-docs-browsing
// Traceability: docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/contracts/step-3-browse-feature-docs.md
//
// Step 3 浏览五类过程文档(全部只读渲染,无编辑入口):
//   success —— completed 样板五类逐 tab:渲染文本与 fixture 文件投影全等
//     (SC4 规范化口径:空白剥离 + 源侧投影);返回导航可用。
//   doc-read-error —— 单文档读取失败注入(denyFileRead:文件在场但不可读
//     —— node utf8 读对无效字节只做替换降级不抛错,删文件又会把 tab 探测
//     带崩,拒读权限是唯一两全注入;win32 icacls deny read-data,POSIX
//     chmod 0,已实测):错误卡 + 重试;其他 tab 不受牵连;恢复可读后重试
//     → 规范化对比恢复通过(恢复突变 = 同一文件恢复可读,内容未损)。
//   external-link-guard —— 外链文档:链接标签文本在场、面板零 <a> 锚点
//     (白名单链接渲染为 span + title,永不导航)、点击后仍停留 dsh-app://。
//   injection-guard —— 注入文档:<script>/<img onerror> 按字面文本呈现,
//     window 侧两个哨兵标记保持 undefined(零执行面)。
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test } from '@playwright/test'
import { FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import type { WrittenForgeProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory } from '../tests/m2/helpers/restart-app.ts'
import {
  COMPLETED_SAMPLE_SLUG, EXTERNAL_LINK_DOC, FIVE_KINDS, GUARDS_SLUG, INJECTION_DOC,
  denyFileRead, fixtureDocBytes, fixtureTextProjection, guardsTaskSet, normalizeDoc,
  openFeaturesTab, panelText, restoreFileRead, workbenchBundles,
} from './helpers.ts'

/** 守卫腿 fixture:writer 落树后覆写守卫文档(Setup 预置内容)。 */
function writeGuardDocs(project: WrittenForgeProject): void {
  writeFileSync(join(project.featuresDir, GUARDS_SLUG, 'prd', 'prd-spec.md'), EXTERNAL_LINK_DOC)
  writeFileSync(join(project.featuresDir, GUARDS_SLUG, 'design', 'tech-design.md'), INJECTION_DOC)
}

// [M4 1.8 e2e 迁移·迁移清单 第④行 · M3 阶段资产面板 / Feature 板(workbench/features)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 2.10 复核:断言锚定已退役宿主方言(旧向导/换台 chrome/提案板与
// Feature 板详情/阶段资产面板内部件),右栏 pane 族未承接 —— 挂起终态与恢复前置 = regression-inventory.md 开放项。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('step-3/success [@web-e2e @journey feature-board-docs-browsing]: the five docs render read-only with normalized-equal text vs fixture files; back navigation works', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const set = guardsTaskSet()
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb3-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-fb3') })

  const session = createAppSessionFactory({
    bundles: workbenchBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })
  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openFeaturesTab(page)

      await page.locator(`[data-dsh-forge-feature-card="${COMPLETED_SAMPLE_SLUG}"]`).click()
      const detail = page.locator(`[data-dsh-forge-feature-detail="${COMPLETED_SAMPLE_SLUG}"]`)
      await expect(detail).toBeVisible({ timeout: 15_000 })

      for (const kind of FIVE_KINDS) {
        const tab = page.locator(`[data-dsh-forge-feature-doc-tab="${kind}"]`)
        await expect(tab, `${kind} tab enabled`).toBeEnabled()
        await tab.click()
        await expect.poll(async () => normalizeDoc(await panelText(detail, kind)), {
          timeout: 30_000,
          message: `${kind}: rendered markdown ≁ fixture file (normalized compare)`,
        }).toBe(fixtureTextProjection(fixtureDocBytes(project, COMPLETED_SAMPLE_SLUG, kind)))
      }

      // 返回 feature 详情列表的导航可用(面包屑回列表)。
      await page.locator('[data-dsh-forge-feature-back]').click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()
      await expect(page.locator(`[data-dsh-forge-feature-card="${COMPLETED_SAMPLE_SLUG}"]`)).toBeVisible()

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})

test.fixme('step-3/doc-read-error [@web-e2e @journey feature-board-docs-browsing]: one unreadable doc shows error+retry without affecting siblings; restore+retry renders normally again', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const set = guardsTaskSet()
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb3e-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-fb3-err') })
  writeGuardDocs(project)
  const corruptedPath = join(project.featuresDir, GUARDS_SLUG, 'ui', 'ui-design.md')
  const validUiBytes = fixtureDocBytes(project, GUARDS_SLUG, 'ui')

  const session = createAppSessionFactory({
    bundles: workbenchBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })
  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openFeaturesTab(page)

      // 损坏注入:文件在场但不可读(单文档粒度;tab 探测不受损)。
      denyFileRead(corruptedPath)

      await page.locator(`[data-dsh-forge-feature-card="${GUARDS_SLUG}"]`).click()
      const detail = page.locator(`[data-dsh-forge-feature-detail="${GUARDS_SLUG}"]`)
      await expect(detail).toBeVisible({ timeout: 15_000 })
      await page.locator('[data-dsh-forge-feature-doc-tab="ui"]').click()
      await expect(detail.locator('[data-dsh-forge-feature-doc-error]'),
        '读取失败 → 错误卡(UF4 error 行)').toBeVisible({ timeout: 30_000 })
      await expect(detail.locator('[data-dsh-forge-feature-doc-retry]'), '重试入口在场').toBeVisible()

      // 其他文档不受牵连:prd(外链守卫内容)照常渲染(逐文档读取动词,
      // 失败面收敛于被读文档)。
      await page.locator('[data-dsh-forge-feature-doc-tab="prd"]').click()
      await expect.poll(async () => normalizeDoc(await panelText(detail, 'prd')), { timeout: 30_000 })
        .toBe(fixtureTextProjection(fixtureDocBytes(project, GUARDS_SLUG, 'prd')))

      // 恢复突变(同一文件恢复可读,内容原样)+ 重试 → 恢复正常渲染。
      restoreFileRead(corruptedPath)
      await page.locator('[data-dsh-forge-feature-doc-tab="ui"]').click()
      // tab 切换即触发重读:恢复已生效时面板直接成功渲染(错误卡退场,无重
      // 试入口可点);仍在错误态时经「重试」恢复 —— 两径终态一致,由下行
      // poll 断言(错误面本身已在 :114-116 持有)。
      await detail.locator('[data-dsh-forge-feature-doc-retry]').click({ timeout: 5_000 }).catch(() => {})
      await expect.poll(async () => normalizeDoc(await panelText(detail, 'ui')), {
        timeout: 30_000,
        message: 'ui: post-restore retry renders the valid content again',
      }).toBe(fixtureTextProjection(validUiBytes))

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      restoreFileRead(corruptedPath) // 拒读残留在任何退出路径下都解除(清理可删)
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})

test.fixme('step-3/external-link-guard [@web-e2e @journey feature-board-docs-browsing]: external link renders as inert text, zero anchors, clicking never leaves dsh-app://', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const set = guardsTaskSet()
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb3l-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-fb3-link') })
  writeGuardDocs(project)

  const session = createAppSessionFactory({
    bundles: workbenchBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })
  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openFeaturesTab(page)

      await page.locator(`[data-dsh-forge-feature-card="${GUARDS_SLUG}"]`).click()
      const detail = page.locator(`[data-dsh-forge-feature-detail="${GUARDS_SLUG}"]`)
      await expect(detail).toBeVisible({ timeout: 15_000 })
      await page.locator('[data-dsh-forge-feature-doc-tab="prd"]').click()
      const panel = detail.locator('[data-dsh-forge-feature-doc-panel="prd"]')

      // 链接标签文本在场(白名单链接 = span + title 悬停 URL,非锚点)。
      await expect(panel).toContainText('外链示例 dsh-forge e2e', { timeout: 30_000 })
      // 面板零 <a> 锚点 —— 没有任何可导航元素。
      await expect(panel.locator('a'), '渲染面零 anchor(默认拒绝)').toHaveCount(0)

      // 点击链接 span:title 槽即白名单位;点击后停留应用内(URL 不变)。
      const urlBefore = page.url()
      expect(urlBefore.startsWith('dsh-app://'), '腿前在应用内').toBe(true)
      await panel.locator('[title="https://example.com/dsh-forge-e2e"]').click()
      expect(page.url(), '点击外链表示后仍停留应用内(不导航离开)').toBe(urlBefore)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})

test.fixme('step-3/injection-guard [@web-e2e @journey feature-board-docs-browsing]: script/HTML payloads render as literal text and never execute', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const set = guardsTaskSet()
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fb3i-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-fb3-inj') })
  writeGuardDocs(project)

  const session = createAppSessionFactory({
    bundles: workbenchBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })
  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openFeaturesTab(page)

      await page.locator(`[data-dsh-forge-feature-card="${GUARDS_SLUG}"]`).click()
      const detail = page.locator(`[data-dsh-forge-feature-detail="${GUARDS_SLUG}"]`)
      await expect(detail).toBeVisible({ timeout: 15_000 })
      await page.locator('[data-dsh-forge-feature-doc-tab="design"]').click()
      const panel = detail.locator('[data-dsh-forge-feature-doc-panel="design"]')

      // 载荷按字面文本呈现(html/tag token 降级为原文)。自动重试式断言:
      // tab 切换首个 commit 只翻 panel key,passive effect 才换 doc — 一次性
      // innerText 读会落在 stale 窗口(前一 kind 的内容)。
      await expect(panel, '<script> 载荷字面在场').toContainText('<script>', { timeout: 30_000 })
      await expect(panel, '<img onerror> 载荷字面在场').toContainText('onerror=')

      // 零执行面:两个 window 哨兵标记保持 undefined。
      const sentinels = await page.evaluate(() => {
        const w = globalThis as {
          __dshForgeE2eScriptInjected?: unknown
          __dshForgeE2eImgOnerror?: unknown
        }
        return { script: w.__dshForgeE2eScriptInjected, img: w.__dshForgeE2eImgOnerror }
      })
      expect(sentinels.script, 'script 载荷未执行').toBeUndefined()
      expect(sentinels.img, 'onerror 载荷未执行(无 <img>,无 fetch)').toBeUndefined()

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})
