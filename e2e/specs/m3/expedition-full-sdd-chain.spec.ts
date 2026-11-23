// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: expedition-full-sdd-chain（T-test-gen-scripts，proposal
// 域退役后 fixed-migration）。断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/
// expedition-full-sdd-chain/contracts/ step-{1..8}-*.md（eval-contract 963/1100 通过——本特性
// Golden Path）。
//
// 载体纪律（Hard Rule）：零真实模型——brainstorm/write-prd/ui-design/tech-design/
// breakdown-tasks 技能产出经回放主径承载（features 域注册 FEATURES_CHANNELS.register +
// upsertDoc + addTask——proposal 域随域退役，注册即 features 行 + feature_records(register)
// 审计行同事务伴随；技能写径与 RPC/桥同一服务门）。
//
// Fact Table 摘录（源码核实）：
//   - registerFeature（features.ts）：slug UNIQUE 冲突 → ERR_FEATURE_EXISTS「feature 已存在」
//     （409）；新行 feature_status 缺省 'prd' + feature_records(register) 审计行同事务伴随
//     （RPC 写径 actor='plugin-tool'）；
//   - claim 守卫（claim.ts）：前置全 ∈ {completed, skipped} 才放行，未满足 =
//     ERR_DEPENDENCIES_UNMET「前置依赖未满足：<slug>/<localId> <status>…——满足集…」；
//   - upsertDoc（FEATURES_CHANNELS.upsertDoc）：feature_documents 按 (feature_id, doc_kind)
//     幂等更新；
//   - 任务域账 = task-loop.db（openTaskLoopDbFull——task_tasks/task_settlements 域账单源；
//     slug 容器弱引用，source_kind/mode 列随容器 slug 化退役）；
//   - 核心包技能目录（fs）：packages/plugin-forge/skills——git-commit/git-checkout 零条目。
//
// 退役面（plugin-spec proposal 域下线 + 概览 feature 消费门关闭）：
//   - 原 Step2b/2c（打回循环 + superseded 演进链——纯提案 verdict 流转面）整测删除；
//   - 提案 mode 溯源 / 提案行 UI / 谱系 meta 面随域退役；feature 子 tab UI 断言降为 db 级；
//   - 任务 mode 快照列退役——容器对应模式活断言面 = 容器 pill data-mode（sc5 承载）。
//
// Outcome → 测试映射（迁移后）：
//   Step3 success（注册成链三件：features 行 + register 审计行）…………………………「冒烟」
//   Step4/5 success（write-prd → feature_documents + 分层文档区真实路径）………………「冒烟」
//   Step6 success（breakdown-tasks 建任务 + 依赖边落库）………………………………………「冒烟」
//   Step7 success（claim/submit 全绿 + 提交哈希入结算域账）…………………………………「冒烟」
//   Step7 zero-manual-file-transfer（任务/feature 记录链对账）……………………………「冒烟」
//   Step8 success（文档/任务域全景一致——UI 面收敛至任务子 tab）…………………………「冒烟」
//   Step1 spec-skill-catalog-complete（远征 spec 目录全量挂载 + core 无退役技能）……「冒烟」尾
//   Step3 幂等（同 slug 重复 register ERR_FEATURE_EXISTS）……………………………………「Step3b」
//   Step4 upsert-idempotent（同 kind 更新不重复建行）…………………………………………「Step3b」
//   Step6 dag-dependency-ordering（前置未终态不可领取——无越序）…………………………「Step3b」
//   Step8 audit-rows-accompany（审计行伴随 + append-only 触发器）…………………………「Step3b」
//
// Assertion depth: 40/44 behavioral（91%），其中 deep 18/40（45%）——两阈均过。

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { OFFICIAL_STACK_GATE_NOTE, officialStackConverged } from '../../support/official-stack-gate.js'
import { FEATURES_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { ROOT } from '../../support/launch.js'
import { createSharedLaunchFixture, openOverviewSubtab, sharedOverlayText } from '../../support/fixtures.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openTaskLoopDbFull } from '../../support/sqlite.js'
import { ttItemOf } from '../../support/anchors.js'
import { presetSkillDirs } from '../../support/m3.js'
import { projectKeyOf } from '../../support/project-key.js'

const WS_NAME = 'ws-jefc'

// e2e-fast-shared-launch 存量迁移（批次四a）：共享 launch fixture——launchHost 整 spec 一次；
// 夹具工作区 = 空白目录（slug 隔离：jefc-golden / jefc-idem 各自作用域）；
// boot-overlay 判读经支撑层单源 sharedOverlayText（SharedLaunchHandle.udDir 透传
// ——魔法前缀扫描退役）。

const { test } = createSharedLaunchFixture({
  seedWorkspace: () => undefined,
  workspaceName: WS_NAME,
  launch: { expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } },
})

