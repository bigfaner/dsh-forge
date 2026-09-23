// @feature dsh-forge-m2 | @web-e2e | @journey sc2-session-injection
// Traceability: docs/features/dsh-forge-m2/tasks/6.3-sc23-session-injection-flow.md
//
// SC2 验收腿(stub 会话通道,PRD Story2 零终端闭环的发起半边):
//
//   SC2-1 双入口一键发起 — 视图 A 节点 hover 触发器与详情侧板主按钮,
//         两个入口各走一遍真实链:1 次点击(入口触发)→ 确认面板(确认
//         按钮 = 默认焦点,AC 的「确认默认焦点」)→ Enter(键盘,非点击)
//         → 发起。点击数 ≤1 的记账口径 = 发起流程内的 pointer click 数
//         (入口触发一次;打开侧板的行选择是任务导航,不计入)。全链 stub
//         (CLI stub 供 probe,通道 stub 供 tier-1)成功后跳转会话视图
//         (keyed main slot 卸载工作台 shell = 跳转观测面)。
//   SC2-2 逐字符注入 — 通道 stub journal 的 prompt 条目.text = 组装后的
//         首条用户消息(verbatim prompt + 一行 FORGE_ACTOR 归因指令)。
//         哈希断言 + 全等断言 + requestId/mode/cwd/FORGE_ACTOR 行数核对;
//         ground truth = control.json 的文本覆盖(测试进程先 spawn 一次
//         stub CLI 锚定 control → stdout,再断言 stdout → 通道全链)。
//   SC2-3 重启挂接 — 同 userData 重启(factory 复用同一 config root/
//         userData/env seams):workbench.db 持久 → 挂接历史行仍在
//         (active),详情侧板加载后 reconcile 点亮会话运行中徽标。
//
// Hard Rules:腿内每次启动前跑单实例探测守卫;DSH_FORGE_USER_DATA =
// journey 临时目录;跑腿前 pnpm build:plugins && pnpm stage:plugin-tarballs
// (factory 装配的是 staged tarball,非源码)。
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball,
} from '../../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../../fixtures/forge-project.ts'
import { generateTaskSet } from '../../fixtures/task-generator.ts'
import { materializeStubCli } from '../../fixtures/stubs/cli.ts'
import { createChannelStub } from '../../fixtures/stubs/channel.ts'
import type { ChannelStubEntry } from '../../fixtures/stubs/channel.ts'
import { composeFirstUserMessage, forgeActorValue } from '../../../../../packages/plugins/forge-workbench/src/host/actor-env.ts'
import { deriveLaunchRequestId } from '../../../../../packages/plugins/forge-workbench/src/host/session-launch.ts'
import {
  cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, openTasksBoard,
} from './helpers/restart-app.ts'

/**
 * The prompt-body override (SC2-2's byte oracle): CRLF, unicode, trailing
 * spaces and a trailing newline ride the whole chain — any transcode or trim
 * anywhere breaks the hash.
 */
const PROMPT_TEXT = [
  'SC2 注入链 oracle prompt — byte-faithful,逐字符一致。',
  'Line-2: CRLF must survive the chain.\r',
  'Line-3: trailing spaces    ',
  'Line-4: unicode ✓ µ 中文 —≡— em—dash',
  '',
  'STUB-PROMPT-BODY (control.json text override, byte-stable for the hash assert)',
  '',
].join('\n')

/** The preload-bridge subset the in-page evaluates read (declared once). */
interface Sc2BridgeGlobals {
  dshForge?: {
    workbench?: {
      getState?: () => Promise<{ activeProjectId: string | null }>
    }
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Poll the channel journal until an entry matches (the host writes it). */
async function pollChannelJournal(
  channel: ReturnType<typeof createChannelStub>,
  predicate: (entry: ChannelStubEntry) => boolean,
  what: string,
  timeoutMs = 15_000,
): Promise<ChannelStubEntry> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = channel.readJournal().find(predicate)
    if (found !== undefined) return found
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`channel journal never carried ${what}: ${JSON.stringify(channel.readJournal())}`)
}

/** First divergence index of two strings (the ≤N-byte diff sample). */
function divergenceAt(a: string, b: string): number {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) return i
  }
  return a.length === b.length ? -1 : len
}

