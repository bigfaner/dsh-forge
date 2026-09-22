// workbench/watcher/watch — DF003 感知编排(任务 2.6)。
//
// 职责链:按激活项目计算 watch 目标(tech-design §Interface 3:
// codeRoot/.forge/ 与文档位置 docs/features/,external 时 = docLocationPath
// /docs/features/)→ 交 fallback 降级链建立 watch;变更批 400ms debounce
// (尾沿合并)→ 经宏任务分片调度 2.5 增量扫入口 scanForgeFiles →
// ScanOutcome.events 进批推缓冲(events.ts,≤500ms 合并)。
//
// Hard Rules:
//  - 仅对已注册项目路径建立 watch:rebuild 时复核 projects 行存在;
//    仓外 doc_location 未授权(isExternalDocPathAuthorized,2.4 持久授权
//    登记)不得 watch —— 该根直接排除 + warn log,链上其余根照常。
//  - 感知风暴不阻塞 IPC 主循环:fs 事件回调只做 debounce 重置(同步轻量);
//    扫描经 setTimeout(0) 宏任务分片离线执行,不与事件回调同栈。
//
// 激活切换语义:rebuild = 全量重建(旧 watch 全释放,无句柄泄漏);
// removeProject 后由调用方(2.7 IPC 接线)传 null 停链。

import { statSync } from 'node:fs'
import { join } from 'node:path'
import { shellLog } from '../../log.ts'
import { resolveFeaturesDir, scanForgeFiles, type ScanOutcome, type ScanTarget } from '../indexer/scan.ts'
import { isExternalDocPathAuthorized } from '../registry/authorize.ts'
import type { RepoDb } from '../repos/types.ts'
import { createEventBatcher, type WorkbenchEventSink } from './events.ts'
import { createTierController, type TierController, type TierDeps, type WatchStrategy } from './fallback.ts'

/** 策略可观测 log code(M1 口径:非致命降级收敛于本地结构化 log)。 */
const LOG_CODE_WATCH = 'WORKBENCH_WATCH'
const LOG_CODE_WATCH_ERROR = 'ERR_WORKBENCH_WATCH'
const DEFAULT_DEBOUNCE_MS = 400

type WatchLog = Pick<typeof shellLog, 'info' | 'warn'>

export interface WorkbenchWatcherDeps {
  /** 感知扫描入口(默认 = 2.5 scanForgeFiles;测试注入计数/故障)。 */
  readonly scan?: (db: RepoDb, target: ScanTarget) => ScanOutcome
  /** 降级链注入面(fs.watch 假体/轮询签名/周期)。 */
  readonly tier?: TierDeps
  /** 变更 debounce(尾沿合并;默认 400ms,Interface 3 预算)。 */
  readonly debounceMs?: number
  /** 批推送端(2.7 接 `dsh-forge:workbench-events`;测试观测)。 */
  readonly onEvents?: WorkbenchEventSink
  readonly log?: WatchLog
}

export interface WorkbenchWatcher {
  /**
   * 激活切换/项目移除时重建:旧 watch 全释放(含在途 debounce 取消),
   * 新目标按 Hard Rules 复核后重立;null = 全停(不冲刷批缓冲)。
   */
  rebuild(target: ScanTarget | null): void
  /** 终止:释放 watch、取消未到点扫描、冲刷待发事件批(不丢事件)。 */
  stop(): void
  /** 当前感知策略(null = 未建立 watch)。 */
  readonly strategy: WatchStrategy | null
}

function isDirectoryPath(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * watch 目标计算(Hard Rule 执行点):仅已注册项目(调用方已复核)的
 * `.forge/` 与文档位置 `docs/features/`;仓外文档位置未授权即排除该根。
 * 不存在的根跳过(watch 不得对缺失目录建立,降级链留给存在根)。
 */
function resolveWatchRoots(db: RepoDb, target: ScanTarget, log: WatchLog): string[] {
  const roots: string[] = []
  const forgeRoot = join(target.codeRoot, '.forge')
  if (isDirectoryPath(forgeRoot)) roots.push(forgeRoot)

  const featuresDir = resolveFeaturesDir(target)
  if (target.docLocationPath === null) {
    if (isDirectoryPath(featuresDir)) roots.push(featuresDir)
  } else if (isExternalDocPathAuthorized(db, target.docLocationPath)) {
    if (isDirectoryPath(featuresDir)) roots.push(featuresDir)
  } else {
    log.warn({
      code: LOG_CODE_WATCH_ERROR,
      message: 'external doc location has no explicit authorization — features dir not watched',
      data: { projectId: target.id, docLocationPath: target.docLocationPath },
    })
  }
  return roots
}

export function createWorkbenchWatcher(db: RepoDb, deps: WorkbenchWatcherDeps = {}): WorkbenchWatcher {
  const scan = deps.scan ?? scanForgeFiles
  const log = deps.log ?? shellLog
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const batcher = createEventBatcher(batch => deps.onEvents?.(batch))

  let tier: TierController | null = null
  let currentTarget: ScanTarget | null = null
  let scanTimer: ReturnType<typeof setTimeout> | null = null

  function cancelScheduledScan(): void {
    if (scanTimer !== null) {
      clearTimeout(scanTimer)
      scanTimer = null
    }
  }

  function teardownTier(): void {
    if (tier !== null) {
      tier.stop()
      tier = null
    }
  }

  async function runScan(): Promise<void> {
    scanTimer = null
    const target = currentTarget
    if (target === null) return
    // 异步分片(Hard Rule):扫描不与 fs 事件回调同栈;分片边界让排队的
    // IPC 消息先消化,感知风暴至多每 debounce 窗口产生一轮扫描。
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
    if (currentTarget !== target) return // 重建/停机竞态:过期目标不扫
    try {
      const outcome = scan(db, target)
      batcher.push(outcome.events)
    } catch (error) {
      log.warn({
        code: LOG_CODE_WATCH_ERROR,
        message: `perception scan failed for project ${target.id}`,
        data: { projectId: target.id, detail: errorMessage(error) },
      })
    }
  }

  function scheduleScan(): void {
    cancelScheduledScan() // 尾沿合并:窗口内后续变更重置计时
    scanTimer = setTimeout(() => {
      void runScan()
    }, debounceMs)
  }

  return {
    rebuild(target) {
      teardownTier()
      cancelScheduledScan()
      currentTarget = target
      if (target === null) return

      const registered = db.prepare('SELECT id FROM projects WHERE id = ?').get(target.id)
      if (registered === undefined) {
        log.warn({
          code: LOG_CODE_WATCH_ERROR,
          message: `refusing to watch unregistered project ${target.id}`,
          data: { projectId: target.id },
        })
        return
      }

      const roots = resolveWatchRoots(db, target, log)
      if (roots.length === 0) {
        log.info({
          code: LOG_CODE_WATCH,
          message: `no watchable roots exist yet for project ${target.id}`,
          data: { projectId: target.id },
        })
        return
      }
      tier = createTierController(
        roots,
        {
          onChange: scheduleScan,
          onStrategy: event =>
            log.info({
              code: LOG_CODE_WATCH,
              message: `watch strategy ${event.strategy} (${event.reason})`,
              data: { projectId: target.id, strategy: event.strategy, reason: event.reason },
            }),
        },
        deps.tier,
      )
    },
    stop() {
      teardownTier()
      cancelScheduledScan()
      currentTarget = null
      batcher.flush()
    },
    get strategy() {
      return tier === null ? null : tier.strategy
    },
  }
}