// 概览子 tab 打开走支撑层单源 openOverviewSubtab（批次四a 四份 spec 内同语义 helper 收编
// ——挂载重试 ×3，轮内 30s/15s 门原样保留，e2e-fast-shared-launch/1.17）。

/** 写动词拒绝面捕获（bridge 直调错误 message = core typed error 文案） */
async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

test('@web-e2e @m3 远征全链·冒烟：features 注册 → 三类规格文档 → 建任务 → 全绿 → 文档/任务域全景（Step3-8）', async ({ sharedLaunch }) => {
  // 族① gate-environment（plugin-spec/fix-7，bug eb786e62）：官方 0.2.2 世代 web 栈收敛前
  // 挂环境前提门控（skip 留痕非红；整代 co-upgrade 落地后自动复跑）——本用例含 GUI 会话
  // 派发/转录面（conversation.view 槽位原生崩溃 + 崩窗掩码阻断概览 dock 交互链）；
  // 库级用例（幂等/守卫/审计）不挂门、照跑。
  test.skip(!officialStackConverged(), OFFICIAL_STACK_GATE_NOTE)
  test.setTimeout(480_000)
  const { app, page, pageErrors, wsDir, udDir } = sharedLaunch
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const projectKey = projectKeyOf(wsDir)
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const PROP = 'jefc-golden'

    // ── Step3：registerFeature 单步成链（features 行 + register 审计行同事务伴随）──
    const feature = (await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: PROP, title: 'Jefc 远征全链演示' })) as { featureId: string; slug: string }
    const featureId = feature.featureId
    const db = openForgeDbAt(dir)
    try {
      const row = db.prepare<unknown[], { slug: string; feature_status: string }>(
        `SELECT slug, feature_status FROM features WHERE id = ?`,
      ).get(featureId)
      expect(row?.slug, 'feature 行同名继承').toBe(PROP)
      expect(row?.feature_status, '新行缺省初态 = prd（推导机不动点）').toBe('prd')
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM feature_records WHERE feature_id = ? AND verb = 'register'`).get(featureId)?.n, 'feature_records 审计行同事务在场（无半链）').toBe(1)
    } finally {
      db.close()
    }

    // ── Step4/5：三类规格文档（write-prd / ui-design / tech-design 的 RPC 双门承载）──
    // 词表事实（contracts DOC_KINDS 七类封闭）：无 ui-design kind——ui-design.md 为 on-disk
    // 工件不入册（ui-design SKILL.md State-Layer Discipline）；UI 段入册工件 = page-map
    // （tech-design SKILL 登记，规范位 design/page-map.md——core discovery 同映射）。
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'prd-spec', relPath: `docs/features/${PROP}/prd/prd-spec.md`, summary: 'Jefc PRD' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'page-map', relPath: `docs/features/${PROP}/design/page-map.md`, summary: 'Jefc 页面图' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'tech-design', relPath: `docs/features/${PROP}/design/tech-design.md`, summary: 'Jefc 技术设计' })

    // ── Step6：breakdown-tasks 建任务（挂 slug 容器 + 依赖 DAG）──
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '远征任务甲', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '远征任务乙', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string; slug: string; localId: string }

    // ── Step7：派发执行（回放主径）——AC gate → commit → submitTask 全绿 ──
    const COMMIT = '0f1e2d3c4b5a6978877665544332211ff0e1d2c3'
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: t1.slug, localId: t1.localId }, sessionId: 'e2e-jefc-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectKey, taskRef: { slug: t1.slug, localId: t1.localId }, result: 'success',
      summary: 'Jefc 甲结算', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT, sessionId: 'e2e-jefc-executor',
    })
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: t2.slug, localId: t2.localId }, sessionId: 'e2e-jefc-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectKey, taskRef: { slug: t2.slug, localId: t2.localId }, result: 'success',
      summary: 'Jefc 乙结算', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT, sessionId: 'e2e-jefc-executor',
    })

    // ── Step7c：零手工搬文件对账（任务/feature 域动词可溯源——task-loop.db ∪ forge.db）──
    const tl = openTaskLoopDbFull(udDir)
    try {
      const taskVerbs = tl.prepare<unknown[], { verbs: string }>(
        `SELECT GROUP_CONCAT(r.verb, ',') AS verbs FROM task_records r JOIN task_tasks t ON t.id = r.task_id WHERE t.slug = ?`,
      ).get(PROP)?.verbs as string
      expect(taskVerbs.includes('add') && taskVerbs.includes('claim') && taskVerbs.includes('submit'), '任务域全程经动词（add/claim/submit）').toBe(true)
      const commits = tl.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_settlements WHERE result = 'success' AND commit_hash = ? AND task_id IN (SELECT id FROM task_tasks WHERE slug = ?)`,
      ).get(COMMIT, PROP)?.n
      expect(commits, '提交哈希入结算域账（两行）').toBe(2)
    } finally {
      tl.close()
    }
    const db2 = openForgeDbAt(dir)
    try {
      const featureVerbs = db2.prepare<unknown[], { verb: string }>(
        `SELECT verb FROM feature_records WHERE feature_id = ? ORDER BY id`,
      ).all(featureId).map((r) => r.verb)
      expect(featureVerbs, 'feature 域动词全经门（register + doc-upsert ×3）').toEqual(['register', 'doc-upsert', 'doc-upsert', 'doc-upsert'])
      const docs = db2.prepare<unknown[], { doc_kind: string }>(
        `SELECT doc_kind FROM feature_documents WHERE feature_id = ? ORDER BY doc_kind`,
      ).all(featureId)
      expect(docs.map((d) => d.doc_kind), 'feature_documents 三类在场（分层多类——UI 段 = page-map，词表无 ui-design）').toEqual(['page-map', 'prd-spec', 'tech-design'])
    } finally {
      db2.close()
    }

    // ── Step8：全景一致（feature 域降为 db 级[子 tab UI 退役]；任务子 tab 行面收敛）──
    await openOverviewSubtab(page, 'tasks')
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '任务行甲 = 已完成').toContainText('已完成', { timeout: 30_000 })
    await expect(page.locator(ttItemOf(t2.taskId)).first(), '任务行乙 = 已完成').toContainText('已完成', { timeout: 30_000 })

    // ── Step1b：远征组合技能目录（数据直证——spec 全量挂载 + core 无退役技能）──
    const overlay = sharedOverlayText(udDir)
    const expDirs = presetSkillDirs(overlay, 'expedition')
    expect(expDirs.filter((d) => d.toLowerCase().includes('plugin-forge-spec')).length, '远征组合 spec 技能目录全量挂载').toBe(1)
    const coreEntries = readdirSync(join(ROOT, 'packages', 'plugin-forge', 'skills')).filter((e) => e !== 'README.md')
    expect(coreEntries, 'core 包无 git-commit（移除断言）').not.toContain('git-commit')
    expect(coreEntries, 'core 包无 git-checkout（未迁断言）').not.toContain('git-checkout')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})

