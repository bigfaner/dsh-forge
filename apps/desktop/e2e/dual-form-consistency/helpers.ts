// dual-form-consistency helpers — the shared mechanics of the journey's five
// step files + smoke (gen-test-scripts, dsh-forge-m2 dual-form-consistency).
//
// Sourcing discipline(不重复发明):
//   - 终端/应用三路读与状态图对拍 = SC7 同款(e2e/tests/m2/sc7-dual-form.spec.ts
//     原样搬入,attributed per-block);
//   - ≤5s 回流计量与预算策略 = SC3 同款(e2e/tests/m2/sc3-reflow-source.spec.ts
//     原样搬入,attributed per-block);
//   - fixture 变更驱动 = createFixtureMutator(e2e/tests/m2/helpers/file-mutate.ts,
//     复用不复制);
//   - 结构性增删 = 直写 index.json,外层序列化形态与 6.1 writer 的
//     tasksIndexJson 序列器逐字节同形(JSON.stringify({tasks}, undefined, 2)+\n)。
//
// 口径钉定(contract state_requirements):
//   - 变更事实/任务集一致性 = 测试进程直读 fixture forge 文件(本文件的
//     fileStatusMap / readIndexEntries),浏览器侧不自行观测 CLI/文件系统;
//   - 终端输出 = stub CLI `task status` TSV(spawnSync,cwd = 项目根);
//   - 应用读数 = dshForge.workbench 桥(getTaskBoard/getTaskDetail/
//     recordSessionLink/endSessionLink)。挂接登记用桥直达形态(sanctioned:
//     发起链路不是本旅程的被测面,见 step-3/step-5 头注)。
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT } from '../helpers/plugins.ts'
import type { BundleEntry } from '../helpers/plugins.ts'
import type { StubCli } from '../fixtures/stubs/cli.ts'
import type { WrittenForgeProject } from '../fixtures/forge-project.ts'
import { tasksIndexJson } from '../fixtures/forge-project.ts'
import type {
  GeneratedFeature, GeneratedRecord, GeneratedTask, GeneratedTaskSet, GeneratedTaskStatus,
} from '../fixtures/task-generator.ts'
import { TASK_STATUSES } from '../fixtures/task-generator.ts'
import type { WorkbenchKey } from '../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'
import { en } from '../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'
import { zh } from '../../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'

