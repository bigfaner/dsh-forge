// @feature dsh-forge-m2 | @web-e2e | @journey task-session-execution-loop
// Traceability: docs/features/dsh-forge-m2/testing/task-session-execution-loop/contracts/step-4-verify-prompt-injection.md
//
// Step 4「确认任务执行 prompt 自动注入」Outcome success —— SC2-2 的逐字符
// 注入口径,本旅程重述:
//   - oracle prompt(control.json 文本覆盖)带 CRLF/unicode/行尾空格/收尾换
//     行 —— 链上任何转码或裁剪都会破坏全等;
//   - 锚定腿:测试进程先 spawn 一次 stub CLI(control → stdout 全等),再断
//     stdout → 通道全链;
//   - 首条用户消息 = verbatim prompt + 恰好一行 FORGE_ACTOR 归因指令
//     (FT-045:原文不改写,仅追加;actor 值 = session:<sessionId>);
//   - requestId = deriveLaunchRequestId(sessionId, message)(sha256 派生,
//     重放不重复投递,FT-041);mode = queue(按队列模式持久化)。
// 本步页面 = 上游会话视图(发起跳转目标);注入内容的观测面 = 通道 stub
// journal(测试进程直读 —— 浏览器侧不自行观测)。
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import {
  disposeJourney, launchOneClick, pickTaskKey, pollChannelJournal, setUpJourney,
} from './helpers.ts'
import { composeFirstUserMessage, forgeActorValue } from '../../../../packages/plugins/forge-workbench/src/host/actor-env.ts'
import { deriveLaunchRequestId } from '../../../../packages/plugins/forge-workbench/src/host/session-launch.ts'

/**
 * The prompt-body override (the byte oracle): CRLF, unicode, trailing spaces
 * and a trailing newline ride the whole chain — any transcode or trim anywhere
 * breaks the hash.
 */
const PROMPT_TEXT = [
  'session-loop 注入链 oracle prompt — byte-faithful,逐字符一致。',
  'Line-2: CRLF must survive the chain.\r',
  'Line-3: trailing spaces    ',
  'Line-4: unicode ✓ µ 中文 —≡— em—dash',
  '',
  'STUB-PROMPT-BODY (control.json text override, byte-stable for the hash assert)',
  '',
].join('\n')

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

test('step-4/success [@web-e2e @journey task-session-execution-loop]: first user message = verbatim stub stdout + one FORGE_ACTOR line, queue-mode, deterministic requestId', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setup = setUpJourney()
  const { set, stub, channel, project, session } = setup
  const KEY = pickTaskKey(set, task => task.status === 'pending' && task.record === null && task.dependencies.length === 0, '首发发起对象')
  const localId = KEY.slice(KEY.lastIndexOf('/') + 1)
  stub.writeControl({ prompt: { text: PROMPT_TEXT } })

  try {
    // 锚定腿 0:stub CLI prints the control text verbatim(control.json →
    // stdout)。App 侧链路只需证明 stdout → renderer → 会话通道的保真。
    const promptRun = spawnSync(stub.cliPath, ['prompt', 'get-by-task-id', localId], {
      cwd: project.codeRoot, encoding: 'utf8', windowsHide: true,
    })
    expect(promptRun.status, `stub prompt exit (stderr: ${String(promptRun.stderr)})`).toBe(0)
    expect(promptRun.stdout, 'control.json text override → stub stdout, byte-exact').toBe(PROMPT_TEXT)

    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      await launchOneClick(page, `[data-dsh-forge-node-card="${KEY}"] [data-dsh-forge-launch-trigger][data-mount="node-hover"]`)
      const create = await pollChannelJournal(channel, entry => entry.kind === 'create', 'the session create')
      const sessionId = create.sessionId ?? ''
      expect(sessionId).not.toBe('')
      const promptEntry = await pollChannelJournal(
        channel, entry => entry.kind === 'prompt' && entry.sessionId === sessionId, 'the first user message journal line')

      // ---- 逐字符注入断言(零手工粘贴;注入内容为 DATA,不被解析执行)----
      expect(promptEntry.mode, '首条用户消息按队列模式持久化于该会话').toBe('queue')
      const expected = composeFirstUserMessage(PROMPT_TEXT, forgeActorValue(sessionId))
      expect(sha256(promptEntry.text ?? ''), `sha256(first user message) for ${sessionId}`).toBe(sha256(expected))
      expect(promptEntry.text, 'first user message = verbatim prompt + ONE FORGE_ACTOR line (full equality)').toBe(expected)
      // prompt 原文本身不被改写:消息以 prompt 逐字节开头,追加内容只在尾部。
      expect((promptEntry.text ?? '').startsWith(PROMPT_TEXT), 'prompt 原文不改写(前缀逐字节全等)').toBe(true)
      // 恰好一行归因指令;每个 FORGE_ACTOR 赋值都携带本会话标识。
      const attributionMarker = '[dsh-forge workbench] Attribution:'
      expect((promptEntry.text ?? '').split(attributionMarker).length - 1, 'exactly one attribution line').toBe(1)
      const actorValue = forgeActorValue(sessionId)
      const forgeActorMentions = (promptEntry.text ?? '').split('FORGE_ACTOR=').length - 1
      expect(forgeActorMentions, 'FORGE_ACTOR assignments exist on the one attribution line').toBeGreaterThan(0)
      for (const line of (promptEntry.text ?? '').split('\n')) {
        if (line.includes('FORGE_ACTOR=')) {
          expect(line.includes(`FORGE_ACTOR=${actorValue}`), `归因值 = ${actorValue}(会话来源标记约定)`).toBe(true)
        }
      }
      // requestId 确定性(FT-041):同 (session, message) 派生同 id,重放不重复投递。
      expect(promptEntry.requestId).toBe(deriveLaunchRequestId(sessionId, expected))

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})
