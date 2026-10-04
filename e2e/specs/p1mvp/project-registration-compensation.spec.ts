// @feature:dsh-forge-p1-mvp @web-e2e
// gen-test-scripts 产物 —— Journey: project-registration-compensation（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/contracts/step-{1..5}-*.md
// （eval-contract 1015/1150 通过）。每条 test 对应一个（或一组同链）Contract Outcome。
//
// 故障注入通道（fact FAULT_INJECTION_CONTRACT：e2e 无 setFault 注入缝——③ 应用库写入失败在
// 单测经 INSERT ABORT 触发器实现）：fix-27 起 ws_path 冲突行已被服务面自愈消费（重注册 =
// 幂等成功），本套件同口径切换注入载体——{userData}/state.db 预置 INSERT 触发器
// （better-sqlite3 自 packages/core 依赖闭包解析，schema.ts DDL 核实：idx_projects_ws_path
// UNIQUE + workspace_id UNIQUE——挂接分支 ownership 面经 workspace_id 占位行注入；
// 触发器/占位行/漂移/活删注入面经 core testutil/db-seeds 单源——fix-37 ⑤）。
//
// 留痕 skip（通道缺失 = 缺陷信号记账，contract fact-note 原文）：
//   - Step 3b host-cancel-in-window：②③ 间窗口非确定性可命中（启动对账触发缝已由 fix-27 接线）
//   - Step 4b compensation-failure-ledger：④ registry.delete 失败注入无缝（FAULT_INJECTION_CONTRACT）
//   - Step 5 success（补偿重放 no-op）：测试开关通道缺失（delete-unknown-id 幂等语义单测 pin）
//
// 观察通道：registry 探针 = {userData}/dsh-home/storages/workspace.json 直读（探针 3 实测）；
// 应用库直读 = forge:projects/list RPC + state.db（better-sqlite3 经 packages/core 闭包解析）；
// workspaceId = register 返回体。
//
// 对账语义归属（fix-37 ⑥ 回迁）：Step5c（通道显式触发找回）/Step5d（一致终态静默）两测试
// 为纯 RPC + 直查重复面（各 60-90s）——对账语义已由 core 集测完整 pin
// （reconcile-queries.test：AC1 relink 找回+记账 / path 匹配零修复零记账双空报告 / AC2
// recreated / AC5 降级永不抛），e2e 侧删除；本套件保留 fix-27 专项（双 boot：悬空引用 →
// boot 期自动对账即修）作为 boot 期自动触发的唯一 e2e 实证。
//
// 复启禁令（gen-scripts 实测纪律）：同一 userData 的第二次 boot 存在产品工作台挂载竞态
//  （官方壳/客户端正常、loader=live，产品插件静默不激活——探针 2/4/6 对照 7 次复现，
//  与引导模态挂载/收起时序相关且非确定性）——除 fix-27 专项（双 boot 均零 UI）外，
//  全部测试取**单 boot 形态**：前置经 RPC 落地、状态转移经 WAL 活写（busy_timeout）、
//  模态收起置于链路末段（无后续 boot）。
// 载体面（launch/dismiss/close/RPC/seed/清理）经 e2e/support 支撑层（fix-37 ①）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import type { ProjectSummary, RegisterResult } from '../../../packages/contracts/src/dto/project.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { dismissOnboardingModals, ensureNoBlockingDialog } from '../../support/modals.js'
import { forgeInvoke } from '../../support/rpc.js'
import { dirRow, enterDir } from '../../support/navigation.js'
import {
  countReconcileWarnLogs,
  deleteProjectRowByWsPath,
  driftProjectWorkspaceRef,
  installProjectInsertFailure,
  openStateDb,
  removeProjectInsertFailure,
  seedWorkspaceIdConflictRow,
} from '../../support/sqlite.js'
import { rmDirBestEffort, rmFileBestEffort } from '../../support/cleanup.js'
import { addProjectPhase, NAV_ADD_PROJECT } from '../../support/anchors.js'

/** 工作区候选夹具：{root}/<name>（含哨兵文件供目录保留断言） */
function makeWorkspaceFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-'))
  const dir = join(root, name)
  mkdirSync(join(dir, '.knowledge'), { recursive: true })
  writeFileSync(join(dir, 'keep.txt'), 'sentinel', 'utf8')
  return root
}

