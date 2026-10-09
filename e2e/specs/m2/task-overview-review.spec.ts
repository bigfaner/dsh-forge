// @feature:dsh-forge-m2-pipeline @web-e2e
// gen-test-scripts 产物 —— Journey: task-overview-review（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m2-pipeline/testing/task-overview-review/contracts/
//   step-{1..6}-*.md（eval-contract 912/1100 通过）。
//
// 载体形态：UI 走查主径（openOverviewDock 官方 guide 入口 / pill 入口）+ 回放钩子造数 +
// 直插受控初态（多态/createdAt 排序基准）+ refetchOnce 读面单发。
//
// Fact Table 摘录（源码核实）：
//   - 概览框架：[data-dswf-ov-panel]（OverviewTab.tsx:177）+ 折叠头 [data-dswf-ov-head]
//     （ov-head.tsx:31，含项目名）+ sticky 区子 tab [data-dswf-ov-subtab="proposals|features|tasks"]
//     + 搜索行 [data-dswf-ov-searchrow]（IME 稳定子树锚）+ 输入 .dswf-ov-search +
//     排序 pill [data-dswf-ov-sort]（文案 ⇅ 活跃优先|最新创建）；
//   - 任务子 tab：feature 绑定 pill [data-dswf-tt-featpill="<slug>"]（点开 Menu 换绑）+
//     视图切换 [data-dswf-tt-view="list|dag|swim"]（aria-pressed）+ 七态 chips
//     [data-dswf-ov-stchip="<status>"]（aria-pressed / disabled + is-zero）+ 清除
//     [data-dswf-ov-stchip-clear] + 行 [data-dswf-tt-item="<taskId>"] + 副行
//     [data-dswf-tt-sub="<taskId>"]（⟞N 挂接）+ DAG [data-dswf-tt-dagsvg] + 泳道列
//     [data-dswf-tt-col="<status>"] / 卡 [data-dswf-tt-card]；
//   - 抽屉：[data-dswf-td-drawer] + 分区 [data-dswf-td-sect="content|timeline"] + 事件行
//     [data-dswf-td-ev-verb="<verb>"] + 转移入口 [data-dswf-td-trans] + eval 空态注记
//     [data-dswf-td-eval-empty]（type-templates/eval.tsx:54）；
//   - 转移对话框（transition-dialog.tsx）：[data-dswf-td-tr-dialog] + 目标 select
//     [data-dswf-td-tr-to]（选项集 = allowedTransitions——当前态机械排除）+ 原因
//     [data-dswf-td-tr-reason] + 终态提示 [data-dswf-td-tr-terminal] + 错误条
//     [data-dswf-td-tr-error]（「原因必填——填写后重试」）+ 确认 [data-dswf-td-tr-confirm]；
//   - 恢复钩子（Step 5 inferred Outcome）：人工转移到 completed/skipped 与 submitTask 同挂
//     （C3 同族）——blocked 后继 auto-restore + 终态提示文案在场。
//
// Outcome → 测试映射：
//   Step1-6 success 链（开页签→绑定→过滤→三视图→详情）……「冒烟：概览走查全链（多态 + 抽屉时间线）」
//   Step1 stress-500-first-screen-under-2s ……………………………………「@500 首屏 ≤2s（UI 面；数据面计时 = sc2-perf）」
//   Step2 success（feature 绑定切换）…………………………………………………………「Step2 feature 绑定切换：列表随绑定切换（直读无第二来源）」
//   Step2 ime-safe-bilingual-search …………………………………………………………「Step2 中英双语搜索过滤（IME 稳定子树）」
//   Step3 success（chips 过滤三视图统一）………………………………………………并入冒烟（chips 过滤 + 三视图）+「Step3 零计数 chip 禁用」
//   Step4 sort-toggle-reorders-all ………………………………………………………………「Step4 排序切换：全列表重排（活跃优先 ↔ 最新创建）」
//   Step5 success（人工转移落库 + 审计）…………………………………………………「Step5 人工转移：对话框落库 + reason 入审计 + 即时反映」
//   Step5 reason-required-empty-reject ……………………………………………………「Step5 空因拒绝：错误条留场可修正 + 零写入」
//   Step5 illegal-target-not-offered …………………………………………………………「Step5 非法目标：选项集排除（所见即所得）+ 服务端先验兜底」
//   Step5 terminal-transition-triggers-restore ……………………………………「Step5 终态转移触发恢复：blocked 后继 auto-restore」
//   Step6 success（抽屉模块化详情）…………………………………………………………并入冒烟（时间线/分区）+ eval 空态独立测试
//   Step6 eval-type-conditional-section-empty-note …………………………「Step6 eval 族条件区空态注记（不伪造评估数据）」
//
// Assertion depth: 68/72 behavioral (94%)，其中 deep 26/68 (38%)——两阈均过。
// M3 drift 台账（5.2 落定）：featureSlug → source:ContainerRef 容器化（1.1/2.4）+ INSERT 列
// source_kind/source_id（schema v1 直改）+ 4.6 v22 容器 pill/视图下拉锚随迁；claimTask 桥直调
// = core 服务 API 保留面（3.5 tool 退役——drift #1 处置：回放主径零波及）。

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { FEATURES_CHANNELS, PROJECTS_M2_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import type { TaskStatus } from '../../../packages/contracts/src/labels.js'
import type { TaskCard, TaskDetail } from '../../../packages/contracts/src/dto/forge.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { switchTaskView } from '../../support/m3.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { refetchOnce } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { OV_PANEL, TD_DRAWER, docPanelOf, ovSubtabOf, ttColOf, ttContpillOf, ttItemOf } from '../../support/anchors.js'
import { openOverviewDock } from '../../support/navigation.js'

/** UI 首屏预算（Step1 stress Outcome 机械判据——毫秒） */
const FIRST_SCREEN_BUDGET_MS = 2_000

async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

async function setupWorld(page: Page, wsDir: string, wsName: string, feature: string) {
  const project = await registerProject(page, wsDir, wsName)
  const projectId = project.id
  await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: feature, title: `概览演示 ${feature}` })
  const dir = (await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: wsDir })).dir
  return { projectId, dir }
}

