// 窗口/应用生命周期接线（定位：基础）。单实例锁防重复拉起（同 userData 互斥）。
export interface AppLike {
  on(event: string, listener: (...args: never[]) => void): unknown
  quit(): void
}

/** 单实例锁：未取得即 quit 并返回 false（main 据此短路启动） */
export function acquireSingleInstance(appLike: {
  requestSingleInstanceLock(): boolean
  quit(): void
}): boolean {
  if (appLike.requestSingleInstanceLock()) return true
  appLike.quit()
  return false
}

/** window-all-closed → quit（P1 仅 Windows NSIS 形态；macOS activate 面留 4.1 后裁决） */
export function wireWindowLifecycle(appLike: AppLike): void {
  appLike.on('window-all-closed', () => appLike.quit())
}

/**
 * 开发态 devtools 面（用户裁决 2026-10-13：boot 不自动开分离窗——窗口可见、能力在场、
 * 零打扰；打包形态零面，main 据调用时机守卫）：F12 按需开关。fail-soft——webContents
 * 形状漂移（toggleDevTools 缺席）时静默不接。
 */
export function wireDevToolsToggle(webContents: unknown): void {
  const wc = webContents as { on?(e: 'before-input-event', l: (event: unknown, input: { type: string; key: string }) => void): void; toggleDevTools?(): void }
  if (typeof wc.on !== 'function' || typeof wc.toggleDevTools !== 'function') return
  // 方法须以 wc 为 receiver 调用（解构后裸调丢 this → node:events _events undefined 实测崩）
  wc.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') wc.toggleDevTools?.()
  })
}