/**
 * 补偿/对账场景启动（launchHost 复启形态：provider 叠层防弹窗毒化 + 60s 相位探针 +
 * console 诊断尾）。dismiss = 是否收起官方首启引导模态：任何形式的收起（点击「稍后
 * 配置」/Esc）都会写 dsh 侧客户态（设置写路径 quirk 家族），实证导致同 userData 的下一
 * boot 产品工作台不挂载（探针 4 对照：不收模态 = 复启正常）——因此**仅链路最后一个
 * UI boot** 允许 dismiss=true；RPC-only boot 保持 false（模态在场不阻塞 evaluate/RPC）。
 */
async function launch(userData: string, options?: { readonly dismiss?: boolean }): Promise<Launched> {
  return launchHost({
    userData,
    dismiss: options?.dismiss ?? true,
    providerOverlay: true,
    stablePhase: 'probe',
    collectConsole: true,
  })
}

/** UI 走查注册指定工作区目录（两段式全链——返回表单终态后续由调用侧断言） */
async function registerViaUi(page: Page, fixtureRoot: string, dirName: string): Promise<void> {
  await ensureNoBlockingDialog(page)
  await page.locator(NAV_ADD_PROJECT).first().click()
  await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
  for (const segment of ['AppData', 'Local', 'Temp']) {
    await enterDir(page, segment)
  }
  await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
  await dirRow(page, dirName).click()
  await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
  await expect(page.locator(addProjectPhase('form'))).toBeVisible()
  await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
}

// ─── registry 探针（dsh 官方持久化面直读——探针 3 实测：{dshHome}/storages/workspace.json） ───
// 注：不経 composer 工作区菜单探针——菜单交互会污染 dsh 侧客户态，同 userData 复启链路上
// 实证导致下一 boot 工作台不挂载（探针 2/冒烟对照）；文件直读零交互零状态变更。

