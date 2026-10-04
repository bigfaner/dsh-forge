// e2e 端口分配器（fix-37 ③）——替代 16 spec 各自的魔法基数（19810/19710/19830/…×17）。
// 撞段史：同 pid 下 web-shell（19810+pid%200）与 project-registration（19810+pid%150+seq%20）
// 两段重叠、flywheel/host-boot 同撞 19710——固定基数对 pid 取模后不可避免交叠。
// 方案：进程内单调序号 + pid 派生基段（进程切片互不重叠的宽度 90 连续段），单 worker
// 串行（fullyParallel:false）下序号单调即进程内零撞；跨进程仍靠 pid 错峰（与旧方案同界，
// 不宣称跨进程唯一）。段上界 19500+280×90+90 < Windows 临时端口段 49152。
// 纯函数面（零 import）——tests/structure/port-allocator.test.ts 单测钉行为。

/** 每进程切片宽度（连续段内序号轮转周期） */
export const PORT_SPAN = 90
/** 端口段起点 */
export const PORT_BASE = 19_500
/** pid 切片系数（280 × 90 = 25200 < 49152-19500 上界余量；导出 = 单测面） */
export const PID_SLICES = 280

/** 进程端口段基点（纯函数——单测面） */
export function portBaseForPid(pid: number): number {
  return PORT_BASE + (pid % PID_SLICES) * PORT_SPAN
}

export interface PortAllocator {
  /** 下一端口（进程内单调，段内轮转——轮转点前必然已 closeApp 释放） */
  next(): number
}

/** 建分配器（缺省取当前进程 pid；注入 pid = 单测面） */
export function createPortAllocator(pid: number = process.pid): PortAllocator {
  const base = portBaseForPid(pid)
  let seq = 0
  return {
    next(): number {
      return base + (seq++ % PORT_SPAN)
    },
  }
}

/** 套件共享分配器（specs 直接消费；单测勿用——用 createPortAllocator(pid)） */
export const portAllocator: PortAllocator = createPortAllocator()

/** 取下一端口（specs 便捷面） */
export function allocatePort(): number {
  return portAllocator.next()
}
