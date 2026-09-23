// feature-board-docs-browsing helpers — the shared mechanics of the journey's
// five step files + smoke (gen-test-scripts, dsh-forge-m2 feature-board-docs-
// browsing).
//
// Sourcing discipline(不重复发明):
//   - 五类文档规范化对比(空白剥离全等 + 源侧投影)= SC4 同款
//     (e2e/tests/m2/sc4-feature-docs.spec.ts,attributed per-block);
//   - 仓外注册向导 external 腿 + 概览卡片定位 = SC5 同款
//     (e2e/tests/m2/sc5-multi-project.spec.ts,attributed per-block);
//   - 手造 typed 模型(sc4 先例:6.1 writer 接受任意模型,方言字节由
//     writeForgeProject 保证)。
//
// 口径钉定(contract state_requirements):
//   - 「与 forge 数据一致」= 测试进程直读 fixture forge 文件(仓内/仓外同
//     口径;本文件 fixtureDocBytes / externalDocBytes);
//   - 注册落库形态 = 工作台状态读数对拍(getState 桥);
//   - loading 态观察 = 观察点先于数据就绪信号注入(tab 点击前装
//     MutationObserver),不依赖竞态时序。
import { spawnSync } from 'node:child_process'
import { chmodSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT } from '../helpers/plugins.ts'
import type { BundleEntry } from '../helpers/plugins.ts'
import type { WrittenForgeProject } from '../fixtures/forge-project.ts'
import type {
  GeneratedFeature, GeneratedTask, GeneratedTaskSet, GeneratedTaskStatus, TaskSetFacts,
} from '../fixtures/task-generator.ts'
import { TASK_STATUSES } from '../fixtures/task-generator.ts'
import { switchToWorkbench } from '../tests/m2/helpers/restart-app.ts'

