// e2e 端口分配器单测（fix-37 ③ 验收面——「端口撞段消除（分配器单测）」）。
// 撞段史：固定基数 + pid 取模在两对 spec 间交叠（19810：web-shell × project-registration；
// 19710：flywheel × host-boot）——分配器 = 进程内单调序号 + pid 派生基段，本测试钉：
// ① 进程内连续分配零重复（撞段消除的直接面）；② 端口恒在预期段内（基 + [0, SPAN)）；
// ③ 不同 pid 切片错峰（相邻 pid 段不重叠）；④ 段上界避开 Windows 临时端口段 49152。
import { describe, expect, it } from 'vitest'
import {
  PID_SLICES,
  PORT_BASE,
  PORT_SPAN,
  createPortAllocator,
  portBaseForPid,
} from '../../e2e/support/ports.js'

describe('e2e 端口分配器（fix-37 ③）', () => {
  it('进程内连续分配零重复（撞段消除——段内轮转周期 PORT_SPAN；轮转点前必已 closeApp）', () => {
    const allocator = createPortAllocator(1234)
    const seen = new Set<number>()
    for (let i = 0; i < PORT_SPAN; i++) {
      const port = allocator.next()
      expect(seen.has(port), `第 ${String(i)} 次分配撞已用端口 ${String(port)}`).toBe(false)
      seen.add(port)
    }
  })

  it('端口恒在进程段内（base + [0, SPAN)）', () => {
    const pid = 42
    const base = portBaseForPid(pid)
    const allocator = createPortAllocator(pid)
    for (let i = 0; i < PORT_SPAN + 5; i++) {
      const port = allocator.next()
      expect(port).toBeGreaterThanOrEqual(base)
      expect(port).toBeLessThan(base + PORT_SPAN)
    }
  })

  it('不同 pid 切片错峰：相邻 pid 基段相差 PORT_SPAN；同切片 pid（+PID_SLICES）共享基段（跨进程不宣称唯一——与旧方案同界）', () => {
    expect(portBaseForPid(1001) - portBaseForPid(1000)).toBe(PORT_SPAN)
    expect(portBaseForPid(1000 + PID_SLICES)).toBe(portBaseForPid(1000))
  })

  it('段上界避开 Windows 临时端口段（< 49152）', () => {
    let max = 0
    for (let pid = 0; pid < 100_000; pid += 7) max = Math.max(max, portBaseForPid(pid))
    expect(max + PORT_SPAN).toBeLessThan(49152)
    expect(PORT_BASE).toBe(19_500)
  })
})
