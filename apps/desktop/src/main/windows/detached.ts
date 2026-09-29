// windows/detached — windowOpenDetached / windowRecall 编排(任务 4.2;
// tech-design §Interfaces·Interface 5 + §Error Handling「窗口面」行)。
//
// 开窗 = 第二 BrowserWindow 同源 SPA 重载(同一 dsh-app://app/ 文档;渲染层
// 经 windowGetRole 握手得知自己是谁 —— 角色不经 URL)。首窗 960×640 居中
// 主窗;此后记忆上次尺寸/位置(进程内记忆;项目域持久化 rect 由 4.5 布局
// 引擎经入参重放)。收回 = close();OS 标题栏关闭与 windowRecall 汇入同一
// 'closed' 终态路径(移除 + detached-closed 事件,恰好一次)—— 语义等价
// 是设计要求,非巧合。
//
// 安全(§Security·T3):新窗同 SHELL_WEB_PREFERENCES(壳引导构造点传入)、
// will-navigate 锁 dsh-app:、window-open 拒 —— 可接线部分抽为
// applyDetachedWindowSecurity(纯函数,测试直证);构造期基线(contextIsolation
// /sandbox)由壳引导(apps/desktop/src/main/index.ts)用与主窗同一常量落位。
//
// 错误口径:开窗失败(构造抛错)→ ERR_WINDOW_OPEN_FAILED reject(toast 归
// 4.3 GUI);文档加载失败 → ERR_WINDOW_OPEN_FAILED log + 收回(close →
// closed → 注册表清除 + detached-closed 事件兜底);windowId 失效 →
// ERR_WINDOW_NOT_FOUND。
//
// Hard Rule(BIZ-002):detached = 派生快照显示面,非第二激活 —— 本模块
// 零 activate/单激活指针触点。

import { shellLog } from '../log.ts'
import type { DetachedView, Rect, SessionTarget } from '../workbench/ui-state/layout-schema.ts'
import type { DetachedWindowEntry, RegistryWindow, WindowRegistry } from './registry.ts'

/** 首个 detached 窗口的缺省几何(Interface 5:960×640 居中主窗)。 */
export const DETACHED_DEFAULT_WIDTH = 960
export const DETACHED_DEFAULT_HEIGHT = 640

/** Interface 5 windowOpenDetached 入参。 */
export interface OpenDetachedInput {
  readonly projectId: string
  readonly view: DetachedView
  readonly target?: SessionTarget
  /** 布局记忆重放的窗口矩形(4.5 布局引擎;在场即优先于进程内记忆)。 */
  readonly rect?: Rect
}

/** detached-opened / detached-closed 推送载荷(Interface 5)。 */
export type WindowChangedEvent =
  | { readonly type: 'detached-opened'; readonly windowId: string; readonly projectId: string; readonly view: DetachedView; readonly target?: SessionTarget }
  | { readonly type: 'detached-closed'; readonly windowId: string; readonly projectId: string; readonly view: DetachedView; readonly target?: SessionTarget }

/** 域错误(壳窗口面仅此两码,tech-design §Error Types & Codes)。 */
export class WindowManagementError extends Error {
  constructor(
    readonly code: 'ERR_WINDOW_NOT_FOUND' | 'ERR_WINDOW_OPEN_FAILED',
    message: string,
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'WindowManagementError'
  }
}

/** 壳引导构造入参(几何 + 标题;安全基线由引导侧落位)。 */
export interface DetachedWindowHostOptions {
  readonly width: number
  readonly height: number
  readonly x?: number
  readonly y?: number
  readonly title: string
}

/** 宿主窗口最小面(BrowserWindow 结构子集;DI 假体同构)。 */
export interface DetachedHostWindow extends RegistryWindow {
  on(event: 'close', listener: () => void): void
  once(event: 'closed', listener: () => void): void
  getBounds(): Rect
  close(): void
  /** 文档加载终局(成功 resolve / 失败 reject)。 */
  whenLoaded(): Promise<void>
  /** 标题更新(归档追加分;4.3)。 */
  setTitle(title: string): void
}

/** 宿主窗口工厂 seam(生产 = index.ts 的 BrowserWindow 构造点)。 */
export type DetachedHostWindowFactory = (options: DetachedWindowHostOptions) => DetachedHostWindow