/** Run one ≤1-click launch through an entry trigger and return the sessionId. */
async function launchViaTrigger(page: Page, triggerSelector: string): Promise<void> {
  const trigger = page.locator(triggerSelector)
  await expect(trigger, 'entry probe must reach available (stub CLI answered)').toHaveAttribute('data-probe', 'available', { timeout: 20_000 })
  await trigger.click() // the ONE pointer click of the 发起 flow
  const confirm = page.locator('[data-dsh-forge-dialog="launch-confirm"]')
  await expect(confirm).toBeVisible({ timeout: 10_000 })
  // AC「确认默认焦点」: the confirm button carries the dialog's initial focus,
  // so Enter alone launches — the click budget stays at 1.
  const focusedOk = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-dsh-forge-launch-confirm-ok') !== null)
  if (!focusedOk) {
    const holder = await page.evaluate(() => {
      const el = document.activeElement
      if (el === null || el === document.body) return String(el === document.body ? 'body' : 'none')
      return `${el.tagName.toLowerCase()}[${(el.getAttribute('data-dsh-forge-task-detail') ?? el.getAttribute('data-dsh-forge-dialog') ?? el.getAttribute('data-dsh-forge-launch-trigger') ?? el.className).toString().slice(0, 80)}]`
    })
    throw new Error(`confirm button must hold the default focus (actual holder: ${holder})`)
  }
  await page.keyboard.press('Enter') // keyboard, not a click
  // 成功跳转: the keyed main slot swaps to the session view — the workbench
  // shell unmounts. A chain failure keeps the shell (error dialog / degraded
  // toast); the dump names which terminal the chain reached.
  const jumpDeadline = Date.now() + 15_000
  while (Date.now() < jumpDeadline) {
    if (await page.locator('[data-dsh-forge-shell]').count() === 0) return
    await page.waitForTimeout(250)
  }
  const dump = await page.evaluate(() => ({
    activeElement: document.activeElement === document.body
      ? 'body'
      : (document.activeElement?.outerHTML ?? 'none').slice(0, 140),
    entryStates: Array.from(document.querySelectorAll('[data-dsh-forge-launch-trigger]'))
      .map(el => `${el.getAttribute('data-mount') ?? ''}:${el.getAttribute('data-probe') ?? ''}/${el.getAttribute('data-stage') ?? ''}`).slice(0, 6),
    dialogs: Array.from(document.querySelectorAll('[data-dsh-forge-dialog]'))
      .map(el => el.getAttribute('data-dsh-forge-dialog') ?? ''),
    degradedToast: document.querySelector('[data-dsh-forge-launch-toast]') !== null,
    persistedViewKey: localStorage.getItem('dsh.forge.workbench.view'),
  }))
  throw new Error(`launch jump never happened (shell stayed mounted): ${JSON.stringify(dump)}`)
}

/** Assert one composed first-user message against the byte oracle (SC2-2). */
function assertFirstUserMessage(promptEntry: ChannelStubEntry, createEntry: ChannelStubEntry, promptStdout: string): string {
  const sessionId = createEntry.sessionId ?? ''
  expect(sessionId).not.toBe('')
  expect(promptEntry.sessionId, 'prompt leg rides the created session').toBe(sessionId)
  expect(promptEntry.mode, 'first message is delivered queue-mode (persisted user message)').toBe('queue')
  const expected = composeFirstUserMessage(promptStdout, forgeActorValue(sessionId))
  // 哈希断言 (AC form) + full equality (the actionable oracle on failure).
  expect(sha256(promptEntry.text ?? ''), `sha256(first user message) for ${sessionId}`).toBe(sha256(expected))
  const divergence = divergenceAt(promptEntry.text ?? '', expected)
  expect(
    promptEntry.text,
    `first user message must equal verbatim prompt + ONE FORGE_ACTOR line (divergence at ${String(divergence)}: `
    + `got ${JSON.stringify((promptEntry.text ?? '').slice(Math.max(0, divergence - 20), divergence + 40))} `
    + `expected ${JSON.stringify(expected.slice(Math.max(0, divergence - 20), divergence + 40))})`,
  ).toBe(expected)
  // The ONE attribution line: the marker appears exactly once, and every
  // FORGE_ACTOR assignment on it carries this session's id.
  const attributionMarker = '[dsh-forge workbench] Attribution:'
  expect((promptEntry.text ?? '').split(attributionMarker).length - 1, 'exactly one attribution line').toBe(1)
  const actorValue = forgeActorValue(sessionId)
  const forgeActorMentions = (promptEntry.text ?? '').split('FORGE_ACTOR=').length - 1
  expect(forgeActorMentions, 'FORGE_ACTOR assignments all live on the one attribution line').toBeGreaterThan(0)
  for (const line of (promptEntry.text ?? '').split('\n')) {
    if (line.includes('FORGE_ACTOR=')) {
      expect(line.includes(`FORGE_ACTOR=${actorValue}`), `attribution carries ${actorValue}`).toBe(true)
    }
  }
  // requestId determinism (4.2): derived from (sessionId, message) — replays
  // can never double-post the first message.
  expect(promptEntry.requestId).toBe(deriveLaunchRequestId(sessionId, expected))
  return sessionId
}