/** 最小产品配置:基座 + 必备 forge 核心(全旅程共用,SC7 同款)。 */
export function workbenchBundles(): readonly BundleEntry[] {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

// ---------------------------------------------------------------------------
// SC7 同款:状态标签回映 + 终端 TSV 读 + 三路应用读 + 状态图对拍
// (来源:e2e/tests/m2/sc7-dual-form.spec.ts —— 原样搬入,仅改导入深度)
// ---------------------------------------------------------------------------

/** view-C 状态标签 → 状态(双语,SC1 同款回映表)。 */
const STATUS_LABEL_KEY_OF: Readonly<Record<GeneratedTaskStatus, WorkbenchKey>> = {
  pending: 'tasks.status.pending',
  in_progress: 'tasks.status.in_progress',
  completed: 'tasks.status.completed',
  blocked: 'tasks.status.blocked',
  suspended: 'tasks.status.suspended',
  skipped: 'tasks.status.skipped',
  rejected: 'tasks.status.rejected',
}
const statusOfLabel = new Map<string, GeneratedTaskStatus>()
for (const status of TASK_STATUSES) {
  const key = STATUS_LABEL_KEY_OF[status]
  statusOfLabel.set(zh[key], status)
  statusOfLabel.set(en[key], status)
}

/** 终端形态读:`forge task status` TSV → Map<taskKey, status>(词表原样)。 */
export function readTerminalStatuses(stub: StubCli, codeRoot: string): ReadonlyMap<string, string> {
  const result = spawnSync(stub.cliPath, ['task', 'status'], { cwd: codeRoot, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`stub forge task status exited ${String(result.status)}: ${result.stderr ?? ''}`)
  }
  const byKey = new Map<string, string>()
  for (const line of result.stdout.split('\n')) {
    if (line.trim() === '') continue
    const parts = line.split('\t')
    const key = parts[0] ?? ''
    const status = parts[1] ?? ''
    if (parts.length !== 2 || key === '' || status === '') {
      throw new Error(`unparseable status row: ${JSON.stringify(line)}`)
    }
    byKey.set(key, status)
  }
  return byKey
}

/** 两张状态图的逐键逐状态对拍(带差异样本)。 */
export function expectStatusMapsEqual(label: string, left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): void {
  const samples: string[] = []
  for (const [key, status] of left) {
    const other = right.get(key)
    if (other === undefined) samples.push(`${label}: ${key} missing on the right`)
    else if (other !== status) samples.push(`${label}: ${key} ${status} != ${other}`)
    if (samples.length >= 5) break
  }
  for (const key of right.keys()) {
    if (!left.has(key)) samples.push(`${label}: ${key} unexpected on the right`)
    if (samples.length >= 8) break
  }
  expect(samples, `${label}: status-map diff samples`).toEqual([])
  expect(left.size, `${label}: key count`).toBe(right.size)
}

/** 应用形态读·数据面:getTaskBoard 直调 → entries。 */
export async function boardStatusEntries(page: Page, projectId: string): Promise<Array<[string, string]>> {
  return await page.evaluate(async (id: string) => {
    const bridge = (globalThis as {
      dshForge?: { workbench?: { getTaskBoard?: (id: string) => Promise<{ tasks: Array<{ key: string; status: string }> }> } }
    }).dshForge?.workbench
    const board = await bridge?.getTaskBoard?.(id)
    if (board === undefined) throw new Error('dshForge.workbench.getTaskBoard bridge unavailable in the e2e renderer')
    return board.tasks.map(task => [task.key, task.status] as [string, string])
  }, projectId)
}

/** 应用形态读·view-B(分组列):column 属性携带原始状态词。 */
export async function groupedStatusEntries(page: Page): Promise<Array<[string, string]>> {
  return await page.evaluate(() => {
    const rows: Array<[string, string]> = []
    for (const column of document.querySelectorAll('[data-dsh-forge-status-column]')) {
      const status = column.getAttribute('data-dsh-forge-status-column') ?? ''
      for (const card of column.querySelectorAll('[data-dsh-forge-task-card]')) {
        rows.push([card.getAttribute('data-dsh-forge-task-card') ?? '', status])
      }
    }
    return rows
  })
}

/** 应用形态读·view-C(列表行):状态标签文本(回映到状态)。 */
export async function listRowStatusTexts(page: Page): Promise<Array<[string, string]>> {
  return await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-task-row]')).map((row) => {
    const key = row.getAttribute('data-dsh-forge-task-row') ?? ''
    const statusText = row.children[2]?.textContent ?? ''
    return [key, statusText] as [string, string]
  }))
}

/** view-C 行状态(单键,poll 面)。 */
export async function listRowStatus(page: Page, taskKey: string): Promise<string | undefined> {
  return await page.evaluate((key: string) => {
    const row = document.querySelector(`[data-dsh-forge-task-row="${key}"]`)
    return row?.children[2]?.textContent ?? undefined
  }, taskKey)
}

/** 数据面单键状态(poll 面)。 */
export async function boardStatusOf(page: Page, projectId: string, taskKey: string): Promise<string | undefined> {
  return await page.evaluate(async (input: { id: string; key: string }) => {
    const bridge = (globalThis as {
      dshForge?: { workbench?: { getTaskBoard?: (id: string) => Promise<{ tasks: Array<{ key: string; status: string }> }> } }
    }).dshForge?.workbench
    const board = await bridge?.getTaskBoard?.(input.id)
    return board?.tasks.find(task => task.key === input.key)?.status
  }, { id: projectId, key: taskKey })
}

/** 数据面单键来源(FT-045 判定序产物;null = 无任何变更标记)。 */
export async function boardSourceOf(page: Page, projectId: string, taskKey: string): Promise<string | null | undefined> {
  return await page.evaluate(async (input: { id: string; key: string }) => {
    const bridge = (globalThis as {
      dshForge?: {
        workbench?: { getTaskBoard?: (id: string) => Promise<{ tasks: Array<{ key: string; status: string; source: string | null }> }> }
      }
    }).dshForge?.workbench
    const board = await bridge?.getTaskBoard?.(input.id)
    return board?.tasks.find(task => task.key === input.key)?.source
  }, { id: projectId, key: taskKey })
}

/** 数据面单键 blockers(依赖维对拍面;stub TSV 不携带依赖列,见 step-2 头注)。 */
export async function boardBlockersOf(page: Page, projectId: string, taskKey: string): Promise<string[] | undefined> {
  return await page.evaluate(async (input: { id: string; key: string }) => {
    const bridge = (globalThis as {
      dshForge?: { workbench?: { getTaskBoard?: (id: string) => Promise<{ tasks: Array<{ key: string; blockers: string[] }> }> } }
    }).dshForge?.workbench
    const board = await bridge?.getTaskBoard?.(input.id)
    return board?.tasks.find(task => task.key === input.key)?.blockers
  }, { id: projectId, key: taskKey })
}