export interface DetachedWindowManagerDeps {
  readonly registry: WindowRegistry
  readonly createHostWindow: DetachedHostWindowFactory
  /** 项目显示名(标题「<项目名> · <视图名>」;缺席回退 projectId)。 */
  readonly resolveProjectTitle: (projectId: string) => string | undefined
  /** 视图名本地化(壳引导接 i18n t();测试注入定值)。 */
  readonly viewLabel: (view: DetachedView) => string
  /** 归档追加分本地化(标题追加「已归档」;ui-design C10 窗口语义,4.3)。 */
  readonly archivedSuffix: () => string
  /** 主窗当前矩形(首窗居中基准;缺席 = 不定位,交 OS 缺省)。 */
  readonly getMainWindowBounds: () => Rect | undefined
  /** detached-opened/closed 推送落点(fan-out 面)。 */
  readonly emitWindowChanged: (event: WindowChangedEvent) => void
}

export interface DetachedWindowManager {
  /** 开 detached 窗(同源 SPA 重载);返回 windowId。 */
  openDetached(input: OpenDetachedInput): { windowId: string }
  /** 收回(OS 标题栏关闭同语义);windowId 失效 → ERR_WINDOW_NOT_FOUND。 */
  recall(windowId: string): void
  /** 收回项目全部 detached 窗(removeProject 关窗 hook);返回收回数。 */
  recallAllForProject(projectId: string): number
  /** 收回全部 detached(主窗关闭 = 退出的对账腿);返回收回数。 */
  recallAll(): number
  /**
   * 归档语义落题(任务 4.3,ui-design C10「归档 → 窗口保持可用,窗口标题
   * 追加『已归档』」):记账 + 在窗标题即时刷新;此后该项目新开窗携带同样
   * 后缀(restore 清除)。
   */
  setProjectArchived(projectId: string, archived: boolean): void
}

/**
 * 标题组装(纯函数):「<项目名> · <视图名>[ · 已归档]」—— the ui-design
 * C10 form. The archived suffix rides ONLY the title (归档 ≠ 关窗: the
 * window stays usable).
 */
export function composeDetachedTitle(
  projectTitle: string,
  viewLabel: string,
  archivedSuffix?: string | undefined,
): string {
  return archivedSuffix === undefined ? `${projectTitle} · ${viewLabel}` : `${projectTitle} · ${viewLabel} · ${archivedSuffix}`
}

// ---------------------------------------------------------------------------
// 安全接线(§Security·T3 可测面;与主窗 createWindow 行为同款)
// ---------------------------------------------------------------------------

/** security 接线所需的最小窗口面(webContents 两钩子)。 */
export interface DetachedSecurityWindow {
  readonly webContents: {
    setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
    on(event: 'will-navigate', listener: (event: { preventDefault(): void }, url: string) => void): void
  }
}

export interface DetachedSecurityDeps {
  /** http/https 外链交系统浏览器(M1 主窗同款;其余协议静默拒)。 */
  readonly openExternal: (url: string) => void
}

/**
 * 新窗安全接线:window-open 一律拒(http/https 转 openExternal,主窗先例);
 * will-navigate 锁 `dsh-app:`(其余 preventDefault;http/https 转 openExternal)。
 * role 不在此面 —— 角色供给见 role.ts(不信任 URL)。
 */
export function applyDetachedWindowSecurity(win: DetachedSecurityWindow, deps: DetachedSecurityDeps): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (['http:', 'https:'].includes(new URL(url).protocol)) deps.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).protocol !== 'dsh-app:') {
      event.preventDefault()
      if (['http:', 'https:'].includes(new URL(url).protocol)) deps.openExternal(url)
    }
  })
}

// ---------------------------------------------------------------------------
// 几何决策(纯函数:入参 rect > 进程内记忆 > 缺省 960×640 居中主窗)
// ---------------------------------------------------------------------------

export interface DetachedGeometry {
  readonly width: number
  readonly height: number
  readonly x?: number
  readonly y?: number
}

export function resolveDetachedGeometry(
  rect: Rect | undefined,
  remembered: Rect | undefined,
  mainBounds: Rect | undefined,
): DetachedGeometry {
  if (rect !== undefined) return { width: rect.width, height: rect.height, x: rect.x, y: rect.y }
  if (remembered !== undefined) {
    return { width: remembered.width, height: remembered.height, x: remembered.x, y: remembered.y }
  }
  const width = DETACHED_DEFAULT_WIDTH
  const height = DETACHED_DEFAULT_HEIGHT
  if (mainBounds === undefined) return { width, height }
  return {
    width,
    height,
    x: mainBounds.x + Math.max(0, Math.round((mainBounds.width - width) / 2)),
    y: mainBounds.y + Math.max(0, Math.round((mainBounds.height - height) / 2)),
  }
}

// ---------------------------------------------------------------------------
// manager
// ---------------------------------------------------------------------------

