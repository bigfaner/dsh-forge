// 日志监听器 = logs/{slug}.jsonl 唯一写者（任务 3.3；tech-design Interface 3 + 图 5 节点 D–H）。
// 链路：tool 执行 emit → 总线（bus.ts）→ 本监听器（标准化 → 归属判定）→ 容器维度追加落盘。
// 归属三分支（监听器归属判定——图 5 节点 E）：事件带任务 → 任务容器 slug
// （taskKey = 'slug/localId' 复合自然键前缀，与 task_records 追溯键同口径）；无任务 →
// contextSlug（no-ready-task 载荷语境；缺省回落信封 slug = 发射侧语境回声）；皆无 →
// '_pool' 兜底。标准行 slug 恒 = 归属判定产物——串联读法「slug 过滤 = 容器全程」的单源。
// 路径：{容器目录}/logs/{slug}.jsonl——容器目录 = {tasksHome}/{flatten}@{hash8} 经注入解析
// （workspace paths 同源；derive-dir 单源在 core，插件不复制——事件 → 工作区映射归装配方闭包）。
// 敏感度边界（Security ③ / Hard Rules）：载荷面只承载 digest（dispatchDigest）——不含凭据、
// 不含 dispatchPrompt 全文；logs = agent 面执行运营日志，UI 面状态审计 = feature_records/
// task_records（DB）——两纪律不混不重复。
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ForgePluginEvent } from '@dsh-forge/contracts'
import type { ForgeEventBus } from './bus.js'

/** 兜底文件 slug（logs/_pool.jsonl——皆无归属事件的纯兜底面） */
export const FORGE_LOG_POOL_SLUG = '_pool'

/** 容器库内日志目录名（{容器目录}/logs/{slug}.jsonl） */
export const FORGE_LOGS_DIR = 'logs'

/** 归属三分支判定（图 5 节点 E——监听器单源；畸形输入防御性落 _pool） */
export function resolveLogSlug(event: ForgePluginEvent): string {
  // 分支①：事件带任务（task-claimed/spawned/submitted/worker-done 载荷恒含 taskKey）
  // → 任务容器 slug = taskKey 前缀
  const taskKey = (event.payload as { taskKey?: unknown }).taskKey
  if (typeof taskKey === 'string' && taskKey !== '') {
    const sep = taskKey.indexOf('/')
    if (sep > 0) return taskKey.slice(0, sep)
  }
  // 分支②：无任务 → contextSlug（no-ready-task 载荷）；缺省回落信封 slug（发射侧语境回声）
  const contextSlug = (event.payload as { contextSlug?: unknown }).contextSlug
  if (typeof contextSlug === 'string' && contextSlug !== '') return contextSlug
  if (typeof event.slug === 'string' && event.slug !== '') return event.slug
  // 分支③：皆无 → _pool 兜底
  return FORGE_LOG_POOL_SLUG
}

/** 事件标准化（唯一写者的行形状锚）：slug = 归属判定产物（原始信封 slug 被判定结果
 *  覆写——行面单源）；键序 = 信封声明序 ts/sessionId/slug/type/payload（发射侧按
 *  contracts 声明序构造信封——spread 保 type↔payload 判别联合相关性）。 */
export function standardizeEvent(event: ForgePluginEvent): ForgePluginEvent {
  return { ...event, slug: resolveLogSlug(event) }
}

/** 日志文件路径（{containerDir}/logs/{slug}.jsonl） */
export function forgeLogFileOf(containerDir: string, slug: string): string {
  return join(containerDir, FORGE_LOGS_DIR, `${slug}.jsonl`)
}

/** 监听器依赖（注入的 tasksHome 语境——workspace paths 同源） */
export interface ForgeLogListenerOptions {
  /** 容器库目录解析：返回 {tasksHome}/{flatten}@{hash8}（事件 → 工作区映射归装配方
   *  闭包承载——本模块零 core import，derive-dir 单源不动） */
  resolveContainerDir(event: ForgePluginEvent): string
}

/** 日志监听器（订阅面 handler 形状；attachForgeLogListener 挂总线） */
export interface ForgeLogListener {
  /** 单事件处理：标准化 → 归属判定 → JSONL 追加行落盘 */
  handle(event: ForgePluginEvent): void
}

/** 建监听器（唯写者；写径 fail-soft——日志缺席不拖垮工具执行闭包，零日志代码纪律的另一半） */
export function createForgeLogListener(options: ForgeLogListenerOptions): ForgeLogListener {
  return {
    handle(event: ForgePluginEvent): void {
      try {
        const line = standardizeEvent(event)
        const file = forgeLogFileOf(options.resolveContainerDir(event), line.slug)
        mkdirSync(dirname(file), { recursive: true })
        appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf8')
      } catch {
        // fail-soft 降级（本机文件面，Security ③ 同级敏感度）——发射方零感知
      }
    },
  }
}

/** 挂接缝（AC4）：总线 → 监听器订阅；返回退订器（装配方 disposer 合并位——3.4/3.5 接线） */
export function attachForgeLogListener(bus: ForgeEventBus, options: ForgeLogListenerOptions): () => void {
  return bus.on(createForgeLogListener(options).handle)
}

/** JSONL 读回（串联读法载面：taskKey 过滤 → claim/spawn/submit/worker-done 会话链重组；
 *  slug 过滤 = 容器全程）。文件缺席/坏行（追加写半行等运营残渣）跳过不抛——读面 fail-soft。 */
export function readForgeEventLog(file: string): ForgePluginEvent[] {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const events: ForgePluginEvent[] = []
  for (const line of text.split('\n')) {
    if (line === '') continue
    try {
      events.push(JSON.parse(line) as ForgePluginEvent)
    } catch {
      // 坏行跳过
    }
  }
  return events
}