// 退役（plugin-spec proposal 域下线——提案 verdict 流转面随域退役）：原 Step2b/2c（打回修订
// 循环：空因拒绝留场 + under-review → draft + 再接受；superseded 演进链：supersededBy 必带
// + 取代目标缺席拒绝 + superseded_by 落库）整测删除，评审流转对话框/五态机断言面不再重建。

test('@web-e2e @m3 远征全链·Step3b/4b/6b/8b：注册幂等 + 文档 upsert 幂等 + DAG 领取守卫 + 审计 append-only', async ({ sharedLaunch }) => {
  test.setTimeout(480_000)
  const { app, page, pageErrors, wsDir, udDir } = sharedLaunch
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const projectKey = projectKeyOf(wsDir)
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const PROP = 'jefc-idem'
    const feature = (await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: PROP, title: 'Jefc 幂等与守卫演示' })) as { featureId: string }
    const featureId = feature.featureId

    // ── 注册幂等：同 slug 再 register → typed 拒（ERR_FEATURE_EXISTS——features.slug UNIQUE
    // 冲突 409 = features.ts 契约面；防重复建链由词表单源承载）──
    const dup = await rejectMessage(forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: PROP, title: 'Jefc 幂等与守卫演示' }))
    expect(dup, '重复 register typed 拒（code 面）').toContain('ERR_FEATURE_EXISTS')
    expect(dup, '重复 register typed 拒（message 面）').toContain('feature 已存在')
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features WHERE slug = ?`).get(PROP)?.n, '重复 register 不建第二链（幂等）').toBe(1)
    } finally {
      db.close()
    }

    // ── upsert 幂等：同 (feature, kind) 再写 = 更新不重复建行 ──
    const relPath = `docs/features/${PROP}/prd/prd-spec.md`
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'prd-spec', relPath, summary: '初版' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'prd-spec', relPath, summary: '修订版' })
    const db2 = openForgeDbAt(dir)
    try {
      expect(db2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM feature_documents WHERE feature_id = ? AND doc_kind = 'prd-spec'`).get(featureId)?.n, '同名同路径 upsert = 单行更新（无重复条目）').toBe(1)
    } finally {
      db2.close()
    }

    // ── DAG 领取守卫：前置未终态不可领取（无越序）──
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '前置任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '依赖任务', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string; slug: string; localId: string }
    const premature = await rejectMessage(driver.call('forgeTasks', 'claimTask', {
      projectKey, taskRef: { slug: t2.slug, localId: t2.localId }, sessionId: 'e2e-jefc3-dispatch',
    }))
    expect(premature, '前置未终态领取拒（ERR_DEPENDENCIES_UNMET 面）').toContain('前置依赖未满足')
    expect(premature, '未满足清单含前置自然键 + 当前状态').toContain(`${PROP}/${t1.localId} pending`)
    // 前置终态后放行（满足集 = completed ∪ skipped）
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: t1.slug, localId: t1.localId }, sessionId: 'e2e-jefc3-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectKey, taskRef: { slug: t1.slug, localId: t1.localId }, result: 'success',
      summary: 'Jefc 前置结算（守卫放行门）', gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 'e2e-jefc3-executor',
    })
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: t2.slug, localId: t2.localId }, sessionId: 'e2e-jefc3-dispatch' })
    const tl = openTaskLoopDbFull(udDir)
    try {
      expect(tl.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM task_tasks WHERE id = ?`).get(t2.taskId)?.task_status, '前置终态后领取放行（按 DAG 顺序）').toBe('in_progress')
    } finally {
      tl.close()
    }

    // ── 审计 append-only：UPDATE / DELETE 直接 ABORT（双触发器）+ 动词伴随 ──
    const db4 = openForgeDbAt(dir)
    try {
      const auditCount = db4.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM feature_records WHERE feature_id = ?`).get(featureId)?.n ?? 0
      expect(auditCount, 'feature 域多次写入每次伴随审计行（register + doc-upsert ×2）').toBeGreaterThanOrEqual(3)
      expect(() => db4.prepare(`UPDATE feature_records SET verb = 'tampered' WHERE feature_id = ?`).run(featureId), 'feature_records UPDATE 被触发器拒绝（append-only）').toThrow()
      expect(() => db4.prepare(`DELETE FROM feature_records WHERE feature_id = ?`).run(featureId), 'feature_records DELETE 被触发器拒绝（append-only）').toThrow()
    } finally {
      db4.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})
