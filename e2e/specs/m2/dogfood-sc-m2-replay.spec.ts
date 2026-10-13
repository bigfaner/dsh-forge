// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.4 SC-M2 门回放版（worker-exec-evidence-replay/1.5——提案附录 A 层：管线链断言走 verb
// 回放）。消费 SC-M2 dogfood 录制夹具（e2e/fixtures/m2/dogfood-dispatch-chain.jsonl——
// dogfood-sc-m2.spec.ts 录制产出，夹具随跑重录），经主侧测试钩子（createBridgeDriver——
// 与 tool 面同一 dispatchRpc 入口）依序重放 verb 行：零真实模型调用，应用链（任务状态机
// /审计追加序/files_json/gate/commit/fix 链单事务/中断恢复/事件流）与录制轮同一产品写路径
// 真实照跑。
//
// 「模型」变量的回放代位（A 层边界——录制的 worker 文件写入/提交不在 verb 面）：
//   · 工件代位——submit 前由本 spec 确定性写入同内容工件（notes.md/interrupt.md/target.md）
//     并 git 提交，提交哈希覆写进重放 args.commitHash（录制期哈希绑定录制期仓不可复现——
//     git 历史包含性断言结构保留，证据落在本轮提交）；
//   · projectId 同机重键（b5-anchors 先例——verb 载荷绑定录制期 projectId 不可跨库重放）；
//   · observed 行 = 录制期 golden 对拍锚（不执行）：重放结算逐行对拍 status/reclaimed/
//     restored/localId——漂移即 fail-loud。
//
// 断言结构对齐 dogfood-sc-m2.spec.ts（AC1 审计半 / AC2 / AC3 逐条保留；AC4 夹具 = 本 spec
// 输入而非产出——夹具完整性门在录制轮承载；物理工件断言由代位面承载）：
//   AC1  1.1 一条不间断（claim digest / 派发会话 ≠ 执行会话 / gate 四布尔 / files_json /
//        commit 在本轮夹具仓 git 历史）；
//   AC2  fix 链（blocked → 单事务建链 auto-block+add 相邻 → fix 完成 → auto-restore 相邻
//        → 边不删 → 二轮成功）；
//   AC3  中断恢复（首领与重入间零 submit / reclaimed from-to 空 / 重入 digest 新值 /
//        3.2 harness 结算落两 claim 之间）。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { FEATURES_CHANNELS, PROJECTS_M2_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, ROOT, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { loadFixture } from '../../support/replay/fixtures.js'
import type { ReplayVerbStep } from '../../support/replay/format.js'
import { readDogfoodAudit, seedDogfoodTaskRow, type DogfoodAuditRecord } from '../../support/replay/dogfood-record.js'

/** 夹具 feature slug（与录制轮一致——任务自然键 + 审计链同构前提） */
const FEATURE = 'dogfood-demo'
/** 录制夹具（SC-M2 dogfood 产出——5.2 回放消费面） */
const FIXTURE_IN = join(ROOT, 'e2e', 'fixtures', 'm2', 'dogfood-dispatch-chain.jsonl')
/** 夹具工作区目录名（注册名 = 工作区目录名——芯片菜单过滤口径） */
const WS_NAME = 'dogfood-ws'

/** 夹具工作区：git 仓 + 无害基线（工件由代位面按 submit 步确定性落） */
function makeReplayWorkspace(): string {
  const wsRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-replay-df-ws-'))
  const ws = join(wsRoot, WS_NAME)
  mkdirSync(ws, { recursive: true })
  writeFileSync(join(ws, 'README.md'), '# dogfood replay workspace\n', 'utf8')
  const git = (args: readonly string[]): void => {
    execFileSync('git', args, { cwd: ws, stdio: 'pipe' })
  }
  git(['init'])
  git(['config', 'user.email', 'dogfood@example.invalid'])
  git(['config', 'user.name', 'dogfood-replay'])
  git(['add', '.'])
  git(['commit', '-m', 'chore: dogfood replay base'])
  return wsRoot
}

/** 工件代位：写文件 + git 提交 → 新提交哈希（重放 args.commitHash 覆写源） */
function stageArtifact(ws: string, name: string, content: string): string {
  writeFileSync(join(ws, name), content, 'utf8')
  execFileSync('git', ['add', name], { cwd: ws, stdio: 'pipe' })
  execFileSync('git', ['commit', '-m', `feat: stage ${name} (replay stand-in)`], { cwd: ws, stdio: 'pipe' })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ws, encoding: 'utf8' }).trim()
}

