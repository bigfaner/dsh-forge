// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// 5.3 SC-M3 门回放版（worker-exec-evidence-replay/fix-1——提案附录 B 层：agent 行为语义走
// 回放驱动器）。消费回放计划（DSH_FORGE_REPLAY_PLAN——本 spec 启动前按录制轮行为面落盘），
// 经 plugin-forge spawn 替换缝（index.ts 装配三级解析：override > 计划 > in-process）整替
// worker spawn：零真实模型调用，派发循环/dispatchTask 四分支应用链真实照跑——
//   ① halted：计划 abort 条目（spawn 成功 + worker 无结算死亡）→ 异常终止阶梯 ×4 →
//      worker-abort-over-limit 挂起投影（3b① 起裁决走 owner 对话面——问询卡退役）→
//      /stop-dag-tasks 人工停止收口 → 人工转移 → 会话 B 二轮（occurrence 5）；
//   ② spawned·success（1.1 复位后 + 1.2）；③ spawned·blocked（1.3 一轮 blocked →
//      blocked-ask-user 无进展硬停挂起 → harness 代理处置层建 fix-1（d5c272c6 起 worker
//      拒收 addTask——链派生权归主会话/循环处置层）→ 停止收口 → 会话 C：fix-1 成功 →
//      auto-restore → 1.3 二轮成功）；④ no-task（1.4 收官占位——harness
//      预领/结算，池快照判词收工）。
// 「模型」变量的回放代位（B 层边界——工具调用经 forge tool 真执行，工件/提交由计划动作
// fs-write/git-commit 确定性代位，'$commit' 哨兵把本轮提交哈希代进 submit 载荷）：
// 断言结构对齐 SC-M3 门（任务四件/audit 100%/logs 串联/零 manifest/SC3 只读纪律/UI 全景
// 一致逐条保留；模型面杂项——provider 注入/凭据播种——不在回放面）。
// 停止回执断言豁免（DOM 断言面）：循环停止回执走 host 单点证据（会话记录 command/done，
// 见 stopLoopWithRetry 注释）——官方 pinned chat-view 在「停止打断活跃流式轮」场景 DOM
// 事件泵自唤醒模型轮起冻结且跨重试窗不恢复（上游 bug 347531a8，fix-24 取证 2026-10-30：
// 事件落盘完整仅 DOM 缺席）；渲染层属官方包，AGENTS 1.1 改制红线禁改，正确性 host 单点
// 已保证（AGENTS 1.1）。
// proposal 域退役迁移（a4664ccb/plugin-spec 1.11——族④B 同批口径）：
//   · 立项链播种 = 受控初态直种（task-loop.db 域账单源 seedDogfoodTaskRowLoop）——
//     createProposal/提案 UI 评审成链随域退役；容器 = slug 化终态（task-loop addTask
//     零容器感知——「容器 slug 化终态·零 goal/spec 感知」），slug 即容器键直通派发；
//   · 派发入口 = composer `/run-dag-tasks <slug>` 指令面（command plane 直执行——旧概览
//     UF-3 派发按钮随 task-loop 概览接管退役）；
//   · 账本断言/受控初态 = task-loop.db 单源（openTaskLoopDbFull + readDogfoodAuditLoop
//     ——fix-8 族④B 批一/二同口径；submit 载荷自 task_settlements 就近投影）；
//   · UI 全景尾段 = task-loop 接管版概览锚（OV_TASK_PANEL + ovRowOf——旧子 tab/容器 pill/
//     派发按钮断言面随接管退役）。
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { OFFICIAL_STACK_GATE_NOTE, officialStackConverged } from '../../support/official-stack-gate.js'
import { FEATURES_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { runAllSourceAuditAnchors } from '../../support/audit/anchors.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { openOverviewDock } from '../../support/navigation.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { openTaskLoopDbFull } from '../../support/sqlite.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import {
  readDogfoodAuditLoop,
  seedDogfoodTaskRowLoop,
  type DogfoodAuditRecordLoop,
} from '../../support/replay/dogfood-record.js'
import { findFixtureSession, waitForSessionEvents } from '../../support/session-files.js'
import { awaitNoLateModals, newBlankSession } from '../../support/m3.js'
import { COMPOSER_INPUT, CONVERSATION_CONTENT, OV_TASK_PANEL, ovRowOf } from '../../support/anchors.js'
import { writeReplayPlan, type ReplayPlan } from '../../../plugins/task-loop/host/spawn/seam.js'
import { projectKeyOf } from '../../support/project-key.js'

const FEATURE = 'dsh-forge-m3.5-knowledge-consolidation'
const WS_NAME = 'm35-ws'
/** worker 无结算死亡的归因锚（事件夹 error.log 断言同源——产品结算核失败消息面） */
const ABORT_MESSAGE = 'worker run ended without a settlement (replay halt ladder)'

/**
 * 循环停止重试（fix-13 复跑实证——瞬态窗对策，非放宽断言）：blocked → triage 挂起投影 +
 * ⑩ followup 唤醒轮在途窗内，composer 发送可能不生效（发送键在途禁用）；轮内回执门
 * 原样保留，失败后重发 /stop-dag-tasks（幂等——重复停止零副作用）。
 * 回执断言面 = 会话记录 command/done（host 单点证据——原 DOM toContainText 豁免：官方
 * pinned chat-view 在「停止打断活跃流式轮」场景 DOM 事件泵自唤醒模型轮起冻结且跨重试窗
 * 不恢复，上游 bug 347531a8；fix-24 取证 2026-10-30——command/run → command/done「已停止
 * 任务源 …」4ms 落盘完整、仅 DOM 缺席；渲染层属官方包，AGENTS 1.1 改制红线禁改）。
 */
async function stopLoopWithRetry(
  page: import('@playwright/test').Page,
  dshHome: string,
  sessionId: string,
  rounds: number,
): Promise<void> {
  let lastCause: unknown
  for (let i = 0; i < rounds; i++) {
    try {
      const composer = page.locator(COMPOSER_INPUT).last()
      await expect(composer, 'owner 会话 composer 在场（挂起处置入口）').toBeVisible({ timeout: 30_000 })
      await composer.click()
      await composer.fill('/stop-dag-tasks')
      await page.keyboard.press('Enter')
      await waitForSessionEvents(
        dshHome,
        sessionId,
        (events) =>
          events.some(
            (e) => e.type === 'command/done' && (e.data?.text ?? '').includes('已停止任务源'),
          ),
        20_000,
      )
      return
    } catch (cause) {
      lastCause = cause
      await new Promise((resolve) => setTimeout(resolve, 5_000))
    }
  }
  throw lastCause
}

