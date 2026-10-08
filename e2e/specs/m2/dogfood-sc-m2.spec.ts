// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.4 SC-M2 门：真实模型派发链 dogfood（含 fix 链 + 中断恢复）+ 录制夹具产出（AC1–AC5）。
//
// M3 drift 台账（5.3 收口——drift #1/#3 两处已重录）：dispatcher 教学 prompt = dispatchTask
// 派发循环（run-tasks 技能 M3 形态——3.5 claimTask tool 退役；中断恢复经 dispatchTask 的
// spawn 失败幂等重入径承载，模型按 tool 返回指引重试）+ 录制夹具载荷 = M3 形态（addTask
// source 容器双轨 / TaskSnapshot source+mode / 简报全文源 = worker 会话首条 user/message
// ——e2e/support/replay/dogfood-record.ts 5.3 重录；tech-design drift #1/#3 闭合）。
//
// dogfood 策略（tech-design Per-Layer dogfood 行 + Hard Rule：dogfood = 唯一真实模型依赖面）：
// 低成本真实模型（zai-coding-cn / glm-5.3-flash——e2e/support/dogfood.ts 缺省），凭据经
// dsh profile 域播种（缺席 = 留痕 skip，不伪造）。链路 = 产品宿主 dev profile（plugin-forge
// tools + customSkillDirs 技能面经 3.4 装配，dogfood 即其真实可见性验证）+ 主侧测试钩子
// （DSH_FORGE_TEST_BRIDGE=1——事件记账与 harness 中途结算面，5.1 门控口径）。
//
// 场景编排（相位号 localId 受控初态 = db-insert 直种——addTask 数值顺延不可达 2.1/3.1 面）：
//   · 1.1 (P0) 成功径：notes.md 创建 + 四门（夹具 justfile 无害配方）+ git 提交 + submit success
//     ——AC1「一条不间断端到端」（claim digest / 派发会话 ≠ 执行会话 / gate·files·commit）；
//   · 2.1 (P1) fix 链（验证员角色——机械判据）：just verify-target 非零退出（target.md 缺席，
//     justfile 内置配方）→ submit blocked(reason 含修法指引) → fix 任务经 run-tasks 技能 fix 链
//     协议建立（dispatcher 承接或 worker 顺手建两径均可断言——addTask block_source 单事务：
//     fix-1 + fix-chain 边 + 源 auto-block 同事务记录相邻）→ fix 完成 → 恢复钩子
//     auto-restore（边不删——末态边仍在场）→ 2.1 二轮成功——AC2；
//   · 3.1 (P1) 中断恢复（M3 形态·确定性注入）：harness 以【派发会话身份】预置领取 3.1
//     （pending → in_progress + links 挂 dispatcher、零执行零结算 = missing-record 形态——
//     替代「执行器完成但不结算」的模型依从面：flash 对多分支指令依从不稳（5.3 重录 run2/3
//     实证——run3 恢复轮直接结算））→ dispatcher 下轮 dispatchTask 盲选必重入
//     （latestInProgressBySession——C1 幂等重入，reclaimed 记录 from/to 空）→ 恢复 worker
//     按简报全量执行并结算 success——AC3；重入 digest 新值驱动 = 3.2 (P2) 兄弟任务在两次
//     claim 之间由 harness 经测试钩子结算（相位推进 → PHASE_SUMMARY 行消失 → 简报重合成
//     必异文）。
//
// 录制（AC4）：三源合并 → e2e/support/replay/dogfood-record.ts（5.1 JSONL 夹具——verb 行回放
// 执行面 / observed 行承载 claim dispatchPrompt 全文与 submit 结算+恢复清单 / event 行 = 主侧
// tasks-changed 记账；M3 形态：简报全文源 = worker 会话首条 user/message——closeApp 后落盘）
// 落盘 e2e/fixtures/m2/dogfood-dispatch-chain.jsonl（历史工件——verb 载荷绑定录制期 projectId，
// 回放消费面经同机构造 hand 夹具，b5-anchors 头注）。
// 证据（AC5）：本 spec 头注环境备忘 + e2e/fixtures/m2/README.md 运行记录（真实 node 路径绕
// harness node.cmd shim——shim 注入 ELECTRON_RUN_AS_NODE=1 致 electron 以 Node 模式启动，
// playwright 报 bad option: --remote-debugging-port；S8 spike 实证）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { FEATURES_CHANNELS, PROJECTS_M2_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, ROOT, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { realCredentials, seedDshHome, writeDogfoodOverlay } from '../../support/dogfood.js'
import { rmDirBestEffort, rmFileBestEffort } from '../../support/cleanup.js'
import { COMPOSER_INPUT } from '../../support/anchors.js'
import { waitForFixtureSession } from '../../support/session-files.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { loadFixture, writeFixture } from '../../support/replay/fixtures.js'
import {
  buildDogfoodFixture,
  extractWorkerBriefTexts,
  readDogfoodAudit,
  seedDogfoodTaskRow,
  type DogfoodAuditRecord,
  type DogfoodTaskRow,
} from '../../support/replay/dogfood-record.js'

