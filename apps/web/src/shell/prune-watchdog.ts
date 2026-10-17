// 行存续看门（W4——提案 session-binding-guarantee §W4）：prune 级联回收检测，必须活在
// 壳 bundle 全局面——插件 fiber 内看门随插件同殁，检不出 prune。判读双信号：
//   ① __DSH_FORGE_CLIENT__ 激活标记（插件 apply 立标、fiber 卸载/回收摘除）；
//   ② ctx.slots.entries 计数（插件侧经 __DSH_FORGE_HEALTH__ 探测面发布——closure 持
//      官方 ctx，插件 fiber 死后 slots 服务仍存活，计数回落 = 占用者被回收）。
// 官方信号源双保险：cordis `internal/service` 事件（reflect.notify 服务注销 emit）——
// sessions 注销 = prune 级联回收的官方信号，插件侧监听转发到本看门 check()（事件触发），
// 叠加本模块 setInterval 周期轮询（时间触发）——事件面随插件同殁，轮询面恒在。
// 语义：判定失效 = fail-loud（console.error + 页面级显式横幅），不静默残缺。

/** 插件侧发布的健康探测面（client-plugin/plugin.ts apply 期写 `__DSH_FORGE_HEALTH__`） */
export interface ForgeHealthProbeGlobal {
  /** forge 占用洞位 entries 计数（官方 ctx.slots.entries 求和——插件 fiber 外仍可读） */
  readonly slotCount: () => number
  /** 看门主动核查入口（插件 internal/service 事件监听转发消费——与轮询共用判读核） */
  readonly check: () => void
}

/** 看门读数（一次探测的快照） */
export interface PruneWatchdogState {
  /** __DSH_FORGE_CLIENT__ 激活标记在场 */
  readonly markerPresent: boolean
  /** forge 占用洞位 entries 计数 */
  readonly slotCount: number
}

export interface PruneWatchdogDeps {
  /** 探测读数（undefined = 探测面未就绪——插件未激活，不武装不误报） */
  readonly readState: () => PruneWatchdogState | undefined
  /** 失效呈现（fail-loud——console + UI 态由调用方装配） */
  readonly onLapse: (reason: string) => void
  /** 轮询周期（缺省 15s——秒级人感刻度的三个数量级余量） */
  readonly intervalMs?: number
}

export interface PruneWatchdogHandle {
  /** 停止轮询并摘除事件转发钩（页面卸载/单测收尾） */
  stop(): void
  /** 主动核查一轮（internal/service 事件转发入口——与轮询共用判读核） */
  check(): void
  /** 是否已武装（首次成功读数后） */
  armed(): boolean
  /** 是否已判定失效（闩锁——一次失效后不再重复呈现） */
  lapsed(): boolean
}

/**
 * 看门判读核（纯逻辑——轮询与事件两径共用）：
 *   · 探测面缺席 = 插件未激活，跳过（不武装）；
 *   · 首次成功读数 = 武装（记 slots 计数基线）；
 *   · 武装后标记摘除 ∨ 计数回落 < 基线 = prune 失效 → onLapse 闩锁一次。
 */
export function createPruneWatchdog(deps: PruneWatchdogDeps): PruneWatchdogHandle {
  let armed = false
  let latched = false
  let baseline = 0
  const evaluate = (): void => {
    if (latched) return
    const state = deps.readState()
    if (state === undefined) return
    if (!armed) {
      armed = true
      baseline = state.slotCount
      return
    }
    if (!state.markerPresent) {
      latched = true
      deps.onLapse('激活标记 __DSH_FORGE_CLIENT__ 摘除')
      return
    }
    if (state.slotCount < baseline) {
      latched = true
      deps.onLapse(`slots entries 计数回落（基线 ${baseline} → 现 ${state.slotCount}）`)
    }
  }
  const timer = setInterval(evaluate, deps.intervalMs ?? 15_000)
  const hookGlobals = globalThis as { __DSH_FORGE_PRUNE_CHECK__?: () => void }
  hookGlobals.__DSH_FORGE_PRUNE_CHECK__ = evaluate
  return {
    stop: () => {
      clearInterval(timer)
      if (hookGlobals.__DSH_FORGE_PRUNE_CHECK__ === evaluate) {
        hookGlobals.__DSH_FORGE_PRUNE_CHECK__ = undefined
      }
    },
    check: evaluate,
    armed: () => armed,
    lapsed: () => latched,
  }
}

/** 看门失效呈现（fail-loud——console.error + 页面底缘显式横幅；幂等不重复插条） */
export function announcePruneLapse(reason: string): void {
  console.error(
    `[dsh-forge web] 行存续看门判定插件失效（prune）：${reason}——体验层 wrap 已失守，` +
      'host guard 兜底仍保证绑定正确性；请刷新页面恢复',
  )
  if (typeof document === 'undefined') return
  if (document.getElementById('dswf-prune-lapse') !== null) return
  const bar = document.createElement('div')
  bar.id = 'dswf-prune-lapse'
  bar.textContent = 'dsh-forge 客户端插件被回收（prune）——绑定体验层失守，host 守卫兜底中；请刷新页面'
  bar.setAttribute(
    'style',
    'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:8px 16px;' +
      'background:#5c1a1a;color:#fff;font:12px/1.6 system-ui,sans-serif;text-align:center;',
  )
  document.body.append(bar)
}

/**
 * 装配入口（main.ts 壳 bundle 调用——看门活在壳全局面，非插件 fiber 内）：
 * 探测面 = `__DSH_FORGE_CLIENT__` 标记 + `__DSH_FORGE_HEALTH__` 计数探针。
 */
export function installPruneWatchdog(deps: {
  readonly onLapse?: (reason: string) => void
  readonly intervalMs?: number
}): PruneWatchdogHandle {
  const globals = globalThis as {
    __DSH_FORGE_CLIENT__?: unknown
    __DSH_FORGE_HEALTH__?: ForgeHealthProbeGlobal
  }
  return createPruneWatchdog({
    readState: () => {
      const health = globals.__DSH_FORGE_HEALTH__
      if (health === undefined || typeof health.slotCount !== 'function') return undefined
      return { markerPresent: globals.__DSH_FORGE_CLIENT__ !== undefined, slotCount: health.slotCount() }
    },
    onLapse: deps.onLapse ?? announcePruneLapse,
    intervalMs: deps.intervalMs,
  })
}
