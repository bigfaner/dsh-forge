// workbench/watcher/fallback — 感知降级链(任务 2.6)。
//
// tech-design §Interface 3:recursive fs.watch 不可用(平台能力运行时探测,
// 或 watcher 运行期报错 —— 目录被删/权限变化/ERR_STREAM_WATCH 过载)→
// 非递归目录树 watch → **2s 轮询** 兜底。三级策略对上层(onChange)行为
// 完全一致:都只发「有变更」信号,由 watch.ts 统一 debounce → 增量扫;
// 当前策略经 onStrategy 回调可观测(watch.ts 记结构化 log)。
//
// 探测纪律(Implementation Notes):**不以 process.platform 硬编码分支** ——
// 能力判定的唯一来源 = 构造期试错(openWatch throw)与运行期 error 回调。
// 恢复:轮询 tick 先探测升级(recursive → tree),目录恢复后自动回到更高
// 一级策略;两探皆败才做本轮签名比对(mtime 树签名,不解析 forge 文件)。
//
// 代际(generation)护栏:每次重建/降级冲刷把手柄代际 +1,旧 watcher 的
// 迟到事件(error/change)按代际失配静默丢弃 —— 关闭后的 watcher 永不
// 触发降级或扫描。

import { readdirSync, statSync, watch as fsWatch, type Dirent } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export type WatchStrategy = 'recursive' | 'tree' | 'polling'

/** 策略变迁事件(可观测面)。 */
export interface StrategyEvent {
  readonly strategy: WatchStrategy
  readonly reason: string
}

/** openWatch 产物(最小关闭面;生产 = fs.FSWatcher)。 */
export interface OpenedWatch {
  close(): void
}

/** 变更事件监听(filename 归一为字符串或 null)。 */
export type WatchListener = (eventType: string, filename: string | null) => void

/**
 * fs.watch 的注入面。同步 throw = 构造失败(能力探测/目录缺失);
 * onError = 运行期失败(目录被删/权限变化/过载)。
 */
export type WatchOpener = (
  dir: string,
  options: { recursive: boolean },
  listener: WatchListener,
  onError: (error: Error) => void,
) => OpenedWatch

export interface TierDeps {
  readonly openWatch?: WatchOpener
  /** 轮询签名(默认 = 实际目录树 mtime 签名;测试注入受控序列)。 */
  readonly treeSignature?: (roots: readonly string[]) => string
  /** 轮询周期(默认 2000ms)。 */
  readonly pollIntervalMs?: number
}

export interface TierHooks {
  /** 任一层级探测到变更(上层统一 debounce 合并)。 */
  readonly onChange: () => void
  /** 策略变迁(初始建立/降级/恢复回升)。 */
  readonly onStrategy: (event: StrategyEvent) => void
}

export interface TierController {
  readonly roots: readonly string[]
  /** 当前策略;stop 后为 null。 */
  readonly strategy: WatchStrategy | null
  stop(): void
}

const DEFAULT_POLL_INTERVAL_MS = 2000

function defaultOpenWatch(
  dir: string,
  options: { recursive: boolean },
  listener: WatchListener,
  onError: (error: Error) => void,
): OpenedWatch {
  // persistent: false —— 主进程事件循环由应用本体持有,watcher 不得独立
  // 续命进程(否则未关闭的句柄会吊住退出/测试收尾)。
  const normalized = (eventType: string, filename: string | Buffer | null): void => {
    listener(eventType, filename === null || typeof filename === 'string' ? filename : filename.toString())
  }
  const watcher = fsWatch(dir, { recursive: options.recursive, persistent: false }, normalized)
  watcher.on('error', error => onError(error instanceof Error ? error : new Error(String(error))))
  return { close: () => watcher.close() }
}

function isDirectoryPath(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** 枚举 roots(含自身)下的全部真实目录;符号链接不递归(防环)。 */
function listDirectoriesUnder(roots: readonly string[]): Set<string> {
  const dirs = new Set<string>()
  const walk = (dir: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const child = join(dir, entry.name)
      dirs.add(child)
      walk(child)
    }
  }
  for (const root of roots) {
    if (!isDirectoryPath(root)) continue
    dirs.add(root)
    walk(root)
  }
  return dirs
}

/**
 * 默认轮询签名:roots 下每条路径 + 类型 + mtimeMs 的定序拼接。新建/
 * 删除/改写均改变签名;不解析 forge 文件(轮询兜底只判「变没变」,
 * 语义判定交给增量扫)。
 */
function defaultTreeSignature(roots: readonly string[]): string {
  const parts: string[] = []
  const walk = (dir: string, rel: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      parts.push(`${rel}|missing`)
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const child = join(dir, entry.name)
      let stamp = 'x'
      try {
        stamp = String(statSync(child).mtimeMs)
      } catch {
        stamp = 'x'
      }
      parts.push(`${rel}/${entry.name}|${entry.isDirectory() ? 'd' : 'f'}|${stamp}`)
      if (entry.isDirectory()) walk(child, `${rel}/${entry.name}`)
    }
  }
  for (const root of roots) walk(root, root)
  return parts.join(';')
}

/**
 * Is this event's filename the watched directory ITSELF (6.4, SC5
 * path-invalidation)? win32 reports a watched root's own removal as an
 * unbounded rename storm on the surviving handle — the filename arrives in
 * the `\\?\`-prefixed absolute form (relative names are always children).
 * @param dir - the watched directory this handle belongs to.
 * @param filename - the event filename (null = unusable).
 */
