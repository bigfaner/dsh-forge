// @feature:loop-event-delivery
// Journey: progress-projection-mirror（mobile 进度流实时刷新链——1.10 装配面结构钉）。
// 数据面：投影键 forge-dispatch-events 经既有 forge:proxy/session-projections RPC 全量
// 键读取（传输层零改动）；实时刷新 = host 投影变更帧镜像（sessionProjections.onChanged
// → forge-stream 同一订阅-扇出，零新物理通道）→ mobile 失效信号 → RPC 重拉。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DISPATCH_EVENTS_PROJECTION_KEY,
  coerceDispatchEvents,
  loadDispatchEvents,
} from '../../../apps/mobile/src/views/progress.js'
import { ROOT, expectMobileFile, mobileSrc } from '../support.js'

/** host 源面文本（apps/host/src 相对路径——Journey 结构钉面） */
function hostSrc(rel: string): string {
  return readFileSync(join(ROOT, 'apps/host/src', rel), 'utf8')
}

describe('step-1 投影变更帧镜像（host subscribeProjectionMirror 接线）', () => {
  it('success（onChanged 帧源接进 forge-stream 订阅-扇出）', () => {
    const src = hostSrc('boot/forge-stream.ts')
    expect(src).toMatch(/subscribeProjectionMirror/) // 镜像装配 helper
    expect(src).toMatch(/session\/projection/) // 帧类型（值恒走 RPC，帧只当失效信号）
    expect(src).toMatch(/onChanged/) // 官方注册表 onChanged 缝
    const child = hostSrc('boot/child.ts')
    expect(child).toMatch(/subscribeProjectionMirror/) // child 装配位接线
    expect(child).toMatch(/sessionProjections/) // reflect.get 防御读取（fail-soft 零镜像）
  })
})

describe('step-2 mobile RPC 全量键读取（零传输改动）', () => {
  it('success（既有 session-projections 通道窄读 forge-dispatch-events 键）', async () => {
    expectMobileFile('views/progress.ts')
    expect(mobileSrc('views/progress.ts')).toMatch(/forge:proxy\/session-projections/)
    expect(mobileSrc('views/progress.ts')).toMatch(DISPATCH_EVENTS_PROJECTION_KEY)
    // 值收敛 fail-soft：非法形状 = undefined（诚实空态）
    expect(coerceDispatchEvents({ entries: [], total: 0 })).toEqual({ entries: [], total: 0 })
    expect(coerceDispatchEvents('x')).toBeUndefined()
    // 空会话零调用；键缺席 = undefined
    expect(await loadDispatchEvents({ call: async () => ({ ok: true, data: { values: {} } }) }, 's-1')).toBeUndefined()
  })
})

describe('step-3 实时刷新失效信号接线（main.ts 帧消费）', () => {
  it('success（session/projection 帧 → 进度流段 refresh）', () => {
    const src = mobileSrc('main.ts')
    expect(src).toMatch(/session\/projection/) // 帧类型识别
    expect(src).toMatch(/createProgressStream/) // 进度流段挂载（tasks 浮层）
    expect(src).toMatch(new RegExp(DISPATCH_EVENTS_PROJECTION_KEY)) // 失效信号按键过滤
  })
})
