// dock 页签跟随（定位：基础）——UF-7 机制纯逻辑：页签登记表（全局 + 按项目）与可见集推导。
// 可见集口径（UF-7 Validation）：可见 = 当前项目页签 + 全局页签（全局常驻，注册序保持）；
// 页签集是推导值（登记表 × 当前项目锚）——切项目即换集（不打断面板）、切回即恢复，无需快照。
// zones 容器消费本面渲染页签条；域页签（知识文档/文档 tab 等）经装配登记（本模块零域语义）。

/** 页签归属：全局（常驻可见）或项目（跟随项目锚） */
export type DockTabScope =
  | { readonly type: 'global' }
  | { readonly type: 'project'; readonly projectId: string }

/** dock 页签登记记录 */
export interface DockTabRecord {
  /** 页签稳定 id（登记表内唯一；域前缀命名如 'kndoc:12'，兼作 DOM id 片段） */
  readonly id: string
  /** 展示名（M0 纯文本；富标签随域消费面扩展） */
  readonly label: string
  /** 归属 */
  readonly scope: DockTabScope
}

/** 页签登记表（注册序保持；UI 侧只读消费） */
export type DockTabSet = readonly DockTabRecord[]

/** 全局页签工厂 */
export function globalDockTab(id: string, label: string): DockTabRecord {
  return { id, label, scope: { type: 'global' } }
}

/** 项目页签工厂 */
export function projectDockTab(projectId: string, id: string, label: string): DockTabRecord {
  return { id, label, scope: { type: 'project', projectId } }
}

/** 登记页签（追加保注册序；id 重复即拒——fail-loud 同 steerBootGraph 惯例）。 */
export function registerDockTab(set: DockTabSet, tab: DockTabRecord): DockTabSet {
  if (set.some((t) => t.id === tab.id)) {
    throw new Error(`dsh-forge web: dock 页签 id 重复登记：${tab.id}`)
  }
  return [...set, tab]
}

/** 撤销页签（幂等过滤；缺席 = 无操作）。 */
export function unregisterDockTab(set: DockTabSet, tabId: string): DockTabSet {
  return set.filter((t) => t.id !== tabId)
}

/**
 * 可见集推导（UF-7 口径）：全局页签 + 当前项目页签（注册序，与归属交错无关）；
 * projectId 为 null（无项目锚）时仅全局页签。推导即跟随——切项目换集、切回恢复。
 */
export function visibleDockTabs(set: DockTabSet, projectId: string | null): DockTabRecord[] {
  return set.filter((t) => t.scope.type === 'global' || t.scope.projectId === projectId)
}

/**
 * 激活页签推导：上次显式选择仍在可见集则保持（跨项目往返后恢复原选择），
 * 否则回落首个可见页签；空集 = null（内容区空态占位）。
 */
export function resolveActiveDockTab(
  visible: readonly DockTabRecord[],
  selectedId: string | null,
): DockTabRecord | null {
  if (selectedId !== null) {
    const selected = visible.find((t) => t.id === selectedId)
    if (selected !== undefined) return selected
  }
  return visible[0] ?? null
}