function isWatchedRootSelf(dir: string, filename: string | null): boolean {
  if (filename === null || filename === '') return false
  const raw = filename.startsWith('\\\\?\\') ? filename.slice(4) : filename
  const absolute = isAbsolute(raw) ? raw : resolve(dir, raw)
  if (process.platform === 'win32') return absolute.toLowerCase() === dir.toLowerCase()
  return absolute === dir
}

export function createTierController(roots: readonly string[], hooks: TierHooks, deps: TierDeps = {}): TierController {
  const openWatch = deps.openWatch ?? defaultOpenWatch
  const treeSignature = deps.treeSignature ?? defaultTreeSignature
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const rootList = [...roots]

  let strategy: WatchStrategy | null = null
  const handles = new Map<string, OpenedWatch>()
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastSignature: string | null = null
  let generation = 0
  let stopped = false

  function closeAllHandles(): void {
    generation += 1
    const current = [...handles.values()]
    handles.clear()
    for (const handle of current) {
      try {
        handle.close()
      } catch {
        // 关闭失败不阻断降级链(句柄可能已随目录消失)。
      }
    }
  }

  function stopPolling(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    lastSignature = null
  }

  function openOne(dir: string, recursive: boolean): OpenedWatch | null {
    const gen = generation
    const listener: WatchListener = (eventType, filename) => {
      if (gen !== generation || stopped) return
      if (eventType === 'rename' && isWatchedRootSelf(dir, filename)) {
        // The watched ROOT itself was renamed/removed: ONE change signal (the
        // scan reads the missing dir → sync error — the SC5 路径失效 error
        // state), then degrade — the storming handle must not spin the loop
        // or starve the debounce with an endless event tail.
        hooks.onChange()
        degradeFromWatchError(new Error(`watched root removed: ${dir}`))
        return
      }
      if (!recursive && eventType === 'rename') refreshTreeWatches() // 新建目录需补挂非递归 watch
      hooks.onChange()
    }
    const onError = (error: Error): void => {
      if (gen !== generation || stopped) return
      degradeFromWatchError(error)
    }
    try {
      return openWatch(dir, { recursive }, listener, onError)
    } catch {
      return null
    }
  }

  function tryOpenAll(targets: Iterable<string>, recursive: boolean): boolean {
    for (const dir of targets) {
      const handle = openOne(dir, recursive)
      if (handle === null) {
        closeAllHandles()
        return false
      }
      handles.set(dir, handle)
    }
    return handles.size > 0
  }

  function establishRecursive(reason: string): boolean {
    if (stopped) return false
    closeAllHandles()
    if (!tryOpenAll(rootList, true)) return false
    stopPolling() // 成功立足才停轮询 —— 失败的升级探测不得杀死轮询节奏
    strategy = 'recursive'
    hooks.onStrategy({ strategy, reason })
    return true
  }

  function establishTree(reason: string): boolean {
    if (stopped) return false
    closeAllHandles()
    const dirs = listDirectoriesUnder(rootList)
    if (!tryOpenAll(dirs, false)) return false
    stopPolling() // 同上:探测失败路径不得触碰轮询定时器
    strategy = 'tree'
    hooks.onStrategy({ strategy, reason })
    return true
  }

  function establishPolling(reason: string): void {
    if (stopped) return
    stopPolling()
    closeAllHandles()
    lastSignature = null
    pollTimer = setInterval(pollTick, pollIntervalMs)
    strategy = 'polling'
    hooks.onStrategy({ strategy, reason })
  }

  /** 级联建立:starting 起逐级下探,直到某一层成功(polling 恒成功)。 */
  function establish(starting: 'recursive' | 'tree', reason: string): void {
    if (starting === 'recursive' && establishRecursive(`recursive watch established (${reason})`)) return
    if (establishTree(`recursive watch unavailable (${reason}) — directory-tree watch`)) return
    establishPolling(`directory-tree watch unavailable (${reason}) — 2s polling`)
  }

  /** 运行期 watch 错误:整体降一级(recursive→tree;tree→polling)。 */
  function degradeFromWatchError(error: Error): void {
    const reason = `watch error: ${error.message}`
    const from = strategy
    if (from === 'recursive') {
      establish('tree', reason)
    } else if (from === 'tree') {
      establishPolling(reason)
    }
  }

  /** tree 层增量补挂:新建目录补 watch、消失目录撤 watch(单点失败仅跳过)。 */
  function refreshTreeWatches(): void {
    if (strategy !== 'tree' || stopped) return
    const dirs = listDirectoriesUnder(rootList)
    for (const [dir, handle] of [...handles]) {
      if (!dirs.has(dir)) {
        handles.delete(dir)
        try {
          handle.close()
        } catch {
          // 同 closeAllHandles:关闭失败不阻断。
        }
      }
    }
    for (const dir of dirs) {
      if (handles.has(dir)) continue
      const handle = openOne(dir, false)
      if (handle !== null) handles.set(dir, handle)
    }
  }

  /** 轮询 tick:先探测回升(目录恢复→自动回到更高一级),失败才签名比对。 */
  function pollTick(): void {
    if (stopped || strategy !== 'polling') return
    if (establishRecursive('recovered: recursive watch re-established from polling')) return
    if (establishTree('recovered: directory-tree watch re-established from polling')) return
    const signature = treeSignature(rootList)
    if (lastSignature !== null && signature !== lastSignature) hooks.onChange()
    lastSignature = signature
  }

  establish('recursive', 'watch targets established')

  return {
    roots: rootList,
    get strategy() {
      return strategy
    },
    stop() {
      stopped = true
      closeAllHandles()
      stopPolling()
      strategy = null
    },
  }
}
