// @feature:mobile-ui
// 1.1 回放冒烟（mobile project——390×844 触摸移动 UA）：page.route 回放 fixtures 三面全量——
// ① /remote/__rpc proxy 通道原样重放（mobile 唯一消费面，按 channel FIFO 销账）；
// ② /api 参照腿按 method 原样重放；③ SSE 按 timed 序列重放（snapshot 首帧 + event 增量帧距保持）。
// 零真实 host、离线可重复。前置 = record.spec.ts 产出的 e2e/fixtures/mobile/（缺席 = 留痕 skip）。
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { installReplay, loadRpcEntries, loadSse } from './replay.js'
import { PROXY_CHANNELS, REMOTE_PROXY_CHANNELS } from './wire.js'

const FIXTURE_DIR = join(fileURLToPath(import.meta.url), '..', '..', 'fixtures', 'mobile')

/** 必钉通道（R12 录制清单核心——缺失 = fixtures 残缺，冒烟红） */
const PINNED_CHANNELS = [
  PROXY_CHANNELS.sessionList,
  PROXY_CHANNELS.sessionGrouped,
  PROXY_CHANNELS.sessionModelCatalog,
  PROXY_CHANNELS.sessionPrompt,
  PROXY_CHANNELS.userQuestionsAnswer,
  PROXY_CHANNELS.commandsList,
  PROXY_CHANNELS.commandsExecute,
  REMOTE_PROXY_CHANNELS.progress,
  REMOTE_PROXY_CHANNELS.approval,
  REMOTE_PROXY_CHANNELS.disconnect,
] as const

test('mobile-ui 1.1 回放冒烟：proxy 通道 + /api 参照 + SSE timed 帧序', async ({ page }) => {
  const proxyEntries = loadRpcEntries(FIXTURE_DIR, 'proxy')
  const apiEntries = loadRpcEntries(FIXTURE_DIR, 'api-ref')
  const sse = loadSse(FIXTURE_DIR)
  test.skip(
    proxyEntries.length === 0,
    '回放 fixtures 缺席（录制首跑未执行——E2E_MOBILE_RECORD=1 跑 record.spec.ts）——留痕 skip',
  )

  await installReplay(page, FIXTURE_DIR)
  await page.goto('about:blank')

  // ① proxy 面：每条录制交换按 channel 原样重放一轮（FIFO 销账——录多少放多少）
  const replayed = new Set<string>()
  for (const entry of proxyEntries) {
    const channel = (entry.request as { channel?: string }).channel ?? '(none)'
    if (replayed.has(channel)) continue // 同通道多交换取首条代表（形状钉死口径）
    replayed.add(channel)
    const got = await page.evaluate(async (payload: string) => {
      const res = await fetch('http://127.0.0.1:1/remote/__rpc', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: payload,
      })
      return { status: res.status, body: (await res.json()) as unknown }
    }, JSON.stringify(entry.request))
    expect(got.status, `${channel} 重放终态码原样`).toBe(entry.status)
    expect(got.body, `${channel} 重放体原样`).toEqual(entry.response)
  }
  // AC 钉死面：必钉通道集全在 fixtures（含 session-prompt/commands-execute/user-questions-answer 完整 args）
  for (const channel of PINNED_CHANNELS) {
    expect(replayed, `必钉通道已录：${channel}`).toContain(channel)
  }
  const promptEntry = proxyEntries.find((e) => (e.request as { channel?: string }).channel === PROXY_CHANNELS.sessionPrompt)
  expect(Object.keys((promptEntry!.request as { payload: Record<string, unknown> }).payload).sort(), 'session-prompt 完整 args（sessionId/mode/content/clientTimeZone）').toEqual(['clientTimeZone', 'content', 'mode', 'sessionId'])
  const executeEntry = proxyEntries.find((e) => (e.request as { channel?: string }).channel === PROXY_CHANNELS.commandsExecute)
  expect(Object.keys((executeEntry!.request as { payload: Record<string, unknown> }).payload).sort(), 'commands-execute 完整 args（sessionId/line/submittedAttachments）').toEqual(['line', 'sessionId', 'submittedAttachments'])

  // ② api 参照腿：session/list SessionSummary 字段清单原样在 fixtures（必钉项）
  const sessionList = apiEntries.find((e) => (e.request as { method?: string }).method === 'session/list')
  expect(sessionList, 'session/list 参照腿已录').toBeTruthy()
  const summaryRow = apiEntries
    .filter((e) => (e.request as { method?: string }).method === 'session/list')
    .map((e) => (e.response as { result?: { value?: { items?: Array<Record<string, unknown>> } } }).result?.value?.items ?? [])
    .flatMap((items) => items)[0]
  expect(summaryRow, 'SessionSummary 至少一行真实记录（SessionSummary 字段清单原样钉）').toBeTruthy()
  expect(Object.keys(summaryRow!), 'SessionSummary 字段非空').toContain('sessionId')
  expect(apiEntries.some((e) => (e.request as { method?: string }).method === 'commands/list'), 'commands catalog RPC 形状已录').toBe(true)
  expect(apiEntries.some((e) => (e.request as { method?: string }).method === 'commands/execute'), 'commands execute RPC 形状已录').toBe(true)

  // ③ SSE timed 重放：EventSource 收命名事件帧，帧距保持录制序列（AC——按 timed 序列重放）
  test.skip(
    sse === undefined || sse.frames.filter((f) => f.event === 'snapshot' || f.event === 'event').length < 2,
    'SSE 帧序列不足两帧（录制腿未产出命名事件帧）——留痕 skip',
  )
  if (sse !== undefined && sse.frames.filter((f) => f.event === 'snapshot' || f.event === 'event').length >= 2) {
    const received = await page.evaluate(
      (deadlineMs: number) =>
        new Promise<{ event: string; at: number }[]>((resolve) => {
          const source = new EventSource('http://127.0.0.1:2/api/session/stream?sessionId=replay')
          const out: { event: string; at: number }[] = []
          const t0 = Date.now()
          const push = (name: string) => (ev: MessageEvent) => {
            out.push({ event: name, at: Date.now() - t0 })
            void ev
            if (out.length >= 2) {
              source.close()
              resolve(out)
            }
          }
          source.addEventListener('snapshot', push('snapshot'))
          source.addEventListener('event', push('event'))
          setTimeout(() => {
            source.close()
            resolve(out)
          }, deadlineMs)
        }),
      30_000,
    )
    expect(received.length, 'SSE 回放收到前两帧').toBe(2)
    expect(received[0]!.event, '首帧 = snapshot（官方全量语义）').toBe('snapshot')
    const recordGap = sse.frames[1]!.t - sse.frames[0]!.t
    const replayGap = received[1]!.at - received[0]!.at
    // 亚定时器粒度帧距（<50ms）不做下界断言（setTimeout 1ms 级抖动吞没——录制帧距 1ms 实证）
    if (recordGap >= 50) {
      expect(replayGap, `帧距保持（录制 ${String(recordGap)}ms）`).toBeGreaterThanOrEqual(recordGap * 0.5)
    }
  }
})
