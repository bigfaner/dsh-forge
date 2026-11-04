// 3.8 M1 集成 e2e —— 知识视图填入（UF-6 浏览面挂载）+ UF-4 召回 tab 数据接线。
// 断言源 = 任务 3.8 AC（AC-1 知识视图浏览面/UF-5 回归、AC-3 抽屉跳转、AC-5 无召回空态）；
// 三方一致（AC-2：事件 ↔ tab ↔ 热度）与即时累积实机走查（AC-4：发送消息触发召回）的
// 数据面 = dogfood 链路（4.2，SMOKE-LEDGER §3 L497–L536 归属）——本套件承载结构/接线/
// 空态面 + 条件留痕的数据面（§5 前置缺口：host forge:knowledge/*·forge:projects/* 通道
// 未装配期，组二留痕 skip；UI 侧三方投影一致性由 recall-model 单测 pin）。
// 隔离：独立 userData + 端口分配器（e2e 单实例纪律，沿 smoke-skeleton.spec）；
// 载体面（launch/dismiss/close/桥导航/导航族）经 e2e/support（fix-37 ①）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { bridgeDispatch, closeApp, launchHost, stablePhase, type Launched } from '../support/launch.js'
import { dirRow, enterDir, fixtureDirSegments, pickerStartRoot } from '../support/navigation.js'
import { registerProject, selectWorkspaceViaChip, forgeInvoke } from '../support/rpc.js'
import {
  openKnowledgeDb,
  seedKnowledgeRegistryRow,
  writeKnowledgeBindingsOverlay,
} from '../support/knowledge-db.js'
import {
  KNOWLEDGE_ENTRY,
  KNOWLEDGE_VIEW,
  MAIN_CONVERSATION,
  RIGHTBAR_COLLAPSED,
  TABS_ROW,
  WORKBENCH,
  workbenchOfView,
} from '../support/anchors.js'

/** 组二知识夹具：{root}/demo-proj/.knowledge/{前端,后端}/…（条目内容源——A2 后供数预置
 *  走插件自持库（注册行 + 绑定叠层），此处文件仅剩 rebuild 扫描与详情按需读的内容身份） */
function makeKnowledgeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-kn-'))
  const kn = join(root, 'demo-proj', '.knowledge')
  mkdirSync(join(kn, '前端'), { recursive: true })
  mkdirSync(join(kn, '后端'), { recursive: true })
  writeFileSync(
    join(kn, '前端', 'deploy.md'),
    '---\nid: deploy-spec\ntitle: 部署规范\nsummary: 项目部署流程与上线检查单\nkeywords:\n  - 部署\n  - 上线\n---\n\n# 部署规范\n\n部署前核对回滚预案。\n',
    'utf8',
  )
  writeFileSync(
    join(kn, '后端', 'rollback.md'),
    '---\nid: rollback-manual\ntitle: 回滚手册\nsummary: 服务回滚步骤与注意事项\nkeywords:\n  - 回滚\n---\n\n# 回滚手册\n\n按版本逐级回滚。\n',
    'utf8',
  )
  return root
}

/**
 * host 数据通道探测（组二门）：forge:knowledge/listEntries + forge:projects/list 两面任一
 * 未注册（ipcRenderer invoke 拒绝 "No handler"）= 前置缺口在期 → 组二留痕 skip（§5 转正条件）。
 * 通道在场判定只认 "No handler" 拒绝面：域层 fail-loud 裸错（如 __probe__ 项目 id 未命中
 * projects 行——bare Error 不入信封、经 invoke 拒绝上抛）与 typed 信封 {ok:false} 都是通道
 * 在场的证明（4.2 转正实证：裸错曾被误读为缺口致组二恒 skip）。
 */
