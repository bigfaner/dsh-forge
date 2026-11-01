// 诊断事件域（app-observability 方案 1）：埋点归一单面——所有诊断埋点 = 一次
// cordis `ctx.emit`，承载于官方事件总线（复用优先纪律：不自造事件总线）。
// emit 侧零对 appender 的静态依赖；appender 为 `diag/log` 事件域的唯一订阅者
// （attachDiagAppender）。新增错误源 = 新增 emit 点，订阅侧零改动。
//
// 常量/类型/emit 单源自方案 C 下沉至 @dsh-forge/core（packages/core/src/telemetry/
// diag-events.ts）——本文件保持既有 import 路径的 re-export 面 + cordis Events
// 接口类型化扩充（唯一 augmentation 点）。
import type { DiagEventPayload } from '@dsh-forge/core'

export {
  DIAG_EVENT,
  emitDiag,
  type DiagEmitFace,
  type DiagEventPayload,
  type DiagLevel,
  type DiagProcess,
} from '@dsh-forge/core'

// cordis 官方 Events 接口扩充（官方事件总线的类型化注册缝——诊断事件域类型单源）
declare module '@deepseek-ai/cordis' {
  interface Events {
    'diag/log'(payload: DiagEventPayload): void
  }
}