/** 最小产品配置:基座 + 必备 forge 核心(feature 旅程无 stub CLI 面)。 */
export function workbenchBundles(): readonly BundleEntry[] {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

// ---------------------------------------------------------------------------
// SC4 同款:五类文档锚点 + 规范化对比
// (来源:e2e/tests/m2/sc4-feature-docs.spec.ts —— 原样搬入,仅改导入深度)
// ---------------------------------------------------------------------------

/** The five canonical kinds in strip order (FEATURE_DOC_KINDS mirror). */
export const FIVE_KINDS = ['manifest', 'prd', 'design', 'ui', 'tasks'] as const
export type FiveKind = typeof FIVE_KINDS[number]

/** DOC_KIND_ANCHORS mirror (parse-feature.ts) — where each kind's file lives. */
export const KIND_ANCHORS: Readonly<Record<FiveKind, string>> = {
  manifest: join('manifest.md'),
  prd: join('prd', 'prd-spec.md'),
  design: join('design', 'tech-design.md'),
  ui: join('ui', 'ui-design.md'),
  tasks: join('tasks', 'index.json'),
}

/**
 * Whitespace-stripped normalization (规范化对比):markdown block boundaries
 * introduce no semantics; every other byte must round-trip through the render.
 */
export const normalizeDoc = (text: string): string => text.replaceAll(/\s+/g, '')

/**
 * The fixture file's TEXT projection for the comparison(SC4 同款):markdown
 * SYNTAX tokens that render as structure with no text content — thematic
 * breaks (`---`, the manifest frontmatter fences), heading `#` markers, and
 * link `[label](url)` hrefs (the guarded renderer keeps the label text and
 * carries the URL on the span title — MarkdownView 安全规则 4) — drop out of
 * the source side exactly as the renderer drops them.
 */
export function fixtureTextProjection(markdown: string): string {
  return normalizeDoc(markdown
    .split('\n')
    .filter(line => line.trim() !== '---')
    .map(line => line.replace(/^\s{0,3}#{1,6}\s+/, ''))
    .map(line => line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'))
    .join('\n'))
}

/** The fixture file's bytes for one kind (仓内项目的对比权威)。 */
export function fixtureDocBytes(project: WrittenForgeProject, slug: string, kind: FiveKind): string {
  return readFileSync(join(project.featuresDir, slug, KIND_ANCHORS[kind]), 'utf8')
}

/** 仓外树某 feature 某类文档的文件字节(仓外腿的对比权威,SC5 同口径)。 */
export function externalDocBytes(docsRoot: string, slug: string, kind: FiveKind): string {
  return readFileSync(join(docsRoot, 'docs', 'features', slug, KIND_ANCHORS[kind]), 'utf8')
}

/** The panel's rendered text for the ACTIVE kind. */
export async function panelText(detail: Locator, kind: FiveKind): Promise<string> {
  return await detail.locator(`[data-dsh-forge-feature-doc-panel="${kind}"]`).innerText({ timeout: 30_000 })
}

// ---------------------------------------------------------------------------
// SC5 同款:概览卡片定位 + 仓外注册向导 external 腿
// (来源:e2e/tests/m2/sc5-multi-project.spec.ts —— 原样搬入,仅改导入深度)
// ---------------------------------------------------------------------------

/** The card whose registered displayName is `name` (codeRoot 目录名 default). */
export const cardOf = (page: Page, name: string) => page.locator('[data-dsh-forge-project-card]', { hasText: name }).first()

/** The wizard's external leg: step ② 仓外 + path + 授权确认. */
export async function wizardExternal(page: Page, codeRoot: string, externalPath: string): Promise<void> {
  await page.locator('[data-dsh-forge-wizard-path-input]').fill(codeRoot)
  await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await page.locator('[data-dsh-forge-wizard-doc-external]').click()
  await page.locator('[data-dsh-forge-wizard-external-input]').fill(externalPath)
  await page.locator('[data-dsh-forge-wizard-authorize]').check()
  await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeEnabled()
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await page.locator('[data-dsh-forge-wizard-finish]').click()
}

// ---------------------------------------------------------------------------
// 导航 + getState 读数
// ---------------------------------------------------------------------------

/** 工作台 → feature 看板(SC4 导航事实:tab 点击 + 视图容器可见)。 */
export async function openFeaturesTab(page: Page): Promise<void> {
  await switchToWorkbench(page)
  await page.getByRole('tab', { name: /^feature$|^Features$/ }).click()
  await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-features"]')).toBeVisible()
}

/** getState.projects 行形态(注册落库形态对拍面,FT-036)。 */
export interface StateProjectRow {
  readonly id: string
  readonly displayName: string
  readonly codeRoot: string
  readonly docLocationType: string
  readonly docLocationPath: string | null
}

/** 读 getState 的 projects 行(浏览器侧读数 = 工作台状态读数口径)。 */
export async function getStateProjects(page: Page): Promise<StateProjectRow[]> {
  return await page.evaluate(async () => {
    const bridge = (globalThis as {
      dshForge?: { workbench?: { getState?: () => Promise<{ projects: StateProjectRow[] }> } }
    }).dshForge?.workbench
    const state = await bridge?.getState?.()
    if (state === undefined) throw new Error('dshForge.workbench.getState bridge unavailable in the e2e renderer')
    return state.projects
  })
}

// ---------------------------------------------------------------------------
// 手造模型(sc4 先例):看板双样板 / 守卫腿 / 仓外树 / 零 feature
// ---------------------------------------------------------------------------

/** 手造模型的 facts 精确投影(statusCounts 逐态点数,writer 不消费但求真)。 */
function factsOf(features: GeneratedFeature[]): TaskSetFacts {
  const statusCounts = Object.fromEntries(TASK_STATUSES.map(status => [status, 0])) as Record<GeneratedTaskStatus, number>
  let edgeCount = 0
  let taskCount = 0
  for (const feature of features) {
    for (const task of feature.tasks) {
      statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1
      edgeCount += task.dependencies.length
      taskCount += 1
    }
  }
  return {
    taskCount,
    featureCount: features.length,
    statusCounts,
    edgeCount,
    dangling: [],
    tasksWithRecord: 0,
    recordsWithSessionActor: 0,
    recordsWithTerminalActor: 0,
  }
}

function taskOf(stem: string, localId: string, title: string, status: GeneratedTaskStatus, dependencies: string[] = []): GeneratedTask {
  return { stem, localId, title, status, type: 'coding.feature', dependencies, record: null }
}

/** completed 样板:五类文档齐备 + 任务全完成(计数全满)。 */
export const COMPLETED_SAMPLE_SLUG = 'fixture-board-complete'
function completedSample(): GeneratedFeature {
  return {
    slug: COMPLETED_SAMPLE_SLUG,
    status: 'completed',
    docKinds: ['prd', 'design', 'ui'],
    tasks: [
      taskOf('1.1-t1', '1.1', '看板样板基线任务', 'completed'),
      taskOf('1.2-t2', '1.2', '看板样板并行任务', 'completed'),
      taskOf('1.3-t3', '1.3', '看板样板汇合任务', 'completed', ['1.1']),
      taskOf('1.4-t4', '1.4', '看板样板收口任务', 'completed', ['1.2', '1.3']),
    ],
  }
}

/** in-progress 样板:缺 ui 单类 + completed/pending 并存(计数部分完成)。 */
export const LIVE_SAMPLE_SLUG = 'fixture-board-live'
function liveSample(): GeneratedFeature {
  return {
    slug: LIVE_SAMPLE_SLUG,
    status: 'in-progress',
    docKinds: ['prd', 'design'],
    tasks: [
      taskOf('2.1-t1', '2.1', '进行中样板首任务', 'completed'),
      taskOf('2.2-t2', '2.2', '进行中样板受阻任务', 'pending', ['2.1']),
      taskOf('2.3-t3', '2.3', '进行中样板活跃任务', 'in_progress'),
    ],
  }
}

/** 看板双样板模型(step-1/2 + smoke 的健康 fixture)。 */
export function boardTaskSet(): GeneratedTaskSet {
  const features = [completedSample(), liveSample()]
  return { options: { seed: 'fboard', taskCount: 7, featureCount: 2, danglingRate: 0, recordRate: 0, tasksPerPhase: 6, gates: false, statusWeights: {} }, features, facts: factsOf(features) }
}

/** 守卫腿模型:completed 干净样板(五类对比)+ 守卫 feature(外链/注入/损坏三文档)。 */
export const GUARDS_SLUG = 'fixture-doc-guards'
export function guardsTaskSet(): GeneratedTaskSet {
  const guards: GeneratedFeature = {
    slug: GUARDS_SLUG,
    status: 'completed',
    docKinds: ['prd', 'design', 'ui'],
    tasks: [taskOf('3.1-t1', '3.1', '守卫腿唯一任务', 'completed')],
  }
  const features = [completedSample(), guards]
  return { options: { seed: 'fguards', taskCount: 5, featureCount: 2, danglingRate: 0, recordRate: 0, tasksPerPhase: 6, gates: false, statusWeights: {} }, features, facts: factsOf(features) }
}

/** 守卫腿文档内容(post-write 覆写进树;Setup 预置)。 */
export const EXTERNAL_LINK_DOC = [
  '# 外链守卫腿 fixture',
  '',
  '正文段落:只读渲染不得携带可导航锚点,外链不离开应用。',
  '',
  '[外链示例 dsh-forge e2e](https://example.com/dsh-forge-e2e)',
  '',
  '结尾段落:链接标签保留、跳转禁用。',
  '',
].join('\n')

/** 注入守卫腿文档(脚本 + 内联事件 HTML;须按原文安全渲染、零执行)。 */
export const INJECTION_DOC = [
  '# 注入守卫腿 fixture',
  '',
  '<script>window.__dshForgeE2eScriptInjected = 1</script>',
  '',
  '<img src=x onerror="window.__dshForgeE2eImgOnerror = 1">',
  '',
  '结尾段落:上述载荷按字面文本呈现。',
  '',
].join('\n')

/** 仓外树模型(同构五类齐备;slug 参数化 → 重指向腿的目标树换 slug)。 */
export function externalTaskSet(slug: string, seed: string): GeneratedTaskSet {
  const feature: GeneratedFeature = {
    slug,
    status: 'completed',
    docKinds: ['prd', 'design', 'ui'],
    tasks: [
      taskOf('1.1-t1', '1.1', `${slug} 首任务`, 'completed'),
      taskOf('1.2-t2', '1.2', `${slug} 次任务`, 'pending'),
      taskOf('1.3-t3', '1.3', `${slug} 末任务`, 'in_progress'),
    ],
  }
  return {
    options: { seed, taskCount: 3, featureCount: 1, danglingRate: 0, recordRate: 0, tasksPerPhase: 6, gates: false, statusWeights: {} },
    features: [feature],
    facts: factsOf([feature]),
  }
}

/** 零 feature 模型(空态腿;FT-038:.forge 在 → 检出通过)。 */
export function emptyTaskSet(): GeneratedTaskSet {
  return { options: { seed: 'fempty', taskCount: 0, featureCount: 0, danglingRate: 0, recordRate: 0, tasksPerPhase: 6, gates: false, statusWeights: {} }, features: [], facts: factsOf([]) }
}

// ---------------------------------------------------------------------------
// loading 态观察(就绪门控:观察点先于数据就绪信号注入)
// ---------------------------------------------------------------------------

/** 观察 trace 形态:skeleton/empty/error 三态的插入观测。 */
export interface FeatureLoadTrace {
  readonly skeleton: boolean
  readonly empty: boolean
  readonly error: boolean
}

/**
 * 在 feature tab 点击前装好插入观察(MutationObserver 记录三类状态卡的
 * 出现)—— 观察点先于「数据就绪信号注入」(tab 点击挂载页面并触发首载),
 * loading 断言不依赖竞态时序。
 */
export async function armFeatureLoadObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = globalThis as { __dshForgeE2eFeatureLoadTrace?: { skeleton: boolean; empty: boolean; error: boolean } }
    w.__dshForgeE2eFeatureLoadTrace = { skeleton: false, empty: false, error: false }
    const mark = (kind: 'skeleton' | 'empty' | 'error'): void => {
      const trace = w.__dshForgeE2eFeatureLoadTrace
      if (trace !== undefined) trace[kind] = true
    }
    const selectorOf: Record<'skeleton' | 'empty' | 'error', string> = {
      skeleton: '[data-dsh-forge-feature-skeleton]',
      empty: '[data-dsh-forge-feature-empty]',
      error: '[data-dsh-forge-feature-error]',
    }
    const watch = (mutations: MutationRecord[]): void => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue
          for (const kind of ['skeleton', 'empty', 'error'] as const) {
            const selector = selectorOf[kind]
            if (node.matches(selector) || node.querySelector(selector) !== null) mark(kind)
          }
        }
      }
    }
    new MutationObserver(watch).observe(document.body, { childList: true, subtree: true })
  })
}