function sc23Bundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

test('6.3/sc2-session-injection [@web-e2e @journey sc2-session-injection]: one-click launch, byte-faithful injection, restart persistence', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // --- journey scaffolding ----------------------------------------------------
  const set = generateTaskSet({ seed: 'sc23', taskCount: 12, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const featureA = set.features[0] as NonNullable<typeof set.features[0]>
  const featureB = set.features[1] as NonNullable<typeof set.features[1]>
  const taskA = featureA.tasks[0] as NonNullable<typeof featureA.tasks[0]>
  const taskB = featureB.tasks[0] as NonNullable<typeof featureB.tasks[0]>
  const KEY_A = `${featureA.slug}/${taskA.localId}`
  const KEY_B = `${featureB.slug}/${taskB.localId}`
  expect(set.facts.taskCount).toBe(12)

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc2-'))
  const stub = materializeStubCli(join(root, 'stub-cli'))
  const channel = createChannelStub(join(root, 'stub-channel'))
  // The SC2-2 oracle: the prompt body comes from the control override, so the
  // exact bytes at the CLI's stdout are known before the app ever boots.
  stub.writeControl({ prompt: { text: PROMPT_TEXT } })
  const project = writeForgeProject(set, { codeRoot: join(root, 'fixture-project') })
  stub.attachProject(project.codeRoot)
  const session = createAppSessionFactory({
    bundles: sc23Bundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
    cwd: stub.launchCwd,
    // DSH_FORGE_PROJECT_ROOTS: the ForgeBridge spawn-allowlist is a HOST-SPAWN
    // env fact (host-env-feed feeds it from the projects table right before
    // every host spawn) — a mid-boot registration never reaches the live host
    // child. The explicit-env override is the documented test channel (the
    // feeder keeps an externally-set non-empty value; 5.11 leg-B precedent).
    env: {
      ...stub.env,
      ...channel.env,
      DSH_FORGE_PROJECT_ROOTS: JSON.stringify([project.codeRoot]),
    },
  })

  try {
    // Anchor leg 0 of the byte oracle: the stub CLI prints the control text
    // verbatim (control.json → stdout). The app-side chain then only needs to
    // prove stdout → renderer → session channel fidelity.
    const promptRun = spawnSync(stub.cliPath, ['prompt', 'get-by-task-id', taskA.localId], {
      cwd: project.codeRoot, encoding: 'utf8', windowsHide: true,
    })
    expect(promptRun.status, `stub prompt exit (stderr: ${String(promptRun.stderr)})`).toBe(0)
    expect(promptRun.stdout, 'control.json text override → stub stdout, byte-exact').toBe(PROMPT_TEXT)

    // ========================================================================
    // Boot 1 — SC2-1 (both entries) + SC2-2 (hash oracle).
    // ========================================================================
    const shell = await session.boot()
    let sessionIdA = ''
    let sessionIdB = ''
    try {
      const { page } = shell
      expect(existsSync(join(root, 'user-data', 'workbench', 'workbench.db'))).toBe(true)
      const projectId = await registerFixtureProject(page, project)
      expect(typeof projectId).toBe('string')
      await openTasksBoard(page, set.facts.taskCount)

      // ---- SC2-1a: view-A node hover entry --------------------------------
      await launchViaTrigger(page, `[data-dsh-forge-node-card="${KEY_A}"] [data-dsh-forge-launch-trigger][data-mount="node-hover"]`)
      const createA = await pollChannelJournal(channel, entry => entry.kind === 'create', 'the first session create')
      expect(
        (createA.cwd ?? '').replaceAll('\\', '/'),
        'session create cwd = the registered project codeRoot (normalized form)',
      ).toBe(project.codeRoot.replaceAll('\\', '/'))
      const promptA = await pollChannelJournal(
        channel, entry => entry.kind === 'prompt' && entry.sessionId === createA.sessionId, 'the first session prompt')
      sessionIdA = assertFirstUserMessage(promptA, createA, PROMPT_TEXT)

      // Back on the board: the 运行中 badge for the launched task (the board
      // session store survived the shell unmount — plugin-lifetime memory).
      await openTasksBoard(page, set.facts.taskCount)
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY_A}"] [data-dsh-forge-badge="session-live"]`),
        'launched task carries the live-session badge',
      ).toHaveAttribute('data-dsh-forge-session-id', sessionIdA, { timeout: 10_000 })

      // ---- SC2-1b: detail-panel primary entry ------------------------------
      // (The row activation that opens the dock is task NAVIGATION — outside
      // the 发起 flow's click budget; the launch itself is again 1 click.)
      await page.locator(`[data-dsh-forge-node-card="${KEY_B}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${KEY_B}"]`)).toBeVisible({ timeout: 15_000 })
      await launchViaTrigger(page, `[data-dsh-forge-task-detail="${KEY_B}"] [data-dsh-forge-launch-trigger][data-mount="panel-primary"]`)
      const createB = await pollChannelJournal(
        channel, entry => entry.kind === 'create' && (entry.sessionId ?? '') !== sessionIdA, 'the second session create')
      expect((createB.cwd ?? '').replaceAll('\\', '/')).toBe(project.codeRoot.replaceAll('\\', '/'))
      const promptB = await pollChannelJournal(
        channel, entry => entry.kind === 'prompt' && entry.sessionId === createB.sessionId, 'the second session prompt')
      sessionIdB = assertFirstUserMessage(promptB, createB, PROMPT_TEXT)
      expect(sessionIdB).not.toBe(sessionIdA)

      // Both badges live side by side after the second round-trip.
      await openTasksBoard(page, set.facts.taskCount)
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY_A}"] [data-dsh-forge-badge="session-live"]`),
      ).toHaveAttribute('data-dsh-forge-session-id', sessionIdA, { timeout: 10_000 })
      await expect(
        page.locator(`[data-dsh-forge-node-card="${KEY_B}"] [data-dsh-forge-badge="session-live"]`),
      ).toHaveAttribute('data-dsh-forge-session-id', sessionIdB, { timeout: 10_000 })

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }

    // ========================================================================
    // Boot 2 (SAME userData + config root) — SC2-3: 挂接关系与徽标仍在.
    // ========================================================================
    const restarted = await session.boot()
    try {
      const { page } = restarted
      const state = await page.evaluate(async () => {
        const bridge = (globalThis as Sc2BridgeGlobals).dshForge?.workbench
        return await bridge?.getState?.() ?? null
      })
      expect(state?.activeProjectId, 'the registered project survived the restart (workbench.db)').toBeTruthy()
      await openTasksBoard(page, set.facts.taskCount)

      // The in-memory badge map starts empty after a restart; the AUTHORITATIVE
      // read is getTaskDetail.links — opening the dock reconciles and re-lights.
      for (const [key, sessionId] of [[KEY_A, sessionIdA], [KEY_B, sessionIdB]] as const) {
        await page.locator(`[data-dsh-forge-node-card="${key}"]`).click()
        const dock = page.locator(`[data-dsh-forge-task-detail="${key}"]`)
        await expect(dock).toBeVisible({ timeout: 15_000 })
        // 挂接历史: the persisted link row, active, for the exact session id.
        await expect(
          dock.locator(`[data-dsh-forge-detail-link="${sessionId}"]`),
          `restart kept the ${key} link`,
        ).toHaveAttribute('data-link-status', 'active', { timeout: 15_000 })
        // The badge re-lights off the authoritative read (5.11 reconcile path).
        await expect(
          page.locator(`[data-dsh-forge-node-card="${key}"] [data-dsh-forge-badge="session-live"]`),
          `badge re-lights after restart for ${key}`,
        ).toHaveAttribute('data-dsh-forge-session-id', sessionId, { timeout: 15_000 })
        await page.locator('[data-dsh-forge-detail-close]').click()
        await expect(page.locator('[data-dsh-forge-task-detail]')).toHaveCount(0)
      }

      expect(restarted.pageErrors, `renderer pageerrors: ${restarted.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(restarted.page)
      await closeAndAwaitExit(restarted)
    }
  } finally {
    // Journey cleanup (6.1 Hard Rule: 测试后清理). DSH_E2E_KEEP_ROOT=1 is the
    // diagnostics escape hatch (stub journals/control survive a failed run).
    if (process.env.DSH_E2E_KEEP_ROOT !== '1') {
      rmSync(root, { recursive: true, force: true })
      expect(existsSync(root)).toBe(false)
    } else {
      console.log(`[sc2] journey root kept for diagnostics: ${root}`)
    }
  }
})
