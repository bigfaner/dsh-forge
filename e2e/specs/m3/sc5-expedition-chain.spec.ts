// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC5 远征全链（PRD Goals SC5 / 图 12 下链；自举走查即此流程作用于 M3.5——运行期
// 真实走查归 5.3 dogfood；proposal 域退役后 fixed-migration）：
//   容器播种经 features 域注册（FEATURES_CHANNELS.register——brainstorm 产出承载面随
//   proposal 域退役，注册即 features 行 + feature_records(register) 审计行同事务伴随）
//   → 规格文档（upsertDoc → feature_documents 两行——write-prd/tech-design 产出的 RPC
//   双门承载）→ 任务（addTask slug 容器直挂）→ 派发入口（UF-3 新开路由联动断言：远征
//   模式 + /run-dag-tasks 指令单行自动发送）→ 文档/任务/记录域全景一致。
//
// 退役/降局面（plugin-spec proposal 域下线 + 概览 feature 消费门关闭，用户裁定
// 2026-11-14）：
//   - proposal 成链三行（proposal_id 谱系）/ 提案子 tab 行与展开 meta 面——随 proposal
//     域退役整面摘除；
//   - feature 子 tab UI 断言面（feature 行 / mode chip / 文档行）——features 子 tab 随
//     feature 消费门关闭退役，降为 db 级断言（工作区 forge.db features /
//     feature_documents 直读）；
//   - 任务 mode 快照列（source_kind/source_id/mode）随容器 slug 化退役——容器对应模式
//     的活断言面 = 容器 pill data-mode（features 轨恒 expedition，container-pill.ts 单源）。
import { expect } from '@playwright/test'
import { OFFICIAL_STACK_GATE_NOTE, officialStackConverged } from '../../support/official-stack-gate.js'
import { FEATURES_CHANNELS } from '@dsh-forge/lib-api/channels'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { createSharedLaunchFixture } from '../../support/fixtures.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openTaskLoopDbFull } from '../../support/sqlite.js'
import { openOverviewDock } from '../../support/navigation.js'
import { COMPOSER_INPUT, CONVERSATION_CONTENT, ovSubtabOf, ttItemOf } from '../../support/anchors.js'
import { awaitPresetHeaderLabel, seatPresent } from '../../support/m3.js'
import { projectKeyOf } from '../../support/project-key.js'

const WS_NAME = 'ws-sc5'
const PROP = 'sc5-expedition'
/** 派发指令单行（S5 缓切 `/run-dag-tasks <slug>`——command plane 执行宿主派发循环） */
const DISPATCH_CMD = `/run-dag-tasks ${PROP}`

// e2e-fast-shared-launch 存量迁移（批次四b）：共享 launch fixture——launchHost 整 spec 一次；
// 夹具工作区 = 空白目录（单用例 spec——账本 slug 隔离即天然成立）。
const { test } = createSharedLaunchFixture({
  seedWorkspace: () => undefined,
  workspaceName: WS_NAME,
  launch: { expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } },
})

