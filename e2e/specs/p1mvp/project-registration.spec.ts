// @feature:dsh-forge-p1-mvp @web-e2e
// gen-test-scripts 产物 —— Journey: project-registration（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-p1-mvp/testing/project-registration/contracts/step-{1..5}-*.md
// （eval-contract 993/1150 通过）。每条 test 对应一个 Contract Outcome（溯源注释标注），
// 另含 1 条旅程冒烟（happy path 全步骤贯穿，skill 硬规则）。
//
// Fact Table 摘录（代码侦察，选择器/通道均源码核实）：
//   - 两段模态：.dswf-ap[data-dswf-ap=browser|form|executing|success|failure]（AddProjectFlow.tsx）
//   - 表单字段：[data-dswf-rf-ws|-name|-forge|-kn|-tasks]；校验问题 [data-dswf-rf-issue=<field>]
//     （form-model.ts：绝对路径/非空校验）；仓内外 StateChip（RegisterForm.tsx:154）
//   - 成功反馈文案：attachedToExisting ? 已挂接既有工作区。 : 已创建新工作区。（AddProjectFlow.tsx:107）
//   - 「已注册」标记源 = forge:projects/list 的 ws_path 全集（browser-model.ts:90）
//   - RPC：forge:projects/register → RegisterResult{attachedToExisting}；forge:projects/list → ProjectSummary[]
//   - hero 相位：[data-dswf-workbench][data-dswf-phase=hero|session]；CTA [data-dswf-cta=add-project]
// 隔离：独立 userData + 独立端口（e2e 单实例纪律——端口经 e2e/support 分配器，fix-37）。
// 载体面（launch/dismiss/close/RPC/seed）经 e2e/support 支撑层（fix-37 ①）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import type { ProjectSummary } from '../../../packages/contracts/src/dto/project.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { dismissOnboardingModals } from '../../support/modals.js'
import { forgeInvoke } from '../../support/rpc.js'
import { dirRow, enterDir } from '../../support/navigation.js'
import { openStateDb, deleteProjectRowByWsPath } from '../../support/sqlite.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import {
  AP_ANY,
  CTA_ADD_PROJECT,
  FB_ERROR,
  NAV_ADD_PROJECT,
  WORKBENCH,
  addProjectPhase,
  rfBrowsing,
  rfField,
  rfIssue,
} from '../../support/anchors.js'

/** 工作区候选夹具：{root}/<name>（可选 .knowledge 子目录） */
function makeWorkspaceFixture(name: string, withKnowledge = false): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-'))
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  if (withKnowledge) {
    mkdirSync(join(dir, '.knowledge'), { recursive: true })
    writeFileSync(join(dir, '.knowledge', 'deploy.md'), '---\ntitle: 部署规范\nsummary: 部署流程\nkeywords:\n  - 部署\n---\n\n# 部署规范\n', 'utf8')
  }
  return root
}

// 官方首启「预览版说明」预免 = 产品 boot overlay 内置等值确认（fix-12）——裸启动即真实路径。
// 浏览器行定位/进入（dirRow/enterDir）经 e2e/support/navigation 单源（fix-37 ①）。

/** 从 hero CTA 打开添加项目并导航到夹具根（home → AppData → Local → Temp → 夹具根） */
async function openFlowAtFixtureRoot(page: Page, fixtureRoot: string): Promise<void> {
  await page.locator(CTA_ADD_PROJECT).click()
  await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
  for (const segment of ['AppData', 'Local', 'Temp']) {
    await enterDir(page, segment)
  }
  await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
}

/** canonical path 扁平化（form-model.flattenWorkspacePath 同口径） */
function flattenPath(dir: string): string {
  const normalized = dir.replaceAll('/', '\\').replace(/\\+$/, '')
  return normalized.replace(/^([A-Za-z]):/, '$1').replaceAll('\\', '-')
}

/** 表单段走查到「确认」可点（选中目标目录 → 下一步 → 表单就位） */
async function selectWorkspaceAndNext(page: Page, fixtureRoot: string, dirName: string): Promise<string> {
  await openFlowAtFixtureRoot(page, fixtureRoot)
  await dirRow(page, dirName).click()
  await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
  await expect(page.locator(addProjectPhase('form'))).toBeVisible()
  return join(fixtureRoot, dirName)
}