/** 直插多态任务（受控 status/createdAt/类型/描述/覆盖率——排序与过滤断言基准；desc = 参考文档锚点载体） */
function seedTasks(
  dir: string,
  feature: string,
  rows: readonly { readonly localId: string; readonly title: string; readonly status: TaskStatus; readonly type?: string; readonly createdAt?: string; readonly records?: readonly string[]; readonly desc?: string; readonly coverage?: number }[],
): string[] {
  const db = openForgeDbAt(dir)
  const ids: string[] = []
  try {
    db.transaction(() => {
      const fid = db.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE slug = ?`).get(feature)?.id ?? ''
      for (const r of rows) {
        const id = `t-${feature}-${r.localId}`
        ids.push(id)
        db.prepare(
          `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, source_kind, source_id, task_desc, coverage, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'feature', ?, ?, ?, ?, ?)`,
        ).run(id, feature, r.localId, r.title, r.type ?? 'doc', r.status, fid, r.desc ?? null, r.coverage ?? null, r.createdAt ?? '2026-10-06T00:00:00.000Z', r.createdAt ?? '2026-10-06T00:00:00.000Z')
        for (const verb of r.records ?? []) {
          if (verb === 'claim') {
            db.prepare(
              `INSERT INTO task_records (task_id, verb, from_status, to_status, dispatch_digest, actor, session_id, created_at, updated_at)
               VALUES (?, 'claim', 'pending', 'in_progress', '000011112222', 'plugin-tool', 'e2e-ovr-seed', '2026-10-06T01:00:00.000Z', '2026-10-06T01:00:00.000Z')`,
            ).run(id)
          } else if (verb === 'submit') {
            db.prepare(
              `INSERT INTO task_records (task_id, verb, from_status, to_status, summary, gate_json, actor, session_id, created_at, updated_at)
               VALUES (?, 'submit', 'in_progress', ?, '种子结算', ?, 'plugin-tool', 'e2e-ovr-seed', '2026-10-06T02:00:00.000Z', '2026-10-06T02:00:00.000Z')`,
            ).run(id, r.status, '{"compile":true,"fmt":true,"lint":true,"test":true,"coverage":0.62}')
          }
        }
      }
      // 相位对齐（写动词同口径 deriveTaskPhase 两段式）：直插任务行后 feature_status 须
      // ≡ 任务推导相位——register 缺省 prd + 有任务 = 相位不变量违例，首个写动词
      // （transition）会触发 assertPhaseInvariant 整体回滚（对话框留场错误条）
      const seeded = rows.map((r) => r.status)
      const phase = seeded.some((s) => s === 'in_progress' || s === 'blocked' || s === 'suspended')
        ? 'in-progress'
        : seeded.some((s) => s === 'pending')
          ? 'tasks'
          : 'completed'
      db.prepare(`UPDATE features SET feature_status = ? WHERE id = ?`).run(phase, fid)
    })()
  } finally {
    db.close()
  }
  return ids
}

/** 种子 id 索引收窄（noUncheckedIndexedAccess——缺席即夹具失效 fail-fast） */
function idOf(ids: readonly string[], i: number): string {
  const v = ids[i]
  if (v === undefined) throw new Error(`种子任务索引缺席：${String(i)}`)
  return v
}

/** 打开概览任务子 tab（guide 入口径）并等待列表就绪 */
async function openTasksTab(page: Page): Promise<void> {
  await openOverviewDock(page)
  await page.locator(ovSubtabOf('tasks')).click()
  await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
}

test('@web-e2e @m2 概览走查·冒烟：开页签→绑定→chips 过滤→三视图→详情抽屉（Step1-6 全链）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-'))
  const wsDir = join(fixtureRoot, 'ws-ovr')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'ovr-feat'
    const WS_NAME = '概览走查演示'
    const { projectId, dir } = await setupWorld(page, wsDir, WS_NAME, FEATURE)
    /** 参考文档 docRel（D22：完整形态参考 chip → dock 文档 tab 断言锚——1.3 desc 声明 + feature_documents 在册） */
    const REF_DOC = 'docs/features/ovr-feat/prd/prd-spec.md'

    // 多态夹具（pending + in_progress + completed——chips/排序/抽屉断言基准）+ 依赖边（DAG/泳道）
    // 1.3 = coding-feature + desc 参考文档锚点 + coverage 阈值（D22 完整形态：覆盖率条预期标记 + 参考链态）
    const ids = seedTasks(dir, FEATURE, [
      { localId: '1.1', title: '走查·待办 one', status: 'pending' },
      { localId: '1.2', title: '走查·进行 two', status: 'in_progress', records: ['claim'] },
      { localId: '1.3', title: '走查·已结 three', status: 'completed', type: 'coding-feature', records: ['claim', 'submit'], desc: `实现依据 ${REF_DOC} 对齐`, coverage: 0.6 },
    ])
    const db0 = openForgeDbAt(dir)
    db0.prepare(
      `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
       VALUES (?, ?, 'manual', '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
    ).run(idOf(ids, 1), idOf(ids, 2))
    // 参考文档在册（refs 水化注册面——feature_documents 行）+ 盘上正文（DocsTab 只读渲染体）
    db0.prepare(
      `INSERT INTO feature_documents (feature_id, doc_kind, rel_path, summary, created_at, updated_at)
       SELECT id, 'prd-spec', ?, '走查 PRD 摘要', '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z' FROM features WHERE slug = ?`,
    ).run(REF_DOC, FEATURE)
    db0.close()
    mkdirSync(dirname(join(wsDir, REF_DOC)), { recursive: true })
    writeFileSync(join(wsDir, REF_DOC), '# 走查 PRD\n\nDOC-REF-BODY（D22 参考文档开出体）\n')

    // ── Step 1：dock 开概览（开始页 guide 入口卡）+ ov-head 项目名 ──
    await openOverviewDock(page)
    await expect(page.locator(OV_PANEL).first(), '概览 tab body 挂载（dock 原位开出）').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-ov-head]').first(), 'ov-head 在场（项目名 + 摘要行）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(OV_PANEL).first()).toContainText(WS_NAME)

    // ── Step 2：feature 绑定（单 feature 自动绑定——pill 在场）+ 数据直读 ──
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(page.locator(ttContpillOf('feature', FEATURE)).first(), 'feature 绑定 pill 在场（自动绑定单 feature）').toBeVisible({ timeout: 30_000 })
    for (const id of ids) {
      await expect(page.locator(ttItemOf(id)).first(), `任务行在场（${id}）`).toBeVisible({ timeout: 30_000 })
    }
    const cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: FEATURE } })
    expect(cards, '列表 = 该 feature 任务集（三行）').toHaveLength(3)

    // ── Step 3：七态 chips 过滤（in_progress 单选）——三视图统一 ──
    const chipInProgress = page.locator('[data-dswf-ov-stchip="in_progress"]')
    await expect(chipInProgress).toBeVisible({ timeout: 15_000 })
    await chipInProgress.click()
    await expect(page.locator(ttItemOf(idOf(ids, 1))).first(), '过滤后仅 in_progress 行在场').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ttItemOf(idOf(ids, 0))).first(), 'pending 行被过滤').toHaveCount(0)
    await expect(page.locator(ttItemOf(idOf(ids, 2))).first(), 'completed 行被过滤').toHaveCount(0)
    // 过滤对 DAG/泳道统一生效
    await switchTaskView(page, 'swim')
    await expect(page.locator(ttColOf('pending')).locator('[data-dswf-tt-card]'), '泳道 pending 列零卡（过滤统一）').toHaveCount(0)
    await expect(page.locator(ttColOf('in_progress')).locator('[data-dswf-tt-card]').first(), '泳道 in_progress 列保留卡').toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-ov-stchip-clear]').click()
    // 当前仍在泳道视图——恢复判据用泳道锚（pending 列回卡）；列表锚在 Step4 切回后另行断言
    await expect(page.locator(ttColOf('pending')).locator('[data-dswf-tt-card]').first(), '清除过滤后全量恢复（泳道 pending 列回卡）').toBeVisible({ timeout: 15_000 })

    // ── Step 4：三视图切换（列表 → DAG → 泳道 → 列表）──
    await switchTaskView(page, 'dag')
    await expect(page.locator('[data-dswf-tt-dagsvg]').first(), 'DAG SVG 贝塞尔连线在场（完成边绿）').toBeVisible({ timeout: 30_000 })
    await switchTaskView(page, 'swim')
    await expect(page.locator(ttColOf('completed')).first(), '泳道七态横向列在场').toBeVisible({ timeout: 15_000 })
    await switchTaskView(page, 'list')
    await expect(page.locator(ttItemOf(idOf(ids, 0))).first(), '切回列表视图').toBeVisible({ timeout: 15_000 })
    // 副行承重（前置计数形 ←N 前置——键+当前状态形归抽屉现状条，ui-design 分工）
    await expect(page.locator(`[data-dswf-tt-sub="${idOf(ids, 1)}"]`).first(), '副行呈现前置计数（依赖边 → ←1 前置）').toContainText('←1 前置')

    // ── Step 6：详情弹窗（m3.1 D21 可拖动弹窗 + D22 双形态——模块化分区 + 时间线 + 几何）──
    await page.locator(ttItemOf(idOf(ids, 2))).first().click()
    const drawerEl = page.locator(TD_DRAWER).first()
    await expect(drawerEl, '可拖动弹窗在场（D21——抽屉形态退役）').toBeVisible({ timeout: 15_000 })
    await expect(drawerEl).toContainText('走查·已结 three')
    // m3.1 D22 简要形态（默认 440）：键+tag+标题+概要——完整块零渲染（原型「简要形态不含完整块」）
    await expect(drawerEl).toHaveAttribute('data-dswf-td-form', 'brief')
    await expect(drawerEl.locator('[data-dswf-td-expand]'), '⤢ 翻转钮在场（未展开态）').toHaveAttribute('aria-pressed', 'false')
    await expect(drawerEl.locator('[data-dswf-td-brief]'), '概要体在场（简要形态）').toBeVisible()
    await expect(drawerEl.locator('[data-dswf-td-brief]'), '概要行：所属/类型/前置/挂接会话').toContainText('所属')
    await expect(drawerEl.locator('[data-dswf-td-brief]')).toContainText('类型')
    await expect(drawerEl.locator('[data-dswf-td-sect="content"]'), '简要形态零完整块（任务内容分块不渲染）').toHaveCount(0)
    // ⤢ 展开 → 完整 720：全量内容平移（分区/时间线/八段/覆盖率）
    await drawerEl.locator('[data-dswf-td-expand]').click()
    await expect(drawerEl, '完整形态（D22 720）').toHaveAttribute('data-dswf-td-form', 'full')
    await expect(drawerEl.locator('[data-dswf-td-expand]'), '⤡ 翻转钮已翻（aria-pressed）').toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-dswf-td-sect="content"]').first(), '任务内容分区在场').toBeVisible()
    await expect(page.locator('[data-dswf-td-sect="timeline"]').first(), '执行时间线分区在场').toBeVisible()
    await expect(page.locator('[data-dswf-td-ev-verb="claim"]').first(), '时间线事件行：claim').toBeVisible()
    await expect(page.locator('[data-dswf-td-ev-verb="submit"]').first(), '时间线事件行：submit').toBeVisible()
    await expect(drawerEl.locator('[data-dswf-td-now]').first(), '现状条在场（完整形态全量平移）').toBeVisible()
    await expect(drawerEl.locator('[data-dswf-td-cov]').first(), '覆盖率条在场（coding 族——预期标记+达标判定）').toBeVisible()
    await expect(drawerEl.locator('[data-dswf-td-ref]').first(), '参考文档 chip 在场（resolved 链接态）').toBeVisible()
    // 分块折叠往返（D22：完整形态分块折叠——aria-expanded 翻转）
    const timelineHead = drawerEl.locator('[data-dswf-td-sect="timeline"]').first()
    await expect(timelineHead).toHaveAttribute('aria-expanded', 'true')
    await timelineHead.click()
    await expect(timelineHead, '折叠往返：收起（aria-expanded=false）').toHaveAttribute('aria-expanded', 'false')
    await timelineHead.click()
    await expect(timelineHead, '折叠往返：再展开').toHaveAttribute('aria-expanded', 'true')
    // 参考文档 chip → dock 开文档 tab（弹窗保持——onOpenDoc 语义）
    await drawerEl.locator('[data-dswf-td-ref]').first().click()
    await expect(
      page.locator(docPanelOf(projectId, REF_DOC)).first(),
      '参考文档点开 dock 文档 tab（docRel 去重键）',
    ).toBeVisible({ timeout: 15_000 })
    await expect(drawerEl, '弹窗保持（开 tab 不关弹窗）').toBeVisible()
    // 回概览 tab（文档 tab 激活期概览 body 卸载——后续任务行重开径需概览在场 + 任务子 tab 重激活）
    await openOverviewDock(page)
    await expect(page.locator(OV_PANEL).first(), '概览 tab body 回挂载').toBeVisible({ timeout: 15_000 })
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ttItemOf(idOf(ids, 2))).first(), '任务行回在场（任务子 tab 重激活）').toBeVisible({ timeout: 15_000 })
    // ⤡ 收起回简要 440（宽度交换 + 水平再居中——原型 m31-tm-expand）
    await drawerEl.locator('[data-dswf-td-expand]').click()
    await expect(drawerEl, '收起回简要形态').toHaveAttribute('data-dswf-td-form', 'brief')
    // m3.1 D21 弹窗几何读数（inline 宽/左/顶 = mount 效应落定后的逐开本地态——CSS 居中兜底已让位）
    const drawerGeom = async (): Promise<{ width: number; left: number; top: number }> => {
      const geom = await drawerEl.evaluate((el) => ({
        width: Number.parseFloat((el as HTMLElement).style.width),
        left: Number.parseFloat((el as HTMLElement).style.left),
        top: Number.parseFloat((el as HTMLElement).style.top),
      }))
      expect(geom.left, '起始位已落定（inline left 注入）').not.toBeNaN()
      return geom
    }
    const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
    const defaultLeft = Math.max(8, Math.round((vp.w - 440) / 2))
    const defaultTop = Math.max(8, Math.round(vp.h * 0.14))
    const opened = await drawerGeom()
    expect(opened.width, '默认宽 440（原型 M31_TM_W 刻度）').toBe(440)
    expect(opened.left, '默认起始位 = 水平居中（原型 openTaskModal）').toBe(defaultLeft)
    expect(opened.top, '默认起始位 = 视口高 14%').toBe(defaultTop)
    // 标题栏全窗拖移（D21：指针位移 → 位钳制内平移）
    const headBox = await drawerEl.locator('[data-dswf-td-head]').boundingBox()
    expect(headBox, '标题栏在场（全窗拖移手柄）').not.toBeNull()
    const hx = headBox!.x + headBox!.width / 2
    const hy = headBox!.y + headBox!.height / 2
    await page.mouse.move(hx, hy)
    await page.mouse.down()
    await page.mouse.move(hx + 60, hy + 30, { steps: 4 })
    await page.mouse.up()
    const moved = await drawerGeom()
    expect(moved.width, '拖移不改宽').toBe(440)
    expect(moved.left, '标题栏拖移 = 全窗平移（左 +60）').toBe(opened.left + 60)
    expect(moved.top, '标题栏拖移 = 全窗平移（顶 +30）').toBe(opened.top + 30)
    // 右缘拖宽（D21：对侧锚定——左缘不动；320–760 钳制沿袭）
    const handleBox = await drawerEl.locator('[data-dswf-td-resize="right"]').boundingBox()
    expect(handleBox, '右缘拖宽手柄在场').not.toBeNull()
    const rx = handleBox!.x + handleBox!.width / 2
    const ry = handleBox!.y + handleBox!.height / 2
    await page.mouse.move(rx, ry)
    await page.mouse.down()
    await page.mouse.move(rx + 120, ry, { steps: 4 })
    await page.mouse.up()
    const resized = await drawerGeom()
    expect(resized.width, '右缘拖宽 +120 → 560（限 320–760）').toBe(560)
    expect(resized.left, '对侧锚定：右缘拖宽左缘不动').toBe(moved.left)
    // ✕ 关闭 → 重开回默认起始位 + 默认简要（裁决 #3/#11：关闭不记忆位置/尺寸/展开态——几何与形态随壳卸载弃置）
    await page.locator('[data-dswf-td-close]').first().click()
    await expect(page.locator(TD_DRAWER)).toHaveCount(0)
    await page.locator(ttItemOf(idOf(ids, 2))).first().click()
    await expect(drawerEl, '重开弹窗在场（单例原位）').toBeVisible({ timeout: 15_000 })
    // 重开几何 = toHaveCSS 自动重试形态（mount 效应落定 inline left 前的首帧可见竞态——
    // paint 先于 effect，机械值断言等效应落定后同值收敛）
    await expect(drawerEl, '重开回默认宽 440（不记忆尺寸）').toHaveCSS('width', '440px')
    await expect(drawerEl, '重开回默认起始位·水平居中（不记忆位置）').toHaveCSS('left', `${defaultLeft}px`)
    await expect(drawerEl, '重开回默认起始位·14vh（不记忆位置）').toHaveCSS('top', `${defaultTop}px`)
    await expect(drawerEl, '重开回默认简要形态（D22 裁决 #11——不记忆展开态）').toHaveAttribute('data-dswf-td-form', 'brief')
    await expect(drawerEl.locator('[data-dswf-td-expand]'), '重开 ⤢ 未展开态').toHaveAttribute('aria-pressed', 'false')
    // Esc 关闭（D21：Esc 与 ✕ 双通道）
    await page.keyboard.press('Escape')
    await expect(page.locator(TD_DRAWER)).toHaveCount(0)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 概览走查·Step1 @500 首屏 ≤2s（UI 面——数据面计时归 sc2-perf）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-500-'))
  const wsDir = join(fixtureRoot, 'ws-ovr500')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-500-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'ovr-big'
    const { projectId, dir } = await setupWorld(page, wsDir, '概览压力演示', FEATURE)
    // @500 造数（七态轮转 + 创建时间递增——直插通道，sc2 同构）
    const statuses: readonly TaskStatus[] = ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected']
    seedTasks(dir, FEATURE, Array.from({ length: 500 }, (_, i) => ({
      localId: String(i + 1),
      title: `压力任务 ${i + 1}`,
      status: statuses[i % statuses.length] as TaskStatus,
      createdAt: new Date(Date.parse('2026-10-06T00:00:00.000Z') + i * 1000).toISOString(),
    })))

    // 首屏计时（UI 机械判据）：任务子 tab 开出 → 首行可见 ≤2s
    const t0 = Date.now()
    await openTasksTab(page)
    await expect(page.locator(ttItemOf('t-ovr-big-1')).first(), '首行呈现（首屏）').toBeVisible({ timeout: FIRST_SCREEN_BUDGET_MS + 10_000 })
    const elapsed = Date.now() - t0
    expect(elapsed, `首屏呈现 ≤2s（实测 ${elapsed}ms @500 任务）`).toBeLessThanOrEqual(FIRST_SCREEN_BUDGET_MS)
    // 读面全量直读（EQP 索引面 = sc2-perf 已钉；此处补数据量行为断言）
    const cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: FEATURE } })
    expect(cards, '全量 500 行直读（无截断）').toHaveLength(500)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 概览走查·Step2 feature 绑定切换：列表随绑定切换（直读无第二来源）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-fb-'))
  const wsDir = join(fixtureRoot, 'ws-ovr-fb')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-fb-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, '绑定切换演示')
    const projectId = project.id
    // 注册序 = 列表 created_at 降序的反面：后注册者最新、居列表头——activeFeatureSlug 缺省
    // 绑定最新活跃 feature（overview-model 单测钉死），故甲须后注册才能成为初始绑定
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'fb', title: '绑定乙' })
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'fa', title: '绑定甲' })
    const dir = (await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: wsDir })).dir
    const aIds = seedTasks(dir, 'fa', [{ localId: '1.1', title: '甲任务', status: 'pending' }])
    const bIds = seedTasks(dir, 'fb', [{ localId: '1.1', title: '乙任务', status: 'pending' }])

    await openTasksTab(page)
    await expect(page.locator(ttItemOf(idOf(aIds, 0))).first(), '初始绑定甲（最新活跃 feature 缺省绑定）').toBeVisible({ timeout: 30_000 })

    // 点开绑定 pill → Menu → 选乙（菜单行 = 容器复合键锚 [data-dswf-tt-mcont]——4.6 v22 双轨）
    await page.locator(ttContpillOf('feature', 'fa')).first().click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator('[data-dswf-tt-mcont="feature:fb"]').first().click()
    await expect(page.locator(ttContpillOf('feature', 'fb')).first(), '绑定切换为乙（activeFeatureSlug）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ttItemOf(idOf(bIds, 0))).first(), '列表切换为乙的任务集').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ttItemOf(idOf(aIds, 0))).first(), '甲任务行退场（绑定过滤）').toHaveCount(0)

    // 数据来源断言：读面单发 = 该 feature 任务集（服务端 core 过滤）
    const cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: 'fb' } })
    expect(cards.map((c) => c.taskId), '直读每工作区库（无第二来源）').toEqual(bIds)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 概览走查·Step2 中英双语搜索过滤（IME 稳定子树）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-srch-'))
  const wsDir = join(fixtureRoot, 'ws-ovr-srch')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-srch-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'ovr-srch'
    const { projectId, dir } = await setupWorld(page, wsDir, '双语搜索演示', FEATURE)
    const ids = seedTasks(dir, FEATURE, [
      { localId: '1.1', title: '修复登录 fix-login', status: 'pending' },
      { localId: '1.2', title: '文档撰写 doc-write', status: 'in_progress' },
      { localId: '1.3', title: '修复导出 fix-export', status: 'completed', records: ['claim', 'submit'] },
    ])

    await openTasksTab(page)
    const searchrow = page.locator('[data-dswf-ov-searchrow]').first()
    await expect(searchrow, '搜索行在场').toBeVisible({ timeout: 15_000 })
    const input = page.locator('.dswf-ov-search input')
    await expect(input).toBeVisible()

    // 拉丁关键词：服务端过滤（标题匹配）——仅 fix 系
    await input.fill('fix')
    await expect(page.locator(ttItemOf(idOf(ids, 1))).first(), '非命中行退场').toHaveCount(0)
    await expect(page.locator(ttItemOf(idOf(ids, 0))).first(), '命中行保留（fix-login）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ttItemOf(idOf(ids, 2))).first(), '命中行保留（fix-export）').toBeVisible()
    // IME 安全结构面：搜索行稳定子树（不随关键词重建——组合输入态承载面）
    await expect(page.locator('[data-dswf-ov-searchrow]'), '搜索行稳定子树（IME 判据锚——单实例不重建）').toHaveCount(1)

    // CJK 关键词：中文匹配
    await input.fill('修复')
    await expect(page.locator(ttItemOf(idOf(ids, 1))).first(), 'doc-write 不含中文关键词').toHaveCount(0)
    await expect(page.locator(ttItemOf(idOf(ids, 0))).first(), '修复登录 命中').toBeVisible({ timeout: 15_000 })

    // 清除（Esc/清除钮）→ 全量恢复
    await page.locator('[data-dswf-ov-searchclear]').first().click()
    for (const id of ids) {
      await expect(page.locator(ttItemOf(id)).first(), '清除后全量恢复').toBeVisible({ timeout: 15_000 })
    }

    // 服务端过滤断言（search 参数经 core——renderer 不自滤）
    const filtered = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: FEATURE }, search: 'fix' })
    expect(filtered.map((c) => c.taskId).sort(), '服务端过滤 = fix 系两行').toEqual([idOf(ids, 0), idOf(ids, 2)].sort())

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 概览走查·Step3 零计数 chip 禁用（不可触发过滤）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-chip-'))
  const wsDir = join(fixtureRoot, 'ws-ovr-chip')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-chip-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'ovr-chip'
    const { projectId, dir } = await setupWorld(page, wsDir, '零计数演示', FEATURE)
    // 仅两态在场（in_progress 计数 0——chips 断言基准）
    const ids = seedTasks(dir, FEATURE, [
      { localId: '1.1', title: '零计数·待办', status: 'pending' },
      { localId: '1.2', title: '零计数·已结', status: 'completed', records: ['claim', 'submit'] },
    ])

    // 计数单源：taskStats（七态 chips 计数同源）
    const stats = await refetchOnce<{ total: number; byStatus: Record<string, number> }>(page, TASKS_CHANNELS.stats, { projectId, source: { kind: 'feature', slug: FEATURE } })
    expect(stats.total, 'stats 总数 = 2').toBe(2)
    expect(stats.byStatus.in_progress, 'in_progress 计数 0（禁用基准）').toBe(0)

    await openTasksTab(page)
    const zeroChip = page.locator('[data-dswf-ov-stchip="in_progress"]')
    await expect(zeroChip, '零计数 chip 在场').toBeVisible({ timeout: 15_000 })
    await expect(zeroChip, 'chip disabled（禁用拦截交互）').toBeDisabled()
    // 非零 chip 照常可用：点 pending → 过滤生效
    await page.locator('[data-dswf-ov-stchip="pending"]').click()
    await expect(page.locator(ttItemOf(idOf(ids, 0))).first(), '非零 chip 过滤生效').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ttItemOf(idOf(ids, 1))).first(), 'completed 行被过滤').toHaveCount(0)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 概览走查·Step4 排序切换：全列表重排（活跃优先 ↔ 最新创建）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-sort-'))
  const wsDir = join(fixtureRoot, 'ws-ovr-sort')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-sort-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'ovr-sort'
    const { projectId, dir } = await setupWorld(page, wsDir, '排序演示', FEATURE)
    // 三态三时（活跃优先序 ≠ 创建序——重排可判）
    const ids = seedTasks(dir, FEATURE, [
      { localId: '1.1', title: '最早待办', status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' },
      { localId: '1.2', title: '居中阻塞', status: 'blocked', createdAt: '2026-10-02T00:00:00.000Z' },
      { localId: '1.3', title: '最晚已结', status: 'completed', createdAt: '2026-10-03T00:00:00.000Z', records: ['claim', 'submit'] },
    ])

    await openTasksTab(page)
    const sortPill = page.locator('[data-dswf-ov-sort]').first()
    await expect(sortPill, '排序 pill 在场').toBeVisible({ timeout: 15_000 })

    // 最新创建（created 降序）：最晚已结 → 居中阻塞 → 最早待办
    await sortPill.click()
    await expect(sortPill, '排序切换文案（最新创建）').toContainText('最新创建')
    // 重排 = 异步重拉——evaluateAll 无自动等待，先等组内序落位再取序（快照竞态防线）。
    // 列表呈现层 = 执行中(in_progress|blocked)前置组 + 其余组（task-tab-model 单测钉死）——
    // created 降序在「其余」组内呈现：1.3 → 1.1；服务端纯降序由读面断言（refetchOnce）钉死
    await expect(page.locator('[data-dswf-tt-item]').nth(1), '最新创建序就位（其余组首行 = 最晚已结）').toHaveAttribute('data-dswf-tt-item', idOf(ids, 2), { timeout: 15_000 })
    const createdOrder = await page.locator('[data-dswf-tt-item]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-dswf-tt-item')))
    expect(createdOrder, '最新创建序（呈现层分组：执行中[1.2] + 其余 created 降序[1.3, 1.1]）').toEqual([idOf(ids, 1), idOf(ids, 2), idOf(ids, 0)])

    // 活跃优先：in_progress → blocked → pending → … → completed（阻塞居前、已结殿后）
    await sortPill.click()
    await expect(sortPill, '排序切回文案（活跃优先）').toContainText('活跃优先')
    await expect(page.locator('[data-dswf-tt-item]').nth(1), '活跃优先序就位（其余组首行 = 最早待办）').toHaveAttribute('data-dswf-tt-item', idOf(ids, 0), { timeout: 15_000 })
    const activeOrder = await page.locator('[data-dswf-tt-item]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-dswf-tt-item')))
    expect(activeOrder, '活跃优先序（blocked > pending > completed）').toEqual([idOf(ids, 1), idOf(ids, 0), idOf(ids, 2)])

    // 服务端排序断言（sort 参数——三子 tab 共用同源）
    const byCreated = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: FEATURE }, sort: 'created' })
    expect(byCreated.map((c) => c.taskId), '读面 created 降序').toEqual([idOf(ids, 2), idOf(ids, 1), idOf(ids, 0)])
    const byActive = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: FEATURE }, sort: 'active' })
    expect(byActive.map((c) => c.taskId), '读面活跃优先').toEqual([idOf(ids, 1), idOf(ids, 0), idOf(ids, 2)])

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 概览走查·Step5 人工转移：对话框落库 + reason 入审计 + 即时反映', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-tr-'))
  const wsDir = join(fixtureRoot, 'ws-ovr-tr')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-tr-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'ovr-tr'
    const { projectId, dir } = await setupWorld(page, wsDir, '人工转移演示', FEATURE)
    const ids = seedTasks(dir, FEATURE, [{ localId: '1.1', title: '人工转移目标任务', status: 'pending' }])
    const taskId = idOf(ids, 0)

    await openTasksTab(page)
    await page.locator(ttItemOf(taskId)).first().click()
    await expect(page.locator(TD_DRAWER).first()).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-td-trans]').first().click()

    // 对话框在场 + from 只读呈现当前态
    const dialog = page.locator('[data-dswf-td-tr-dialog]').first()
    await expect(dialog, '转移对话框开（抽屉径）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dswf-td-tr-from]').first()).toContainText('待处理')

    // 选目标态（suspended——非终态）+ 填原因 + 确认
    await page.locator('[data-dswf-td-tr-to]').selectOption('suspended')
    const REASON = 'ovr Step5：人工挂起（演示原因）'
    await page.locator('[data-dswf-td-tr-reason]').fill(REASON)
    await page.locator('[data-dswf-td-tr-confirm]').first().click()
    await expect(page.locator('[data-dswf-td-tr-dialog]'), '确认后对话框收场').toHaveCount(0, { timeout: 15_000 })

    // 落库 + 审计（actor=ui + reason）+ 概览即时反映（单发重取即见）
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId })
    expect(detail.taskStatus, '转移落库 suspended').toBe('suspended')
    const db = openForgeDbAt(dir)
    try {
      const row = db.prepare<unknown[], { verb: string; actor: string; reason: string | null }>(
        `SELECT verb, actor, reason FROM task_records WHERE task_id = ? AND verb = 'transition'`,
      ).get(taskId)
      expect(row?.actor, '转移审计 actor = ui（人工通道）').toBe('ui')
      expect(row?.reason, 'reason 落审计列').toBe(REASON)
    } finally {
      db.close()
    }
    await expect(page.locator(ttItemOf(taskId)).first(), '概览行即时反映新状态（已挂起）').toContainText('已挂起', { timeout: 30_000 })

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 概览走查·Step5 空因拒绝：错误条留场可修正 + 零写入', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-rr-'))
  const wsDir = join(fixtureRoot, 'ws-ovr-rr')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-rr-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'ovr-rr'
    const { projectId, dir } = await setupWorld(page, wsDir, '空因拒绝演示', FEATURE)
    const ids = seedTasks(dir, FEATURE, [{ localId: '1.1', title: '空因拒绝目标任务', status: 'pending' }])
    const taskId = idOf(ids, 0)
    const db = openForgeDbAt(dir)
    const recordsBefore = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records`).get()?.n ?? 0
    db.close()

    await openTasksTab(page)
    await page.locator(ttItemOf(taskId)).first().click()
    await page.locator('[data-dswf-td-trans]').first().click()
    await page.locator('[data-dswf-td-tr-to]').selectOption('suspended')
    // reason 留空确认 → 前端校验拒绝
    await page.locator('[data-dswf-td-tr-confirm]').first().click()
    const errBar = page.locator('[data-dswf-td-tr-error]').first()
    await expect(errBar, '错误条在场（role=alert）').toBeVisible({ timeout: 15_000 })
    await expect(errBar, '错误文案（原因必填——填写后重试）').toContainText('原因必填')
    await expect(page.locator('[data-dswf-td-tr-dialog]').first(), '对话框留场（可修正）').toBeVisible()
    await expect(page.locator('[data-dswf-td-tr-to]').first(), '已选目标保留（可修正不丢输入）').toHaveValue('suspended')

    // 零写入：无转移审计行、状态不变
    const db2 = openForgeDbAt(dir)
    try {
      expect(db2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records`).get()?.n, '零审计行（输入面校验先于 RPC）').toBe(recordsBefore)
    } finally {
      db2.close()
    }
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId })
    expect(detail.taskStatus, '状态不变（仍 pending）').toBe('pending')

    // 修正后可提交（同对话框续走——留场可修正语义）
    await page.locator('[data-dswf-td-tr-reason]').fill('ovr Step5：补填原因后提交')
    await page.locator('[data-dswf-td-tr-confirm]').first().click()
    await expect(page.locator('[data-dswf-td-tr-dialog]'), '补填后确认成功收场').toHaveCount(0, { timeout: 15_000 })
    const detail2 = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId })
    expect(detail2.taskStatus, '修正后转移落库').toBe('suspended')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 概览走查·Step5 非法目标：选项集排除（所见即所得）+ 服务端先验兜底', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-it-'))
  const wsDir = join(fixtureRoot, 'ws-ovr-it')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-it-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'ovr-it'
    const { projectId, dir } = await setupWorld(page, wsDir, '非法目标演示', FEATURE)
    const ids = seedTasks(dir, FEATURE, [{ localId: '1.1', title: '非法目标目标任务', status: 'pending' }])
    const taskId = idOf(ids, 0)

    // 抽屉读侧：allowedTransitions 恒 props 下发（与服务端 transitionTargets 同源零漂移）
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId })
    expect(detail.allowedTransitions, '详情面携带允许目标集').not.toContain('pending')

    // 对话框选项集 = 允许集（当前态机械排除——用户点不到非法目标）
    await openTasksTab(page)
    await page.locator(ttItemOf(taskId)).first().click()
    await page.locator('[data-dswf-td-trans]').first().click()
    const options = await page.locator('[data-dswf-td-tr-to] option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
    expect(options, '选项不含当前态（from ≠ to）').not.toContain('pending')
    expect(options.every((v) => detail.allowedTransitions.includes(v as TaskStatus)), '选项 ⊆ 服务端允许集（同源）').toBe(true)
    await page.locator('[data-dswf-td-tr-cancel]').first().click()
    await expect(page.locator('[data-dswf-td-tr-dialog]')).toHaveCount(0)

    // 服务端先验兜底：RPC 直打目标 = 当前态 → ERR_INVALID_TRANSITION
    const rejection = await rejectMessage(forgeInvoke(page, TASKS_CHANNELS.transition, { projectId, taskId, toStatus: 'pending', reason: '同态转移（应拒）' }))
    expect(rejection, '服务端同一纯函数先验拒绝').toContain('非法任务转移')
    const detail2 = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId })
    expect(detail2.taskStatus, '状态零变更').toBe('pending')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 概览走查·Step5 终态转移触发恢复：blocked 后继 auto-restore（边保留）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-rs-'))
  const wsDir = join(fixtureRoot, 'ws-ovr-rs')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-rs-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'ovr-rs'
    const { projectId, dir } = await setupWorld(page, wsDir, '终态恢复演示', FEATURE)
    // 受控初态：W（blocked 后继）依赖 T（pending 待转移源）
    const ids = seedTasks(dir, FEATURE, [
      { localId: '2.1', title: '待转移源 T', status: 'pending' },
      { localId: '2.2', title: 'blocked 后继 W', status: 'blocked' },
    ])
    const tId = idOf(ids, 0)
    const wId = idOf(ids, 1)
    const db0 = openForgeDbAt(dir)
    db0.prepare(
      `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
       VALUES (?, ?, 'fix-chain', '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
    ).run(wId, tId)
    db0.close()

    // 对话框径：T → completed（终态）——终态提示在场 + 恢复钩子触发
    await openTasksTab(page)
    await page.locator(ttItemOf(tId)).first().click()
    await page.locator('[data-dswf-td-trans]').first().click()
    await page.locator('[data-dswf-td-tr-to]').selectOption('completed')
    await expect(page.locator('[data-dswf-td-tr-terminal]').first(), '终态提示在场（可能触发 autoRestore）').toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-td-tr-reason]').fill('ovr Step5：源完成（触发后继恢复）')
    await page.locator('[data-dswf-td-tr-confirm]').first().click()
    await expect(page.locator('[data-dswf-td-tr-dialog]')).toHaveCount(0, { timeout: 15_000 })

    // T 落 completed；W 恢复 pending（人工终态转移同挂恢复钩子——C3 同族）
    const tDetail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: tId })
    expect(tDetail.taskStatus, 'T 落目标态 completed').toBe('completed')
    const wDetail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: wId })
    expect(wDetail.taskStatus, 'W 由 blocked 转 pending（恢复钩子）').toBe('pending')
    const db = openForgeDbAt(dir)
    try {
      const restore = db.prepare<unknown[], { verb: string; actor: string }>(
        `SELECT verb, actor FROM task_records WHERE task_id = ? AND verb = 'auto-restore'`,
      ).get(wId)
      expect(restore, 'W 的 auto-restore 审计在场').toBeDefined()
      expect(restore?.actor, '恢复审计 actor = core').toBe('core')
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ? AND prerequisite_id = ?`,
      ).get(wId, tId)?.n, '依赖边保留不删（满足 = 读时派生）').toBe(1)
    } finally {
      db.close()
    }
    // 概览两行新状态即时可见
    await expect(page.locator(ttItemOf(tId)).first()).toContainText('已完成', { timeout: 30_000 })
    await expect(page.locator(ttItemOf(wId)).first()).toContainText('待处理', { timeout: 30_000 })

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 概览走查·Step6 eval 族条件区空态注记（不伪造评估数据）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-ev-'))
  const wsDir = join(fixtureRoot, 'ws-ovr-ev')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-ovr-ev-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'ovr-ev'
    const { projectId, dir } = await setupWorld(page, wsDir, 'eval 空态演示', FEATURE)
    const ids = seedTasks(dir, FEATURE, [
      { localId: '1.1', title: 'eval 族任务（契约评审）', status: 'pending', type: 'eval-contract' },
    ])
    const taskId = idOf(ids, 0)

    await openTasksTab(page)
    await page.locator(ttItemOf(taskId)).first().click()
    await expect(page.locator(TD_DRAWER).first()).toBeVisible({ timeout: 15_000 })
    // m3.1 D22：类型模板在完整形态——⤢ 展开后评估条件区可见（简要 = 概要四行零模板）
    await page.locator('[data-dswf-td-expand]').first().click()
    // 评估结果条件区呈空态注记（M2 无技能写入——在场但不伪造结构化数据）
    await expect(page.locator('[data-dswf-td-eval-empty]').first(), 'eval 空态注记在场').toBeVisible({ timeout: 15_000 })
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId })
    expect(detail.taskType, '任务类型 = eval-contract（条件区路由基准）').toBe('eval-contract')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});