export function createDetachedWindowManager(deps: DetachedWindowManagerDeps): DetachedWindowManager {
  let windowSeq = 0
  let rememberedGeometry: Rect | undefined
  /** 归档记账(标题后缀的开关;setProjectArchived 维护)。 */
  const archivedProjects = new Set<string>()

  /** 项目域标题组装(「<项目名> · <视图名>[ · 已归档]」)。 */
  const titleOf = (projectId: string, view: DetachedView): string => composeDetachedTitle(
    deps.resolveProjectTitle(projectId) ?? projectId,
    deps.viewLabel(view),
    archivedProjects.has(projectId) ? deps.archivedSuffix() : undefined,
  )

  const detachEvent = (
    type: 'detached-opened' | 'detached-closed',
    entry: Pick<DetachedWindowEntry, 'windowId' | 'projectId' | 'view'> & { target?: SessionTarget | undefined },
  ): WindowChangedEvent => ({
    type,
    windowId: entry.windowId,
    projectId: entry.projectId,
    view: entry.view,
    ...(entry.target === undefined ? {} : { target: entry.target }),
  })

  const adoptHostWindow = (host: DetachedHostWindow, windowId: string): void => {
    // OS 标题栏关闭 ≡ recall:'close'(关闭请求,几何仍可读)记忆尺寸/位置,
    // 'closed'(销毁终态)做注册表移除 + detached-closed —— 两条关闭来源
    // 汇入同一编排,事件恰好一次(registry.removeDetached 是唯一移除口)。
    host.on('close', () => {
      if (!host.isDestroyed()) rememberedGeometry = host.getBounds()
    })
    host.once('closed', () => {
      const removed = deps.registry.removeDetached(windowId)
      if (removed !== undefined) deps.emitWindowChanged(detachEvent('detached-closed', removed))
    })
  }

  return {
    openDetached(input) {
      const windowId = `detached-${String(++windowSeq)}`
      const title = titleOf(input.projectId, input.view)
      const geometry = resolveDetachedGeometry(input.rect, rememberedGeometry, deps.getMainWindowBounds())

      let host: DetachedHostWindow
      try {
        host = deps.createHostWindow({ ...geometry, title })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        shellLog.error({
          code: 'ERR_WINDOW_OPEN_FAILED',
          message: 'detached window construction failed',
          data: { projectId: input.projectId, detail },
        })
        throw new WindowManagementError('ERR_WINDOW_OPEN_FAILED', 'detached window could not be opened', detail)
      }

      deps.registry.addDetached({
        windowId,
        projectId: input.projectId,
        view: input.view,
        ...(input.target === undefined ? {} : { target: input.target }),
        window: host,
      })
      adoptHostWindow(host, windowId)
      deps.emitWindowChanged({
        type: 'detached-opened',
        windowId,
        projectId: input.projectId,
        view: input.view,
        ...(input.target === undefined ? {} : { target: input.target }),
      })

      // 文档加载失败 = 开窗失败(log 口径;toast 归 4.3 GUI):收回该窗,
      // 'closed' 路径清除注册表 + detached-closed 事件兜底。
      host.whenLoaded().catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error)
        shellLog.error({
          code: 'ERR_WINDOW_OPEN_FAILED',
          message: 'detached window failed to load the application document; recalling',
          data: { windowId, projectId: input.projectId, detail },
        })
        if (!host.isDestroyed()) host.close()
      })
      return { windowId }
    },

    recall(windowId) {
      const entry = deps.registry.getDetached(windowId)
      if (entry === undefined) {
        throw new WindowManagementError('ERR_WINDOW_NOT_FOUND', `detached window ${windowId} does not exist`)
      }
      ;(entry.window as DetachedHostWindow).close()
    },

    recallAllForProject(projectId) {
      return closeAll(deps.registry.listDetachedByProject(projectId))
    },

    recallAll() {
      return closeAll(deps.registry.listDetached())
    },

    setProjectArchived(projectId, archived) {
      if (archived) archivedProjects.add(projectId)
      else archivedProjects.delete(projectId)
      // 在窗即时刷新(不待重启 —— 收回语义同款时态);已销毁窗由注册表过滤。
      for (const entry of deps.registry.listDetachedByProject(projectId)) {
        if (entry.window.isDestroyed()) continue
        ;(entry.window as DetachedHostWindow).setTitle(titleOf(projectId, entry.view))
      }
    },
  }
}

function closeAll(entries: readonly DetachedWindowEntry[]): number {
  let closed = 0
  for (const entry of entries) {
    if (entry.window.isDestroyed()) continue
    // 注册表条目的 window 面由 manager 写入(生产 = DetachedHostWindow;
    // close 是收回动作的最小需求面,此处向下转型收窄)。
    ;(entry.window as DetachedHostWindow).close() // 'closed' 编排负责移除 + 事件
    closed++
  }
  return closed
}