// ─────────────────────────────────────────────────────────────────────────────
// 旅程冒烟：happy path 全步骤（Step 1→5 success 贯穿——skill 硬规则：每旅程恰一条冒烟）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp project-registration·冒烟：hero → 两段式注册 → 左栏挂载（Step 1-5 success）', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeWorkspaceFixture('reg-demo')
  const targetDir = join(fixtureRoot, 'reg-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-ud-'))
  const { app, page, pageErrors } = await launchHost({ userData, expectPhase: 'hero' })
  try {
    // Step 1 success：hero CTA → 第一段文件浏览器（目录列表/面包屑/已注册标记呈现；未选中禁用）
    await page.locator(CTA_ADD_PROJECT).click()
    await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
    await expect(page.locator('.dswf-fb-list[role="listbox"]')).toBeVisible()
    const confirmBtn = page.locator('.dswf-fb-confirm')
    await expect(confirmBtn).toBeDisabled()
    await expect(confirmBtn).toHaveText('下一步')

    // Step 2 success：导航 + 单击选中 → 解禁 → 下一步 → 表单
    for (const segment of ['AppData', 'Local', 'Temp']) {
      await enterDir(page, segment)
    }
    await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
    await dirRow(page, 'reg-demo').click()
    await expect(confirmBtn).toBeEnabled()
    await confirmBtn.click()
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()

    // Step 3 success：表单默认值与只读派生行（Contract Output 全项）
    const ws = page.locator(rfField('ws'))
    const name = page.locator(rfField('name'))
    const forge = page.locator(rfField('forge'))
    const kn = page.locator(rfField('kn'))
    const tasks = page.locator(rfField('tasks'))
    await expect(ws).toHaveValue(targetDir)
    expect(await ws.getAttribute('readonly'), '工作区目录只读回填').not.toBeNull()
    await expect(name).toHaveValue('reg-demo')
    await expect(forge).toHaveValue(`${targetDir}\\.forge`)
    await expect(kn).toHaveValue(`${targetDir}\\.knowledge`)
    expect(await kn.getAttribute('readonly'), '知识库目录可改').toBeNull()
    await expect(tasks).toHaveValue(`~/.dsh-forge/${flattenPath(targetDir)}`)
    expect(await tasks.getAttribute('readonly'), '任务清单与记录只读派生').not.toBeNull()
    expect(await page.locator('.dswf-rf input[type="radio"]').count(), '仓内/仓外无 radio 字段').toBe(0)
    await expect(page.locator('.dswf-rf-relation', { hasText: '仓内' }).first()).toBeVisible()
    await expect(page.locator('.dswf-rf input'), '表单字段全集 = 5（不含「默认召回域」）').toHaveCount(5)
    await expect(page.locator('.dswf-rf-confirm')).toHaveText('确认')

    // Step 4 success：确认 → 不可交互中断执行态 → 四步链
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator(addProjectPhase('executing'))).toBeVisible()

    // Step 5 success：成功反馈（新建说明）自动关闭 → 左栏挂载 → hero 永久隐退
    await expect(page.locator(addProjectPhase('success'))).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(addProjectPhase('success')), '新建工作区说明').toContainText('已创建新工作区')
    await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await expect(page.locator('[data-dswf-hero]')).toHaveCount(0)
    await expect(page.locator('.dswf-sidebar-project', { hasText: 'reg-demo' }).first()).toBeVisible({ timeout: 30_000 })
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '注册落库：projects 单行（含 workspace 外键链）').toHaveLength(1)
    expect(projects[0]!.wsPath).toBe(targetDir)
    expect(projects[0]!.workspaceId, 'workspace 外键在场').toBeTruthy()
    expect(pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 Outcome "cancel-clean-exit"（journey Step 1b：文件浏览器段取消）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp project-registration·Step1 cancel-clean-exit：浏览器段取消零残留', async () => {
  test.setTimeout(180_000)
  const fixtureRoot = makeWorkspaceFixture('cancel-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-ud-'))
  const { app, page } = await launchHost({ userData, expectPhase: 'hero' })
  try {
    await page.locator(CTA_ADD_PROJECT).click()
    await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
    // 直接关闭对话框（Esc = 关闭意图）
    await page.keyboard.press('Escape')
    await expect(page.locator(AP_ANY)).toHaveCount(0)
    // 干净退出回工作台 hero——hero 与 CTA 仍在位
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'hero')
    await expect(page.locator(CTA_ADD_PROJECT)).toBeVisible()
    // State：dsh 侧与应用侧均无残留（未调用 dsh create，projects 表零行）
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '取消 = 应用库零变更（projects 零行）').toHaveLength(0)
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 Outcome "attach-existing-workspace"（journey Step 2b：幂等挂接既有）
// 挂接分支可达前置（4.3 探针实证 + 服务面源码）：registry 在场 / 应用库零行——两侧均在场的
// 重复登记自 fix-27 起 = 幂等成功（自愈防御，归 compensation fix-27 专项口径）。
// 本测试以「删应用侧行保 dsh 侧注册」预置挂接态（fixture 通道——core testutil/db-seeds）。
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp project-registration·Step2 attach-existing-workspace：已注册目录挂接既有', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = makeWorkspaceFixture('attach-demo')
  const targetDir = join(fixtureRoot, 'attach-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-ud-'))
  let launched: Launched | undefined
  try {
    // 单 boot：首次注册（RPC——新建分支）→ WAL 活删应用侧行（挂接态预置：registry 在场/
    // 应用库零行；两侧均在场的重复登记自 fix-27 起 = 幂等成功，归 compensation fix-27 专项）
    launched = await launchHost({ userData, dismiss: false })
    const page = launched.page
    const first = await forgeInvoke<{ projectId: string; workspaceId: string; attachedToExisting: boolean }>(page, 'forge:projects/register', {
      workspaceDir: targetDir,
      name: 'attach-demo',
      forgeDir: join(targetDir, '.forge'),
      knowledgeDir: join(targetDir, '.knowledge'),
    })
    expect(first.attachedToExisting, '首次注册 = 新建分支').toBe(false)
    {
      const db = openStateDb(userData)
      try {
        deleteProjectRowByWsPath(db, targetDir)
      } finally {
        db.close()
      }
    }
    // 收模态（链路无后续 boot——毒化面不适用）
    await dismissOnboardingModals(page)

    // 挂接走查（侧栏「＋」入口——WAL 外删不触发工作台重拉锚，相位保持 session；
    // 挂接态前置以 RPC 口径断言：应用库零行）
    const before = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(before.filter((p) => p.wsPath === targetDir), '挂接态前置：应用库零行（registry 保留）').toHaveLength(0)
    await page.locator(NAV_ADD_PROJECT).first().click()
    await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
    for (const segment of ['AppData', 'Local', 'Temp']) {
      await enterDir(page, segment)
    }
    await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
    const row = dirRow(page, 'attach-demo')
    // 注：「已注册」标记源 = 应用库 ws_path 全集（browser-model.ts:90）——挂接态（应用库
    // 零行）标记缺席为设计语义；挂接判定在服务面 ① 预检（registry）
    await row.click()
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    // Output：挂接既有分支——成功反馈含挂接说明并自动关闭模态
    await expect(page.locator(addProjectPhase('success'))).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(addProjectPhase('success'))).toContainText('已挂接既有工作区')
    await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 15_000 })
    // State：应用库单行（新登记）挂接既有 workspaceId
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    const attached = projects.filter((p) => p.wsPath === targetDir)
    expect(attached, '挂接登记恰一行').toHaveLength(1)
    expect(attached[0]!.workspaceId, '登记挂接既有 workspaceId 外键（registry 注册数不变）').toBe(first.workspaceId)
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 Outcome "listing-failure-retryable"（fact AP-16：列举失败态错误提示 + 重试）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp project-registration·Step2 listing-failure-retryable：列举失败可重试且导航保持', async () => {
  test.setTimeout(180_000)
  const fixtureRoot = makeWorkspaceFixture('listfail-demo')
  const brokenDir = join(fixtureRoot, 'broken-dir')
  mkdirSync(brokenDir, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-ud-'))
  const { app, page } = await launchHost({ userData, expectPhase: 'hero' })
  try {
    await openFlowAtFixtureRoot(page, fixtureRoot)
    // 行在场后外部删除目标目录 → 双击进入 → 列举失败
    await expect(dirRow(page, 'broken-dir')).toBeVisible()
    rmSync(brokenDir, { recursive: true, force: true })
    await dirRow(page, 'broken-dir').dblclick()
    // Output：错误提示呈现（可修正、可重试），导航状态不丢失
    await expect(page.locator(FB_ERROR)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(FB_ERROR)).toContainText('目录加载失败')
    // State：流程停留第一段文件浏览器，无注册副作用
    await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
    // 重试成功路径：恢复目录 → 重试 → 列表恢复呈现
    mkdirSync(brokenDir, { recursive: true })
    await page.locator('.dswf-fb-retry', { hasText: '重试' }).click()
    await expect(page.locator(FB_ERROR)).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('.dswf-fb-crumb-current')).toHaveText('broken-dir', { timeout: 15_000 })
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '列举失败路径零注册副作用').toHaveLength(0)
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 Outcome "cancel-return-clean-exit"（journey Step 3b：表单段取消 + 往返保持）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp project-registration·Step3 cancel-return-clean-exit：表单段取消 + 往返状态保持', async () => {
  test.setTimeout(180_000)
  const fixtureRoot = makeWorkspaceFixture('formcancel-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-ud-'))
  const { app, page } = await launchHost({ userData, expectPhase: 'hero' })
  try {
    const targetDir = await selectWorkspaceAndNext(page, fixtureRoot, 'formcancel-demo')
    // 手改项目名（制造「已填表单状态」）
    await page.locator(rfField('name')).fill('手改名')
    // 返回上一步 → repick 相位（段一起始目录锚 + 表单保持挂载——flow-model FLOW_PHASES）；
    // 再下一步（同目录）→ 表单状态保持
    await page.getByRole('button', { name: '返回上一步' }).click()
    await expect(page.locator(addProjectPhase('repick'))).toBeVisible()
    // repick 起始 = 段一起始目录锚（选定工作区自身）→ 上一级回夹具根再选同目录
    await page.locator('.dswf-fb-up').click()
    await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(fixtureRoot.split('\\').at(-1) as string, { timeout: 15_000 })
    await dirRow(page, 'formcancel-demo').click()
    await page.locator('.dswf-fb-confirm').click() // repick 确认钮（选择此文件夹/下一步 两态文案）
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()
    await expect(page.locator(rfField('name')), '浏览器⇄表单往返已填状态保持').toHaveValue('手改名')
    await expect(page.locator(rfField('ws'))).toHaveValue(targetDir)
    // 直接关闭对话框 → 干净退出（取消点在 dsh create 之前——零副作用）
    await page.keyboard.press('Escape')
    await expect(page.locator(AP_ANY)).toHaveCount(0)
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '表单段取消 = projects 零新增、无补偿动作').toHaveLength(0)
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'hero')
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 Outcome "reselect-rederive-fields"（journey Step 3c：换选工作区字段联动）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp project-registration·Step3 reselect-rederive-fields：换选重构未触碰字段、保留已触碰字段', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeWorkspaceFixture('rederive-a')
  mkdirSync(join(fixtureRoot, 'rederive-b'), { recursive: true })
  // 浏览改选目标目录预置（浏览面板起点 = 当前知识库目录 .knowledge → 上一级选 .forge）
  mkdirSync(join(fixtureRoot, 'rederive-a', '.knowledge'), { recursive: true })
  mkdirSync(join(fixtureRoot, 'rederive-a', '.forge'), { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-ud-'))
  const { app, page } = await launchHost({ userData, expectPhase: 'hero' })
  try {
    const dirA = await selectWorkspaceAndNext(page, fixtureRoot, 'rederive-a')
    // 经「浏览…」改选知识库目录（字段标记为已触碰）
    await page
      .locator('.dswf-rf-row')
      .filter({ has: page.locator(rfField('kn')) })
      .getByRole('button', { name: '浏览…' })
      .click()
    await expect(page.locator(rfBrowsing('knowledgeDir'))).toBeVisible()
    await page.locator('.dswf-fb-up').click()
    await expect(page.locator('.dswf-fb-crumb-current')).toHaveText('rederive-a', { timeout: 15_000 })
    await dirRow(page, '.forge').click()
    await page.locator('.dswf-fb-confirm', { hasText: '选择此文件夹' }).click()
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()
    await expect(page.locator(rfField('kn')), '浏览选定知识库目录 = 已触碰').toHaveValue(`${dirA}\\.forge`)

    // 重新选择 → 换选 rederive-b
    await page.getByRole('button', { name: '重新选择' }).click()
    await expect(page.locator(rfBrowsing('workspace'))).toBeVisible()
    await page.locator('.dswf-fb-up').click()
    await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(fixtureRoot.split('\\').at(-1) as string, { timeout: 15_000 })
    await dirRow(page, 'rederive-b').click()
    await page.locator('.dswf-fb-confirm', { hasText: '选择此文件夹' }).click()
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()
    const dirB = join(fixtureRoot, 'rederive-b')
    // Output：未手改字段随新工作区重构；手改/浏览选定过的字段保留原值不重置
    await expect(page.locator(rfField('ws'))).toHaveValue(dirB)
    await expect(page.locator(rfField('name')), '项目名重取').toHaveValue('rederive-b')
    await expect(page.locator(rfField('forge')), 'forge 目录默认值重算').toHaveValue(`${dirB}\\.forge`)
    await expect(page.locator(rfField('tasks')), '任务清单重新派生').toHaveValue(`~/.dsh-forge/${flattenPath(dirB)}`)
    await expect(page.locator(rfField('kn')), '浏览选定过的知识库目录保留原值').toHaveValue(`${dirA}\\.forge`)
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 Outcome "illegal-path-blocked"（journey Step 3d：非法路径拦截于表单态）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp project-registration·Step3 illegal-path-blocked：非法路径表单态拦截', async () => {
  test.setTimeout(180_000)
  const fixtureRoot = makeWorkspaceFixture('illegal-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-ud-'))
  const { app, page } = await launchHost({ userData, expectPhase: 'hero' })
  try {
    await selectWorkspaceAndNext(page, fixtureRoot, 'illegal-demo')
    const confirm = page.locator('.dswf-rf-confirm', { hasText: '确认' })
    await expect(confirm).toBeEnabled()
    // 清空必填项（forge 目录）→ 字段级提示 + 确认不可用
    await page.locator(rfField('forge')).fill('')
    await expect(page.locator(rfIssue('forgeDir'))).toContainText('不能为空')
    await expect(confirm).toBeDisabled()
    // 相对路径片段 → 需为绝对路径提示
    await page.locator(rfField('forge')).fill('relative\\path')
    await expect(page.locator(rfIssue('forgeDir'))).toContainText('需为绝对路径')
    await expect(confirm).toBeDisabled()
    // 知识库目录同口径
    await page.locator(rfField('kn')).fill('rel-kn')
    await expect(page.locator(rfIssue('knowledgeDir'))).toContainText('需为绝对路径')
    // 修正回合法绝对路径 → 提示消解、确认解禁（可修正语义）
    await page.locator(rfField('forge')).fill(join(fixtureRoot, 'illegal-demo', '.forge'))
    await page.locator(rfField('kn')).fill(join(fixtureRoot, 'illegal-demo', '.knowledge'))
    await expect(page.locator('[data-dswf-rf-issue]')).toHaveCount(0)
    await expect(confirm).toBeEnabled()
    // State：不进入注册执行——关闭后零变更
    await page.keyboard.press('Escape')
    await expect(page.locator(AP_ANY)).toHaveCount(0)
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '拦截于表单态 = dsh 侧与应用侧零变更').toHaveLength(0)
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 Outcome "external-forge-dir-derivation"（fact FACT_DEF_6：仓外推导边界取值）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp project-registration·Step3 external-forge-dir-derivation：仓外派生标识', async () => {
  test.setTimeout(180_000)
  const fixtureRoot = makeWorkspaceFixture('external-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-ud-'))
  const { app, page } = await launchHost({ userData, expectPhase: 'hero' })
  try {
    await selectWorkspaceAndNext(page, fixtureRoot, 'external-demo')
    // 默认态：工作区内 .forge → 仓内
    await expect(page.locator('.dswf-rf-relation', { hasText: '仓内' }).first()).toBeVisible()
    // 手动输入工作区外合法绝对路径（夹具根在工作区外）→ 仓外标识，注册不因此受阻
    await page.locator(rfField('forge')).fill(join(fixtureRoot, 'outside-forge'))
    await expect(page.locator('.dswf-rf-relation', { hasText: '仓外' }).first()).toBeVisible()
    await expect(page.locator(rfIssue('forgeDir')), '合法绝对路径 = 校验通过').toHaveCount(0)
    await expect(page.locator('.dswf-rf-confirm', { hasText: '确认' })).toBeEnabled()
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 Outcome "double-confirm-reentry-blocked"（fact FLOW_PHASES：执行态单次进入护栏）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp project-registration·Step4 double-confirm-reentry-blocked：确认连击无二次注册链', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeWorkspaceFixture('dbl-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-ud-'))
  const { app, page } = await launchHost({ userData, expectPhase: 'hero' })
  try {
    await selectWorkspaceAndNext(page, fixtureRoot, 'dbl-demo')
    const confirm = page.locator('.dswf-rf-confirm', { hasText: '确认' })
    // 快速连击（第二次触发落在执行态开始之后）
    await confirm.dblclick()
    await expect(page.locator(addProjectPhase('executing'))).toBeVisible()
    // Output：无第二次注册链启动——单次进入护栏；进度呈现连续直至成功终态
    await expect(page.locator(addProjectPhase('success'))).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 15_000 })
    // State：无重复 dsh create / 无重复应用库写入
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    const wsProjects = projects.filter((p) => p.wsPath === join(fixtureRoot, 'dbl-demo'))
    expect(wsProjects, '连击 = 恰一行项目记录（无重复写入）').toHaveLength(1)
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 Outcome "second-project-via-tree"（journey Step 5b：项目态下经项目树「＋」再添加）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp project-registration·Step5 second-project-via-tree：项目态「＋」注册第二项目并存', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = makeWorkspaceFixture('proj-a')
  mkdirSync(join(fixtureRoot, 'proj-b'), { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-reg-ud-'))
  const { app, page } = await launchHost({ userData, expectPhase: 'hero' })
  try {
    // Setup：已有至少一个项目（第一项目经向导注册——hero 起步）
    const dirA = await selectWorkspaceAndNext(page, fixtureRoot, 'proj-a')
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator(addProjectPhase('success'))).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    void dirA

    // 项目态下经项目树「＋」打开同一两段式流程（浏览器起始 = 主目录——导航至夹具根）
    await page.locator(NAV_ADD_PROJECT).first().click()
    await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
    for (const segment of ['AppData', 'Local', 'Temp']) {
      await enterDir(page, segment)
    }
    await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
    await dirRow(page, 'proj-b').click()
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(page.locator(addProjectPhase('form'))).toBeVisible()
    await expect(page.locator(rfField('name'))).toHaveValue('proj-b')
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator(addProjectPhase('success'))).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(AP_ANY)).toHaveCount(0, { timeout: 15_000 })

    // Output：左栏项目树新增该项目，多项目并存，hero 不再出现
    await expect(page.locator('.dswf-sidebar-project', { hasText: 'proj-a' }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.dswf-sidebar-project', { hasText: 'proj-b' }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-hero]')).toHaveCount(0)
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session')
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '应用项目数 = 2（新旧并存各携外键）').toHaveLength(2)
    expect(new Set(projects.map((p) => p.workspaceId)).size, '两行各携独立 workspace 外键').toBe(2)
  } finally {
    await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})
