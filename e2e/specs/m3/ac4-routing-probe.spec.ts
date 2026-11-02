// @feature:expert-squad-default-routing @web-e2e
// AC4 真机取证探针（expert-squad-default-routing/disc-1——过程件，不入 git）：
// dev 宿主（electron dev profile）真实 dispatchTask 派发两例——
//   case1 基座：expert-squad cordis patch（DSH_FORGE_PATCH_FILES 叠层）defaultAgentOptions
//        {zai-coding-cn/glm-5.3-flash/reasoning: high}，doc 任务（tech-writer 档案无路由）
//        → 期望 route=zai-coding-cn/glm-5.3-flash/high（③基座命中）
//   case2 override：同一基座 + experts['@dsh-forge/plugin-forge#tech-writer'].agentOptions
//        {同 provider/model, reasoning: low} → 期望 route=…/low（①条目压过③；档位取模型支持集内值——medium 不在 glm-5.3-flash 支持集会被 reconcile 剥离）
// 取证锚：host stderr [forge-spawn-routing]（in-process-driver.ts:184）+ worker 会话 dump。
// 证据保留（keepEvidence）：userData/wsRoot/overlay 不清理，路径打点供归档拷贝。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { DOGFOOD_MODEL, DOGFOOD_PROVIDER, realCredentials, seedDshHome } from '../../support/dogfood.js'
import { closeApp, launchHost, ROOT, type Launched } from '../../support/launch.js'
import { openOverviewDock } from '../../support/navigation.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { seedFeature } from '../../../packages/core/src/forge/tasks/harness.js'
import { seedDogfoodTaskRow } from '../../support/replay/dogfood-record.js'
import { bestSessionLog, decodeSessionFile, sessionLogById } from '../../support/session-files.js'
import { awaitPresetHeaderLabel } from '../../support/m3.js'
import { ovSubtabOf } from '../../support/anchors.js'
import { backupTrackedFile, restoreTrackedFile } from '../../support/fixtures.js'

const FEATURE = 'ac4-routing-probe'
const EVIDENCE_ROOT = process.env.AC4_EVIDENCE_DIR ?? join(tmpdir(), 'ac4-evidence')
/** dev profile 用户层 cordis.patch.yml（expert-squad 播种写径——备份/改写/还原） */
const DEV_PATCH = join(ROOT, 'apps', 'host', 'profile.dev', 'cordis.patch.yml')