async function hostDataChannelsLive(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge
    if (forge === undefined) return false
    const arrived = async (channel: string, payload?: unknown): Promise<boolean> => {
      try {
        await forge.invoke(channel, payload)
        return true
      } catch (error) {
        return !String(error).includes('No handler')
      }
    }
    return (
      (await arrived('forge:projects/list')) &&
      (await arrived('forge:knowledge/listEntries', { projectId: '__probe__' }))
    )
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 组一：知识视图填入 + 召回 tab 接线（实机——无 host 数据通道亦可全绿：无项目锚 = 引导
// 空态、无会话锚 = 静态空态；UF-5 互换回归由 smoke-skeleton 组一承载，此处断 3.8 填入面）
// ─────────────────────────────────────────────────────────────────────────────
test('3.8·知识视图浏览面挂载 + 召回 tab 接线（无锚降级面）', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-kni-'))
  const { app, page, pageErrors } = await launchHost({ userData })
  try {
    const phase = await stablePhase(page)

    // AC-1：知识视图 = UF-6 浏览面装配壳（M0 占位已替换）；无项目锚 = 引导空态（确定性：
    // 零注册 ⟺ 无锚——host 通道在期亦然），壳结构位在场
    await page.locator(KNOWLEDGE_ENTRY).first().click()
    const knowledgeView = page.locator(KNOWLEDGE_VIEW).first()
    await expect(knowledgeView).toBeVisible()
    await expect(page.locator(workbenchOfView('knowledge')).first()).toBeAttached()
    // 无项目锚 = 引导空态（锚属性 none——浏览面不出场不拉取不炸壳）
    await expect(knowledgeView).toHaveAttribute('data-dswf-kn-anchor', 'none')
    await expect(page.locator(KNOWLEDGE_VIEW)).toContainText('尚未锚定项目')
    // UF-5 回归（不褪色）：知识模式右栏隐藏（fix-23 官方右栏 frame 锚——此处收起态进入）
    await expect(page.locator(RIGHTBAR_COLLAPSED).first()).toBeAttached()

    // UF-5 回归（不褪色）：切回会话视图 → 右栏恢复收起（知识视图让位结束）
    await bridgeDispatch(page, 'show-session')
    await expect(page.locator(workbenchOfView('session')).first()).toBeAttached()
    await expect(page.locator(KNOWLEDGE_VIEW).first()).toBeHidden()
    await expect(page.locator(RIGHTBAR_COLLAPSED).first()).toBeAttached()

    // 召回 tab 结构（fix-25 官方 roster）：本组无会话——官方页签行（conversation.session.header
    // 内）不渲染，召回视图不挂载（only:id 激活即挂载机制）；「无会话锚 = 静态空态」归
    // ConversationViews 单测 pin，真实会话召回链归 knowledge-recall-flywheel（dogfood）
    if (phase === 'session') {
      await expect(page.locator(TABS_ROW)).toHaveCount(0)
      await expect(page.locator('[data-dswf-pane="recall"]')).toHaveCount(0)
    }

    expect(pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 组二（条件留痕）：注册项目 + 真数据浏览面（卡片/抽屉）+ AC-5 无召回空态 + fix-bug 多项目
// 会话锚定回归（第二项目 + 主视图会话 → 知识锚跟随）——host 数据通道装配后转正（§5；
// 跳过门 = 两面通道探测拒绝）。三方一致（AC-2）与即时累积（AC-4）的
// 事件数据面归 dogfood（4.2）——召回 tab 真数据行/热度/跳转断言随其转正入池。
// 供数（fix-1 / 1.13 收口）：A2 后五通道供数 = knowledge 插件自持库 + 两级解析
//（projectId→wsPath 纯 config 静态注入（Q19）→ 自持注册行（进表径现仅种子迁移））
//——文件系统 .knowledge/ 夹具只余条目内容源身份（rebuild 扫描 + 详情按需读文件），
// 供数预置已迁插件自持库：双 boot 形态（boot1 向导注册取 uuid → 落注册行（ws_path 键）
// + 绑定叠层 → boot2 携叠层走查——projectId uuid 运行期产物，静态 config 须后置注入）。
// ─────────────────────────────────────────────────────────────────────────────
test('3.8·注册项目 → 知识浏览真数据 + 详情抽屉 + 无召回空态（前置 host 数据通道装配）', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-knix-'))
  const fixture = makeKnowledgeFixture()
  const demoWsDir = join(fixture, 'demo-proj')
  let overlayPath: string | undefined
  let app: Launched['app'] | undefined
  let demoProjectId: string | undefined
  try {
    // ── boot 1：向导注册 demo-proj（向导两段走查径保留——浏览器 → 表单默认值 → 确认）──
    const boot1 = await launchHost({ userData })
    try {
      // 前置门：host forge:projects/* + forge:knowledge/* 通道装配（core 插件入 profile +
      // main.ts 接线——独立 host 集成任务，SMOKE-LEDGER §5）。留痕跳过，不弱化断言。
      test.skip(
        !(await hostDataChannelsLive(boot1.page)),
        '前置缺口：host 侧 forge:projects/* 与 forge:knowledge/* 通道未装配（SMOKE-LEDGER §5 转正条件——组二随 host 集成任务落位自动转正）',
      )
      const page = boot1.page
      await page.locator('[data-dswf-nav="add-project"]').first().click()
      await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]')).toBeVisible()
      for (const segment of fixtureDirSegments(fixture, pickerStartRoot())) {
        await enterDir(page, segment)
      }
      await dirRow(page, 'demo-proj').click()
      await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
      await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()
      await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
      await expect(page.locator('.dswf-ap[data-dswf-ap="success"]')).toBeVisible({ timeout: 30_000 })
      await expect(page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
      await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
      // 取运行期 projectId（uuid——绑定叠层与注册行预置的数据源）
      const projects = await forgeInvoke<readonly { id: string; name: string }[]>(page, 'forge:projects/list')
      const demoRow = projects.find((p) => p.name === 'demo-proj')
      expect(demoRow, 'demo-proj 注册行在列（向导注册收敛）').toBeDefined()
      demoProjectId = demoRow!.id
    } finally {
      await closeApp(boot1.app)
    }

    // ── 预置（app 停机窗）：插件自持库注册行（ws_path 键）+ config.projects 绑定叠层 ──
    {
      const db = openKnowledgeDb(userData)
      try {
        seedKnowledgeRegistryRow(db, demoWsDir, join(demoWsDir, '.knowledge'))
      } finally {
        db.close()
      }
    }
    overlayPath = writeKnowledgeBindingsOverlay([{ wsPath: demoWsDir, projectId: demoProjectId! }])

    // ── boot 2：知识面走查（供数 = 插件自持库 + 静态绑定；复启形态 = 60s 相位探针） ──
    const launched = await launchHost({ userData, overlay: overlayPath, stablePhase: 'probe' })
    app = launched.app
    const page = launched.page

    // ── AC-1：知识视图 = 浏览面真数据（项目锚 = 唯一项目兜底；索引直读 → 卡片网格） ──
    await page.locator(KNOWLEDGE_ENTRY).first().click()
    const knowledgeView = page.locator(KNOWLEDGE_VIEW).first()
    await expect(knowledgeView).toBeVisible()
    // 锚非 none（唯一项目兜底——项目 id 运行期未知，断言取「非 none」语义）
    await expect
      .poll(async () => knowledgeView.getAttribute('data-dswf-kn-anchor'), { timeout: 30_000 })
      .not.toBe('none')
    await expect(page.locator('[data-dswf-kn-browse]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(2, { timeout: 30_000 })
    await expect(page.locator('[data-dswf-entry]', { hasText: '部署规范' }).first()).toBeVisible()

    // ── AC-3（浏览路径）：点卡片 → 详情抽屉滑入（摘要块在场）；Esc 关闭回网格 ──
    await page.locator('[data-dswf-entry]', { hasText: '部署规范' }).first().click()
    await expect(page.locator('[data-dswf-kn-drawer]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-kn-summary]').first()).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-dswf-kn-drawer]')).toHaveCount(0)

    // ── AC-5（fix-25 载体迁移）：本组至此无会话——官方页签行不渲染（session.header 会话作用域），
    // 「无召回会话 = 本会话暂无召回」空态归 ConversationViews 单测 pin；真实会话召回数据链
    // 归 knowledge-recall-flywheel（dogfood）——此处断官方会话面板恢复挂载
    await bridgeDispatch(page, 'show-session')
    await expect(page.locator(MAIN_CONVERSATION).first()).toBeVisible()
    await expect(page.locator(TABS_ROW)).toHaveCount(0)

    // ── fix-bug 多项目回归：注册第二项目（唯一项目兜底失效相位）+ 打开 demo-proj 会话
    //（composer 芯片选定其工作区 → 会话 retainedBy.mainView）→ 知识锚跟随主视图会话
    //（修复前：sessionId 恒 null → 两项目 anchor 恒 none =「尚未锚定项目」恒空态）──
    const secondRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-kn2-'))
    const secondDir = join(secondRoot, 'proj-b')
    mkdirSync(secondDir, { recursive: true })
    await registerProject(page, secondDir, 'proj-b')
    // 打开 demo-proj 会话（官方会话面新会话入口——工作区芯片同径）
    await selectWorkspaceViaChip(page, 'demo-proj')
    // 知识面板：锚 = 会话归属项目（两项目下非 none——多项目不再恒「尚未锚定项目」）
    await page.locator(KNOWLEDGE_ENTRY).first().click()
    const knowledgeView2 = page.locator(KNOWLEDGE_VIEW).first()
    await expect(knowledgeView2).toBeVisible()
    await expect
      .poll(async () => knowledgeView2.getAttribute('data-dswf-kn-anchor'), { timeout: 30_000 })
      .not.toBe('none')
    await expect(page.locator('[data-dswf-kn-browse]').first()).toBeVisible({ timeout: 30_000 })

    // ── fix-bug 范围切换控件（composer 同款）：范围 Pill 可点开项目菜单 → 拾取 proj-b
    // → 浏览锚切换（显式拾取优先；修复前 Pill = 纯文本不可点）──
    //（proj-b 运行期注册无静态绑定——切换后数据面按未绑定降级，此处只断锚切换与浏览壳在场）
    const anchorBefore = await knowledgeView2.getAttribute('data-dswf-kn-anchor')
    await page.locator('[data-dswf-kn-scope-trigger]').first().click()
    await expect(page.locator('[role="menu"]').first()).toBeVisible()
    await expect(page.locator('[role="menuitem"]', { hasText: 'demo-proj' }).first()).toBeVisible()
    await expect(page.locator('[role="menuitem"]', { hasText: 'proj-b' }).first()).toBeVisible()
    // 切换菜单 = 纯项目行（无「添加项目…」入口——添加径归 hero 弹层/左栏「＋」）
    await expect(page.locator('[role="menuitem"]', { hasText: '添加项目' })).toHaveCount(0)
    await page.locator('[role="menuitem"]', { hasText: 'proj-b' }).first().click()
    await expect
      .poll(async () => knowledgeView2.getAttribute('data-dswf-kn-anchor'), { timeout: 30_000 })
      .not.toBe(anchorBefore)
    await expect(page.locator('[data-dswf-kn-browse]').first()).toBeVisible({ timeout: 30_000 })
    rmSync(secondRoot, { recursive: true, force: true })
  } finally {
    if (app !== undefined) await closeApp(app)
    if (overlayPath !== undefined) rmSync(overlayPath, { force: true })
    rmSync(userData, { recursive: true, force: true })
    rmSync(fixture, { recursive: true, force: true })
  }
})