/** 官方 commands HTTP transport 打开面（fix-2 配方——loop-msg-consol-walk14/sidebar-loop-
 *  tri-state 同径）：boot manifest → 认证交换（303 + set-cookie）→ POST /api/commands/execute。
 *  composer 键入径在 blank 期斜杠菜单/焦点窗不稳定，transport 为现役回放面的派发入口。 */
async function openCommandTransport(page: import('@playwright/test').Page): Promise<{
  run(line: string, agentId: string): Promise<void>
}> {
  const manifest = (await page.evaluate(() => {
    const forge = (globalThis as unknown as { dshForge?: { getBootManifest(): Promise<{ url: string }> } }).dshForge
    if (forge === undefined) throw new Error('dshForge preload 面缺席')
    return forge.getBootManifest()
  })) as { url: string }
  const bootUrl = new URL(manifest.url)
  const boot = await fetch(manifest.url, { redirect: 'manual' })
  expect(boot.status, '官方认证交换（303 + set-cookie）').toBe(303)
  const cookie = (boot.headers.get('set-cookie') ?? '').split(';')[0]
  let rpcSeq = 0
  return {
    async run(line, agentId) {
      rpcSeq += 1
      const res = await fetch(`${bootUrl.origin}/api/commands/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie } as unknown as HeadersInit,
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `e2e-m35-replay-${rpcSeq}`,
          method: 'commands/execute',
          payload: { args: { agentId, line, submittedAttachments: [] } },
        }),
      })
      const body = await res.text()
      console.log(`[m35-replay] commands/execute（${line} agentId=${agentId}）→ ${res.status} ${body.slice(0, 200)}`)
      expect(res.status, `commands/execute HTTP 200（${line}；body=${body.slice(0, 300)}）`).toBe(200)
    },
  }
}

/** 活跃会话 commands/execute 派发（agentId = 侧栏会话行 id——walk14/sidebar-loop 同径） */
async function dispatchViaCommand(
  page: import('@playwright/test').Page,
  cmd: { run(line: string, agentId: string): Promise<void> },
  feature: string,
): Promise<void> {
  let agentId = await page.locator('[data-dswf-session]').first().getAttribute('data-dswf-session')
  if (agentId === null || agentId === '') {
    agentId = await page.locator(CONVERSATION_CONTENT).first().getAttribute('data-conversation-session')
  }
  expect(agentId, '活跃会话身份在场（commands/execute agentId）').toBeTruthy()
  // 会话行显式激活 + composer 活 agent 门（walk14 配方——命令派发前置）
  const row = page.locator(`[data-dswf-session="${String(agentId)}"]`).first()
  await row.click({ timeout: 15_000 }).catch(() => undefined)
  await expect(page.locator('[data-composer-input]').last(), '会话 composer 可用（活 agent）').toBeEnabled({ timeout: 30_000 })
  await cmd.run(`/run-dag-tasks ${feature}`, agentId as string)
}

/** 夹具工作区：git 仓 + 无害四门 justfile（与录制轮同形） */
function makeWalkthroughWorkspace(): string {
  const wsRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m35-ws-'))
  const ws = join(wsRoot, WS_NAME)
  mkdirSync(ws, { recursive: true })
  const justfile = [
    '# SC-M3 walkthrough fixture workspace — quality gates as honest no-ops',
    'set shell := ["powershell", "-NoProfile", "-Command"]',
    '',
    'compile:',
    '    @echo compile-ok',
    'fmt:',
    '    @echo fmt-ok',
    'lint:',
    '    @echo lint-ok',
    'unit-test:',
    '    @echo unit-test-ok',
    'test: unit-test',
    '',
  ].join('\n')
  writeFileSync(join(ws, 'justfile'), justfile, 'utf8')
  writeFileSync(join(ws, 'README.md'), '# SC-M3 walkthrough fixture workspace（M3.5 立项走查）\n', 'utf8')
  writeFileSync(join(ws, '.gitignore'), '.forge/\n', 'utf8')
  const git = (args: readonly string[]): void => {
    execFileSync('git', args, { cwd: ws, stdio: 'pipe' })
  }
  git(['init'])
  git(['config', 'user.email', 'walkthrough@example.invalid'])
  git(['config', 'user.name', 'm35-walkthrough'])
  git(['add', '.'])
  git(['commit', '-m', 'chore: SC-M3 walkthrough fixture base'])
  return wsRoot
}

/** 文件 sha-256（SC3 前后对照） */
function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** 递归枚举文件（跳过 .git） */
function walkFiles(root: string, out: string[] = [], dir = root): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(root, out, full)
    else out.push(full)
  }
  return out
}

/** logs/{slug}.jsonl 事件行读回 */
interface LogLine {
  readonly ts: number
  readonly sessionId: string
  readonly slug: string
  readonly type: string
  readonly payload: Record<string, unknown>
}

function readLogLines(file: string): LogLine[] {
  if (!existsSync(file)) return []
  const out: LogLine[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line === '') continue
    try {
      out.push(JSON.parse(line) as LogLine)
    } catch {
      // 坏行跳过（监听器读面 fail-soft 同形）
    }
  }
  return out
}

/** 回放计划装配（四分支行为面——与录制轮 worker 行为逐同构）
 *
 * 保持纪律（fix-13）：本计划与产品派发行为同步——fix-4 验收语义起 blocked 结算恒入
 * triage 阶梯，fix-7 起处置代理经同一 spawn 缝真实 spawn（label 后缀「 · 处置分析」
 * = 回放面独立计划键）。凡计划中含 blocked 结算条目，必须随附同 taskKey 的
 * 「 · 处置分析」条目回放其决策（output = 结构化决策 JSON）；漏配 = 回放键漂移
 * fail-loud（seam 拒绝面，见 seam.ts planKey 识别）。 */
function makeReplayPlan(ws: string): ReplayPlan {
  const submitCommon = { gate_compile: true, gate_fmt: true, gate_lint: true, gate_test: true }
  return {
    version: 1,
    workspaceDir: ws,
    entries: [
      // ① halted 靶（1.1 会话 A 连环 ×4——spawn 成功 + worker 无结算死亡）
      { taskKey: `${FEATURE}/1.1`, occurrence: 1, behavior: 'abort', message: ABORT_MESSAGE },
      { taskKey: `${FEATURE}/1.1`, occurrence: 2, behavior: 'abort', message: ABORT_MESSAGE },
      { taskKey: `${FEATURE}/1.1`, occurrence: 3, behavior: 'abort', message: ABORT_MESSAGE },
      { taskKey: `${FEATURE}/1.1`, occurrence: 4, behavior: 'abort', message: ABORT_MESSAGE },
      // ② 1.1 会话 B 复位二轮（occurrence 5）
      {
        taskKey: `${FEATURE}/1.1`, occurrence: 5, behavior: 'script',
        actions: [
          { kind: 'fs-write', relPath: 'docs/knowledge/domains-index.md', content: '# knowledge domains\nconventions\nbusiness-rules\n' },
          { kind: 'git-commit', message: 'docs(knowledge): domains-index 初稿（SC-M3 回放 1.1）', paths: ['docs/knowledge/domains-index.md'] },
          {
            kind: 'tool', name: 'submitTask',
            args: {
              slug: FEATURE, local_id: '1.1', result: 'success',
              summary: 'SC-M3 回放：domains-index.md 初稿落盘（知识域索引）',
              files: ['docs/knowledge/domains-index.md'], commit_hash: '$commit', ...submitCommon,
            },
          },
        ],
      },
      // ② 1.2 成功径
      {
        taskKey: `${FEATURE}/1.2`, occurrence: 1, behavior: 'script',
        actions: [
          { kind: 'fs-write', relPath: 'docs/knowledge/entry-template.md', content: '# entry template\nstatus: unconfirmed\n' },
          { kind: 'git-commit', message: 'docs(knowledge): entry-template（SC-M3 回放 1.2）', paths: ['docs/knowledge/entry-template.md'] },
          {
            kind: 'tool', name: 'submitTask',
            args: {
              slug: FEATURE, local_id: '1.2', result: 'success',
              summary: 'SC-M3 回放：entry-template.md 落盘（知识条目模板）',
              files: ['docs/knowledge/entry-template.md'], commit_hash: '$commit', ...submitCommon,
            },
          },
        ],
      },
      // ③ 1.3 一轮 blocked（纯结算——fix 链派生不在 worker 面：d5c272c6 起 worker 会话
      //    addTask 拒收，链由处置层 harness 代理建，见走查中段 1.3 阻塞处置轮；
      //    block_classification = T2 归类闸门契约（回放计划契约同步——录制面在 T2 落地前，
      //    blocked 结算缺归类即被 ERR_BLOCK_CLASSIFICATION_REQUIRED 拒绝）
      {
        taskKey: `${FEATURE}/1.3`, occurrence: 1, behavior: 'script',
        actions: [
          {
            kind: 'tool', name: 'submitTask',
            args: {
              slug: FEATURE, local_id: '1.3', result: 'blocked',
              reason: 'freshness-checklist.md absent — fix: create docs/knowledge/freshness-checklist.md containing the single line: marker',
              block_classification_kind: 'new-problem',
            },
          },
        ],
      },
      // ③ 1.3 blocked → triage 阶梯处置代理回放（fix-4 语义：blocked 恒入阶梯；fix-7：
      //    真实 spawn 经同一缝——独立键「 · 处置分析」，零动作 + output 承载决策）。
      //    决策 = escalate：与原无进展硬停挂起同终态——挂起投影后处置仍走 harness 代理
      //    addTask 建 fix-1 → /stop-dag-tasks 收口（走查中段流程零漂移）。
      {
        taskKey: `${FEATURE}/1.3 · 处置分析`, occurrence: 1, behavior: 'script',
        actions: [],
        output: '1.3 受阻成因明确（工件缺席、可机械修复），交由处置层按 fix 链协议派生修复任务。\n{"action":"escalate"}',
      },
      // ③ fix-1 修复完成
      {
        taskKey: `${FEATURE}/fix-1`, occurrence: 1, behavior: 'script',
        actions: [
          { kind: 'fs-write', relPath: 'docs/knowledge/freshness-checklist.md', content: 'marker\n' },
          { kind: 'git-commit', message: 'docs(knowledge): freshness-checklist（SC-M3 回放 fix-1）', paths: ['docs/knowledge/freshness-checklist.md'] },
          {
            kind: 'tool', name: 'submitTask',
            args: {
              slug: FEATURE, local_id: 'fix-1', result: 'success',
              summary: 'SC-M3 回放：freshness-checklist.md 创建（含 marker）',
              files: ['docs/knowledge/freshness-checklist.md'], commit_hash: '$commit', ...submitCommon,
            },
          },
        ],
      },
      // ③ 1.3 二轮成功（auto-restore 后）
      {
        taskKey: `${FEATURE}/1.3`, occurrence: 2, behavior: 'script',
        actions: [
          {
            kind: 'tool', name: 'submitTask',
            args: {
              slug: FEATURE, local_id: '1.3', result: 'success',
              summary: 'SC-M3 回放：freshness-checklist.md 在场核验（含 marker）',
              files: ['docs/knowledge/freshness-checklist.md'], commit_hash: '$commit', ...submitCommon,
            },
          },
        ],
      },
      // ④ 1.4 = harness 预领/结算（零计划条目——dispatcher 对他会话 in_progress 盲选不可见，
      //    其余全终态后必命中 no-task；误 spawn = 计划键漂移拒绝面 fail-loud）
    ],
  }
}

test('@web-e2e @m3 5.3 SC-M3 门回放版：spawn 缝回放驱动器消费（四分支链断言保留）——零真实模型', async () => {
  // 族① gate-environment（plugin-spec/fix-7，bug eb786e62）：官方 0.2.2 世代 web 栈收敛前
  // 挂环境前提门控（skip 留痕非红；整代 co-upgrade 落地后自动复跑）——派发/领取链经 GUI
  // 会话承载，conversation.view 槽位原生崩溃使会话运行时降级（claims 收敛超时）。
  test.skip(!officialStackConverged(), OFFICIAL_STACK_GATE_NOTE)
  test.setTimeout(900_000)
  const startedAt = Date.now()
  const wsRoot = makeWalkthroughWorkspace()
  const ws = join(wsRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m35-ud-'))
  const dshHome = join(userData, 'dsh-home')
  const planPath = join(userData, 'replay-plan.json')
  writeReplayPlan(planPath, makeReplayPlan(ws))
  let launched: Launched | undefined
  let keepEvidence = false
  try {
    launched = await launchHost({
      userData,
      env: { DSH_FORGE_TEST_BRIDGE: '1', DSH_FORGE_REPLAY_PLAN: planPath },
      timeouts: { firstWindow: 120_000, bootReady: 180_000, loaderLive: 120_000, workbenchVisible: 120_000 },
    })
    const page = launched.page
    const driver = createBridgeDriver(launched.app)
    const proc = launched.app.process()
    proc.once('exit', (code, signal) => {
      console.error(`[m35-replay] 宿主进程退出：code=${String(code)} signal=${String(signal)} +${Math.round((Date.now() - startedAt) / 1000)}s`)
    })
    page.on('crash', () => {
      console.error(`[m35-replay] 渲染进程崩溃 +${Math.round((Date.now() - startedAt) / 1000)}s`)
    })

    // ── 底座：注册（清洁夹具——发现面零吸收）+ 项目键 + 任务库目录（logs 对账锚）──
    const project = await registerProject(page, ws, WS_NAME)
    const projectId = project.id
    const projectKey = projectKeyOf(ws)
    const dir = (
      await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: ws })
    ).dir

    // ── 会话物化前置（fix-3）：侧栏空态「新会话」钮物化 blank 会话并等转录绑定──
    // 官方右栏展开钮以会话为承载（dsh-client-ui-sidebar-right ExpandButton 按
    // bySession[sessionId] 渲染——「暂无会话」空白头恒缺席，bug cb695d4d/850d6a1c 链）。
    await page.getByText('新会话', { exact: true }).first().click({ timeout: 30_000 })
    await expect(
      page.locator(CONVERSATION_CONTENT).first(),
      'blank 会话物化（转录绑上会话）',
    ).toHaveAttribute('data-conversation-session', /.+/, { timeout: 30_000 })

    // ── 规格文档两篇（upsertDoc RPC——features 域在役面）+ 任务四件受控初态直种
    //    （task-loop.db 域账单源——proposal 域退役后容器 = slug 化终态，slug 直通派发）──
    // 登记序纪律：register 显式建 feature 行 → upsertDoc 逐篇登记（存储相位经登记即推进
    // 单调 prd → design）→ 最后落盘文件。先落盘会被发现面吸收（docKinds 全量在册而存储
    // 相位未推进 = 相位派生不变量「存储 ≡ 推导」漂移拒绝）。
    const docPrd = `docs/features/${FEATURE}/prd/prd-spec.md`
    const docDesign = `docs/features/${FEATURE}/design/tech-design.md`
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: 'dsh-forge M3.5 知识沉淀与保鲜（进气端 + 保鲜端）' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, {
      projectId, featureSlug: FEATURE, docKind: 'prd-spec', relPath: docPrd, summary: 'M3.5 PRD（走查初稿）',
    })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, {
      projectId, featureSlug: FEATURE, docKind: 'tech-design', relPath: docDesign, summary: 'M3.5 技术设计（走查初稿）',
    })
    mkdirSync(join(ws, '.forge', 'docs', 'features', FEATURE, 'prd'), { recursive: true })
    mkdirSync(join(ws, '.forge', 'docs', 'features', FEATURE, 'design'), { recursive: true })
    writeFileSync(
      join(ws, '.forge', docPrd),
      '---\ntitle: M3.5 PRD（走查初稿）\nstatus: Draft\n---\n\n# M3.5 知识沉淀 PRD（SC-M3 走查立项初稿）\n',
      'utf8',
    )
    writeFileSync(
      join(ws, '.forge', docDesign),
      '---\ntitle: M3.5 技术设计（走查初稿）\nstatus: Draft\n---\n\n# M3.5 知识沉淀技术设计（SC-M3 走查立项初稿）\n',
      'utf8',
    )
    let task11Id = ''
    {
      const db = openTaskLoopDbFull(userData)
      try {
        task11Id = seedDogfoodTaskRowLoop(db, projectKey, FEATURE, '1.1', {
          title: '创建 docs/knowledge/domains-index.md（知识域索引初稿）并提交',
          taskType: 'doc',
          priority: 'P0',
          taskDesc: [
            '步骤：1) 在工作区根的 docs/knowledge/ 目录下创建 domains-index.md，内容恰好三行：# knowledge domains、conventions、business-rules',
            '2) 依次运行 just compile、just fmt、just lint、just unit-test（应全部通过）',
            '3) 用 git 提交该文件（Conventional Commits）',
            '4) submitTask result=success：summary 简述、files=["docs/knowledge/domains-index.md"]、gate_compile/fmt/lint/test 四布尔全 true、commit_hash 填提交哈希',
          ].join('\n'),
        })
        seedDogfoodTaskRowLoop(db, projectKey, FEATURE, '1.2', {
          title: '创建 docs/knowledge/entry-template.md（知识条目模板）并提交',
          taskType: 'doc',
          priority: 'P1',
          taskDesc: [
            '步骤：1) 在工作区根的 docs/knowledge/ 目录下创建 entry-template.md，内容恰好两行：# entry template、status: unconfirmed',
            '2) 依次运行 just compile、just fmt、just lint、just unit-test（应全部通过）',
            '3) 用 git 提交该文件（Conventional Commits）',
            '4) submitTask result=success：summary 简述、files=["docs/knowledge/entry-template.md"]、gate_compile/fmt/lint/test 四布尔全 true、commit_hash 填提交哈希',
          ].join('\n'),
        })
        seedDogfoodTaskRowLoop(db, projectKey, FEATURE, '1.3', {
          title: '确保 docs/knowledge/freshness-checklist.md 存在且含一行 marker（缺席时受阻走 fix 链）',
          taskType: 'doc',
          priority: 'P2',
          taskDesc: [
            `目标：docs/knowledge/freshness-checklist.md 在场且内容含一行 marker。`,
            '1) 若该文件不存在：不要创建它。直接 submitTask result=blocked，reason 填「freshness-checklist.md absent — fix: create docs/knowledge/freshness-checklist.md containing the single line: marker」。等待处置层按 fix 链协议派生修复任务。',
            '2) 若该文件已存在：确保其中含一行 marker（无则追加），跑四门（just compile/fmt/lint/unit-test），git 提交，submitTask result=success（files=["docs/knowledge/freshness-checklist.md"]、四门布尔、commit_hash）。',
          ].join('\n'),
        })
        seedDogfoodTaskRowLoop(db, projectKey, FEATURE, '1.4', {
          title: '收官占位（harness 预领——no-task 收工信号驱动）',
          taskType: 'doc',
          taskDesc: '占位任务——由测试 harness 领取与结算，执行器无需处理。',
        })
      } finally {
        db.close()
      }
    }

    // ── SC3 前置快照 + 1.4 收官占位预领 ──
    const presetFiles = [
      join(ws, 'justfile'),
      join(ws, 'README.md'),
      join(ws, '.gitignore'),
      join(ws, '.forge', docPrd),
      join(ws, '.forge', docDesign),
    ]
    const hashBefore = new Map(presetFiles.map((f) => [f, hashFile(f)]))
    await driver.call('forgeTasks', 'claimTask', {
      projectKey,
      taskRef: { slug: FEATURE, localId: '1.4' },
      sessionId: 'e2e-harness',
    })

    // ── SC2/SC7 源码面回归 ──
    const findings = runAllSourceAuditAnchors()
    expect(
      findings,
      `总纲 SC2/SC7 源码面回归零残留：\n${findings.map((f) => `${f.anchor}: ${f.detail}`).join('\n')}`,
    ).toEqual([])

    // ── 派发会话 A（commands/execute transport——真实 dispatchTask 循环）→ 回放 abort 阶梯 → halted ──
    const cmd = await openCommandTransport(page)
    await dispatchViaCommand(page, cmd, FEATURE)
    const sessionA = findFixtureSession(dshHome, WS_NAME)
    const sessionAId = sessionA?.sessionId
    expect(sessionAId, '派发会话 A 落盘开户').toBeDefined()

    // ── halted 收敛轮询：1.1 claim 计 ≥3 + 全库零 submit + 宿主存活（task-loop.db 域账直读）──
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    const dbStats = (): { statuses: Map<string, string>; claims11: number; submits: number } => {
      const db = openTaskLoopDbFull(userData)
      try {
        const rows = db.prepare<unknown[], { local_id: string; task_status: string }>(
          'SELECT local_id, task_status FROM task_tasks',
        ).all()
        const claims11 = (
          db
            .prepare<unknown[], { n: number }>(
              `SELECT COUNT(*) AS n FROM task_records r JOIN task_tasks t ON t.id = r.task_id
               WHERE t.local_id = '1.1' AND r.verb = 'claim'`,
            )
            .get() as { n: number }
        ).n
        const submits = (
          db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records WHERE verb = 'submit'`).get() as {
            n: number
          }
        ).n
        return { statuses: new Map(rows.map((r) => [r.local_id, r.task_status])), claims11, submits }
      } finally {
        db.close()
      }
    }
    let lastLog = 0
    const haltDeadline = Date.now() + Number(process.env.DSH_FORGE_DOGFOOD_HALT_MS ?? 120_000)
    for (;;) {
      const s = dbStats()
      if (Date.now() - lastLog > 30_000) {
        lastLog = Date.now()
        console.log(`[m35-replay] halt 阶段 +${Math.round((Date.now() - startedAt) / 1000)}s claims11=${s.claims11} submits=${s.submits} statuses=${JSON.stringify([...s.statuses.entries()])} appExit=${String(proc.exitCode)}`)
      }
      if (proc.exitCode !== null) throw new Error(`宿主进程提前退出：code=${String(proc.exitCode)}`)
      if (s.claims11 >= 3) break
      if (Date.now() > haltDeadline) {
        throw new Error(`halted 收敛超时：claims11=${s.claims11} statuses=${JSON.stringify([...s.statuses.entries()])}`)
      }
      await sleep(2_000)
    }
    await sleep(5_000) // 阶梯 ×4 终局 + 裁决问询挂出静置
    {
      const s = dbStats()
      expect(s.statuses.get('1.1'), 'halted 形态：1.1 留 in_progress（幂等重入径——不走 submit-blocked）').toBe('in_progress')
      expect(s.statuses.get('1.2'), '1.2 未被触碰（盲选重入本会话 in_progress）').toBe('pending')
      expect(s.statuses.get('1.3'), '1.3 未被触碰').toBe('pending')
      expect(s.submits, 'halted 阶段全库零 submit').toBe(0)
      expect(s.claims11, '1.1 连环重入 claim 计 ≥3（worker 异常终止阶梯）').toBeGreaterThanOrEqual(3)
      console.log(`[m35-replay] halted 收敛 +${Math.round((Date.now() - startedAt) / 1000)}s（claims11=${s.claims11}）`)
    }

    // ── 挂起投影 + 人工停止收口（worker-abort-over-limit 第三层）──
    // 595eaab7（3b① 挂起改造）起裁决改经 owner 对话面（P3 挂起投影），不再挂 userQuestions
    // 问询卡。挂起机械信号 = 阶梯冻结：1.1 claim 计钉在 4（零第 5 次重入）+
    // 全库零 submit + 1.1 保持 in_progress；处置走挂起回执指引的「停止」径——/stop-dag-tasks
    // （UI command plane 直执行，零模型依赖）终止循环 → 登记表删除 → 独占释放。
    const freezeDeadline = Date.now() + 30_000
    for (;;) {
      const s = dbStats()
      if (s.claims11 >= 4) break
      if (Date.now() > freezeDeadline) {
        throw new Error(`挂起冻结超时：claims11=${s.claims11} statuses=${JSON.stringify([...s.statuses.entries()])}`)
      }
      await sleep(2_000)
    }
    await sleep(3_000) // 静置——第 5 次重入若发生即非挂起（冻结判据反证窗）
    {
      const s = dbStats()
      expect(s.claims11, '挂起冻结：1.1 claim 计 = 4（阶梯 ×4 终局——零第 5 次重入）').toBe(4)
      expect(s.submits, '挂起阶段全库零 submit').toBe(0)
      expect(s.statuses.get('1.1'), '挂起保持：1.1 留 in_progress').toBe('in_progress')
      console.log(`[m35-replay] 挂起投影 +${Math.round((Date.now() - startedAt) / 1000)}s（claims11=${s.claims11}）`)
    }
    // 挂起处置走 stopLoopWithRetry（fix-17 复跑实证——挂起唤醒轮在途窗内模型回合持锁，
    // composer 发送键在途禁用；轮内回执门原样保留，失败重发 /stop-dag-tasks 幂等）
    await stopLoopWithRetry(page, dshHome, sessionAId as string, 4)

    // ── halted 阶日志面：worker 异常终止阶梯证据（taskHome = deriveTaskStoreDir 单源派生）──
    const logFile = join(dir, 'logs', `${FEATURE}.jsonl`)
    const haltLines = readLogLines(logFile)
    const incidentRoot = join(dir, 'logs', FEATURE, '1.1')
    const abortDirs = existsSync(incidentRoot) ? readdirSync(incidentRoot).filter((n) => /^\d{3}-worker-aborted$/.test(n)) : []
    expect(abortDirs.length, 'logs worker-aborted 事件夹 ×≥3（异常终止阶梯证据）').toBeGreaterThanOrEqual(3)
    for (const d of abortDirs) {
      expect(
        readFileSync(join(incidentRoot, d, 'error.log'), 'utf8'),
        `worker-aborted 证据含失败归因（${d}）`,
      ).toContain('worker run ended without a settlement')
    }
    const claimEvents = haltLines.filter((l) => l.type === 'task-claimed' && (l.payload.taskKey as string) === `${FEATURE}/1.1`)
    const spawnedEvents = haltLines.filter((l) => l.type === 'task-spawned' && (l.payload.taskKey as string) === `${FEATURE}/1.1`)
    expect(claimEvents.length, 'logs task-claimed（1.1 连环重入）×≥3').toBeGreaterThanOrEqual(3)
    expect(spawnedEvents.length, 'logs task-spawned ×≥3（spawn 成功——失败类在 worker 执行）').toBeGreaterThanOrEqual(3)
    const foreignToolErrors = haltLines.filter(
      (l) => l.type === 'tool-error' && !String((l.payload as { message?: string }).message ?? '').includes('owned by an active dispatch loop'),
    )
    expect(
      foreignToolErrors.map((l) => (l.payload as { code?: string }).code),
      'halted 阶段零非独占拒绝 tool-error（异常终止非 spawn 机制故障）',
    ).toEqual([])

    // ── 复位：人工转移（in_progress → pending——人类面 transition 通道） ──
    await forgeInvoke(page, TASKS_CHANNELS.transition, {
      projectId, taskId: task11Id, toStatus: 'pending',
      reason: 'SC-M3 回放走查：halted 复位——人工转移后新会话重派',
    })
    {
      const db = openTaskLoopDbFull(userData)
      try {
        const row = db
          .prepare<unknown[], { task_status: string }>('SELECT task_status FROM task_tasks WHERE id = ?')
          .get(task11Id)
        expect(row?.task_status, '人工转移落账：1.1 → pending').toBe('pending')
        const tr = db
          .prepare<unknown[], { verb: string; actor: string; from_status: string }>(
            'SELECT verb, actor, from_status FROM task_records WHERE task_id = ? AND verb = ?',
          )
          .get(task11Id, 'transition') as { verb: string; actor: string; from_status: string } | undefined
        expect(tr, 'transition 记录在场').toBeDefined()
        expect(tr?.actor, 'actor = ui（人类面通道推断）').toBe('ui')
        expect(tr?.from_status, 'from = in_progress').toBe('in_progress')
      } finally {
        db.close()
      }
    }

    // ── 派发会话 B（冷启动计数器复位——新会话径 + composer 指令面） ──
    await newBlankSession(page)
    await expect(
      page.locator(CONVERSATION_CONTENT).first(),
      '会话 B 物化（转录绑上会话）',
    ).toHaveAttribute('data-conversation-session', /.+/, { timeout: 30_000 })
    await dispatchViaCommand(page, cmd, FEATURE)
    await awaitNoLateModals(page)

    // ── 1.3 阻塞处置轮（3b② 无进展硬停挂起 + d5c272c6 派生权收归处置层——harness 代理）──
    // B 轮领序：1.1（P0）成功 → 1.3 blocked 结算（零 commit/files）→ blocked-ask-user 挂起。
    // 处置 = harness 代理处置层单事务建 fix 链（blockSource：fix-1 行 + fix-chain 边 + 源
    // auto-block）→ 挂起收口走「停止」径（owner 会话 /stop-dag-tasks——同 ① 径）→ 会话 C
    // 新开循环领 fix-1（fix 优先键）→ auto-restore → 1.3 二轮成功。
    const blockedDeadline = Date.now() + 120_000
    for (;;) {
      const s = dbStats()
      if (s.statuses.get('1.1') === 'completed' && s.statuses.get('1.3') === 'blocked') break
      if (proc.exitCode !== null) throw new Error(`宿主进程提前退出：code=${String(proc.exitCode)}`)
      if (Date.now() > blockedDeadline) {
        throw new Error(`1.3 一轮受阻收敛超时：statuses=${JSON.stringify([...s.statuses.entries()])}`)
      }
      await sleep(2_000)
    }
    console.log(`[m35-replay] 1.3 一轮受阻 +${Math.round((Date.now() - startedAt) / 1000)}s（1.1 completed / 1.3 blocked）`)
    await driver.call('forgeTasks', 'addTask', {
      projectKey,
      slug: FEATURE,
      title: 'Fix: create freshness-checklist.md',
      type: 'doc',
      sourceTask: { slug: FEATURE, localId: '1.3' },
      blockSource: true,
      brief: 'freshness-checklist.md 缺席（SC-M3 回放 1.3 一轮受阻）——创建之并含一行 marker。',
    })
    // 会话 B 定位（新会话径——排除会话 A 同 id 碰撞的 mtime 抖动窗；B 创建即新开户，
    // findFixtureSession 取最新且 ≠ A 才认）
    let sessionBId: string | undefined
    for (let i = 0; i < 15 && sessionBId === undefined; i++) {
      const s = findFixtureSession(dshHome, WS_NAME)
      if (s !== undefined && s.sessionId !== sessionAId) sessionBId = s.sessionId
      else await sleep(2_000)
    }
    expect(sessionBId, '派发会话 B 落盘开户（新会话）').toBeDefined()
    await stopLoopWithRetry(page, dshHome, sessionBId as string, 4)

    // ── 派发会话 C（fix 链执行轮——fix-1 → auto-restore → 1.3 二轮）──
    await newBlankSession(page)
    await expect(
      page.locator(CONVERSATION_CONTENT).first(),
      '会话 C 物化（转录绑上会话）',
    ).toHaveAttribute('data-conversation-session', /.+/, { timeout: 30_000 })
    await dispatchViaCommand(page, cmd, FEATURE)
    await awaitNoLateModals(page)

    // ── 全任务终态轮询 + 1.4 收官结算介入（事件门控同原版） ──
    let closerSettled = false
    let othersTerminalSince = 0
    const settleDeadline = Date.now() + Number(process.env.DSH_FORGE_DOGFOOD_DEADLINE_MS ?? 300_000)
    const noReadySeen = (): boolean =>
      [...readLogLines(logFile), ...readLogLines(join(dir, 'logs', '_pool.jsonl'))].some(
        (l) => l.type === 'no-ready-task',
      )
    for (;;) {
      const s = dbStats()
      if (Date.now() - lastLog > 30_000) {
        lastLog = Date.now()
        console.log(`[m35-replay] 派发中 +${Math.round((Date.now() - startedAt) / 1000)}s statuses=${JSON.stringify([...s.statuses.entries()])} appExit=${String(proc.exitCode)}`)
      }
      if (proc.exitCode !== null) throw new Error(`宿主进程提前退出：code=${String(proc.exitCode)}`)
      const othersTerminal =
        s.statuses.get('1.4') === 'in_progress' &&
        [...s.statuses.entries()].every(([id, st]) => id === '1.4' || st === 'completed' || st === 'skipped')
      if (othersTerminal && othersTerminalSince === 0) othersTerminalSince = Date.now()
      if (!closerSettled && othersTerminal && (noReadySeen() || Date.now() - othersTerminalSince > 90_000)) {
        await driver.call('forgeTasks', 'submitTask', {
          projectKey,
          taskRef: { slug: FEATURE, localId: '1.4' },
          result: 'success',
          summary: 'harness 收官结算 1.4（no-task 收工信号驱动——双 dispatcher 防线占位）',
          sessionId: 'e2e-harness',
        })
        closerSettled = true
        console.log(`[m35-replay] harness 收官结算 1.4 完成（事件门控=${noReadySeen() ? 'no-ready-task 已见' : '90s 兜底'}）`)
      }
      const unsettled = [...s.statuses.entries()].filter(([, st]) => st !== 'completed' && st !== 'skipped')
      if (unsettled.length === 0) break
      if (Date.now() > settleDeadline) {
        throw new Error(`走查终态超时：statuses=${JSON.stringify([...s.statuses.entries()])}`)
      }
      await sleep(2_000)
    }
    console.log(`[m35-replay] 全任务终态收敛 +${Math.round((Date.now() - startedAt) / 1000)}s`)

    // ── no-task 收工等待 ──
    {
      const noReadyDeadline = Date.now() + 60_000
      for (;;) {
        const l1 = readLogLines(logFile)
        const l2 = readLogLines(join(dir, 'logs', '_pool.jsonl'))
        if ([...l1, ...l2].some((l) => l.type === 'no-ready-task')) {
          console.log(`[m35-replay] no-ready-task 事件在场（dispatcher 末轮收口）+${Math.round((Date.now() - startedAt) / 1000)}s`)
          break
        }
        if (Date.now() > noReadyDeadline) break
        await sleep(2_000)
      }
    }

    // ── 转录尾部留痕（诊断面——审计与 db 为断言真相） ──
    const transcriptTail =
      (await page
        .locator(CONVERSATION_CONTENT)
        .first()
        .textContent({ timeout: 10_000 })
        .catch(() => '<renderer-unavailable>')) ?? ''
    console.log('[m35-replay] 会话 C 转录尾部：', transcriptTail.slice(-500))
    test.info().annotations.push({ type: 'm35-transcript-tail', description: transcriptTail.slice(-1200) })

    // ── AC1 断言面：任务/执行记录 100% 入 task-loop.db 域账（rowid 升序 = 追加序真相；
    //    submit 载荷自 task_settlements 最新结算行就近投影——v1 列面） ──
    const db = openTaskLoopDbFull(userData)
    let audit: ReturnType<typeof readDogfoodAuditLoop>
    let statusOf: ReadonlyMap<string, string>
    try {
      audit = readDogfoodAuditLoop(db)
      statusOf = new Map(
        db
          .prepare<unknown[], { local_id: string; task_status: string }>('SELECT local_id, task_status FROM task_tasks')
          .all()
          .map((r) => [r.local_id, r.task_status]),
      )
    } finally {
      db.close()
    }
    const { tasks, edges, records } = audit
    const taskByLocal = (localId: string) => {
      const row = tasks.find((t) => t.localId === localId)
      expect(row, `任务行在场：${localId}`).toBeDefined()
      return row!
    }
    const recsOf = (localId: string): readonly DogfoodAuditRecordLoop[] => records.filter((r) => r.localId === localId)
    expect(tasks.length, '任务全量 = 四件 + fix 一件').toBe(5)
    for (const t of tasks) {
      expect(statusOf.get(t.localId), `任务 ${t.localId} 终态 completed`).toBe('completed')
      const rs = recsOf(t.localId)
      expect(rs.some((r) => r.verb === 'claim'), `${t.localId} claim 记录在场`).toBe(true)
      expect(rs.some((r) => r.verb === 'submit' && r.toStatus === 'completed'), `${t.localId} submit·success 记录在场`).toBe(true)
    }
    expect(tasks.filter((t) => /^fix-\d+$/.test(t.localId)), 'fix 任务行（fix-N 前缀）').toHaveLength(1)
    {
      const r4 = recsOf('1.4')
      const r4Claims = r4.filter((r) => r.verb === 'claim')
      expect(r4Claims, '1.4 恰一条 claim（harness 预领——零模型重入）').toHaveLength(1)
      expect(r4Claims[0]?.sessionId, '1.4 领取会话 = harness（盲选不可见性）').toBe('e2e-harness')
      expect(r4.find((r) => r.verb === 'submit')?.toStatus, '1.4 harness 结算 completed').toBe('completed')
    }
    const a = recsOf('1.1')
    const aClaims = a.filter((r) => r.verb === 'claim')
    expect(aClaims.length, '1.1 claim 计 ≥4（halted 连环 + 复位领取）').toBeGreaterThanOrEqual(4)
    const aSubmit = a.find((r) => r.verb === 'submit')
    expect(aSubmit?.toStatus, '1.1 复位后成功结算').toBe('completed')
    expect(JSON.parse(aSubmit?.filesJson ?? '[]')).toContain('docs/knowledge/domains-index.md')
    expect(aSubmit?.commitHash ?? '').toMatch(/^[0-9a-f]{7,40}$/)
    const claimSessions = new Set(aClaims.map((r) => r.sessionId))
    expect(claimSessions.size, '1.1 两个派发会话（A halted + B 复位——冷启动计数器复位实证）').toBe(2)
    expect(readFileSync(join(ws, 'docs', 'knowledge', 'domains-index.md'), 'utf8'), '1.1 工件在场（域索引初稿）').toContain('# knowledge domains')
    const b = recsOf('1.2')
    const bClaim = b.find((r) => r.verb === 'claim')
    const bSubmit = b.find((r) => r.verb === 'submit')
    expect(bClaim?.sessionId, '1.2 派发会话 = session- 前缀形态').toMatch(/^session-/)
    expect(bSubmit?.sessionId, '1.2 执行会话 ≠ 派发会话（SC7——子会话裸 uuid 形态）').not.toBe(bClaim?.sessionId)
    expect(bSubmit?.sessionId).not.toMatch(/^session-/)
    const bGate = JSON.parse(bSubmit?.gateJson ?? 'null') as Record<string, unknown> | null
    expect(bGate, '1.2 gate 四布尔落账（worker 自检经 tool 写入）').toMatchObject({ compile: true, fmt: true, lint: true, test: true })
    const gitLog = execFileSync('git', ['log', '--format=%H'], { cwd: ws, encoding: 'utf8' })
    expect(gitLog, '1.2 commit_hash 在夹具仓 git 历史').toContain((bSubmit?.commitHash ?? '').slice(0, 7))
    expect(readFileSync(join(ws, 'docs', 'knowledge', 'entry-template.md'), 'utf8'), '1.2 工件在场（条目模板）').toContain('status: unconfirmed')
    // 1.3 fix 链
    const c = recsOf('1.3')
    const cBlocked = c.find((r) => r.verb === 'submit' && r.toStatus === 'blocked')
    expect(cBlocked, '1.3 一轮受阻结算在场（reason 必带）').toBeDefined()
    expect(cBlocked?.reason ?? '').toContain('freshness-checklist.md')
    const fixRow = tasks.find((t) => t.sourceTaskId === taskByLocal('1.3').id)
    expect(fixRow, 'fix 任务行在场（fix_of_task_id 谱系——fix-N 前缀）').toBeDefined()
    expect(fixRow?.localId).toMatch(/^fix-\d+$/)
    const fixAdd = recsOf(fixRow!.localId).find((r) => r.verb === 'add')
    expect(fixAdd, 'fix add 记录在场（处置层派生——harness 代理主会话面，d5c272c6 后 worker 面拒收）').toBeDefined()
    const autoBlock = c.find((r) => r.verb === 'auto-block')
    expect(autoBlock, '源 auto-block 记录在场（core 面）').toBeDefined()
    expect(autoBlock!.id, '单事务建链：auto-block 与 fix add 相邻（同事务落账）').toBe(fixAdd!.id + 1)
    expect(edges.some((e) => e.origin === 'fix-chain' && e.prerequisiteId === fixRow!.id), 'fix-chain 边在场且指向源').toBe(true)
    const fixSubmit = recsOf(fixRow!.localId).find((r) => r.verb === 'submit')
    expect(fixSubmit?.toStatus, 'fix 结算 completed').toBe('completed')
    const autoRestore = c.find((r) => r.verb === 'auto-restore')
    expect(autoRestore, '恢复钩子 auto-restore 在场（blocked → pending）').toMatchObject({ fromStatus: 'blocked', toStatus: 'pending' })
    const cRound2 = c.filter((r) => r.verb === 'claim').find((r) => r.id > (autoRestore?.id ?? 0))
    const cRound2Submit = c.filter((r) => r.verb === 'submit').find((r) => r.id > (cRound2?.id ?? 0))
    expect(cRound2Submit?.toStatus, '1.3 二轮成功').toBe('completed')
    expect(readFileSync(join(ws, 'docs', 'knowledge', 'freshness-checklist.md'), 'utf8'), '1.3 工件在场（含 marker）').toContain('marker')

    // ── logs 串联断言 ──
    const lines = readLogLines(logFile)
    const chainOf = (key: string): readonly string[] =>
      lines.filter((l) => (l.payload.taskKey as string) === key).map((l) => l.type)
    expect(chainOf(`${FEATURE}/1.2`), '1.2 事件链完整（claim → spawn → submit → worker-done）').toEqual([
      'task-claimed',
      'task-spawned',
      'task-submitted',
      'task-worker-done',
    ])
    const spawned12 = lines.find((l) => l.type === 'task-spawned' && (l.payload.taskKey as string) === `${FEATURE}/1.2`)
    expect(spawned12, 'task-spawned 行在场（1.2）').toBeDefined()
    expect(String(spawned12?.payload.workerSessionId), 'task-spawned 载 workerSessionId（对账锚——裸 uuid）').toMatch(/^[0-9a-f-]{36}$/)
    expect(
      ((spawned12?.payload.toolFilter as string[] | undefined) ?? []).includes('dispatchTask'),
      'worker toolFilter deny 含 dispatchTask（worker 面不含派发动词）',
    ).toBe(true)
    const submitted12 = lines.find((l) => l.type === 'task-submitted' && (l.payload.taskKey as string) === `${FEATURE}/1.2`)
    expect(submitted12?.sessionId, 'task-submitted 会话 = worker 自身（≠ dispatcher）').not.toMatch(/^session-/)
    const poolLines = readLogLines(join(dir, 'logs', '_pool.jsonl'))
    const noReady = [...lines, ...poolLines].filter((l) => l.type === 'no-ready-task')
    expect(noReady.length, 'no-ready-task 事件在场（dispatchTask no-task 分支——收工信号）').toBeGreaterThanOrEqual(1)

    // ── AC2 断言面：零 manifest + SC3 只读纪律 ──
    const allFiles = walkFiles(ws)
    const manifests = allFiles.filter((f) => f.split(/[\\/]/).pop()?.toLowerCase() === 'manifest.md')
    expect(manifests, `全程零 manifest.md 生成（老 forge 形态消亡——SC8 判据）：${manifests.join(', ')}`).toEqual([])
    for (const [file, before] of hashBefore) {
      expect(hashFile(file), `SC3 只读纪律：预置文档零变化（${file}）`).toBe(before)
    }
    const gitStatus = execFileSync('git', ['status', '--porcelain'], { cwd: ws, encoding: 'utf8' })
    expect(gitStatus, 'SC3 收口：夹具仓干净（一切 worker 产物经 git 提交——管线纪律）').toBe('')

    // ── AC2/AC3 断言面：概览全景一致（task-loop 接管版锚——OV_TASK_PANEL + 状态行投影） ──
    await openOverviewDock(page)
    await expect(page.locator(OV_TASK_PANEL).first(), '接管版概览面板在场').toBeVisible({ timeout: 30_000 })
    for (const t of tasks) {
      const row = page.locator(ovRowOf('completed'), { hasText: `${FEATURE}/${t.localId}` }).first()
      await expect(row, `概览任务行终态全景一致：${t.localId}（UI = db 直读——SC2②）`).toBeVisible({ timeout: 30_000 })
    }

    // ── 收尾 ──
    const bridgeEvents = await driver.events().catch((cause: unknown) => {
      console.error('[m35-replay] 事件记账快照失败（宿主连接态）：', String((cause as Error)?.message ?? cause))
      return [] as { at: number; channel: string; payload: { projectId: string } }[]
    })
    console.log(
      `[m35-replay] 走查完成 +${Math.round((Date.now() - startedAt) / 1000)}s（tasks=${tasks.length} records=${records.length} logLines=${lines.length} bridgeEvents=${bridgeEvents.length}）`,
    )
    await closeApp(launched.app).catch((cause: unknown) => {
      console.error('[m35-replay] closeApp 异常（宿主连接态）：', String((cause as Error)?.message ?? cause))
    })
    launched = undefined
  } catch (cause) {
    keepEvidence = true
    console.error('[m35-replay] 失败——证据保留：', `userData=${userData}`, `wsRoot=${wsRoot}`, `plan=${planPath}`)
    console.error('[m35-replay] 原始错误：', cause)
    throw cause
  } finally {
    if (launched !== undefined) await closeApp(launched.app).catch(() => undefined)
    if (!keepEvidence) {
      await rmDirBestEffort(userData)
      await rmDirBestEffort(wsRoot)
    }
  }
})