function makeWorkspace(): string {
  const wsRoot = mkdtempSync(join(tmpdir(), 'ac4-probe-ws-'))
  const ws = join(wsRoot, 'probe-ws')
  mkdirSync(ws, { recursive: true })
  const justfile = [
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
  writeFileSync(join(ws, '.gitignore'), '.forge/\n', 'utf8')
  const git = (args: readonly string[]): void => execFileSync('git', args, { cwd: ws, stdio: 'pipe' })
  git(['init'])
  git(['config', 'user.email', 'probe@example.invalid'])
  git(['config', 'user.name', 'ac4-probe'])
  git(['add', '.'])
  git(['commit', '-m', 'chore: ac4 probe fixture base'])
  return wsRoot
}

/** expert-squad cordis.patch.yml 播种行（id 定向 patch 行——config 整组替换语义） */
function squadPatchRow(o: { readonly withOverride: boolean }): string {
  const lines = [
    '- id: expert-squad',
    "  name: '@dsh-forge/expert-squad'",
    '  config:',
    '    defaultAgentOptions:',
    `      provider: ${DOGFOOD_PROVIDER}`,
    `      model: ${DOGFOOD_MODEL}`,
    '      reasoning: high',
  ]
  if (o.withOverride) {
    lines.push(
      '    experts:',
      '      "@dsh-forge/plugin-forge#tech-writer":',
      '        agentOptions:',
      `          provider: ${DOGFOOD_PROVIDER}`,
      `          model: ${DOGFOOD_MODEL}`,
      '          reasoning: low',
    )
  }
  return lines.join('\n')
}

/** expert-squad 播种：dev profile 用户层 cordis.patch.yml 追加行（返回还原闭包；写径复位
 *  走支撑层单源 backupTrackedFile / restoreTrackedFile——e2e-fast-shared-launch/1.17 收编） */
function seedProfilePatch(o: { readonly withOverride: boolean; readonly caseDir: string }): () => void {
  const original = backupTrackedFile(DEV_PATCH) as string
  writeFileSync(join(o.caseDir, 'profile-dev-patch.before.yml'), original, 'utf8')
  const seeded = `${original}\n# AC4 探针播种（expert-squad-default-routing/disc-1）——探针还原\n${squadPatchRow(o)}\n`
  writeFileSync(DEV_PATCH, seeded, 'utf8')
  writeFileSync(join(o.caseDir, 'profile-dev-patch.seeded.yml'), seeded, 'utf8')
  return () => restoreTrackedFile(DEV_PATCH, original)
}

/** dogfood 模型叠层（不含 expert-squad 行——播种归 profile patch） */
function writeSquadOverlay(o: { readonly tag: string }): string {
  const target = join(tmpdir(), `ac4-squad-patch-${o.tag}-${process.pid}.yml`)
  const lines = [
    '# AC4 探针叠层：dogfood 模型',
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
    `      ${DOGFOOD_PROVIDER}:`,
    '        apiKeyEnv: ZAI_CODING_CN_API_KEY',
    '- id: agent-default-model',
    '  config:',
    `    provider: ${DOGFOOD_PROVIDER}`,
    `    model: ${DOGFOOD_MODEL}`,
  ]
  writeFileSync(target, lines.join('\n') + '\n', 'utf8')
  return target
}

interface LogLine {
  readonly ts: number
  readonly sessionId: string
  readonly slug: string
  readonly type: string
  readonly payload: Record<string, unknown>
}

function readLogLines(file: string): LogLine[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => {
      try {
        return JSON.parse(l) as LogLine
      } catch {
        return undefined
      }
    })
    .filter((l): l is LogLine => l !== undefined)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function runCase(o: { readonly tag: string; readonly withOverride: boolean }): Promise<void> {
  const credentials = realCredentials()
  test.skip(credentials === undefined, 'dogfood 前置缺口：真实模型凭据不在场——留痕 skip')
  test.skip(process.env.DSH_FORGE_DOGFOOD_RECORD !== '1', '去模型化门：须显式 DSH_FORGE_DOGFOOD_RECORD=1')
  test.setTimeout(1_500_000)
  const caseDir = join(EVIDENCE_ROOT, o.tag)
  mkdirSync(caseDir, { recursive: true })
  const wsRoot = makeWorkspace()
  const ws = join(wsRoot, 'probe-ws')
  const userData = mkdtempSync(join(tmpdir(), `ac4-probe-ud-${o.tag}-`))
  const dshHome = join(userData, 'dsh-home')
  seedDshHome(dshHome, credentials as string)
  const overlay = writeSquadOverlay({ tag: o.tag })
  writeFileSync(join(caseDir, 'squad-patch.yml'), readFileSync(overlay, 'utf8'), 'utf8')
  const restorePatch = seedProfilePatch({ withOverride: o.withOverride, caseDir })
  let launched: Launched | undefined
  let keepEvidence = false
  try {
    launched = await launchHost({
      userData,
      overlay,
      env: { DSH_FORGE_TEST_BRIDGE: '1' },
      timeouts: { firstWindow: 120_000, bootReady: 180_000, loaderLive: 120_000, workbenchVisible: 120_000 },
    })
    const page = launched.page
    // host stderr/stdout 捕获（[forge-spawn-routing] 锚——in-process-driver.ts:184）
    const procOut: string[] = []
    const appProc = launched.app.process()
    appProc.stdout?.on('data', (d: Buffer) => procOut.push(String(d)))
    appProc.stderr?.on('data', (d: Buffer) => procOut.push(String(d)))

    await registerProject(page, ws, 'probe-ws')
    // 播种在场面（产品呈现）：专家面板卡片 chip——config 折叠应答（defaults/entry）生效即显模型名
    const panelRow = page.locator('button[aria-label="专家团"]')
    await expect(panelRow, '左栏「专家团」行在场').toBeVisible({ timeout: 30_000 })
    await panelRow.click()
    await expect(page.locator('[data-dswf-expert-panel]'), '专家面板挂载').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.dswf-card-grid .dswf-xcard').first(), '卡片网格数据态').toBeVisible({ timeout: 30_000 })
    const cardTexts = await page.locator('.dswf-card-grid .dswf-xcard').allInnerTexts()
    const chipModel = cardTexts.filter((t) => t.includes(DOGFOOD_MODEL)).length
    const chipInherit = cardTexts.filter((t) => t.includes('继承父Agent')).length
    console.log(`[${o.tag}] 面板 chip：model=${chipModel} inherit=${chipInherit} cards=${cardTexts.length}`)
    writeFileSync(join(caseDir, 'panel-chips.json'), JSON.stringify({ chipModel, chipInherit, cards: cardTexts.length }, null, 1), 'utf8')
    await page.screenshot({ path: join(caseDir, 'panel-chips.png'), fullPage: false }).catch((e: unknown) => console.log(`[${o.tag}] panel-chips.png 截图失败（非致命，chip 计数以 JSONL 为准）: ${String(e)}`))
    await page.locator('button[aria-label="专家团"]').click().catch(() => undefined) // 收回面板（后续 tasks dock 动线不受扰）
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: ws })).dir
    {
      const db = openForgeDbAt(dir)
      try {
        seedFeature(db, { slug: FEATURE, status: 'tasks' })
        seedDogfoodTaskRow(db, FEATURE, '1.1', {
          title: '创建 docs/probe-note.md（内容一行：ac4 probe）并提交',
          taskType: 'doc',
          priority: 'P1',
          taskDesc: [
            '步骤：1) 在工作区根 docs/ 下创建 probe-note.md，内容恰好一行：ac4 probe',
            '2) 依次运行 just compile、just fmt、just lint、just unit-test（应全部通过）',
            '3) git 提交该文件（Conventional Commits）',
            '4) submitTask result=success：summary 简述、files=["docs/probe-note.md"]、gate 四布尔全 true、commit_hash 填提交哈希',
          ].join('\n'),
        })
      } finally {
        db.close()
      }
    }

    // 派发入口 UF-3：远征 + /run-dag-tasks 单行自动发送（真实 dispatchTask 循环）
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const dispatchOn = page.locator('[data-dswf-tt-dispatch="on"]').first()
    await expect(dispatchOn, '派发按钮亮起（未终态任务在场）').toBeVisible({ timeout: 30_000 })
    await dispatchOn.click()
    await expect(page.locator('[data-conversation-content]').first()).toContainText(`/run-dag-tasks ${FEATURE}`, {
      timeout: 30_000,
    })
    await awaitPresetHeaderLabel(page, '远征模式')

    // 轮询 task-spawned（logs JSONL——payload.model = agentOptions.model ?? 'inherit'）
    const logFile = join(dir, 'logs', `${FEATURE}.jsonl`)
    const deadline = Date.now() + 900_000
    let spawned: LogLine | undefined
    for (;;) {
      spawned = readLogLines(logFile).find((l) => l.type === 'task-spawned')
      if (spawned !== undefined) break
      if (appProc.exitCode !== null) throw new Error(`宿主提前退出 code=${String(appProc.exitCode)}`)
      if (Date.now() > deadline) throw new Error(`task-spawned 等待超时：lines=${readLogLines(logFile).map((l) => l.type).join(',')}`)
      await sleep(3_000)
    }
    console.log(`[${o.tag}] task-spawned：workerSessionId=${String(spawned!.payload.workerSessionId)} model=${String(spawned!.payload.model)}`)
    const spawnedLine = JSON.stringify(spawned)
    writeFileSync(join(caseDir, 'task-spawned.json'), spawnedLine, 'utf8')

    // worker 起跑留痕窗（会话事件落盘节奏）后收口——证据保留不清理
    await sleep(45_000)
    writeFileSync(join(caseDir, 'host-stdouterr.txt'), procOut.join(''), 'utf8')
    const routing = procOut.filter((l) => l.includes('[forge-spawn-routing]'))
    writeFileSync(join(caseDir, 'forge-spawn-routing.txt'), routing.join('\n'), 'utf8')
    console.log(`[${o.tag}] routing lines:\n${routing.join('\n')}`)

    // worker 会话 dump（closeApp 后 in-process 子会话落盘）
    const workerSessionId = String(spawned!.payload.workerSessionId)
    await closeApp(launched.app).catch(() => undefined)
    launched = undefined
    const log = sessionLogById(dshHome, workerSessionId)
    if (log !== undefined) {
      const events = decodeSessionFile(log)
      writeFileSync(join(caseDir, 'worker-session-events.json'), JSON.stringify(events, null, 1), 'utf8')
      // 全会话树快照（原始 zstd 归档）
      const sessionsDir = join(dshHome, 'sessions')
      const hits: string[] = []
      for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
        if (!wsDir.isDirectory()) continue
        for (const sDir of readdirSync(join(sessionsDir, wsDir.name), { withFileTypes: true })) {
          const l = bestSessionLog(join(sessionsDir, wsDir.name, sDir.name))
          if (l === undefined) continue
          if (l === log) continue
          const ev = decodeSessionFile(l)
          const text = JSON.stringify(ev)
          if (text.includes('forge-spawn-routing') || text.includes('agentOptions')) {
            hits.push(`${wsDir.name}/${sDir.name} -> ${l}`)
            writeFileSync(join(caseDir, `other-session-${sDir.name}.json`), JSON.stringify(ev, null, 1), 'utf8')
          }
        }
      }
      writeFileSync(join(caseDir, 'session-scan.txt'), hits.join('\n'), 'utf8')
    } else {
      writeFileSync(join(caseDir, 'worker-session-events.json'), `worker session log not found: ${workerSessionId}`, 'utf8')
    }
    writeFileSync(join(caseDir, 'paths.txt'), [`userData=${userData}`, `wsRoot=${wsRoot}`, `dshHome=${dshHome}`, `overlay=${overlay}`, `storeDir=${dir}`].join('\n'), 'utf8')
    keepEvidence = true
    // 对账断言（route 逐字段——锚行为准）
    expect(routing.length, '[forge-spawn-routing] 锚行在场').toBeGreaterThanOrEqual(1)
    const workerRoute = routing.filter((l) => l.includes(FEATURE))
    expect(workerRoute.length, 'worker 锚行在场（label 含 taskKey）').toBeGreaterThanOrEqual(1)
    const expectedEffort = o.withOverride ? 'low' : 'high'
    expect(
      workerRoute.join('\n'),
      `route = ${DOGFOOD_PROVIDER}/${DOGFOOD_MODEL}/${expectedEffort}`,
    ).toContain(`route=${DOGFOOD_PROVIDER}/${DOGFOOD_MODEL}/${expectedEffort}`)
    expect(spawnedLine, 'task-spawned payload.model = 路由模型').toContain(DOGFOOD_MODEL)
    keepEvidence = false // 断言全绿——临时目录仍保留（evidence 已拷 caseDir）
  } catch (cause) {
    keepEvidence = true
    console.error(`[${o.tag}] 失败——证据保留：`, cause)
    throw cause
  } finally {
    restorePatch()
    if (launched !== undefined) await closeApp(launched.app).catch(() => undefined)
    if (!keepEvidence) {
      console.log(`[${o.tag}] 证据已归档 ${caseDir}（原始临时目录留盘不清理——取证留痕）`)
    }
  }
}

test('AC4 case1 基座：defaultAgentOptions 落 route（③）', async () => {
  await runCase({ tag: 'case1-base', withOverride: false })
})

test('AC4 case2 override：experts 条目压基座（①）', async () => {
  await runCase({ tag: 'case2-override', withOverride: true })
})