/** 夹具 feature slug（任务自然键前缀） */
const FEATURE = 'dogfood-demo'
/** 夹具工作区目录名（会话 cwd / 芯片选择 / 会话文件定位共用） */
const WS_NAME = 'dogfood-ws'
/** harness 经测试钩子结算的面（3.1 重入简报 PHASE_SUMMARY 消失驱动） */
const HARNESS_SESSION = 'e2e-harness'
/** 录制夹具落盘路径（5.2 回放消费面——仓内工件） */
const FIXTURE_OUT = join(ROOT, 'e2e', 'fixtures', 'm2', 'dogfood-dispatch-chain.jsonl')

// M3 派发指令（dispatchTask 循环——run-tasks 技能 3.6 形态；容器绑定经 source 对携带，
// 兼承无任务事件归属——context_slug 入参已退役）
const DISPATCHER_PROMPT = [
  '请调用 run-tasks 技能（skill 工具，name 填 run-tasks），然后严格按该技能的派发循环执行到底：',
  '每轮 = dispatchTask 单调用（source_kind 填 feature、source_slug 填 dogfood-demo——容器限定认领，无任务事件归属随 source_slug）——工具自己领取任务、派发子代理执行并返回结算与池快照；按返回的池快照决定继续或收工。',
  '按技能内协议处理：spawn 失败（✗ ERR_SPAWN_FAILED）时按返回指引原样重试同一调用（幂等重入——简报自动重合成）；受阻任务结算走 fix 链（addTask block_source 建单事务修复任务）；返回 no-task 且池态 = 收工时输出 Dispatch Summary 收工。',
  '派发会话自己不要改文件、不要跑测试——一切经子代理执行。',
].join('\n')

/** 夹具工作区：git 仓 + 无害四门 justfile（executor 质量门诚实可过） */
function makeDogfoodWorkspace(): string {
  const wsRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-dogfood5-ws-'))
  const ws = join(wsRoot, WS_NAME)
  mkdirSync(ws, { recursive: true })
  const justfile = [
    '# dogfood fixture workspace — quality gates as honest no-ops',
    // shell 钉 powershell：just 缺省经 msys sh.exe 执行配方——受限 agent 会话撞沙箱命名对象
    // 边界（NtCreateDirectoryObject 0xC0000022，run3 实证：重入执行器三连崩→诚实 blocked
    // 污染中断恢复形状）；powershell 面零 msys 依赖，四门确定性可过。
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
    // 2.1 验证员任务的机械判据（target.md 缺席或缺 marker 行 → 非零退出——受阻径的
    // 确定性触发面，替代模型对条件指令的依从）
    'verify-target:',
    `    @if (-not (Test-Path target.md) -or -not (Select-String -Path target.md -Pattern marker -Quiet)) { exit 1 }`,
    '',
  ].join('\n')
  writeFileSync(join(ws, 'justfile'), justfile, 'utf8')
  writeFileSync(join(ws, 'README.md'), '# dogfood fixture workspace\n', 'utf8')
  const git = (args: readonly string[]): void => {
    execFileSync('git', args, { cwd: ws, stdio: 'pipe' })
  }
  git(['init'])
  git(['config', 'user.email', 'dogfood@example.invalid'])
  git(['config', 'user.name', 'dogfood-executor'])
  git(['add', '.'])
  git(['commit', '-m', 'chore: dogfood fixture base'])
  return wsRoot
}

