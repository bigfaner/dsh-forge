// 诊断上下文传播缝（app-observability 方案 7 + 评审 Note-4 DI 缝定版）：
// trace_id 等关联字段经 Node AsyncLocalStorage 进程内贯穿——ALS 实例可注入，
// 测试可控（拆解前提：缝保留，不在本任务接线 trace_id 生成/传播链）。
import { AsyncLocalStorage } from 'node:async_hooks'

/** 进程内诊断上下文（emit 点经 ALS 就近携带——appender 订阅回调内同步读取） */
export interface DiagContext {
  traceId?: string
  projectId?: string
  sessionId?: string
  cwd?: string
}

/** ALS 缝最小面（DI：AsyncLocalStorage 实例可注入替换——评审 Note-4） */
export interface DiagContextStore {
  getStore(): DiagContext | undefined
}

/** 创建 ALS 实例（装配缺省——测试注入替身时不经此处） */
export function createDiagContextStore(): AsyncLocalStorage<DiagContext> {
  return new AsyncLocalStorage<DiagContext>()
}

/** 在诊断上下文内执行（trace_id 链挂点用——本任务仅提供缝） */
export function runWithDiagContext<T>(
  store: DiagContextStore,
  context: DiagContext,
  fn: () => T,
): T {
  return (store as AsyncLocalStorage<DiagContext>).run(context, fn)
}
