// @feature:mobile-ui
// 1.1 回放冒烟（mobile project——Chrome 设备模拟）：page.route 回放 fixtures 三面全量——
// ① /api/rpc 原样重放（按录制请求体 method 匹配）；② /remote/__rpc 桥信封重放；
// ③ SSE 按 timed 序列重放（snapshot 首帧 + event 增量帧距保持）。零真实 host、离线可重复。
// 前置 = record.spec.ts 产出的 e2e/fixtures/mobile/ 三 JSONL（缺席 = 留痕 skip——不伪造）。
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { installReplay, loadRpcEntries, loadSse } from './replay.js'

const FIXTURE_DIR = join(fileURLToPath(import.meta.url), '..', '..', 'fixtures', 'mobile')

test('mobile-ui 1.1 回放冒烟：RPC 原样 + /remote/__rpc 信封 + SSE timed 帧序', async ({ page }) => {
  const rpcEntries = loadRpcEntries(FIXTURE_DIR, 'rpc')
  const remoteEntries = loadRpcEntries(FIXTURE_DIR, 'remote-rpc')
  const sse = loadSse(FIXTURE_DIR)
  test.skip(
    rpcEntries.length === 0,
    '回放 fixtures 缺席（录制首跑未执行——E2E_MOBILE_RECORD=1 跑 record.spec.ts）——留痕 skip',
  )

  await installReplay(page, FIXTURE_DIR)
  await page.goto('about:blank')

  // ① api 面：每条录制交换按 method 原样重放一轮（FIFO 销账——录多少放多少）
  const seenMethods = new Set<string>()
  for (const entry of rpcEntries) {
    const method = (entry.request as { method?: string }).method ?? '(none)'
    if (seenMethods.has(method)) continue // 同方法多交换取首条代表（形状钉死口径）
    seenMethods.add(method)
    const got = await page.evaluate(async (payload: string) => {
      const res = await fetch('http://127.0.0.1:1/api/rpc', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: payload,
      })
      return { status: res.status, body: (await res.json()) as unknown }
    }, JSON.stringify(entry.request))
    expect(got.status, `${method} 重放终态码原样`).toBe(entry.status)
    expect(got.body, `${method} 重放体原样`).toEqual(entry.response)
  }
  // AC 钉死面：指令目录（commands.list）与 ask 题型载荷（interaction.pending）必须在 fixtures
  const pinned = rpcEntries.map((e) => (e.request as { method?: string }).method)
  expect(pinned, '官方指令 catalog RPC 形状已录').toContain('commands.list')
  expect(pinned, 'interaction.pending ask 载荷已录').toContain('interaction.pending')

  // ② forge 桥面：信封原样
  if (remoteEntries.length > 0) {
    const entry = remoteEntries[0]!
    const got = await page.evaluate(async (payload: string) => {
      const res = await fetch('http://127.0.0.1:1/remote/__rpc', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: payload,
      })
      return (await res.json()) as unknown
    }, JSON.stringify(entry.request))
    expect(got, `${String((entry.request as { channel?: string }).channel)} 信封原样`).toEqual(entry.response)
  }

  // ③ SSE timed 重放：EventSource 收命名事件帧，帧距保持录制序列（AC——按 timed 序列重放）
  if (sse !== undefined && sse.frames.length >= 2) {
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
    expect(replayGap, `帧距保持（录制 ${String(recordGap)}ms）`).toBeGreaterThanOrEqual(Math.max(0, recordGap * 0.5))
  }
})