/**
 * 四路对拍(SC7 终态形态):终端 TSV vs 数据面 vs view-B vs view-C 逐键逐状态
 * 全等;结束时回到 view-A(后续腿的计量面)。
 */
export async function expectFourWayAgreement(
  page: Page, projectId: string, stub: StubCli, codeRoot: string, label: string,
): Promise<void> {
  const terminal = readTerminalStatuses(stub, codeRoot)
  const board = new Map(await boardStatusEntries(page, projectId))
  expectStatusMapsEqual(`${label} 终端 vs 数据面`, terminal, board)

  await page.locator('[data-dsh-forge-board-view="grouped"]').click()
  await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible({ timeout: 30_000 })
  expectStatusMapsEqual(`${label} view-B vs 数据面`, new Map(await groupedStatusEntries(page)), board)

  await page.locator('[data-dsh-forge-board-view="list"]').click()
  await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })
  const viewC = new Map<string, string>()
  for (const [key, rowText] of await listRowStatusTexts(page)) {
    const status = statusOfLabel.get(rowText.trim())
    if (status === undefined) throw new Error(`${label}: view-C 行 ${key} 状态标签无法回映: ${JSON.stringify(rowText)}`)
    viewC.set(key, status)
  }
  expectStatusMapsEqual(`${label} view-C vs 数据面`, viewC, board)

  await page.locator('[data-dsh-forge-board-view="tree"]').click()
  await expect(page.locator('[data-dsh-forge-board-panel="tree"]')).toBeVisible({ timeout: 30_000 })
}

// ---------------------------------------------------------------------------
// SC3 同款:≤5s 回流计量 + 预算策略
// (来源:e2e/tests/m2/sc3-reflow-source.spec.ts —— 原样搬入,仅改导入深度)
// ---------------------------------------------------------------------------

/** AC budget: the full 感知+推送+渲染 chain, real clock, never widened. */
export const REFLOW_BUDGET_MS = 5_000

/** The wait's failure ceiling — well above budget so a retry leg can measure. */
export const REFLOW_WAIT_TIMEOUT_MS = 20_000

/** The short-label locale keys (view-A node cards render the SHORT label). */
const SHORT_LABEL_KEYS: Readonly<Record<GeneratedTaskStatus, keyof typeof zh>> = {
  pending: 'tasks.status.short.pending',
  in_progress: 'tasks.status.short.in_progress',
  completed: 'tasks.status.short.completed',
  blocked: 'tasks.status.short.blocked',
  suspended: 'tasks.status.short.suspended',
  skipped: 'tasks.status.short.skipped',
  rejected: 'tasks.status.short.rejected',
}

/** Both locales' short labels for a status (the shell's `t` seat is either). */
function shortLabelsOf(status: GeneratedTaskStatus): string[] {
  return [zh[SHORT_LABEL_KEYS[status]], en[SHORT_LABEL_KEYS[status]]]
}

/**
 * t0 → t1 measurement of one reflow: the DOM must show the target source badge
 * AND the new status's short label on the task's view-A node card.
 */
export async function measureReflow(
  page: Page,
  taskKey: string,
  expectSource: 'session' | 'terminal',
  newStatus: GeneratedTaskStatus,
  apply: () => void,
): Promise<number> {
  const newLabels = shortLabelsOf(newStatus)
  apply() // the semantic file change(s); the LAST write is the t0 anchor
  const t0 = Date.now()
  await page.waitForFunction((input: { key: string; source: string; labels: string[] }) => {
    const card = document.querySelector(`[data-dsh-forge-node-card="${input.key}"]`)
    if (card === null) return false
    const badge = card.querySelector('[data-dsh-forge-badge^="source:"]')
    if (badge?.getAttribute('data-dsh-forge-badge') !== `source:${input.source}`) return false
    const text = card.textContent ?? ''
    return input.labels.some(label => text.includes(label))
  }, { key: taskKey, source: expectSource, labels: newLabels }, { timeout: REFLOW_WAIT_TIMEOUT_MS, polling: 50 })
  return Date.now() - t0
}

/**
 * The Hard-Rule retry policy: try each attempt (each a FRESH mutation) until
 * one lands inside the budget — at most the pool's size, in practice ≤2
 * (retry once); the distribution is ALWAYS printed; the threshold never moves.
 */
