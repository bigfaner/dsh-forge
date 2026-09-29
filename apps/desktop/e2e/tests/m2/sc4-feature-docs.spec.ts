// @feature dsh-forge-m2 | @web-e2e | @journey sc4-feature-docs
// Traceability: docs/features/dsh-forge-m2/tasks/6.4-sc45-features-external-docs.md
//
// SC4 验收腿(tech-design Key Test Scenarios / PRD SC4):feature 看板呈现
// m1 样板(全完成任务)完成徽标 + 任务计数;五类文档(manifest/prd/design/
// ui/tasks)tab 打开渲染,内容与 fixture 文件一致(规范化对比 —— 空白剥离
// 后全等,markdown 块边界不引入语义);docKinds 缺位的 tab 恒 disabled
// (Interface 1 注记:五槽位条是稳定地图,缺类禁用不隐藏)。
//
// Fixture:手造 GeneratedTaskSet(6.1 writer 接受任意模型 —— 方言字节由
// writeForgeProject 保证):fixture-m1-complete 全完成 + 三可选类齐备(五
// 类全开),fixture-partial 部分完成 + 无可选类(三 tab 禁用矩阵)。计数
// 断言对拍模型自身(任务计数正确 = DTO 计数器 ↔ 模型)。
//
// Hard Rule:腿内启动前单实例探测守卫(ERR_SINGLE_INSTANCE 教训);
// DSH_FORGE_USER_DATA = journey 临时目录(6.1 隔离缝)。
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball, launchPluginShell,
} from '../../helpers/plugins.ts'
import type { PluginShell } from '../../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../../fixtures/forge-project.ts'
import type { WrittenForgeProject } from '../../fixtures/forge-project.ts'
import type { GeneratedFeature, GeneratedTaskSet } from '../../fixtures/task-generator.ts'
import {
  assertNoActiveForgeInstance, closeAndAwaitExit, cleanupViewKey, switchToWorkbench,
} from './helpers/restart-app.ts'

/** The five canonical kinds in strip order (FEATURE_DOC_KINDS mirror). */
const FIVE_KINDS = ['manifest', 'prd', 'design', 'ui', 'tasks'] as const
type FiveKind = typeof FIVE_KINDS[number]

/** DOC_KIND_ANCHORS mirror (parse-feature.ts) — where each kind's file lives. */
const KIND_ANCHORS: Readonly<Record<FiveKind, string>> = {
  manifest: join('manifest.md'),
  prd: join('prd', 'prd-spec.md'),
  design: join('design', 'tech-design.md'),
  ui: join('ui', 'ui-design.md'),
  tasks: join('tasks', 'index.json'),
}

/**
 * The SC4 model: deterministic by construction (hand-built typed literals —
 * the 6.1 writer renders dialect-exact bytes from it; no PRNG involved).
 */