/** 读回观察 trace(卡片就绪后调用)。 */
export async function readFeatureLoadTrace(page: Page): Promise<FeatureLoadTrace> {
  return await page.evaluate(() => {
    const trace = (globalThis as { __dshForgeE2eFeatureLoadTrace?: FeatureLoadTrace }).__dshForgeE2eFeatureLoadTrace
    if (trace === undefined) throw new Error('feature load trace was never armed')
    return { skeleton: trace.skeleton, empty: trace.empty, error: trace.error }
  })
}

// ---------------------------------------------------------------------------
// 单文档读取失败注入(损坏腿)
// ---------------------------------------------------------------------------

/**
 * 使一个文档文件「存在但不可读」—— readFeatureDoc 的确定性失败注入:
 * node 的 utf8 读对无效字节只做替换字符降级(不抛错),而删除文件会让
 * docKinds 探测(statSync.isFile)失真 → tab 被禁用,错误卡不可达。唯一
 * 两全的注入 = 拒读权限:win32 = icacls 拒绝 Everyone SID 的 read-data
 * (statSync 仍成功、readFileSync EPERM);POSIX = chmod 0。
 * (已在 win32 实测:deny *S-1-1-0:(RD) → stat ok / read EPERM。)
 */
export function denyFileRead(path: string): void {
  if (process.platform === 'win32') {
    const result = spawnSync('icacls', [path, '/deny', '*S-1-1-0:(RD)'], { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(`icacls deny failed on ${path}: ${(result.stderr ?? result.stdout ?? '').trim()}`)
    }
    return
  }
  chmodSync(path, 0o000)
}

/** 恢复可读(单文档粒度,同一文件;恢复后内容即原有效内容)。 */
export function restoreFileRead(path: string): void {
  if (process.platform === 'win32') {
    const result = spawnSync('icacls', [path, '/remove:d', '*S-1-1-0'], { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(`icacls restore failed on ${path}: ${(result.stderr ?? result.stdout ?? '').trim()}`)
    }
    return
  }
  chmodSync(path, 0o644)
}