export async function assertReflowWithinBudget(
  label: string,
  attempts: ReadonlyArray<() => Promise<number>>,
): Promise<void> {
  const samples: number[] = []
  for (const attempt of attempts) {
    samples.push(await attempt())
    if ((samples[samples.length - 1] as number) <= REFLOW_BUDGET_MS) break
  }
  console.log(`[dual-form] ${label} reflow(ms)=${JSON.stringify(samples)} budget=${String(REFLOW_BUDGET_MS)} (感知+推送+渲染全链,真实时钟)`)
  expect(
    samples.some(ms => ms <= REFLOW_BUDGET_MS),
    `${label}: ≤${String(REFLOW_BUDGET_MS)}ms not met — distribution ${JSON.stringify(samples)} (Hard Rule: retry once + record distribution, threshold unchanged)`,
  ).toBe(true)
}

// ---------------------------------------------------------------------------
// fixture 直读口径:任务集一致性 / 序列器往返 / 结构性增删
// ---------------------------------------------------------------------------

/** index.json 单任务条目的钉定形状(6.1 序列器字段序:id/title/status/dependencies/type?/file?/record?);属性可变 —— 结构性/3.x 形腿在解析产物上原地改写。 */
export interface IndexEntry {
  id: string
  title: string
  status: string
  dependencies: string[]
  type?: string
  file?: string
  record?: string
}

/** 直读一个 feature 的 tasks/index.json(测试进程 oracle,非浏览器观测)。 */
export function readIndexEntries(indexPath: string): Record<string, IndexEntry> {
  const parsed = JSON.parse(readFileSync(indexPath, 'utf8')) as { tasks?: Record<string, IndexEntry> }
  if (parsed.tasks === undefined || typeof parsed.tasks !== 'object') {
    throw new Error(`index.json has no tasks object: ${indexPath}`)
  }
  return parsed.tasks
}

/**
 * 直写 index.json —— 外层形态与 6.1 writer 的 tasksIndexJson 序列器逐字节
 * 同形(2-space + trailing newline);条目内字段序由调用方保持方言序。
 */
export function writeIndexEntries(indexPath: string, entries: Record<string, IndexEntry>): void {
  writeFileSync(indexPath, `${JSON.stringify({ tasks: entries }, undefined, 2)}\n`)
}

/** 任务集直读对拍面:全部 feature 的 index.json → Map<taskKey, status>。 */
export function fileStatusMap(project: WrittenForgeProject): Map<string, string> {
  const byKey = new Map<string, string>()
  for (const { slug, path } of project.indexPaths) {
    for (const entry of Object.values(readIndexEntries(path))) {
      byKey.set(`${slug}/${entry.id}`, entry.status)
    }
  }
  return byKey
}

/** 序列器占位记录(record 字段非空即渲染指针;内容不入 index.json)。 */
const RECORD_PLACEHOLDER: GeneratedRecord = { actor: null, summary: '', completed: '2026-09-23 12:00' }

/**
 * SC7 往返断言的文件面:当前 index.json 字节 ≡ tasksIndexJson(从文件重建的
 * 模型)渲染 —— 方言自洽、零半写/零改写的字节级证明。
 */
export function expectIndexSerializerRoundTrip(slug: string, indexPath: string): void {
  const raw = readFileSync(indexPath, 'utf8')
  const tasks: GeneratedTask[] = Object.entries(readIndexEntries(indexPath)).map(([stem, entry]) => ({
    stem,
    localId: entry.id,
    title: entry.title,
    status: entry.status as GeneratedTaskStatus,
    type: entry.type ?? '',
    dependencies: [...entry.dependencies],
    record: typeof entry.record === 'string' && entry.record !== '' ? RECORD_PLACEHOLDER : null,
  }))
  const feature: GeneratedFeature = { slug, status: 'in-progress', docKinds: [], tasks }
  expect(tasksIndexJson(feature), `${slug}/tasks/index.json serializer round-trip`).toBe(raw)
}

// ---------------------------------------------------------------------------
// 任务选键 + 桥直达挂接动词(发起链路不在本旅程被测面 —— 见各 step 头注)
// ---------------------------------------------------------------------------

/** 谓词选任务的限定地址结果(feature 内 localId 顺序遍历,首中即返)。 */
export interface PickedTask {
  readonly key: string
  readonly featureSlug: string
  readonly localId: string
}