test('@web-e2e @m2 5.4 SC-M2 门：真实模型派发链 dogfood（fix 链 + 中断恢复）+ 录制夹具产出', async () => {
  test.setTimeout(1_500_000)
  const credentials = realCredentials()
  test.skip(
    credentials === undefined,
    'dogfood 前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip（Hard Rule：dogfood = 唯一真实模型面，不伪造凭据）',
  )

  const startedAt = Date.now()
  const wsRoot = makeDogfoodWorkspace()
  const ws = join(wsRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-dogfood5-ud-'))
  const dshHome = join(userData, 'dsh-home')
  seedDshHome(dshHome, credentials as string)
  const overlay = writeDogfoodOverlay()
  let launched: Launched | undefined
  let keepEvidence = false
  try {
    launched = await launchHost({
      userData,
      overlay,
      env: { DSH_FORGE_TEST_BRIDGE: '1' },
      // 内存受限环境（commit charge 紧张）boot 链全程变慢——放宽就绪链超时（缺省 60/90/60；
      // firstWindow 缺省 30s——bootDshHost child spawn + skill 面装配先于首窗，慢环境可越限）
      timeouts: { firstWindow: 120_000, bootReady: 180_000, loaderLive: 120_000, workbenchVisible: 120_000 },
    })
    const page = launched.page
    const driver = createBridgeDriver(launched.app)
    // 宿主存活面：进程句柄启动即取（连接 dispose 后 app.process() 抛 '_object' TypeError——
    // 上一轮实证：连接断≠进程亡，句柄先取恒可读 exitCode）+ 退出/崩溃留痕（死因诊断）。
    const proc = launched.app.process()
    proc.once('exit', (code, signal) => {
      console.error(`[dogfood5.4] 宿主进程退出：code=${String(code)} signal=${String(signal)} +${Math.round((Date.now() - startedAt) / 1000)}s`)
    })
    page.on('crash', () => {
      console.error(`[dogfood5.4] 渲染进程崩溃 +${Math.round((Date.now() - startedAt) / 1000)}s`)
    })

    // ── 受控初态：注册 + feature 行（人类径 RPC）+ 相位号任务直种（db-insert 通道） ──
    // 注册名 = 工作区目录名（芯片菜单按注册名列示——flywheel 同径按目录名过滤）
    const project = await registerProject(page, ws, WS_NAME)
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: FEATURE, title: 'dogfood 派发链演示' })
    const derived = await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: ws })
    {
      const db = openForgeDbAt(derived.dir)
      try {
        seedDogfoodTaskRow(db, FEATURE, '1.1', {
          title: '在工作区根创建 notes.md（一行 dogfood-ok）并提交',
          taskType: 'doc',
          priority: 'P0',
          taskDesc: [
            '步骤：1) 在工作区根目录创建 notes.md，内容恰好一行：dogfood-ok',
            '2) 依次运行 just compile、just fmt、just lint、just unit-test（应全部通过）',
            '3) 用 git 提交该文件（Conventional Commits）',
            '4) submitTask result=success：summary 简述、files=["notes.md"]、gate_compile/fmt/lint/test 四布尔全 true、commit_hash 填提交哈希',
          ].join('\n'),
        })
        seedDogfoodTaskRow(db, FEATURE, '2.1', {
          title: '验证 target.md 在场且含一行 marker（缺席 = 受阻走 fix 链）',
          taskType: 'doc',
          priority: 'P1',
          taskDesc: [
            '【角色：验证员——只判定，绝不创建或修改 target.md】',
            '步骤：1) 运行 just verify-target（justfile 已内置：target.md 缺失或缺 marker 行 → 非零退出）。',
            '2) 非零退出：立即 submitTask result=blocked，reason 填「target.md absent — fix: create target.md containing the single line: marker」，然后立即结束——不要创建文件、不要建修复任务（派发会话按 fix 链协议承接）。',
            '3) 零退出（验证通过）：跑四门（just compile/fmt/lint/unit-test），如工作区有未提交变更则 git 提交，submitTask result=success（files=["target.md"]、四门布尔、commit_hash 填提交哈希）。',
          ].join('\n'),
        })
        seedDogfoodTaskRow(db, FEATURE, '3.1', {
          title: '中断恢复演练：创建 interrupt.md 并结算（首轮经 harness 预置中断——领取后无结算）',
          taskType: 'doc',
          priority: 'P1',
          taskDesc: [
            '步骤：1) 在工作区根创建 interrupt.md，内容恰好一行：done',
            '2) 依次运行四门（just compile/fmt/lint/unit-test）确认通过',
            '3) 用 git 提交该文件（Conventional Commits）',
            '4) submitTask result=success：summary 简述、files=["interrupt.md"]、gate_compile/fmt/lint/test 四布尔全 true、commit_hash 填提交哈希',
          ].join('\n'),
        })
        seedDogfoodTaskRow(db, FEATURE, '3.2', {
          title: '保留任务（harness 结算占位）',
          taskType: 'doc',
          priority: 'P2',
          taskDesc: '占位任务——由测试 harness 直接结算，执行器无需处理。',
        })
        // 相位不动点对齐：register RPC 建 feature 缺省 status=prd，而四 pending 任务推导
        // tasks（§6-29 有任务时 taskDerived 覆盖）——claim 写事务内增量断言非不动点即红
        // （上轮 dogfood 实证：相位派生不变量断言失败）。core 动词自此自维护（事务内重算+落列）。
        db.prepare(`UPDATE features SET feature_status = 'tasks', updated_at = ? WHERE slug = ?`).run(
          new Date().toISOString(),
          FEATURE,
        )
      } finally {
        db.close()
      }
    }

    // ── 派发会话：夹具工作区选定 → run-tasks 技能指令（真实模型往返） ──
    await selectWorkspaceViaChip(page, WS_NAME)
    const composer = page.locator(COMPOSER_INPUT).last()
    await composer.click()
    await page.keyboard.insertText(DISPATCHER_PROMPT)
    await page.keyboard.press('Enter')
    // 派发会话落盘开户确认（worker 会话 = 简报全文源，closeApp 后统一抽取）+ 会话 id 捕获
    // （3.1 预置中断以【派发会话身份】领取——links 挂 dispatcher，下轮盲选必重入）
    const dispatcherSessionId = await waitForFixtureSession(dshHome, WS_NAME, 120_000)

    // ── 中途结算 + 终态轮询（3.1 执行窗内 harness 结算 3.2 → 重入简报必异文） ──
    // 轮询面 = forge.db 直读（WAL 并发读——渲染进程零依赖：长会话渲染层可能崩溃，模型
    // 会话在宿主子进程继续推进，动词照常落账）；中途结算经主侧测试钩子（electronApp.evaluate
    // 主进程面）。sleep = Node 侧（禁 page.waitForTimeout——page 崩溃即断链）。
    let intervened = false
    const harnessClaim: { at: number; result: unknown }[] = []
    const pollDeadline = Date.now() + Number(process.env.DSH_FORGE_DOGFOOD_DEADLINE_MS ?? 900_000)
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    const statusSnapshot = (): ReadonlyMap<string, string> => {
      const db = openForgeDbAt(derived.dir)
      try {
        const rows = db.prepare<unknown[], { local_id: string; task_status: string }>(
          'SELECT local_id, task_status FROM tasks',
        ).all()
        return new Map(rows.map((r) => [r.local_id, r.task_status]))
      } finally {
        db.close()
      }
    }
    let lastLog = 0
    for (;;) {
      const statuses = statusSnapshot()
      if (Date.now() - lastLog > 30_000) {
        lastLog = Date.now()
        console.log(`[dogfood5.4] +${Math.round((Date.now() - startedAt) / 1000)}s statuses=${JSON.stringify([...statuses.entries()])} appExit=${String(proc.exitCode)}`)
      }
      if (proc.exitCode !== null) {
        throw new Error(`宿主进程提前退出：code=${String(proc.exitCode)} statuses=${JSON.stringify([...statuses.entries()])}`)
      }
      if (
        !intervened &&
        statuses.get('3.1') === 'pending' &&
        statuses.get('3.2') === 'pending' &&
        [...statuses.values()].includes('in_progress') // 派发会话正忙于更早任务（无领取竞态窗口）
      ) {
        const at = Date.now()
        // ① 3.1 预置中断（missing-record 形态——确定性注入，替代「执行器完成但不结算」的
        //    模型依从面）：以【派发会话身份】显式领取 → in_progress + links 挂 dispatcher、
        //    零执行零结算。dispatcher 下轮 dispatchTask 盲选必重入（latestInProgressBySession
        //    ——C1 幂等重入），恢复 worker 按简报全量执行并结算。
        const interruptClaim = await driver.call('forgeTasks', 'claimTask', {
          projectId,
          taskRef: { slug: FEATURE, localId: '3.1' },
          sessionId: dispatcherSessionId,
        })
        // ② 3.2 harness 结算（重入简报 digest 新值驱动：3.2 完成于两 claim 之间 →
        //    PHASE_SUMMARY 行消失 → 简报重合成必异文）
        const claim = await driver.call('forgeTasks', 'claimTask', {
          projectId,
          taskRef: { slug: FEATURE, localId: '3.2' },
          sessionId: HARNESS_SESSION,
        })
        const submit = await driver.call('forgeTasks', 'submitTask', {
          projectId,
          taskRef: { slug: FEATURE, localId: '3.2' },
          result: 'success',
          summary: 'harness 结算 3.2（3.1 重入简报 PHASE_SUMMARY 消失驱动——digest 新值）',
          sessionId: HARNESS_SESSION,
        })
        harnessClaim.push({ at, result: interruptClaim }, { at, result: claim }, { at, result: submit })
        intervened = true
        console.log('[dogfood5.4] harness 预置 3.1 中断（派发会话身份领取·无结算）+ 中途结算 3.2 完成')
      }
      const unsettled = [...statuses.entries()].filter(([, s]) => s !== 'completed' && s !== 'skipped')
      if (unsettled.length === 0) break
      if (Date.now() > pollDeadline) {
        throw new Error(`dogfood 终态超时：statuses=${JSON.stringify([...statuses.entries()])}`)
      }
      await sleep(3_000)
    }
    expect(intervened, 'harness 中途结算发生（3.2 在 3.1 执行窗内结算——digest 新值驱动）').toBe(true)
    console.log(`[dogfood5.4] 全任务终态收敛，耗时 ${Math.round((Date.now() - startedAt) / 1000)}s`)

    // ── 尾事件收敛等待 + 事件记账快照（worker 会话落盘 = closeApp 后——简报全文抽取前提） ──
    await sleep(8_000)
    const bridgeEvents = await driver.events().catch((cause: unknown) => {
      console.error('[dogfood5.4] 事件记账快照失败（宿主连接态）：', String((cause as Error)?.message ?? cause))
      return [] as { at: number; channel: string; payload: { projectId: string } }[]
    })
    // 转录尾部 = 诊断面（渲染层长会话可能崩溃——best-effort，审计与 db 为断言真相）
    const transcriptTail =
      (await page
        .locator('[data-conversation-content]')
        .first()
        .textContent({ timeout: 10_000 })
        .catch(() => '<renderer-unavailable>')) ?? ''
    console.log('[dogfood5.4] 转录尾部：', transcriptTail.slice(-600))
    test.info().annotations.push({ type: 'dogfood-transcript-tail', description: transcriptTail.slice(-1200) })
    test.info().annotations.push({ type: 'dogfood-bridge-events', description: JSON.stringify(bridgeEvents.length) })
    await closeApp(launched.app).catch((cause: unknown) => {
      // 连接已 dispose（宿主先亡）时 app.process() 抛 '_object'——留痕不阻断夹具产出
      console.error('[dogfood5.4] closeApp 异常（宿主连接态）：', String((cause as Error)?.message ?? cause))
    })
    launched = undefined

    // ── 三源合并 → 录制夹具落盘（AC4——5.1 JSONL 格式；M3 简报源 = worker 会话首条 user/message） ──
    const briefTexts = extractWorkerBriefTexts(dshHome)
    for (const call of harnessClaim) {
      const r = call.result as { digest?: string; dispatchPrompt?: string }
      if (typeof r?.digest === 'string' && typeof r?.dispatchPrompt === 'string') briefTexts.set(r.digest, r.dispatchPrompt)
    }
    const db = openForgeDbAt(derived.dir)
    let audit: ReturnType<typeof readDogfoodAudit>
    try {
      audit = readDogfoodAudit(db)
    } finally {
      db.close()
    }
    const fixture = buildDogfoodFixture({
      projectId,
      tasks: audit.tasks,
      edges: audit.edges,
      records: audit.records,
      briefTexts,
      harnessCalls: [],
      events: bridgeEvents,
      meta: { note: `SC-M2 dogfood M3 重录 ${new Date(startedAt).toISOString()}（5.3 drift #1/#3 收口）——dispatchTask 循环 + worker 会话简报源；受控初态=相位号直种(db-insert)；3.2=harness 中途结算` },
    })
    writeFixture(FIXTURE_OUT, fixture)
    const reloaded = loadFixture(FIXTURE_OUT)

    // ── 审计断言面（record id 升序 = 追加序真相） ──
    const { tasks, edges, records } = audit
    const taskByLocal = (localId: string): DogfoodTaskRow => {
      const row = tasks.find((t) => t.localId === localId)
      expect(row, `任务行在场：${localId}`).toBeDefined()
      return row as DogfoodTaskRow
    }
    const recsOf = (localId: string): readonly DogfoodAuditRecord[] => records.filter((r) => r.localId === localId)

    // AC1：1.1 一条不间断（claim digest + 派发≠执行会话 + submit gate/files/commit + 真实 git）
    const a = recsOf('1.1')
    const aClaim = a.find((r) => r.verb === 'claim')
    const aSubmit = a.find((r) => r.verb === 'submit')
    expect(aClaim, '1.1 claim 记录在场').toBeDefined()
    expect(aSubmit, '1.1 submit 记录在场').toBeDefined()
    expect(aClaim!.dispatchDigest).toMatch(/^[0-9a-f]{12}$/)
    expect(aClaim!.sessionId, '1.1 派发会话 = 主会话（session- 前缀形态）').toMatch(/^session-/)
    expect(aSubmit!.sessionId, '1.1 执行会话 ≠ 派发会话（SC6③——子会话裸 uuid 形态）').not.toBe(aClaim!.sessionId)
    expect(aSubmit!.toStatus).toBe('completed')
    expect(aSubmit!.summary ?? '').not.toBe('')
    const aGate = JSON.parse(aSubmit!.gateJson ?? 'null') as Record<string, unknown> | null
    expect(aGate, '1.1 gate 四布尔落账').toMatchObject({ compile: true, fmt: true, lint: true, test: true })
    expect(JSON.parse(aSubmit!.filesJson ?? '[]')).toContain('notes.md')
    expect(aSubmit!.commitHash ?? '').toMatch(/^[0-9a-f]{7,40}$/)
    expect(readFileSync(join(ws, 'notes.md'), 'utf8'), '1.1 工件在场：notes.md 内容逐字').toBe('dogfood-ok\n')
    const gitLog = execFileSync('git', ['log', '--format=%H'], { cwd: ws, encoding: 'utf8' })
    expect(gitLog, '1.1 commit_hash 在夹具仓 git 历史（短/全长前缀包含）').toContain((aSubmit!.commitHash ?? '').slice(0, 7))

    // AC2：fix 链（blocked → 单事务建链 → fix 完成 → auto-restore 边不删 → 二轮成功）
    const b = recsOf('2.1')
    const bBlocked = b.find((r) => r.verb === 'submit' && r.toStatus === 'blocked')
    expect(bBlocked, '2.1 一轮受阻结算在场（reason 必带）').toBeDefined()
    expect(bBlocked!.reason ?? '').toContain('target.md')
    const fixRow = tasks.find((t) => t.sourceTaskId === taskByLocal('2.1').id)
    expect(fixRow, 'fix 任务行在场（fix-N 前缀）').toBeDefined()
    expect(fixRow!.localId).toMatch(/^fix-\d+$/)
    const fixAdd = recsOf(fixRow!.localId).find((r) => r.verb === 'add')
    expect(fixAdd, 'fix add 记录在场（plugin-tool 面）').toBeDefined()
    const autoBlock = b.find((r) => r.verb === 'auto-block')
    expect(autoBlock, '源 auto-block 记录在场（core 面）').toBeDefined()
    expect(autoBlock!.id, '单事务建链：auto-block 与 fix add 记录相邻（同事务落账）').toBe(fixAdd!.id + 1)
    const fixEdge = edges.find((e) => e.origin === 'fix-chain' && e.prerequisiteId === fixRow!.id)
    expect(fixEdge, 'fix-chain 边在场且指向源（task_id=源 ← prerequisite=fix）').toMatchObject({ taskId: taskByLocal('2.1').id })
    const fixSubmit = recsOf(fixRow!.localId).find((r) => r.verb === 'submit')
    expect(fixSubmit, 'fix 结算在场').toBeDefined()
    expect(fixSubmit!.toStatus).toBe('completed')
    const autoRestore = b.find((r) => r.verb === 'auto-restore')
    expect(autoRestore, '恢复钩子 auto-restore 记录在场（blocked → pending）').toMatchObject({ fromStatus: 'blocked', toStatus: 'pending' })
    expect(autoRestore!.id, 'auto-restore 与 fix submit 同事务相邻').toBe(fixSubmit!.id + 1)
    expect(edges.some((e) => e.origin === 'fix-chain' && e.prerequisiteId === fixRow!.id), '边不删：fix-chain 边末态仍在场').toBe(true)
    const bRound2Claim = b.filter((r) => r.verb === 'claim').find((r) => r.id > (autoRestore?.id ?? 0))
    const bRound2Submit = b.filter((r) => r.verb === 'submit').find((r) => r.id > (bRound2Claim?.id ?? 0))
    expect(bRound2Claim, '2.1 恢复后二轮领取在场').toBeDefined()
    expect(bRound2Submit?.toStatus, '2.1 二轮成功').toBe('completed')
    expect(readFileSync(join(ws, 'target.md'), 'utf8'), '2.1 工件在场：target.md 含 marker').toContain('marker')

    // AC3：中断恢复（3.1 一轮无 submit → 外环重入 reclaimed（from/to 空）→ digest 新值 → 恢复结算）
    const c = recsOf('3.1')
    const cClaims = c.filter((r) => r.verb === 'claim')
    expect(cClaims.length, '3.1 两条 claim 记录（首领 + 重入）').toBe(2)
    const [cFirst, cReclaim] = cClaims as [DogfoodAuditRecord, DogfoodAuditRecord]
    expect(cFirst.fromStatus).toBe('pending')
    expect(cReclaim.fromStatus, '重入记录 from/to 空（无状态效应形态）').toBeNull()
    expect(cReclaim.toStatus).toBeNull()
    const submitsBetween = c.filter((r) => r.verb === 'submit' && r.id > cFirst.id && r.id < cReclaim.id)
    expect(submitsBetween, '中断形态：首领与重入之间零 submit 记录（record 缺失）').toHaveLength(0)
    expect(cReclaim.dispatchDigest, '重入简报重合成 digest 新值').not.toBe(cFirst.dispatchDigest)
    const cSubmit = c.find((r) => r.verb === 'submit')
    expect(cSubmit?.toStatus, '恢复结算 success').toBe('completed')
    expect(JSON.parse(cSubmit?.filesJson ?? '[]')).toContain('interrupt.md')
    expect(readFileSync(join(ws, 'interrupt.md'), 'utf8'), '3.1 工件在场：interrupt.md 内容逐字').toBe('done\n')
    // 3.2 harness 结算在 3.1 首领与重入之间（相位推进 = digest 新值的驱动面）
    const s = recsOf('3.2')
    const sSubmit = s.find((r) => r.verb === 'submit')
    expect(sSubmit?.id, '3.2 结算时刻落 3.1 首领与重入之间').toBeGreaterThan(cFirst.id)
    expect(sSubmit?.id).toBeLessThan(cReclaim.id)
    expect(sSubmit?.sessionId).toBe(HARNESS_SESSION)

    // AC4：录制夹具（5.1 格式 + dispatchPrompt 全文 + 事件流）
    expect(reloaded.header.source).toBe('dogfood')
    const verbSteps = reloaded.steps.filter((st) => st.kind === 'verb')
    const observedSteps = reloaded.steps.filter((st) => st.kind === 'observed')
    const eventSteps = reloaded.steps.filter((st) => st.kind === 'event')
    expect(verbSteps.length, 'verb 行 ≥ 12（add fix + 7 claim + 6 submit 量级）').toBeGreaterThanOrEqual(12)
    const claimObs = observedSteps.filter((o) => o.verb === 'claimTask')
    expect(claimObs.length, 'claim observed 行数 = 审计 claim 记录数（全量入夹具）').toBe(
      records.filter((r) => r.verb === 'claim' && r.actor === 'plugin-tool').length,
    )
    for (const o of claimObs) {
      const r = o.result as { dispatchPrompt: string; digest: string }
      expect(r.dispatchPrompt.length, 'claim observed 全文非空（人格段 + 三标签块）').toBeGreaterThan(200)
      expect(r.digest).toMatch(/^[0-9a-f]{12}$/)
    }
    const reclaimObs = claimObs.find((o) => (o.result as { reclaimed?: boolean }).reclaimed === true)
    expect(reclaimObs, '重入 observed（reclaimed=true）入夹具').toBeDefined()
    const fixSubmitObs = observedSteps.filter((o) => o.verb === 'submitTask').find((o) => ((o.result as { restored?: unknown[] }).restored?.length ?? 0) > 0)
    expect(fixSubmitObs, 'fix 结算 observed restored 清单入夹具（fix 链事件流面）').toBeDefined()
    expect(eventSteps.length, '事件行 = 主侧 tasks-changed 记账全量（≥ verb 行数）').toBeGreaterThanOrEqual(verbSteps.length)
    expect(eventSteps.every((e) => e.channel === 'forge:events/tasks-changed' && e.payload.projectId === projectId)).toBe(true)
    expect(existsSync(FIXTURE_OUT)).toBe(true)
    console.log(`[dogfood5.4] 夹具落盘：${FIXTURE_OUT}（verb=${verbSteps.length} observed=${observedSteps.length} event=${eventSteps.length}）`)
  } catch (cause) {
    // 证据保全：失败时保留 userData（会话文件/dshHome）与夹具工作区（git/工件）供诊断
    keepEvidence = true
    console.error('[dogfood5.4] 失败——证据保留：', `userData=${userData}`, `wsRoot=${wsRoot}`, `overlay=${overlay}`)
    console.error('[dogfood5.4] 原始错误：', cause)
    throw cause
  } finally {
    if (launched !== undefined) await closeApp(launched.app).catch(() => undefined)
    if (!keepEvidence) {
      rmFileBestEffort(overlay)
      await rmDirBestEffort(userData)
      await rmDirBestEffort(wsRoot)
    }
  }
})
