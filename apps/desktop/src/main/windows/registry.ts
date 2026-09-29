// windows/registry — 壳层窗口注册表(任务 4.2;tech-design §Interfaces·
// Interface 5「窗口注册表(主窗 + detached 集)」+ §Architecture·Layer
// Placement「壳窗口」行)。
//
// 纯记账面:主窗引用 + detached 集(增删查),零 Electron 依赖 —— 窗口
// 构造/生命周期钩子由壳引导(apps/desktop/src/main/index.ts)经 seam 注入,
// 测试注入假体(single-instance/tray 同款纪律)。读侧一律做 destroyed 过滤
// (陈旧引用不外泄);detached 的「关闭即移除 + 事件兜底」编排归
// detached.ts,本模块只持数据。
//
// 唯一身份面:windowId(manager 生成,进程内单调);条目 → webContents 的
// 映射是 windowGetRole 的握手基础(role 按主进程注册表解析,不信任 URL —
// M1 spike-3 禁 URL hash 纪律的 T5 裁决面)。

import type { DetachedView, SessionTarget } from '../workbench/ui-state/layout-schema.ts'

/** 注册表所需的最小 webContents 面(推送/身份;DI 假体同构)。 */
export interface RegistryWebContents {
  /** webContents 身份(进程内唯一;role 匹配键)。 */
  readonly id: number
  send(channel: string, ...args: unknown[]): void
  isDestroyed(): boolean
}

/** 注册表所需的最小窗口面(BrowserWindow 结构子集;DI 假体同构)。 */
export interface RegistryWindow {
  isDestroyed(): boolean
  readonly webContents: RegistryWebContents
}

/** detached 窗口注册行(manager 写入;role/fan-out/收回读)。 */
export interface DetachedWindowEntry {
  readonly windowId: string
  readonly projectId: string
  readonly view: DetachedView
  readonly target?: SessionTarget | undefined
  readonly window: RegistryWindow
}

/** 窗口注册表面(主窗 + detached 集;增删查 + 活性视图)。 */
export interface WindowRegistry {
  /** 主窗登记(壳引导在每个主窗实例落位点调用;同引用幂等)。 */
  setMainWindow(window: RegistryWindow | undefined): void
  /** 当前主窗(已销毁 → undefined)。 */
  getMainWindow(): RegistryWindow | undefined
  /** detached 入册(同 windowId 幂等覆盖)。 */
  addDetached(entry: DetachedWindowEntry): void
  /** 摘除并返回该行(缺席 → undefined;事件兜底的唯一移除口)。 */
  removeDetached(windowId: string): DetachedWindowEntry | undefined
  /** 按 windowId 查(窗口已销毁 → 视同缺席)。 */
  getDetached(windowId: string): DetachedWindowEntry | undefined
  /** 全部存活 detached(快照副本)。 */
  listDetached(): readonly DetachedWindowEntry[]
  /** 项目域过滤(removeProject 关窗 hook 的输入面)。 */
  listDetachedByProject(projectId: string): readonly DetachedWindowEntry[]
  /** 主窗 + detached 的存活 webContents(事件 fan-out 推送面)。 */
  liveWebContents(): readonly RegistryWebContents[]
  /** 同上,id 集(WS 改写层逐 webContents 注册面)。 */
  liveWebContentsIds(): ReadonlySet<number>
}

export function createWindowRegistry(): WindowRegistry {
  let mainWindow: RegistryWindow | undefined
  const detachedById = new Map<string, DetachedWindowEntry>()

  const isLive = (window: RegistryWindow | undefined): window is RegistryWindow =>
    window !== undefined && !window.isDestroyed()

  const liveEntries = (): DetachedWindowEntry[] =>
    [...detachedById.values()].filter(entry => !entry.window.isDestroyed())

  return {
    setMainWindow(window) {
      mainWindow = window
    },
    getMainWindow() {
      return isLive(mainWindow) ? mainWindow : undefined
    },
    addDetached(entry) {
      detachedById.set(entry.windowId, entry)
    },
    removeDetached(windowId) {
      const entry = detachedById.get(windowId)
      if (entry === undefined) return undefined
      detachedById.delete(windowId)
      return entry
    },
    getDetached(windowId) {
      const entry = detachedById.get(windowId)
      // 防御性活性过滤:'closed' 编排在 manager,极端时序下的陈旧行不外泄。
      return entry !== undefined && !entry.window.isDestroyed() ? entry : undefined
    },
    listDetached() {
      return liveEntries()
    },
    listDetachedByProject(projectId) {
      return liveEntries().filter(entry => entry.projectId === projectId)
    },
    liveWebContents() {
      const contents: RegistryWebContents[] = []
      if (isLive(mainWindow)) contents.push(mainWindow.webContents)
      for (const entry of liveEntries()) contents.push(entry.window.webContents)
      return contents
    },
    liveWebContentsIds() {
      return new Set(this.liveWebContents().map(contents => contents.id))
    },
  }
}