/** registry 持久化文本（缺席 = 空串——零注册态） */
function registryFileText(dshHome: string): string {
  const file = join(dshHome, 'storages', 'workspace.json')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** registry 是否含指定 canonical path（JSON 转义双向容错） */
function registryContains(dshHome: string, wsPath: string): boolean {
  const text = registryFileText(dshHome)
  return text.includes(wsPath) || text.includes(wsPath.replaceAll('\\', '\\\\'))
}

/** registry 文本快照（前后比对 = 「registry 不变」断言的载体——挂接分支不写 registry） */
function registrySnapshot(dshHome: string): string {
  return registryFileText(dshHome)
}

// ─────────────────────────────────────────────────────────────────────────────
// 旅程冒烟：新建注册成功（Step1/2）→ ③注入失败补偿（Step3/4）→ 重试成功（Step5b）→ 孤儿=0
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·冒烟：③写入失败 → ④补偿删除 → 失败反馈 → 重试成功孤儿归零', async () => {
  test.setTimeout(600_000)
  const fixtureRoot = makeWorkspaceFixture('comp-a')
  mkdirSync(join(fixtureRoot, 'comp-b'), { recursive: true })
  writeFileSync(join(fixtureRoot, 'comp-b', 'keep.txt'), 'sentinel', 'utf8')
  const dirA = join(fixtureRoot, 'comp-a')
  const dirB = join(fixtureRoot, 'comp-b')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-ud-'))
  let launched: Launched | undefined
  try {
    // ── 单 boot 链路（同 userData 复启在实测中存在产品工作台挂载竞态——见文件头注）：
    //    RPC 前置（模态在场不阻塞 evaluate）→ WAL 活写注入 → 收模态 → UI 走查 ──

    // Step 1/2 success：①预检未命中 = 新建分支 → ②dsh create + 补偿登记（RPC 面）
    launched = await launch(userData, { dismiss: false })
    const first = await forgeInvoke<RegisterResult>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'comp-a',
      forgeDir: join(dirA, '.forge'),
      knowledgeDir: join(dirA, '.knowledge'),
    })
    expect(first.attachedToExisting, '①预检未命中 = 新建分支（非挂接）').toBe(false)
    expect(first.workspaceId, '②workspaceId 在场（uuid——应用库外键素材）').toBeTruthy()
    expect(registryContains(join(userData, 'dsh-home'), dirA), '②dsh create 落地：registry 含新工作区').toBe(true)

    // 注入：WAL 活写预置 INSERT ABORT 触发器（③ INSERT 必失败——单测同口径；fix-27 后
    // ws_path 冲突行已被自愈面消费，注入载体改触发器）
    {
      const db = openStateDb(userData)
      try {
        installProjectInsertFailure(db)
      } finally {
        db.close()
      }
    }

    // 收模态（boot 内唯一 dismiss——链路无后续 boot，毒化面不适用）
    await dismissOnboardingModals(launched.page)

    // Step 3/4 success：③应用库写入失败 → ④补偿自动执行 → 失败反馈
    await registerViaUi(launched.page, fixtureRoot, 'comp-b')
    const failure = launched.page.locator(addProjectPhase('failure'))
    await expect(failure, '失败反馈（UF-3 失败态）').toBeVisible({ timeout: 30_000 })
    await expect(failure).toContainText('注册失败')
    await expect(failure, '补偿结果说明在场（④=registry.delete 补偿已执行）').toContainText('补偿')
    // fix-28 typed code 过桥保真：标题命中 ERR_PROJECT_WRITE(compensated) 分支文案——
    // 桥灭失期标题恒落「注册失败（未预期错误）」默认分支（「注册失败」Tag 常驻，旧断言
    // 不具判别力；补偿细节旧由 .dswf-ap-raw 原始 message 文本携带）
    await expect(failure.locator('.dswf-ap-feedback-title')).toHaveText('应用库写入失败（补偿已执行）')
    // Step 3 Output 终态：该路径无注册（registry 探针）+ 应用侧无残留 + 目录与日志保留
    expect(registryContains(join(userData, 'dsh-home'), dirB), '④补偿后 registry 无 comp-b（孤儿 = 0）').toBe(false)
    await expect(launched.page.locator('.dswf-sidebar-project', { hasText: 'comp-b' })).toHaveCount(0)
    expect(existsSync(join(dirB, 'keep.txt')), '补偿只删注册记录——工作区目录保留').toBe(true)
    // 失败态可关闭退出（事后关闭非取消）
    await launched.page.locator('.dswf-ap-dismiss', { hasText: '关闭' }).first().click()
    await expect(launched.page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })

    // 注入复位：WAL 活删触发器（「上一次已完整补偿」的干净前置——5b 前提）
    {
      const db = openStateDb(userData)
      try {
        removeProjectInsertFailure(db)
      } finally {
        db.close()
      }
    }

    // Step 5b retry-registration-same-path：补偿后重注册同一路径成功
    await registerViaUi(launched.page, fixtureRoot, 'comp-b')
    await expect(launched.page.locator(addProjectPhase('success'))).toBeVisible({ timeout: 30_000 })
    await expect(launched.page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
    expect(registryContains(join(userData, 'dsh-home'), dirB), '重试成功：registry 重新含 comp-b').toBe(true)
    await expect(launched.page.locator('.dswf-sidebar-project', { hasText: 'comp-b' }).first()).toBeVisible({ timeout: 30_000 })
    const projects = await forgeInvoke<readonly ProjectSummary[]>(launched.page, 'forge:projects/list')
    const compB = projects.filter((p) => p.wsPath === dirB)
    expect(compB, '重试落库恰一行').toHaveLength(1)
    expect(compB[0]!.workspaceId, '外键一致（registry 按 path 反查同 id）').toBeTruthy()
    // 场景终态孤儿 = 0（全流程后 dsh 侧注册与挂接一一对应）
    expect(registryContains(join(userData, 'dsh-home'), dirA)).toBe(true)
    expect(registryContains(join(userData, 'dsh-home'), dirB)).toBe(true)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      if (launched.overlayPath !== undefined) rmFileBestEffort(launched.overlayPath)
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 "attach-branch-selected" + Step 2 "create-idempotent-existing-path"
// （挂接分支判定 + registry 幂等）。挂接可达前置 = registry 在场 / 应用库零行
// （两侧均在场的重复登记走 ③ 冲突失败——ownership 保护，归 Step3c）——删应用侧行预置。
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·Step1/2 attach-branch + create-idempotent：同路径复注册幂等挂接', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = makeWorkspaceFixture('idem-a')
  const dirA = join(fixtureRoot, 'idem-a')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-ud-'))
  let launched: Launched | undefined
  try {
    // 单 boot：新建注册（RPC）→ WAL 活删应用侧行（预置挂接态）→ 收模态 → UI 挂接走查
    launched = await launch(userData, { dismiss: false })
    const first = await forgeInvoke<RegisterResult>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'idem-a',
      forgeDir: join(dirA, '.forge'),
      knowledgeDir: join(dirA, '.knowledge'),
    })
    expect(first.attachedToExisting, '①预检未命中 = 新建分支').toBe(false)
    const registryBefore = registrySnapshot(join(userData, 'dsh-home'))
    // WAL 活删应用侧行（registry 保留——②幂等实体验证锚；挂接可达前置 = 应用库零行）
    {
      const db = openStateDb(userData)
      try {
        deleteProjectRowByWsPath(db, dirA)
      } finally {
        db.close()
      }
    }
    await dismissOnboardingModals(launched.page)

    // 同一 canonical path 再次注册（UI——注册成功回调锚刷新工作台）
    await registerViaUi(launched.page, fixtureRoot, 'idem-a')
    // ①预检命中 → 挂接分支（②create 整步跳过——幂等返回既有实体、不登记补偿）
    await expect(launched.page.locator(addProjectPhase('success'))).toContainText('已挂接既有工作区', { timeout: 30_000 })
    await expect(launched.page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
    // State：registry 不变（挂接零写）+ 应用库恰一行（挂接既有外键）
    expect(registrySnapshot(join(userData, 'dsh-home')), '挂接不写 registry（文件零变更）').toBe(registryBefore)
    const projects = await forgeInvoke<readonly ProjectSummary[]>(launched.page, 'forge:projects/list')
    expect(projects.filter((p) => p.wsPath === dirA), '挂接登记恰一行').toHaveLength(1)
    expect(projects[0]!.workspaceId, '同路径幂等：workspaceId 稳定不变（既有实体返回）').toBe(first.workspaceId)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      if (launched.overlayPath !== undefined) rmFileBestEffort(launched.overlayPath)
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 Outcome "existing-workspace-protected"（journey Step 3c：ownership 保护）
// 注：fix-27 起同路径既有注册的二次登记 = 幂等成功（attachExistingRow 按 ws_path 消费
// 在场行——自愈防御，不再炸 ws_path UNIQUE），挂接分支 ③ 失败的可达注入 = workspace_id
// UNIQUE 占位行（他行占住既有工作区 id）。**占位前须活删 own-a 应用侧行**（挂接可达
// 前置 = 应用库零行，同 Step1/2 口径）：fix-28 走查实证 fix-27 版缺此删——seed 自撞
// UNIQUE(workspace_id) 恒红（own-a 行已持同 id），且不删则重注册幂等成功永不达 ③。
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·Step3c existing-workspace-protected：挂接分支失败不误删既有', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = makeWorkspaceFixture('own-a')
  const dirA = join(fixtureRoot, 'own-a')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-ud-'))
  let launched: Launched | undefined
  try {
    // 单 boot：既有注册（RPC）→ WAL 活删 own-a 应用侧行（挂接可达前置——attachExistingRow
    // 幂等面按 ws_path 消费在场行，不删则重注册幂等成功永不达 ③）→ WAL 活写 workspace_id
    // 占位行（挂接分支上的 ③ 失败源——路径随机错开：占位行不进左栏、不与 dirA 抢 ws_path）
    launched = await launch(userData, { dismiss: false })
    const first = await forgeInvoke<RegisterResult>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'own-a',
      forgeDir: join(dirA, '.forge'),
      knowledgeDir: join(dirA, '.knowledge'),
    })
    expect(first.attachedToExisting).toBe(false)
    {
      const db = openStateDb(userData)
      try {
        deleteProjectRowByWsPath(db, dirA)
        seedWorkspaceIdConflictRow(db, first.workspaceId)
      } finally {
        db.close()
      }
    }
    const registryBefore = registrySnapshot(join(userData, 'dsh-home'))
    await dismissOnboardingModals(launched.page)

    // 行使：注册同一既有路径 → ①命中（挂接，无补偿登记）→ ③写入失败（workspace_id 冲突）
    await registerViaUi(launched.page, fixtureRoot, 'own-a')
    const failure = launched.page.locator(addProjectPhase('failure'))
    await expect(failure, '挂接分支上的失败反馈在场').toBeVisible({ timeout: 30_000 })
    // fix-28 typed code 过桥保真：挂接分支 ③ 失败 = ERR_PROJECT_WRITE 无补偿——标题命中
    // 「挂接既有，未补偿」分支（非默认「未预期错误」分支）
    await expect(failure.locator('.dswf-ap-feedback-title')).toHaveText('应用库写入失败（挂接既有，未补偿）')
    // Output：既有工作区不被删除——registry 探针断言既有注册仍在（幂等命中不误删）
    expect(
      registryContains(join(userData, 'dsh-home'), dirA),
      'ownership 保护：既有工作区注册保持（幂等命中不误删）',
    ).toBe(true)
    expect(existsSync(join(dirA, 'keep.txt')), '工作区目录与内容不受波及').toBe(true)
    // State：挂接分支零补偿（registry 文本不变——delete 零调用）+ 应用侧本次登记未落库
    expect(registrySnapshot(join(userData, 'dsh-home')), '补偿 delete 零调用（registry 文本不变）').toBe(registryBefore)
    const projects = await forgeInvoke<readonly ProjectSummary[]>(launched.page, 'forge:projects/list')
    expect(
      projects.filter((p) => p.wsPath === dirA),
      '挂接分支失败 = 本次登记未落库（own-a 行已为挂接前置活删）',
    ).toHaveLength(0)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      if (launched.overlayPath !== undefined) rmFileBestEffort(launched.overlayPath)
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// fix-27 专项（任务验收 1/2/4；Step 5 "drift-repair-on-startup" 的 boot 期自动触发实证
// ——fix-37 ⑥ 回迁后本套件唯一的双 boot 对账测试）：boot 接线启动对账 + register 链
// 自愈/幂等——悬空引用夹具（行指向不存在 workspaceId，走查人 Z:\learn 同型）→ 重启
// boot 即修。对账语义细节（显式通道 relink/recreated/孤儿/静默双空/记账形状）归 core
// 集测 reconcile-queries.test；重注册幂等的补偿/ownership 面归 core project-service.test。
// 双 boot 形态：两次 boot 均 dismiss:false（「不收模态 = 复启正常」探针口径——文件头注）。
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·fix-27 boot 自愈 + 重注册幂等：悬空引用启动即修 → 重复注册幂等成功', async () => {
  test.setTimeout(600_000)
  const fixtureRoot = makeWorkspaceFixture('fix27-a')
  const dirA = join(fixtureRoot, 'fix27-a')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-comp-ud-'))
  let launched: Launched | undefined
  try {
    // boot 1（RPC-only，不收模态）：正常注册建立基线（registry 实体 + 应用侧行）
    launched = await launch(userData, { dismiss: false })
    const first = await forgeInvoke<RegisterResult>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'fix27-a',
      forgeDir: join(dirA, '.forge'),
      knowledgeDir: join(dirA, '.knowledge'),
    })
    const projects1 = await forgeInvoke<readonly ProjectSummary[]>(launched.page, 'forge:projects/list')
    const projectId = projects1.find((p) => p.wsPath === dirA)!.id
    await closeApp(launched.app)
    if (launched.overlayPath !== undefined) rmFileBestEffort(launched.overlayPath)
    launched = undefined

    // 悬空引用夹具（app 关闭后直写——行指向不存在 workspaceId，fix-18 home 翻转遗留同型）
    {
      const db = openStateDb(userData)
      try {
        const res = driftProjectWorkspaceRef(db, projectId, 'bogus-workspace-id')
        expect(res, '悬空夹具生效（UPDATE 命中）').toBeTruthy()
      } finally {
        db.close()
      }
    }

    // boot 2：启动对账接线（fix-27 main.ts boot 面 fire-and-forget）→ 引用启动即修
    launched = await launch(userData, { dismiss: false })
    const deadline = Date.now() + 60_000
    let repaired: { readonly workspaceId: string } | undefined
    for (;;) {
      const probe = await forgeInvoke<{ id: string; workspaceId: string } | null>(launched.page, 'forge:projects/get', { id: projectId })
      if (probe !== null && probe.workspaceId === first.workspaceId) {
        repaired = probe
        break
      }
      if (Date.now() > deadline) throw new Error('boot 启动对账超时（60s）：悬空引用未修复')
      await new Promise((done) => setTimeout(done, 2_000))
    }
    expect(repaired.workspaceId, '悬空引用 boot 即修（relinked——registry 按 ws_path 找回原实体）').toBe(first.workspaceId)
    // 对账记账在场（relink = 关键一致性事件 → warn 单条，scope=reconcile——只读探针）
    {
      const db = openStateDb(userData)
      try {
        expect(countReconcileWarnLogs(db), '对账修复记账在场（relinked warn）').toBeGreaterThanOrEqual(1)
      } finally {
        db.close()
      }
    }

    // 重复注册 = 幂等成功（fix-27 自愈防御：健康行 → 既有项目返回，不炸 UNIQUE、不删工作区）
    const again = await forgeInvoke<RegisterResult>(launched.page, 'forge:projects/register', {
      workspaceDir: dirA,
      name: 'fix27-a',
      forgeDir: join(dirA, '.forge'),
      knowledgeDir: join(dirA, '.knowledge'),
    })
    expect(again, '重注册幂等成功（返回既有项目）').toMatchObject({
      projectId,
      workspaceId: first.workspaceId,
      attachedToExisting: true,
    })
    // 幂等成功零补偿（fix-33 起 compensated 已从 RegisterResult 删除——成功径零补偿为
    // 类型级保证；断言保留为运行期佐证：字段缺席 = undefined）
    expect((again as { compensated?: unknown }).compensated, '幂等成功零补偿').toBeUndefined()
    // 终态：应用库恰一行 + registry 实体保持（不删）
    const projects2 = await forgeInvoke<readonly ProjectSummary[]>(launched.page, 'forge:projects/list')
    expect(projects2.filter((p) => p.wsPath === dirA), '重注册不落第二行').toHaveLength(1)
    expect(registryContains(join(userData, 'dsh-home'), dirA), '既有工作区注册保持（幂等不删）').toBe(true)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      if (launched.overlayPath !== undefined) rmFileBestEffort(launched.overlayPath)
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 已回迁 core 集测的对账 Outcome（fix-37 ⑥——语义单源 core，e2e 删重复）：
//   - Step 5 "drift-repair-on-startup"（通道显式触发）→ reconcile-queries.test AC1
//     （relink 找回 + 单条 warn 记账 + data_json 结果）
//   - Step 5 "no-drift-startup-silent"（一致终态静默）→ reconcile-queries.test
//     「path 匹配 → 通过：零修复、零记账、零 create/delete 副作用」
//   - Step 5c 的 Input「重启应用」boot 期自动触发面 = 下方 fix-27 专项（双 boot）承载
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 留痕 skip：注入/触发通道缺失（缺陷信号记账——转正条件 = 缝落地）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp compensation·Step3b host-cancel-in-window（留痕 skip）', async () => {
  test.skip(
    true,
    '②③ 间流程窗口（毫秒级本地链）非确定性可命中，且宿主级中断注入缝缺失（启动对账触发缝已由 fix-27 接线，取消窗口注入仍无通道）——留痕 skip，转正条件 = 注入缝落地',
  )
})

test('@web-e2e @p1mvp compensation·Step4b compensation-failure-ledger（留痕 skip）', async () => {
  test.skip(
    true,
    '④ registry.delete 失败注入通道缺失（fact FAULT_INJECTION_CONTRACT：e2e 无故障注入设施）——留痕 skip，转正条件 = 注入缝落地（记账日志/对账提示断言随缝转正）',
  )
})

test('@web-e2e @p1mvp compensation·Step5 success 补偿重放 no-op（留痕 skip）', async () => {
  test.skip(
    true,
    '对同一 workspaceId 重放补偿的测试开关通道缺失（fact FAULT_INJECTION_CONTRACT）；delete-unknown-id 幂等语义由 core 单测 pin——留痕 skip',
  )
})