test('@web-e2e @m3 SC5·远征全链：features 注册 → 规格文档 → 任务 → 派发入口 → 文档/任务/记录域全景一致', async ({ sharedLaunch }) => {
  // 族① gate-environment（plugin-spec/fix-7，bug eb786e62）：官方 0.2.2 世代 web 栈收敛前
  // 挂环境前提门控（skip 留痕非红；整代 co-upgrade 落地后自动复跑）——派发入口走 GUI
  // 会话打开面，挂 conversation.view 槽位原生崩溃（崩窗对话框掩码阻断概览 dock 交互链）。
  test.skip(!officialStackConverged(), OFFICIAL_STACK_GATE_NOTE)
  test.setTimeout(480_000)
  const { app, page, pageErrors, wsDir, udDir } = sharedLaunch
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const projectKey = projectKeyOf(wsDir)
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)

    // ── 容器播种（features 域注册——行 + register 审计行同事务伴随）──
    const feature = (await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: PROP, title: 'SC5 远征全链演示' })) as { featureId: string; slug: string }
    const featureId = feature.featureId
    const db = openForgeDbAt(dir)
    try {
      const row = db.prepare<unknown[], { slug: string }>(`SELECT slug FROM features WHERE id = ?`).get(featureId)
      expect(row?.slug, 'feature 行同名继承').toBe(PROP)
      const audit = db.prepare<unknown[], { verb: string; actor: string }>(
        `SELECT verb, actor FROM feature_records WHERE feature_id = ? ORDER BY id`,
      ).all(featureId)
      expect(audit, '审计伴随行（register·actor=plugin-tool——RPC 写径单事务伴随）').toEqual([{ verb: 'register', actor: 'plugin-tool' }])
    } finally {
      db.close()
    }

    // ── 规格文档（write-prd / tech-design 产出的 RPC 双门承载——文档入 feature_documents）──
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'prd-spec', relPath: `docs/features/${PROP}/prd/prd-spec.md`, summary: 'SC5 演示 PRD' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'tech-design', relPath: `docs/features/${PROP}/design/tech-design.md`, summary: 'SC5 演示技术设计' })

    // ── 任务（breakdown-tasks 产出承载：slug 容器直挂）──
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: 'SC5 远征任务甲', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: 'SC5 远征任务乙', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string }

    // ── 派发入口（UF-3 新开路由联动）：任务子 tab「派发」→ 新会话（远征）+ 单行指令自动发送 ──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    // feature 容器缺省选中（活跃 feature）；行在场 = 容器装载完成
    await expect(page.locator(ttItemOf(t1.taskId)).first(), 'feature 容器任务行在场').toBeVisible({ timeout: 30_000 })
    // 容器对应模式活断言面（mode 快照列退役后）：pill 蓝点 data-mode = expedition（恒远征）
    await expect(page.locator('[data-dswf-tt-contpill]').first().locator('.dswf-tt-contdot'), '容器蓝点 = 远征（features 轨恒 expedition）').toHaveAttribute('data-mode', 'expedition')
    const dispatchButton = page.locator('[data-dswf-tt-dispatch="on"]').first()
    await expect(dispatchButton, '派发按钮亮起（存在未终态）').toBeVisible({ timeout: 15_000 })
    await dispatchButton.click()
    // 新开：远征模式会话 + /run-dag-tasks 指令单行自动发送（S5 缓切宿主指令入口）
    await expect(page.locator(CONVERSATION_CONTENT).first(), '转录面承载自动发送指令').toContainText(DISPATCH_CMD, { timeout: 30_000 })
    await awaitPresetHeaderLabel(page, '远征模式')
    expect(await seatPresent(page, 1_000), '指令已发送 = 非 blank（hero 座位退场）').toBe(false)

    // ── 全景一致（任务子 tab + 库记录域；features 域降为 db 级——子 tab UI 退役）──
    // （会话编排 replaceMain 后右栏 dock 激活面可被会话面取代——keyed body 非激活即卸载，
    //  官方语义；openOverviewDock 幂等重开[strip 页签重激活径]）
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '任务行甲在场').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(ttItemOf(t2.taskId)).first(), '任务行乙在场').toBeVisible({ timeout: 15_000 })
    // ① feature 域（db 级——features 子 tab UI 已随 feature 消费门关闭退役）
    const db2 = openForgeDbAt(dir)
    try {
      const docs = db2.prepare<unknown[], { doc_kind: string }>(`SELECT doc_kind FROM feature_documents WHERE feature_id = ? ORDER BY doc_kind`).all(featureId)
      expect(docs.map((d) => d.doc_kind), 'feature_documents 两行').toEqual(['prd-spec', 'tech-design'])
    } finally {
      db2.close()
    }
    // ② 记录域：task_records 审计链头（task-loop.db 域账单源——add 两行打头，本容器作用域）
    const tl = openTaskLoopDbFull(udDir)
    try {
      const verbs = tl.prepare<unknown[], { verb: string }>(
        `SELECT r.verb AS verb FROM task_records r JOIN task_tasks t ON t.id = r.task_id WHERE t.slug = ? ORDER BY r.rowid`,
      ).all(PROP).map((r) => r.verb)
      expect(verbs.slice(0, 2), '记录域审计链头 = 两 add 行').toEqual(['add', 'add'])
    } finally {
      tl.close()
    }

    // 指令单行（v23）：转录不含多行模板（@path/名称/摘要族不参与派发指令）
    const transcript = await page.locator(CONVERSATION_CONTENT).first().textContent({ timeout: 10_000 })
    expect((transcript ?? '').includes('我的意图：'), '派发指令 = 单行最小消息（非 prefill 格式族）').toBe(false)
    // fix-4 起派发链真实收敛：零凭据 worker 反复异常退出（4 次）会挂出派发裁决问询卡
    // （占据主区——composer 随之让位，产品正确行为面）。走「跳过」收掉问询再断言 composer
    // 就绪（零凭据失败面不计入产品断言——与下方 pageerror 同纪律）。
    const skip = page.getByRole('button', { name: '跳过' }).first()
    await skip.click({ timeout: 15_000 }).catch(() => {}) // 无问询形态 = 直接就绪
    await expect(page.locator(COMPOSER_INPUT).last(), 'composer 在场（新会话就绪）').toBeVisible({ timeout: 30_000 })

    // 零凭据模型失败面不计入产品断言（指令已落地 = 派发入口交付面）
    if (pageErrors.length > 0) console.log(`[sc5-diagnostic] pageerror：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})
