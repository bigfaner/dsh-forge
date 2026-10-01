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
