// e2e 清理面（fix-37 ① 收编——rmDirBestEffort ×3 / 4 种清理写法单源）。
// Node24 Windows 环境坑：单文件删除一律 unlinkSync（rmSync 单文件对 CJK 文件名/父目录
// 静默失效——实测坑，见 memory）；目录递归 rmSync 安全。
import { rmSync, unlinkSync } from 'node:fs'

/** 目录删除重试（句柄释放竞态；终态兜底不掩盖用例结论——mkdtemp 唯一名不外溢） */
export async function rmDirBestEffort(dir: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // 残留兜底（句柄长期占用）——不掩盖用例结论
  }
}

/** 单文件删除（unlinkSync——force 等值：缺席静默；CJK 名安全） */
export function rmFileBestEffort(file: string): void {
  try {
    unlinkSync(file)
  } catch {
    // 缺席/占用——叠层清理不掩盖用例结论
  }
}
