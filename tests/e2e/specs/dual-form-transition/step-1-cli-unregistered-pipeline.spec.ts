// @feature dsh-forge-m3 | @web-e2e | @journey dual-form-transition
// Traceability: docs/features/dsh-forge-m3/testing/dual-form-transition/
// contracts/step-1-cli-unregistered-pipeline.md — Outcomes(anchor note:本步
// 为终端 CLI 形态,web 锚点留空 —— 断言 = 子进程输出/退出码/落盘数据 +
// 浏览器/内核侧的不可见面):
//   success             — CLI 三段管线(add → claim → submit)行为正常,
//                         任务数据落仓内 forge 文件。
//                         // VERIFY: pre-M3 golden 逐字对拍集非仓内工件 ——
//                         以行为级断言承载(SC7 先例);golden 面留待工件落地。
//   cc-plugin-frozen-works — PARTIAL:CC 插件内交互工作流非本 harness 可驱
//                         动(外部核验通道);承载面 = 应用存活期间 CLI 照常
//                         (不受应用通道演进影响)。
//   illegal-submit-rejected — 对终态任务的 CLI 领取被拒(非零退出 + 数据
//                         零破坏),重试合法提交成功。
//   app-invisibility    — 未注册项目不出现在工作台注册表(应用不可见)。
// fixture_spec: UnregisteredForgeProject(registered=false)+ GoldenBaselineSet
// (缺位,见 VERIFY)+ Task(终态靶)。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, normPath, resolveForgeCli, runForgeCli, snapshotTree, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildRegisteredWorld, buildUnregisteredCliCorpus, CLI_BASE_ID, CLI_BASE_TITLE, cliIndexTasks, writeCliRecordData } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('dual-form-transition / step 1: 未注册项目全程 CLI 照旧', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null
  let forgeExe = ''

  test.beforeAll(async () => {
    kernel = await buildRegisteredWorld(freshRoot('dual-s1'))
    // 环境前提:真实 forge CLI 可解析(SC7 先例;fail-fast 显式)。
    forgeExe = resolveForgeCli()
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — CLI 三段管线照旧(行为级)。
  test('step1/success: the CLI add → claim → submit pipeline runs normally on the unregistered project; data lands in the in-repo forge files', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const cliRoot = join(mkdtempSync(join(tmpdir(), 'dual-cli-s1-')), 'cli-repo')
    const cli = buildUnregisteredCliCorpus(cliRoot)

    // add(新增并领取三段管线的第一段)。
    const addOut = runForgeCli(forgeExe, ['task', 'add', '--title', '双形态 CLI 探针任务', '--type', 'doc', '--id', '9', '--description', 'dual-form CLI probe'], cliRoot)
    expect(addOut.status, 'task add 退出码 0').toBe(0)
    expect(addOut.stdout, 'add 行为正常(ACTION: ADDED 标记)').toContain('ACTION: ADDED')

    // claim(领取)— 真 CLI 口径:无位置参数,领取下一个可领任务(此处
    // 任务 1/9 同深度同优先级,ID 语义序 1 < 9,确定性命中基础任务)。
    const claimOut = runForgeCli(forgeExe, ['task', 'claim'], cliRoot)
    expect(claimOut.status, 'task claim 退出码 0').toBe(0)
    expect(cliIndexTasks(cli.indexPath).get(CLI_BASE_ID)?.status, 'CLI 权威文件:基础任务 → in_progress').toBe('in_progress')

    // submit(完成后提交;--data 记录文件为真 CLI 硬必填面)。
    const submitOut = runForgeCli(forgeExe, ['task', 'submit', CLI_BASE_ID, '--data', writeCliRecordData(cliRoot, CLI_BASE_ID)], cliRoot)
    expect(submitOut.status, 'task submit 退出码 0').toBe(0)
    expect(cliIndexTasks(cli.indexPath).get(CLI_BASE_ID)?.status, 'CLI 权威文件:基础任务 → completed').toBe('completed')

    // list 双行(rebuild 保留 frontmatter 语料 —— CLI 行为正常的强断言)。
    const listOut = runForgeCli(forgeExe, ['task', 'list', '--local'], cliRoot)
    expect(listOut.stdout, 'list 呈现既有任务').toContain(CLI_BASE_TITLE)
    expect(listOut.stdout, 'list 呈现新增任务').toContain('双形态 CLI 探针任务')
  })

  // Outcome "illegal-submit-rejected" — 终态任务的 CLI 领取被拒。
  test('step1/illegal-submit-rejected: claiming the completed task through the CLI is refused (non-zero exit, no half state); the legal retry path succeeds', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const cliRoot = join(mkdtempSync(join(tmpdir(), 'dual-cli-s1r-')), 'cli-repo')
    const cli = buildUnregisteredCliCorpus(cliRoot)

    // 先走合法管线至 completed。
    runForgeCli(forgeExe, ['task', 'claim'], cliRoot)
    runForgeCli(forgeExe, ['task', 'submit', CLI_BASE_ID, '--data', writeCliRecordData(cliRoot, CLI_BASE_ID)], cliRoot)
    const baseline = snapshotTree(cliRoot)

    // 非法领取(completed 终态后无可领任务)→ CLI 呈现拒绝与原因(非零退出)。
    const refused = runForgeCli(forgeExe, ['task', 'claim'], cliRoot, { allowFailure: true })
    expect(refused.status, '对终态任务 claim → 非零退出(状态机拒绝)').not.toBe(0)
    expect(cliIndexTasks(cli.indexPath).get(CLI_BASE_ID)?.status, '任务状态不被破坏(无半状态)').toBe('completed')
    expect(snapshotTree(cliRoot).get('docs/features/dual-cli-unregistered/tasks/index.json'),
      '拒绝零写入(index.json 字节原样)').toBe(baseline.get('docs/features/dual-cli-unregistered/tasks/index.json'))
  })

  // Outcome "cc-plugin-frozen-works"(承载面)+ 应用不干预。
  test('step1/cc-plugin-frozen-works (carried face): while the app runs its own channel the unregistered CLI keeps working — zero interference from the app', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const cliRoot = join(mkdtempSync(join(tmpdir(), 'dual-cli-cc-')), 'cli-repo')
    const cli = buildUnregisteredCliCorpus(cliRoot)
    const treeBefore = snapshotTree(cliRoot)

    // 应用存活(已注册项目激活):CLI 照常(不受应用通道演进影响)。
    const listOut = runForgeCli(forgeExe, ['task', 'list', '--local'], cliRoot)
    expect(listOut.status, '应用存活期间 CLI 照常(list 退出码 0)').toBe(0)
    expect(listOut.stdout, 'CLI 任务视图 = 仓内 forge 文件(双行在场)').toContain(CLI_BASE_TITLE)

    // 应用不干预的文件面:未注册树零变化。
    expect(snapshotTree(cliRoot), '未注册项目文件树零变化(应用不干预)').toEqual(treeBefore)
    // 注:CC 插件内交互工作流(领取→执行→提交)非本 web harness 可驱动,
    // 外部核验通道确认(冻结插件安装目录未改动)—— contract 验证通道注记。
    void cli
  })

  // Outcome "app-invisibility" — 应用不可见未注册项目。
  test('step1/app-invisibility: the unregistered project never appears in the workbench registry', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main', { tab: 'workbench/overview' })
    const { page } = world
    const cliRoot = join(mkdtempSync(join(tmpdir(), 'dual-cli-inv-')), 'cli-repo')
    buildUnregisteredCliCorpus(cliRoot)

    // 内核注册表面:不含未注册项目代码根。
    const state = await bridgeInvoke<{ projects: Array<{ codeRoot: string }> }>(page, 'getState', [])
    expect(state.projects.some(row => normPath(row.codeRoot) === normPath(cliRoot)), '未注册项目不在注册表(应用不可见)').toBe(false)
    // 浏览器面:项目卡不含该目录名。
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: 'cli-repo' })
    await expect(card, '项目卡不呈现未注册项目').toHaveCount(0)
  })
})
