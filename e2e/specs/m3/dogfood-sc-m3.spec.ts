// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// 5.3 SC-M3 门（PRD SC8 / tech-design Testing Strategy dogfood 行）：M3.5 自举走查——
// 远征会话派发开发自身的端到端真实模型 walkthrough（走查即 M3.5 立项启动）：
//   · 立项链（AC1 前半）：真实 M3.5 提案文档（仓内 docs/proposals/dsh-forge-m3.5-
//     knowledge-consolidation/proposal.md 逐字拷贝入夹具 .forge 文档树）→ createProposal
//     （bridge = agent 技能代笔承载，mode=expedition 创建时写入——DF006）→ 提案子 tab
//     人工评审流转（UI 裁决对话框 = 律三人类面）→ accepted 成链原子三行（features 行 +
//     proposal_id 谱系 + feature_records(register)——db 断言）→ 规格文档两篇（upsertDoc
//     RPC + 真实文件）→ 任务三件 db-insert 受控初态（M2 5.4 形制）；
//   · dispatchTask 四分支全走查（Implementation Notes「四分支含 halted 复位路径」）：
//     ① halted —— forgeSettings worker 指向不存在 provider → 派发入口（UF-3 按钮）开会话 A
//     （远征 + /run-tasks 单行自动发送）→ spawn 失败 ×3 粘住（1.1 留 in_progress 走幂等
//     重入径——3 条 claim 零 submit 断言 + logs tool-error ×3）→ 复位 = 人工转移（forge:tasks/
//     transition 人类面 in_progress→pending）+ 新派发会话 B（冷启动计数器复位）；
//     ② spawned·success（1.1 复位后 + 1.2）；③ spawned·blocked（1.3 缺席文件 → fix 链 →
//     auto-restore → 二轮成功）；④ no-task（1.4 收官占位 = harness 预领 in_progress——对
//     两代 dispatcher 盲选不可见[双派发防线实证]，其余全终态后 dispatcher 必命中 no-task
//     [池快照 in_progress=1 → wait 判词续环]，harness 结算后末轮 no-task[done 判词]收工——
//     logs no-ready-task 事件确定性在场）；
//   · 零 manifest（AC2）：全程文件系统断言——夹具树递归零 manifest.md（老 forge 形态
//     消亡论证）+ 概览三视图 / 文档 / 提案子 tab 全景一致（UI 断言）；
//   · 总纲回归（AC3）：SC2 无投影（runAllSourceAuditAnchors 源码面 + UI=db 直读一致）/
//     SC3 只读纪律（预置文档前后哈希零变化 + 产品状态写仅 .forge 域）/ SC7 真闭环（真实
//     模型 worker 经 tool 写入 → 状态层 → 概览即时反映——submit 记录会话 ≠ 派发会话）。
// dogfood 策略（Hard Rule：dogfood = 唯一真实模型依赖面——沿 M2 裁决）：低成本真实模型
// （zai-coding-cn / glm-5.3-flash——e2e/support/dogfood.ts 缺省；halt 注入 = forgeSettings
// worker provider 指向不存在名——spawn 组装恒拒，非真实模型面伪造）。凭据经 dsh profile
// 域播种（缺席 = 留痕 skip，不伪造）。
// 证据（AC5）：e2e/fixtures/m3/README.md 运行记录 + 环境备忘（M2 5.4 形制；S8 真实 node
// 路径绕 harness node.cmd shim）。
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { FEATURES_CHANNELS, SETTINGS_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { runAllSourceAuditAnchors } from '../../support/audit/anchors.js'
import { rmDirBestEffort, rmFileBestEffort } from '../../support/cleanup.js'
import { DOGFOOD_MODEL, DOGFOOD_PROVIDER, realCredentials, seedDshHome, writeDogfoodOverlay } from '../../support/dogfood.js'
import { closeApp, launchHost, ROOT, type Launched } from '../../support/launch.js'
import { openOverviewDock } from '../../support/navigation.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { readDogfoodAudit, seedDogfoodTaskRow, type DogfoodAuditRecord } from '../../support/replay/dogfood-record.js'
import { findFixtureSession } from '../../support/session-files.js'
import { awaitNoLateModals, awaitPresetHeaderLabel } from '../../support/m3.js'
import { ovSubtabOf, ttItemOf } from '../../support/anchors.js'

/** M3.5 真实提案（仓内 Draft——走查即立项启动；夹具内逐字拷贝） */
const M35_REPO_PROPOSAL = join(ROOT, 'docs', 'proposals', 'dsh-forge-m3.5-knowledge-consolidation', 'proposal.md')
const PROP = 'dsh-forge-m3.5-knowledge-consolidation'
const PROP_TITLE = 'dsh-forge M3.5 知识沉淀与保鲜（进气端 + 保鲜端）'
/** 成链 feature slug ≡ 提案 slug（同名成链裁决） */
const FEATURE = PROP
/** 夹具工作区目录名（会话 cwd / 芯片选择共用） */
const WS_NAME = 'm35-ws'
/** halted 注入面：不存在的 provider 名（spawn 组装恒拒——非伪造模型调用） */
const BROKEN_PROVIDER = 'dsh-forge-e2e-halt-probe'

/** 夹具工作区：git 仓 + 无害四门 justfile（executor 质量门诚实可过——M2 5.4 形制） */
function makeWalkthroughWorkspace(): string {
  const wsRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m35-ws-'))
  const ws = join(wsRoot, WS_NAME)
  mkdirSync(ws, { recursive: true })
  const justfile = [
    '# SC-M3 walkthrough fixture workspace — quality gates as honest no-ops',
    // shell 钉 powershell：just 缺省经 msys sh.exe 执行配方——受限 agent 会话撞沙箱命名对象
    // 边界（M2 5.4 run3 实证）；powershell 面零 msys 依赖，四门确定性可过。
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
  // 产品状态目录不入 git（worker 提交面 = 任务工件；git status 干净 = SC3 断言面）
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

/** 文件 sha-256（SC3 前后对照——预置文档零变化断言） */
function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** 递归枚举文件（跳过 .git——零 manifest 断言 + 树快照面） */
function walkFiles(root: string, out: string[] = [], dir = root): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(root, out, full)
    else out.push(full)
  }
  return out
}

/** logs/{slug}.jsonl 事件行读回（监听器行形状 = ForgePluginEvent 信封） */
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

test('@web-e2e @m3 5.3 SC-M3 门：M3.5 自举走查（评审成链 + dispatchTask 四分支 + 零 manifest + 总纲回归）', async () => {
  test.setTimeout(2_400_000)
  const credentials = realCredentials()
  test.skip(
    credentials === undefined,
    'dogfood 前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip（Hard Rule：dogfood = 唯一真实模型面，不伪造凭据）',
  )

  const startedAt = Date.now()
  const wsRoot = makeWalkthroughWorkspace()
  const ws = join(wsRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m35-ud-'))
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
      // M2 5.4 同口径：内存受限环境放宽就绪链（bootDshHost 先于首窗）
      timeouts: { firstWindow: 120_000, bootReady: 180_000, loaderLive: 120_000, workbenchVisible: 120_000 },
    })
    const page = launched.page
    const driver = createBridgeDriver(launched.app)
    const proc = launched.app.process()
    proc.once('exit', (code, signal) => {
      console.error(`[m35] 宿主进程退出：code=${String(code)} signal=${String(signal)} +${Math.round((Date.now() - startedAt) / 1000)}s`)
    })
    page.on('crash', () => {
      console.error(`[m35] 渲染进程崩溃 +${Math.round((Date.now() - startedAt) / 1000)}s`)
    })

    // ── 立项链：注册（清洁夹具——发现面零吸收）→ createProposal（bridge = 技能代笔承载）→ 真实提案文档入树 ──
    const project = await registerProject(page, ws, WS_NAME)
    const projectId = project.id
    const dir = (
      await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: ws })
    ).dir
    await driver.call('forgeProposals', 'createProposal', {
      projectId,
      slug: PROP,
      title: PROP_TITLE,
      relPath: `docs/proposals/${PROP}/proposal.md`,
      mode: 'expedition', // 创建时写入（DF006——mode 溯源 = 提案行字段）
    })
    mkdirSync(join(ws, '.forge', 'docs', 'proposals', PROP), { recursive: true })
    writeFileSync(join(ws, '.forge', 'docs', 'proposals', PROP, 'proposal.md'), readFileSync(M35_REPO_PROPOSAL, 'utf8'), 'utf8')

    // ── 评审接受（UI 人工裁决——律三人类面）→ 成链原子三行 ──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const propRow = page.locator('[data-dswf-ov-proposals] [data-dswf-ov-parent]', { hasText: PROP_TITLE }).first()
    await expect(propRow, 'M3.5 提案行在场（真实提案文档吸收面）').toBeVisible({ timeout: 30_000 })
    await expect(propRow, 'mode chip = 远征（创建时写入）').toContainText('远征')
    await expect(propRow, '状态 = 草稿').toContainText('草稿')
    await propRow.locator('[data-dswf-ov-more]').click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
    const verdictDialog = page.locator('[data-dswf-ov-vd]')
    await expect(verdictDialog).toBeVisible({ timeout: 15_000 })
    // 五态机 UI 允许集（draft → under-review → accepted——流程三两步评审；draft 直达 accepted
    // 不在菜单窄集）：第一步转评审中
    await page.locator('[data-dswf-ov-vd-to]').selectOption('under-review')
    await page.locator('[data-dswf-ov-vd-reason]').fill('SC-M3 走查：M3.5 立项启动（评审进入审议）')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(verdictDialog).toBeHidden({ timeout: 15_000 })
    await expect(propRow, '行状态收敛 = 评审中').toContainText('评审中', { timeout: 30_000 })
    // 第二步：受理 → 单步成链（accepted ∧ expedition）
    await propRow.locator('[data-dswf-ov-more]').click()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
    await expect(verdictDialog).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-ov-vd-to]').selectOption('accepted')
    await page.locator('[data-dswf-ov-vd-reason]').fill('SC-M3 走查：M3.5 立项启动（评审接受 → 单步成链）')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(verdictDialog).toBeHidden({ timeout: 15_000 })
    await expect(propRow, '行状态收敛 = 已接受').toContainText('已接受', { timeout: 30_000 })

    // 成链原子三行（db 断言）：features 行 + proposal_id 谱系 + feature_records(register)
    let featureId = ''
    {
      const db = openForgeDbAt(dir)
      try {
        const feature = db
          .prepare<unknown[], { id: string; feature_status: string }>(
            'SELECT id, feature_status FROM features WHERE slug = ?',
          )
          .get(FEATURE)
        expect(feature, '成链 feature 行在场（同名 slug）').toBeDefined()
        featureId = feature?.id ?? ''
        const proposal = db
          .prepare<unknown[], { proposal_status: string; mode: string | null }>(
            'SELECT proposal_status, mode FROM proposals WHERE slug = ?',
          )
          .get(PROP)
        expect(proposal).toMatchObject({ proposal_status: 'accepted', mode: 'expedition' })
        const lineage = db
          .prepare<unknown[], { proposal_id: string }>('SELECT proposal_id FROM features WHERE id = ?')
          .get(featureId)
        expect(lineage?.proposal_id, '谱系 proposal_id 回指').toBeDefined()
        const register = db
          .prepare<unknown[], { verb: string; actor: string }>(
            'SELECT verb, actor FROM feature_records WHERE feature_id = ? ORDER BY id',
          )
          .all(featureId)
        expect(register, 'feature_records(register) 审计伴随（成链内聚）').toEqual([{ verb: 'register', actor: 'core' }])
      } finally {
        db.close()
      }
    }

    // ── 规格文档两篇（upsertDoc RPC 人类面 + 真实文件——登记即推进）+ 任务三件 db-insert 受控初态 ──
    const docPrd = `docs/features/${FEATURE}/prd/prd-spec.md`
    const docDesign = `docs/features/${FEATURE}/design/tech-design.md`
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
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, {
      projectId, featureSlug: FEATURE, docKind: 'prd-spec', relPath: docPrd, summary: 'M3.5 PRD（走查初稿）',
    })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, {
      projectId, featureSlug: FEATURE, docKind: 'tech-design', relPath: docDesign, summary: 'M3.5 技术设计（走查初稿）',
    })
    {
      const db = openForgeDbAt(dir)
      try {
        // 1.1 (P0) halted 复位路径靶：会话 A spawn 失败 ×3 粘住 → 人工转移 → 会话 B 完成
        seedDogfoodTaskRow(db, FEATURE, '1.1', {
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
        // 1.2 (P1) 成功径
        seedDogfoodTaskRow(db, FEATURE, '1.2', {
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
        // 1.3 (P2) 受阻 → fix 链 → 恢复二轮（M3 addTask tool 参数面教学）
        seedDogfoodTaskRow(db, FEATURE, '1.3', {
          title: '确保 docs/knowledge/freshness-checklist.md 存在且含一行 marker（缺席时受阻走 fix 链）',
          taskType: 'doc',
          priority: 'P2',
          taskDesc: [
            `目标：docs/knowledge/freshness-checklist.md 在场且内容含一行 marker。`,
            '1) 若该文件不存在：不要创建它。直接 submitTask result=blocked，reason 填「freshness-checklist.md absent — fix: create docs/knowledge/freshness-checklist.md containing the single line: marker」，随后按 fix 链协议调用 addTask 建修复任务：source_kind="feature"、source_slug="dsh-forge-m3.5-knowledge-consolidation"、title="Fix: create freshness-checklist.md"、type="doc"、source_task_slug="dsh-forge-m3.5-knowledge-consolidation"、source_task_local_id="1.3"、block_source=true、task_desc 简述成因。',
            '2) 若该文件已存在：确保其中含一行 marker（无则追加），跑四门（just compile/fmt/lint/unit-test），git 提交，submitTask result=success（files=["docs/knowledge/freshness-checklist.md"]、四门布尔、commit_hash）。',
          ].join('\n'),
        })
        // 1.4 收官占位（no-task 分支确定性驱动 + 双 dispatcher 防线走查）：harness 预领后
        // 全程 in_progress（他会话 in_progress 对盲选不可见——双派发防线实证），其余任务
        // 全终态后 dispatcher 必命中 no-task（池快照 in_progress=1 → wait 判词 → 续环）；
        // harness 随后结算 → 末轮 no-task（done 判词）收工。
        seedDogfoodTaskRow(db, FEATURE, '1.4', {
          title: '收官占位（harness 预领——no-task 收工信号驱动）',
          taskType: 'doc',
          taskDesc: '占位任务——由测试 harness 领取与结算，执行器无需处理。',
        })
        // 相位不动点对齐（M2 5.4 同形）：文档两篇 + 任务在场 → taskDerived 覆盖为 tasks
        db.prepare(`UPDATE features SET feature_status = 'tasks', updated_at = ? WHERE slug = ?`).run(
          new Date().toISOString(),
          FEATURE,
        )
      } finally {
        db.close()
      }
    }

    // ── SC3 前置快照：预置文档哈希（走查后零变化断言）+ 树基线 ──
    const presetFiles = [
      join(ws, 'justfile'),
      join(ws, 'README.md'),
      join(ws, '.gitignore'),
      join(ws, '.forge', 'docs', 'proposals', PROP, 'proposal.md'),
      join(ws, '.forge', docPrd),
      join(ws, '.forge', docDesign),
    ]
    const hashBefore = new Map(presetFiles.map((f) => [f, hashFile(f)]))

    // ── 1.4 收官占位预领（harness 会话身份）：他会话 in_progress 对 dispatcher 盲选不可见
    //    （双 dispatcher 不双派发防线）——其余任务全终态后 dispatcher 必命中 no-task ──
    await driver.call('forgeTasks', 'claimTask', {
      projectId,
      taskRef: { slug: FEATURE, localId: '1.4' },
      sessionId: 'e2e-harness',
    })

    // ── SC2/SC7 源码面回归：审计锚零残留（无 watch/回流/编排——runAllSourceAuditAnchors 单源） ──
    const findings = runAllSourceAuditAnchors()
    expect(
      findings,
      `总纲 SC2/SC7 源码面回归零残留：\n${findings.map((f) => `${f.anchor}: ${f.detail}`).join('\n')}`,
    ).toEqual([])

    // ── halted 注入：forgeSettings worker 指向不存在 provider（人类面 RPC——改完即生效） ──
    await forgeInvoke(page, SETTINGS_CHANNELS.set, {
      worker: { provider: BROKEN_PROVIDER, model: 'none', reasoning: 'low' },
    })

    // ── 派发会话 A（UF-3 派发入口——远征 + /run-tasks 单行自动发送）→ spawn 失败 ×3 → halted ──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const dispatchOn = page.locator('[data-dswf-tt-dispatch="on"]').first()
    await expect(dispatchOn, '派发按钮亮起（未终态任务在场）').toBeVisible({ timeout: 30_000 })
    await dispatchOn.click()
    await expect(
      page.locator('[data-conversation-content]').first(),
      '派发指令单行自动发送（容器标识 = feature slug）',
    ).toContainText(`/run-tasks ${FEATURE}`, { timeout: 30_000 })
    await awaitPresetHeaderLabel(page, '远征模式')
    const sessionA = findFixtureSession(dshHome, WS_NAME)
    expect(sessionA, '派发会话 A 落盘开户').toBeDefined()

    // ── halted 收敛轮询：1.1 claim 计 ≥3（幂等重入连环）+ 全库零 submit + 宿主存活 ──
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    const dbStats = (): { statuses: Map<string, string>; claims11: number; submits: number } => {
      const db = openForgeDbAt(dir)
      try {
        const rows = db.prepare<unknown[], { local_id: string; task_status: string }>(
          'SELECT local_id, task_status FROM tasks',
        ).all()
        const claims11 = (
          db
            .prepare<unknown[], { n: number }>(
              `SELECT COUNT(*) AS n FROM task_records r JOIN tasks t ON t.id = r.task_id
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
    const haltDeadline = Date.now() + Number(process.env.DSH_FORGE_DOGFOOD_HALT_MS ?? 480_000)
    for (;;) {
      const s = dbStats()
      if (Date.now() - lastLog > 30_000) {
        lastLog = Date.now()
        console.log(`[m35] halt 阶段 +${Math.round((Date.now() - startedAt) / 1000)}s claims11=${s.claims11} submits=${s.submits} statuses=${JSON.stringify([...s.statuses.entries()])} appExit=${String(proc.exitCode)}`)
      }
      if (proc.exitCode !== null) throw new Error(`宿主进程提前退出：code=${String(proc.exitCode)}`)
      if (s.claims11 >= 3) break
      if (Date.now() > haltDeadline) {
        throw new Error(`halted 收敛超时：claims11=${s.claims11} statuses=${JSON.stringify([...s.statuses.entries()])}`)
      }
      await sleep(3_000)
    }
    await sleep(10_000) // 第三轮失败返回 + 模型收尾静置（db 已稳定——halted 后零 claim 面）
    {
      const s = dbStats()
      expect(s.statuses.get('1.1'), 'halted 形态：1.1 留 in_progress（幂等重入径——不走 submit-blocked）').toBe('in_progress')
      expect(s.statuses.get('1.2'), '1.2 未被触碰（盲选重入本会话 in_progress）').toBe('pending')
      expect(s.statuses.get('1.3'), '1.3 未被触碰').toBe('pending')
      expect(s.submits, 'halted 阶段全库零 submit').toBe(0)
      expect(s.claims11, '1.1 连环重入 claim 计 ≥3（spawn 失败防线阈值）').toBeGreaterThanOrEqual(3)
      console.log(`[m35] halted 收敛 +${Math.round((Date.now() - startedAt) / 1000)}s（claims11=${s.claims11}）`)
    }

    // ── halted 阶段日志面：logs/{slug}.jsonl tool-error ×≥3 + task-claimed ×≥3（容器维度同文件） ──
    const logFile = join(dir, 'logs', `${FEATURE}.jsonl`)
    const haltLines = readLogLines(logFile)
    const toolErrors = haltLines.filter((l) => l.type === 'tool-error')
    const claimEvents = haltLines.filter((l) => l.type === 'task-claimed' && (l.payload.taskKey as string) === `${FEATURE}/1.1`)
    expect(toolErrors.length, 'logs tool-error（ERR_SPAWN_FAILED）×≥3').toBeGreaterThanOrEqual(3)
    expect(toolErrors.every((l) => String(l.payload.code) === 'ERR_SPAWN_FAILED'), 'tool-error 码 = ERR_SPAWN_FAILED').toBe(true)
    expect(claimEvents.length, 'logs task-claimed（1.1 连环重入）×≥3').toBeGreaterThanOrEqual(3)

    // ── 复位：设置回真实模型 + 人工转移（in_progress → pending——人类面 transition） ──
    await forgeInvoke(page, SETTINGS_CHANNELS.set, {
      worker: { provider: DOGFOOD_PROVIDER, model: DOGFOOD_MODEL, reasoning: 'low' },
    })
    const task11Id = `t-${FEATURE}-1.1`
    await forgeInvoke(page, TASKS_CHANNELS.transition, {
      projectId, taskId: task11Id, toStatus: 'pending',
      reason: 'SC-M3 走查：halted 复位——人工转移后经派发入口新会话重派（ERR_SPAWN_FAILED 指引径）',
    })
    {
      const db = openForgeDbAt(dir)
      try {
        const row = db
          .prepare<unknown[], { task_status: string }>('SELECT task_status FROM tasks WHERE id = ?')
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

    // ── 派发会话 B（冷启动计数器复位——新会话径）：派发入口再入 → 新会话 + 单行自动发送 ──
    await openOverviewDock(page) // 会话编排后 dock 激活面可被取代——幂等重开（M3 5.2 口径）
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const dispatchOn2 = page.locator('[data-dswf-tt-dispatch="on"]').first()
    await expect(dispatchOn2, '派发按钮亮起（1.1 回 pending + 其余未终态）').toBeVisible({ timeout: 30_000 })
    await dispatchOn2.click()
    await expect(
      page.locator('[data-conversation-content]').first(),
      '会话 B 派发指令自动发送（不重发到 A——新会话转录只含本轮指令）',
    ).toContainText(`/run-tasks ${FEATURE}`, { timeout: 30_000 })
    await awaitPresetHeaderLabel(page, '远征模式')
    await awaitNoLateModals(page)

    // ── 全任务终态轮询（forge.db 直读——WAL 并发读；渲染层零依赖）+ 1.4 收官结算介入 ──
    // 1.4 结算时机 = 事件门控（首轮 no-ready-task 落日志后）——过早结算会挤进末轮 spawned
    // 返回的池快照读窗（池显示全终态 → 模型直接收工不再调用——run4 实证）；门控保证模型
    // 先撞一次 no-task（wait 判词 → 续环），harness 随后结算 → 末轮 no-task（done 判词）收工。
    // 90s 兜底 = 模型耐心耗尽直收工的收敛保底（此时断言面 fail-loud）。
    let closerSettled = false
    let othersTerminalSince = 0
    const settleDeadline = Date.now() + Number(process.env.DSH_FORGE_DOGFOOD_DEADLINE_MS ?? 1_500_000)
    const noReadySeen = (): boolean =>
      [...readLogLines(logFile), ...readLogLines(join(dir, 'logs', '_pool.jsonl'))].some(
        (l) => l.type === 'no-ready-task',
      )
    for (;;) {
      const s = dbStats()
      if (Date.now() - lastLog > 30_000) {
        lastLog = Date.now()
        console.log(`[m35] 派发中 +${Math.round((Date.now() - startedAt) / 1000)}s statuses=${JSON.stringify([...s.statuses.entries()])} appExit=${String(proc.exitCode)}`)
      }
      if (proc.exitCode !== null) throw new Error(`宿主进程提前退出：code=${String(proc.exitCode)}`)
      const othersTerminal =
        s.statuses.get('1.4') === 'in_progress' &&
        [...s.statuses.entries()].every(([id, st]) => id === '1.4' || st === 'completed' || st === 'skipped')
      if (othersTerminal && othersTerminalSince === 0) othersTerminalSince = Date.now()
      if (!closerSettled && othersTerminal && (noReadySeen() || Date.now() - othersTerminalSince > 90_000)) {
        await driver.call('forgeTasks', 'submitTask', {
          projectId,
          taskRef: { slug: FEATURE, localId: '1.4' },
          result: 'success',
          summary: 'harness 收官结算 1.4（no-task 收工信号驱动——双 dispatcher 防线占位）',
          sessionId: 'e2e-harness',
        })
        closerSettled = true
        console.log(`[m35] harness 收官结算 1.4 完成（事件门控=${noReadySeen() ? 'no-ready-task 已见' : '90s 兜底'}）`)
      }
      const unsettled = [...s.statuses.entries()].filter(([, st]) => st !== 'completed' && st !== 'skipped')
      if (unsettled.length === 0) break
      if (Date.now() > settleDeadline) {
        throw new Error(`走查终态超时：statuses=${JSON.stringify([...s.statuses.entries()])}`)
      }
      await sleep(3_000)
    }
    console.log(`[m35] 全任务终态收敛 +${Math.round((Date.now() - startedAt) / 1000)}s`)

    // ── no-task 收工等待：dispatcher 末轮调用滞后于库终态（模型回合收尾在最后一个 spawned
    //    返回之后——closeApp 前留给循环收口，否则 no-ready-task 事件随末轮调用一同夭折）──
    {
      const noReadyDeadline = Date.now() + 180_000
      for (;;) {
        const l1 = readLogLines(logFile)
        const l2 = readLogLines(join(dir, 'logs', '_pool.jsonl'))
        if ([...l1, ...l2].some((l) => l.type === 'no-ready-task')) {
          console.log(`[m35] no-ready-task 事件在场（dispatcher 末轮收口）+${Math.round((Date.now() - startedAt) / 1000)}s`)
          break
        }
        if (Date.now() > noReadyDeadline) break // 等待窗尽——断言面 fail-loud 兜底
        await sleep(3_000)
      }
    }

    // ── 转录尾部留痕（诊断面——审计与 db 为断言真相） ──
    const transcriptTail =
      (await page
        .locator('[data-conversation-content]')
        .first()
        .textContent({ timeout: 10_000 })
        .catch(() => '<renderer-unavailable>')) ?? ''
    console.log('[m35] 会话 B 转录尾部：', transcriptTail.slice(-500))
    test.info().annotations.push({ type: 'm35-transcript-tail', description: transcriptTail.slice(-1200) })

    // ── AC1 断言面：任务/执行记录 100% 入自身 forge.db（record id 升序 = 追加序真相） ──
    const db = openForgeDbAt(dir)
    let audit: ReturnType<typeof readDogfoodAudit>
    let statusOf: ReadonlyMap<string, string>
    try {
      audit = readDogfoodAudit(db)
      statusOf = new Map(
        db
          .prepare<unknown[], { local_id: string; task_status: string }>('SELECT local_id, task_status FROM tasks')
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
    const recsOf = (localId: string): readonly DogfoodAuditRecord[] => records.filter((r) => r.localId === localId)
    // 全景覆盖（100% 入库）：全任务终态 completed + 容器/模式快照 + 每任务 claim/submit 双记录
    expect(tasks.length, '任务全量 = 四件 + fix 一件').toBe(5)
    for (const t of tasks) {
      expect(statusOf.get(t.localId), `任务 ${t.localId} 终态 completed`).toBe('completed')
      expect([t.sourceKind, t.mode], `任务 ${t.localId} 容器/模式快照（feature · expedition）`).toEqual(['feature', 'expedition'])
      const rs = recsOf(t.localId)
      expect(rs.some((r) => r.verb === 'claim'), `${t.localId} claim 记录在场`).toBe(true)
      expect(rs.some((r) => r.verb === 'submit' && r.toStatus === 'completed'), `${t.localId} submit·success 记录在场`).toBe(true)
    }
    expect(tasks.filter((t) => /^fix-\d+$/.test(t.localId)), 'fix 任务行（fix-N 前缀）').toHaveLength(1)
    // 1.4 收官占位：harness 预领（他会话 in_progress 对两代 dispatcher 盲选均不可见——双派发
    // 防线实证：全程零模型 claim 记录）+ harness 结算
    {
      const r4 = recsOf('1.4')
      const r4Claims = r4.filter((r) => r.verb === 'claim')
      expect(r4Claims, '1.4 恰一条 claim（harness 预领——零模型重入）').toHaveLength(1)
      expect(r4Claims[0]?.sessionId, '1.4 领取会话 = harness（盲选不可见性）').toBe('e2e-harness')
      expect(r4.find((r) => r.verb === 'submit')?.toStatus, '1.4 harness 结算 completed').toBe('completed')
    }
    // 1.1 halted 连环 + 复位后单轮成功（≥4 claim = ≥3 重入连环 + 会话 B 复位领取）
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
    // SC7 真闭环：worker 结算会话 ≠ 派发会话（真实模型 worker 经 tool 写入状态层）
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
    // 1.3 fix 链（blocked → 单事务建链 → fix 完成 → auto-restore → 二轮成功）
    const c = recsOf('1.3')
    const cBlocked = c.find((r) => r.verb === 'submit' && r.toStatus === 'blocked')
    expect(cBlocked, '1.3 一轮受阻结算在场（reason 必带）').toBeDefined()
    expect(cBlocked?.reason ?? '').toContain('freshness-checklist.md')
    const fixRow = tasks.find((t) => t.sourceTaskId === taskByLocal('1.3').id)
    expect(fixRow, 'fix 任务行在场（fix-N 前缀）').toBeDefined()
    expect(fixRow?.localId).toMatch(/^fix-\d+$/)
    const fixAdd = recsOf(fixRow!.localId).find((r) => r.verb === 'add')
    expect(fixAdd, 'fix add 记录在场（worker tool 面——逃生通道）').toBeDefined()
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

    // ── logs 串联断言：容器维度全程（taskKey 过滤 → claim→spawn→submit→worker-done 会话链） ──
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
    // no-task 分支证据：池清后收工事件（source 对在场 = source_slug 归属容器日志；缺席回落 _pool 兜底）
    const poolLines = readLogLines(join(dir, 'logs', '_pool.jsonl'))
    const noReady = [...lines, ...poolLines].filter((l) => l.type === 'no-ready-task')
    expect(noReady.length, 'no-ready-task 事件在场（dispatchTask no-task 分支——收工信号）').toBeGreaterThanOrEqual(1)

    // ── AC2 断言面：零 manifest.md（文件系统断言）+ SC3 只读纪律（预置文档零变化 + git 干净） ──
    const allFiles = walkFiles(ws)
    const manifests = allFiles.filter((f) => f.split(/[\\/]/).pop()?.toLowerCase() === 'manifest.md')
    expect(manifests, `全程零 manifest.md 生成（老 forge 形态消亡——SC8 判据）：${manifests.join(', ')}`).toEqual([])
    for (const [file, before] of hashBefore) {
      expect(hashFile(file), `SC3 只读纪律：预置文档零变化（${file}）`).toBe(before)
    }
    const gitStatus = execFileSync('git', ['status', '--porcelain'], { cwd: ws, encoding: 'utf8' })
    expect(gitStatus, 'SC3 收口：夹具仓干净（一切 worker 产物经 git 提交——管线纪律）').toBe('')

    // ── AC2/AC3 断言面：概览三视图 / 文档 / 提案子 tab 全景一致（UI = forge.db 直读一致） ──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(propRow, '提案行：已接受 + 远征（评审终态全景）').toContainText('已接受', { timeout: 30_000 })
    await expect(propRow).toContainText('远征')
    await page.locator(ovSubtabOf('features')).click()
    await expect(page.locator(ovSubtabOf('features'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const featRow = page.locator('[data-dswf-ov-features] [data-dswf-ov-parent]', { hasText: FEATURE }).first()
    await expect(featRow, 'feature 行在场（成链同名 slug）').toBeVisible({ timeout: 30_000 })
    await featRow.locator('[data-dswf-ov-parent-toggle]').click()
    await expect(
      page.locator(`[data-dswf-ov-doc="${docPrd}"]`),
      'feature 文档区：PRD 行（分层文档）',
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(`[data-dswf-ov-doc="${docDesign}"]`), 'feature 文档区：技术设计行').toBeVisible({ timeout: 15_000 })
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(
      page.locator(`[data-dswf-tt-contpill="feature:${FEATURE}"]`),
      '容器 pill = feature 容器（双轨判别）',
    ).toBeVisible({ timeout: 30_000 })
    for (const t of tasks) {
      const row = page.locator(ttItemOf(t.id)).first()
      await expect(row, `任务行在场：${t.localId}`).toBeVisible({ timeout: 30_000 })
      await expect(row, `任务行终态全景一致：${t.localId}（UI = db 直读——SC2②）`).toContainText('已完成', { timeout: 15_000 })
    }
    const dispatchOff = page.locator('[data-dswf-tt-dispatch="off"]').first()
    await expect(dispatchOff, '全终态置灰（UF-3 收工态）').toBeVisible({ timeout: 30_000 })
    await expect(dispatchOff).toBeDisabled()

    // ── 收尾：事件记账快照留痕 + 关停 ──
    const bridgeEvents = await driver.events().catch((cause: unknown) => {
      console.error('[m35] 事件记账快照失败（宿主连接态）：', String((cause as Error)?.message ?? cause))
      return [] as { at: number; channel: string; payload: { projectId: string } }[]
    })
    test.info().annotations.push({ type: 'm35-bridge-events', description: JSON.stringify(bridgeEvents.length) })
    console.log(
      `[m35] 走查完成 +${Math.round((Date.now() - startedAt) / 1000)}s（tasks=${tasks.length} records=${records.length} logLines=${lines.length} bridgeEvents=${bridgeEvents.length}）`,
    )
    await closeApp(launched.app).catch((cause: unknown) => {
      console.error('[m35] closeApp 异常（宿主连接态）：', String((cause as Error)?.message ?? cause))
    })
    launched = undefined
  } catch (cause) {
    keepEvidence = true
    console.error('[m35] 失败——证据保留：', `userData=${userData}`, `wsRoot=${wsRoot}`, `overlay=${overlay}`)
    console.error('[m35] 原始错误：', cause)
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