function sc4TaskSet(): GeneratedTaskSet {
  const options = {
    seed: 'sc4',
    taskCount: 7,
    featureCount: 2,
    danglingRate: 0,
    recordRate: 0,
    tasksPerPhase: 6,
    gates: false,
    statusWeights: {},
  }
  const m1Complete: GeneratedFeature = {
    slug: 'fixture-m1-complete',
    status: 'completed',
    docKinds: ['prd', 'design', 'ui'],
    tasks: [
      { stem: '1.1-t1', localId: '1.1', title: 'm1 样板基线任务', status: 'completed', type: 'coding.feature', dependencies: [], record: null },
      { stem: '1.2-t2', localId: '1.2', title: 'm1 样板并行任务', status: 'completed', type: 'doc.feature', dependencies: [], record: null },
      { stem: '1.3-t3', localId: '1.3', title: 'm1 样板汇合任务', status: 'completed', type: 'test', dependencies: ['1.1'], record: null },
      { stem: '1.4-t4', localId: '1.4', title: 'm1 样板收口任务', status: 'completed', type: 'validation', dependencies: ['1.2', '1.3'], record: null },
    ],
  }
  const partial: GeneratedFeature = {
    slug: 'fixture-partial',
    status: 'in-progress',
    docKinds: [],
    tasks: [
      { stem: '2.1-t1', localId: '2.1', title: '进行中特性首任务', status: 'completed', type: 'coding.feature', dependencies: [], record: null },
      { stem: '2.2-t2', localId: '2.2', title: '进行中特性受阻任务', status: 'pending', type: 'coding.feature', dependencies: ['2.1'], record: null },
      { stem: '2.3-t3', localId: '2.3', title: '进行中特性活跃任务', status: 'in_progress', type: 'gate', dependencies: [], record: null },
    ],
  }
  return {
    options,
    features: [m1Complete, partial],
    facts: {
      taskCount: 7,
      featureCount: 2,
      statusCounts: { pending: 1, in_progress: 1, completed: 5, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
      edgeCount: 4,
      dangling: [],
      tasksWithRecord: 0,
      recordsWithSessionActor: 0,
      recordsWithTerminalActor: 0,
    },
  }
}

/** Whitespace-stripped normalization (规范化对比):markdown block boundaries
 * introduce no semantics; every other byte must round-trip through the render. */
const normalizeDoc = (text: string): string => text.replaceAll(/\s+/g, '')

/**
 * The fixture file's TEXT projection for the comparison: markdown SYNTAX
 * tokens that render as structure with no text content — thematic breaks
 * (`---`, the manifest frontmatter fences) and heading `#` markers — drop
 * out of the source side exactly as the renderer drops them; every remaining
 * character must round-trip.
 */
function fixtureTextProjection(markdown: string): string {
  return normalizeDoc(markdown
    .split('\n')
    .filter(line => line.trim() !== '---')
    .map(line => line.replace(/^\s{0,3}#{1,6}\s+/, ''))
    .join('\n'))
}

/** The fixture file's bytes for one kind (the comparison authority). */
function fixtureDocBytes(project: WrittenForgeProject, slug: string, kind: FiveKind): string {
  return readFileSync(join(project.featuresDir, slug, KIND_ANCHORS[kind]), 'utf8')
}

/** The panel's rendered text for the ACTIVE kind. */
async function panelText(detail: Locator, kind: FiveKind): Promise<string> {
  return await detail.locator(`[data-dsh-forge-feature-doc-panel="${kind}"]`).innerText({ timeout: 30_000 })
}

function sc4Bundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

// [M4 1.8 e2e 迁移·迁移清单 第④行 · M3 阶段资产面板 / Feature 板(workbench/features)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 2.10 复核:断言锚定已退役宿主方言(旧向导/换台 chrome/提案板与
// Feature 板详情/阶段资产面板内部件),右栏 pane 族未承接 —— 挂起终态与恢复前置 = regression-inventory.md 开放项。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('6.4/sc4-feature-docs [@web-e2e @journey sc4-feature-docs]: m1-completed badge + counters + five-doc-kind fidelity vs fixture files', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  const set = sc4TaskSet()
  const m1Complete = set.features[0] as NonNullable<typeof set.features[0]>
  const partial = set.features[1] as NonNullable<typeof set.features[1]>
  // Model self-checks (the assertion base below reads these numbers).
  expect(m1Complete.tasks.every(task => task.status === 'completed')).toBe(true)
  expect(partial.tasks.filter(task => task.status === 'completed').length).toBe(1)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc4-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'fixture-project') })
  const shellRoot = join(root, 'shell')
  const userDataDir = join(root, 'user-data')

  try {
    assertNoActiveForgeInstance()
    const shell: PluginShell = await launchPluginShell({
      bundles: sc4Bundles(),
      stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
      rootDir: shellRoot,
      userDataDir,
    })
    try {
      await shell.uiReady()
      const { page } = shell
      expect(existsSync(join(userDataDir, 'workbench', 'workbench.db'))).toBe(true)

      const projectId = await registerFixtureProject(page, project)
      expect(typeof projectId).toBe('string')

      await switchToWorkbench(page)
      await page.getByRole('tab', { name: /^Feature$|^Features$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()

      // ======================================================================
      // SC4-1 · m1 样板完成徽标 + 任务计数(DTO 计数器 ↔ 模型对拍)
      // ======================================================================
      const doneCard = page.locator(`[data-dsh-forge-feature-card="${m1Complete.slug}"]`)
      const liveCard = page.locator(`[data-dsh-forge-feature-card="${partial.slug}"]`)
      await expect(doneCard).toBeVisible({ timeout: 30_000 })
      await expect(doneCard).toHaveAttribute('data-dsh-forge-feature-complete', '')
      await expect(doneCard.locator('[data-dsh-forge-feature-completed]')).toBeVisible()
      // 计数正确:进度文本与 progressbar 值域均以 DTO 计数器为准(4/4)。
      await expect(doneCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
      await expect(doneCard.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4')
      await expect(doneCard.getByRole('progressbar')).toHaveAttribute('aria-valuetext', /4\/4/)
      // 非完成特性:无徽标、计数 1/3(部分完成的真实口径)。
      await expect(liveCard).toBeVisible()
      await expect(liveCard).not.toHaveAttribute('data-dsh-forge-feature-complete', '')
      await expect(liveCard.locator('[data-dsh-forge-feature-completed]')).toHaveCount(0)
      await expect(liveCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
      await expect(liveCard.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3')
      await expect(liveCard.getByRole('progressbar')).toHaveAttribute('aria-valuetext', /1\/3/)

      // ======================================================================
      // SC4-2 · 五类文档:全开特性逐 tab 渲染,内容与 fixture 文件一致
      // ======================================================================
      await doneCard.click()
      const detail = page.locator(`[data-dsh-forge-feature-detail="${m1Complete.slug}"]`)
      await expect(detail).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-feature-detail"]')).toBeVisible()
      // 详情徽标复用列表判定(完成徽标);in_repo 无仓外角标。
      await expect(detail.locator('[data-dsh-forge-feature-completed]')).toBeVisible()
      await expect(detail.locator('[data-dsh-forge-badge="external-docs"]')).toHaveCount(0)

      for (const kind of FIVE_KINDS) {
        const tab = page.locator(`[data-dsh-forge-feature-doc-tab="${kind}"]`)
        await expect(tab, `${kind} tab enabled on the all-kinds feature`).toBeEnabled()
        await tab.click()
        // The tab swap paints one frame with the PREVIOUS doc before the read
        // effect arms (useEffect runs post-paint) — poll the settled content.
        await expect.poll(async () => normalizeDoc(await panelText(detail, kind)), {
          timeout: 30_000,
          message: `${kind}: rendered markdown ≁ fixture file (normalized compare)`,
        }).toBe(fixtureTextProjection(fixtureDocBytes(project, m1Complete.slug, kind)))
      }

      // 返回保留列表态:面包屑回列表(5.16 契约,round-trip 顺带覆盖)。
      await page.locator('[data-dsh-forge-feature-back]').click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()
      await expect(doneCard).toBeVisible()

      // ======================================================================
      // SC4-2(续)· 缺类禁用矩阵:无可选类特性,三 tab disabled 不隐藏
      // ======================================================================
      await liveCard.click()
      const liveDetail = page.locator(`[data-dsh-forge-feature-detail="${partial.slug}"]`)
      await expect(liveDetail).toBeVisible({ timeout: 15_000 })
      for (const kind of ['prd', 'design', 'ui'] as const) {
        const tab = page.locator(`[data-dsh-forge-feature-doc-tab="${kind}"]`)
        await expect(tab, `${kind} tab present (never hidden)`).toHaveCount(1)
        await expect(tab).toBeDisabled()
        await expect(tab).toHaveAttribute('aria-disabled', 'true')
        await expect(tab).toHaveAttribute('title', /.+/) // the 「无此类文档」 tooltip seat
      }
      for (const kind of ['manifest', 'tasks'] as const) {
        await expect(page.locator(`[data-dsh-forge-feature-doc-tab="${kind}"]`)).toBeEnabled()
      }
      // 缺省落点:首个可用类(manifest)渲染,panel 数据一致(polled — the
      // mount's own read settles asynchronously).
      await expect.poll(async () => normalizeDoc(await panelText(liveDetail, 'manifest')), {
        timeout: 30_000,
      }).toBe(fixtureTextProjection(fixtureDocBytes(project, partial.slug, 'manifest')))

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    // Journey cleanup (6.1 Hard Rule: 测试后清理 — fixture tree + userData + shell root).
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