test('@web-e2e @m2 5.4 SC-M2 门回放版：录制夹具 verb 重放（fix 链 + 中断恢复）——零真实模型', async () => {
  test.setTimeout(420_000)
  const fixture = loadFixture(FIXTURE_IN)
  expect(fixture.header.source, '消费面 = dogfood 录制夹具（录制源不可带伤）').toBe('dogfood')

  const wsRoot = makeReplayWorkspace()
  const ws = join(wsRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-replay-df-ud-'))
  let launched: Launched | undefined
  try {
    launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
    const page = launched.page
    const driver = createBridgeDriver(launched.app)

    // ── 受控初态：注册 + feature 行（人类径 RPC）+ 相位号任务直种（与录制轮同构——审计链同构前提） ──
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
          taskDesc: '回放轮任务规格与录制轮逐字同构（claim 简报重合成 = 产品面真实照跑）',
        })
        seedDogfoodTaskRow(db, FEATURE, '2.1', {
          title: '验证 target.md 在场且含一行 marker（缺席 = 受阻走 fix 链）',
          taskType: 'doc',
          priority: 'P1',
          taskDesc: '回放轮任务规格与录制轮逐字同构',
        })
        seedDogfoodTaskRow(db, FEATURE, '3.1', {
          title: '中断恢复演练：创建 interrupt.md 并结算（首轮经 harness 预置中断——领取后无结算）',
          taskType: 'doc',
          priority: 'P1',
          taskDesc: '回放轮任务规格与录制轮逐字同构',
        })
        seedDogfoodTaskRow(db, FEATURE, '3.2', {
          title: '保留任务（harness 结算占位）',
          taskType: 'doc',
          priority: 'P2',
          taskDesc: '占位任务——由测试 harness 直接结算，执行器无需处理。',
        })
        db.prepare(`UPDATE features SET feature_status = 'tasks', updated_at = ? WHERE slug = ?`).run(
          new Date().toISOString(),
          FEATURE,
        )
      } finally {
        db.close()
      }
    }

    // ── verb 行依序重放（projectId 同机重键 + 工件代位 + commitHash 覆写）+ golden 对拍 ──
    const verbs = fixture.steps.filter((s): s is ReplayVerbStep => s.kind === 'verb')
    const observedBySeq = new Map(
      fixture.steps.filter((s) => s.kind === 'observed').map((s) => [s.seq, s]),
    )
    /** 工件代位表：submit 步 seq → [文件名, 内容]（提交哈希覆写进重放 args） */
    const stageBySeq = new Map<number, readonly (readonly [string, string])[]>([
      [11, [['notes.md', 'dogfood-ok\n']]],
      [13, [['interrupt.md', 'done\n']]],
      [23, [['target.md', 'marker\n']]],
    ])
    for (const step of verbs) {
      const args: Record<string, unknown> = { ...step.args, projectId }
      if (step.verb === 'submitTask') {
        const artifacts = stageBySeq.get(step.seq)
        if (artifacts !== undefined) {
          let hash = ''
          for (const [name, content] of artifacts) hash = stageArtifact(ws, name, content)
          if (typeof args.commitHash === 'string') args.commitHash = hash
        }
      }
      let result: unknown
      try {
        result = await driver.call(step.service, step.verb, args)
      } catch (cause) {
        const reason = String((cause as Error)?.message ?? cause)
        throw new Error(`[replay] 步骤 #${step.seq} ${step.service}.${step.verb} 失败：${reason}（回放 fail-fast——夹具/产品面错配定位）`)
      }
      // golden 对拍（observed = 录制期结算锚——结构面逐字段，非逐字 prompt）
      const obs = observedBySeq.get(step.seq)
      if (obs !== undefined && obs.verb === step.verb) {
        const r = result as Record<string, unknown>
        const o = obs.result as Record<string, unknown>
        if (step.verb === 'claimTask') {
          expect(r.reclaimed, `#${step.seq} claim reclaimed 对拍`).toBe(o.reclaimed)
          const task = r.task as { localId: string } | undefined
          const obsTask = o.task as { localId: string } | undefined
          expect(task?.localId, `#${step.seq} claim 任务对拍`).toBe(obsTask?.localId)
          expect(typeof r.digest, `#${step.seq} digest 在场（12 hex——产品面实时重合成）`).toBe(true)
        } else if (step.verb === 'submitTask') {
          expect(r.status, `#${step.seq} submit status 对拍`).toBe(o.status)
          expect(((r.restored as unknown[]) ?? []).length, `#${step.seq} restored 清单对拍`).toBe(((o.restored as unknown[]) ?? []).length)
        } else if (step.verb === 'addTask') {
          expect(r.localId, `#${step.seq} addTask localId 对拍`).toBe(o.localId)
          expect(r.reused, `#${step.seq} addTask reused 对拍`).toBe(o.reused)
        }
      }
    }

    // ── 审计断言面（与 dogfood-sc-m2.spec.ts 同构——record id 升序 = 追加序真相） ──
    const db = openForgeDbAt(derived.dir)
    let records: readonly DogfoodAuditRecord[]
    let tasks: { id: string; localId: string; sourceTaskId: string | null }[]
    let edges: readonly { taskId: string; prerequisiteId: string; origin: string }[]
    try {
      const audit = readDogfoodAudit(db)
      records = audit.records
      tasks = audit.tasks.map((t) => ({ id: t.id, localId: t.localId, sourceTaskId: t.sourceTaskId }))
      edges = audit.edges
    } finally {
      db.close()
    }
    const recsOf = (localId: string): readonly DogfoodAuditRecord[] => records.filter((r) => r.localId === localId)
    const taskByLocal = (localId: string): { id: string; localId: string; sourceTaskId: string | null } => {
      const row = tasks.find((t) => t.localId === localId)
      expect(row, `任务行在场：${localId}`).toBeDefined()
      return row!
    }

    // AC1：1.1 一条不间断（claim digest + 派发≠执行会话 + submit gate/files/commit + git 历史）
    const a = recsOf('1.1')
    const aClaim = a.find((r) => r.verb === 'claim')
    const aSubmit = a.find((r) => r.verb === 'submit')
    expect(aClaim, '1.1 claim 记录在场').toBeDefined()
    expect(aSubmit, '1.1 submit 记录在场').toBeDefined()
    expect(aClaim!.dispatchDigest).toMatch(/^[0-9a-f]{12}$/)
    expect(aClaim!.sessionId, '1.1 派发会话 = 主会话（session- 前缀形态——录制载荷保真）').toMatch(/^session-/)
    expect(aSubmit!.sessionId, '1.1 执行会话 ≠ 派发会话（SC6③——子会话裸 uuid 形态）').not.toBe(aClaim!.sessionId)
    expect(aSubmit!.toStatus).toBe('completed')
    expect(aSubmit!.summary ?? '').not.toBe('')
    const aGate = JSON.parse(aSubmit!.gateJson ?? 'null') as Record<string, unknown> | null
    expect(aGate, '1.1 gate 四布尔落账').toMatchObject({ compile: true, fmt: true, lint: true, test: true })
    expect(JSON.parse(aSubmit!.filesJson ?? '[]')).toContain('notes.md')
    expect(aSubmit!.commitHash ?? '').toMatch(/^[0-9a-f]{7,40}$/)
    expect(readWsFile(ws, 'notes.md'), '1.1 工件在场：notes.md 内容逐字').toBe('dogfood-ok\n')
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
    expect(readWsFile(ws, 'target.md'), '2.1 工件在场：target.md 含 marker').toContain('marker')

    // AC3：中断恢复（3.1 一轮无 submit → 重入 reclaimed（from/to 空）→ digest 新值 → 恢复结算）
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
    expect(readWsFile(ws, 'interrupt.md'), '3.1 工件在场：interrupt.md 内容逐字').toBe('done\n')
    // 3.2 harness 结算在 3.1 首领与重入之间（相位推进 = digest 新值的驱动面）
    const s = recsOf('3.2')
    const sSubmit = s.find((r) => r.verb === 'submit')
    expect(sSubmit?.id, '3.2 结算时刻落 3.1 首领与重入之间').toBeGreaterThan(cFirst.id)
    expect(sSubmit?.id).toBeLessThan(cReclaim.id)
    expect(sSubmit?.sessionId).toBe('e2e-harness')

    // 事件流：重放期间 tasks-changed 主侧记账 ≥ verb 行数（事件面真实照跑——录制 event 行
    // 为录制期快照不重放，重放轮事件 = 本轮 live 记账）
    const events = await driver.events()
    expect(events.length, '重放轮事件记账 ≥ verb 行数（事件流真实照跑）').toBeGreaterThanOrEqual(verbs.length)
  } finally {
    if (launched !== undefined) await closeApp(launched.app).catch(() => undefined)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(wsRoot)
  }
})

/** 工作区文件读取（代位工件断言面） */
function readWsFile(ws: string, name: string): string {
  return readFileSync(join(ws, name), 'utf8')
}