/** 按谓词挑一个任务并回看板限定地址(SC7 pickTask 同款遍历序)。 */
export function pickTaskKey(
  set: GeneratedTaskSet, predicate: (task: GeneratedTask) => boolean, ...exclude: string[]
): PickedTask {
  const excluded = new Set(exclude)
  for (const feature of set.features) {
    for (const task of feature.tasks) {
      const key = `${feature.slug}/${task.localId}`
      if (excluded.has(key)) continue
      if (predicate(task)) return { key, featureSlug: feature.slug, localId: task.localId }
    }
  }
  throw new Error('dual-form: no fixture task matches the pick predicate')
}

/** 桥直达 recordSessionLink(Interface 1 动词;返回挂接行 id 供 endSessionLink)。 */
export async function bridgeRecordSessionLink(
  page: Page, input: { projectId: string; taskKey: string; sessionId: string },
): Promise<{ id: string }> {
  return await page.evaluate(async (arg: { projectId: string; taskKey: string; sessionId: string }) => {
    const bridge = (globalThis as {
      dshForge?: {
        workbench?: { recordSessionLink?: (input: { projectId: string; taskKey: string; sessionId: string }) => Promise<{ id: string }> }
      }
    }).dshForge?.workbench
    if (bridge?.recordSessionLink === undefined) throw new Error('dshForge.workbench.recordSessionLink bridge unavailable')
    return await bridge.recordSessionLink(arg)
  }, input)
}

/** 桥直达 endSessionLink(Interface 1 动词;入参 = linkId,非 record 镜像 —— ipc/types.ts 契约)。 */
export async function bridgeEndSessionLink(page: Page, linkId: string): Promise<void> {
  await page.evaluate(async (id: string) => {
    const bridge = (globalThis as {
      dshForge?: { workbench?: { endSessionLink?: (linkId: string) => Promise<void> } }
    }).dshForge?.workbench
    if (bridge?.endSessionLink === undefined) throw new Error('dshForge.workbench.endSessionLink bridge unavailable')
    await bridge.endSessionLink(id)
  }, linkId)
}

/** getTaskDetail.links 读(挂接索引 = 工作台自有 SoT 的读数对拍面,新→旧)。 */
export async function detailLinksOf(
  page: Page, projectId: string, taskKey: string,
): Promise<Array<{ sessionId: string; status: string; endedAt: string | null }>> {
  return await page.evaluate(async (input: { id: string; key: string }) => {
    const bridge = (globalThis as {
      dshForge?: {
        workbench?: {
          getTaskDetail?: (id: string, key: string) => Promise<{
            links: Array<{ sessionId: string; status: string; endedAt: string | null }>
          }>
        }
      }
    }).dshForge?.workbench
    const detail = await bridge?.getTaskDetail?.(input.id, input.key)
    if (detail === undefined) throw new Error('dshForge.workbench.getTaskDetail bridge unavailable')
    return detail.links
  }, { id: projectId, key: taskKey })
}

/** getTaskDetail.records 读(记录指针面;frozen 腿的 record-drop 可观测)。 */
export async function detailRecordsOf(
  page: Page, projectId: string, taskKey: string,
): Promise<Array<{ source: string | null; summary: string }>> {
  return await page.evaluate(async (input: { id: string; key: string }) => {
    const bridge = (globalThis as {
      dshForge?: {
        workbench?: { getTaskDetail?: (id: string, key: string) => Promise<{ records: Array<{ source: string | null; summary: string }> }> }
      }
    }).dshForge?.workbench
    const detail = await bridge?.getTaskDetail?.(input.id, input.key)
    if (detail === undefined) throw new Error('dshForge.workbench.getTaskDetail bridge unavailable')
    return detail.records
  }, { id: projectId, key: taskKey })
}

/**
 * view-A 无整板重载探针:给某任务的 react-flow 节点打一个测试侧标记属性,
 * 变更回流后标记仍在 = 该节点 DOM 未被重建(整板重载会重建全部节点)。
 * (测试仪表属性,非 data-dsh-forge-* 产品定位面。)
 */
export async function markTreeNode(page: Page, taskKey: string): Promise<boolean> {
  return await page.evaluate((key: string) => {
    const card = document.querySelector(`[data-dsh-forge-node-card="${key}"]`)
    const node = card?.closest('.react-flow__node')
    node?.setAttribute('data-e2e-node-marked', '1')
    return node !== null
  }, taskKey)
}

/** 读回 markTreeNode 的标记(整板重载 = 标记消失)。 */
export async function treeNodeMarked(page: Page, taskKey: string): Promise<boolean> {
  return await page.evaluate((key: string) => {
    const card = document.querySelector(`[data-dsh-forge-node-card="${key}"]`)
    const node = card?.closest('.react-flow__node')
    return node?.getAttribute('data-e2e-node-marked') === '1'
  }, taskKey)
}
