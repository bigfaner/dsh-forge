// mobile 表面 Journey 测试共享基座（gen-test-scripts 1.27）。
// 数据源 = e2e/fixtures/mobile 回放 fixtures（1.1 R12 录制产物——离线、零真实 host）；
// 源面锚点读 apps/mobile/src 视图层实现。语义描述符在此落成具体匹配器，以事实表为据。
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import { loadRpcEntries, loadSse, type ReplaySse } from '../../e2e/mobile/replay.js'
import { PROXY_CHANNELS, REMOTE_PROXY_CHANNELS, type RpcRecord } from '../../e2e/mobile/wire.js'

/** 仓库根（tests/mobile/support.ts → 上两级） */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 回放 fixtures 目录（AC 指定数据源） */
export const FIXTURE_DIR = join(ROOT, 'e2e', 'fixtures', 'mobile')

export { PROXY_CHANNELS, REMOTE_PROXY_CHANNELS }

/** fixtures 三面全量（进程内读一次的纯函数——调用方自行缓存不强制） */
export function loadFixtures(): { proxy: RpcRecord[]; apiRef: RpcRecord[]; sse: ReplaySse | undefined } {
  return {
    proxy: loadRpcEntries(FIXTURE_DIR, 'proxy'),
    apiRef: loadRpcEntries(FIXTURE_DIR, 'api-ref'),
    sse: loadSse(FIXTURE_DIR),
  }
}

/** proxy 面按 channel 取代表录制交换（形状钉死口径——同通道多条取首个 ok 信封条目；
 * 录制流里混有 404 探针交换（回放器 no-fixture 显性化腿），不作为形状基准） */
export function firstProxy(proxy: RpcRecord[], channel: string): RpcRecord {
  const entries = proxy.filter((e) => (e.request as { channel?: string }).channel === channel)
  expect(entries.length, `fixtures 缺通道录制：${channel}`).toBeGreaterThan(0)
  return entries.find((e) => (e.response as { ok?: boolean }).ok === true) ?? entries[0]!
}

/** RPC 信封形状断言（ok:true → data；ok:false → error.code——事实表 RPC_ENVELOPE） */
export function expectRpcOk(entry: RpcRecord, label: string): Record<string, unknown> {
  expect(entry.status, `${label} 终态码`).toBe(200)
  const body = entry.response as { ok?: boolean; data?: unknown; error?: { code?: string } }
  expect(body, `${label} 响应为 RPC 信封`).toBeTruthy()
  if (body.ok === true) {
    expect(body.data, `${label} ok=true 携 data`).toBeDefined()
    return body.data as Record<string, unknown>
  }
  expect(body.ok, `${label} 信封 ok 字段缺断`).toBeDefined()
  return {}
}

/** mobile 源面文本（apps/mobile/src 相对路径） */
export function mobileSrc(rel: string): string {
  return readFileSync(join(ROOT, 'apps/mobile/src', rel), 'utf8')
}

/** mobile 源面文件在场的硬断言（锚点缺文件 = 直接红） */
export function expectMobileFile(rel: string): void {
  expect(() => mobileSrc(rel), `apps/mobile/src/${rel} 缺席`).not.toThrow()
}

/** api 参照腿按 method 取代表（协议形状参照面——同上优先 ok 结果条目） */
export function firstApiRef(apiRef: RpcRecord[], method: string): RpcRecord {
  const entries = apiRef.filter((e) => (e.request as { method?: string }).method === method)
  expect(entries.length, `fixtures 缺 api 参照腿：${method}`).toBeGreaterThan(0)
  return entries.find((e) => (e.response as { result?: { ok?: boolean } }).result?.ok === true) ?? entries[0]!
}

/** 官方 SessionSummary 参照样本（session/list 首行——SessionSummary 字段清单钉面） */
export function sessionSummarySample(apiRef: RpcRecord[]): Record<string, unknown> {
  const items = apiRef
    .filter((e) => (e.request as { method?: string }).method === 'session/list')
    .map((e) => (e.response as { result?: { value?: { items?: Array<Record<string, unknown>> } } }).result?.value?.items ?? [])
    .flatMap((rows) => rows)
  expect(items.length, 'session/list 参照腿至少一行真实记录').toBeGreaterThan(0)
  return items[0]!
}
