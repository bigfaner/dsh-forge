// windows/role — windowGetRole 的主进程供给面(任务 4.2;tech-design
// §Interfaces·Interface 5「windowGetRole:新窗 boot 经 preload 查询,typed
// 握手,不走 URL hash」+ T5 裁决 + §Security·T3「role 经主进程供给
// (不信任 URL)」)。
//
// 解析口径:新窗与主窗加载同一份同源 SPA 文档(dsh-app://app/),自身无法
// 从加载面区分身份 —— 角色唯一权威 = 壳层窗口注册表按 webContents 身份
// (进程内唯一 id)匹配。本模块零 URL 读取(Hard Rule:禁 URL hash 传角色,
// M1 spike-3 纪律);未知 sender(主窗外的早期 invoke/已销毁窗口)→ null,
// 由渲染层按主窗语义兜底。

import type { DetachedView, SessionTarget } from '../workbench/ui-state/layout-schema.ts'
import type { RegistryWebContents, WindowRegistry } from './registry.ts'

/** Interface 5 WindowRole(typed 握手载荷;preload verb 面同型)。 */
export type WindowRole =
  | { readonly kind: 'main' }
  | {
    readonly kind: 'detached'
    readonly windowId: string
    readonly projectId: string
    readonly view: DetachedView
    readonly target?: SessionTarget
  }

/**
 * 按注册表解析 webContents 的窗口角色。sender 缺席/不属任何壳窗口 → null
 * (不抛错:boot 早期或窗口消亡的竞态是合法时序,渲染层自判主窗语义)。
 */
export function resolveWindowRole(
  registry: WindowRegistry,
  sender: RegistryWebContents | undefined,
): WindowRole | null {
  if (sender === undefined) return null
  const main = registry.getMainWindow()
  if (main !== undefined && main.webContents.id === sender.id) return { kind: 'main' }
  for (const entry of registry.listDetached()) {
    if (entry.window.webContents.id !== sender.id) continue
    return {
      kind: 'detached',
      windowId: entry.windowId,
      projectId: entry.projectId,
      view: entry.view,
      ...(entry.target === undefined ? {} : { target: entry.target }),
    }
  }
  return null
}
