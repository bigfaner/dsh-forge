// 「插件市场」目录纯模型（dsh-plugin-marketplace 1.3——定位：业务纯面，零副作用可测）。
// 浏览数据源 = 官方 `remote.pluginManager.listBundles()`（探针点①结论——client 反射官方
// Remote，零产品 rpc 通道）；分组与动作呈现以官方 dsh Plugins 页为对照基准（README 口径：
// **Official** 组在前——发行方随装陈列、未装入 profile 的包；**Installed** 组——profile
// 自持依赖的包）。BundleInfo 行形状（上游 dsh-plugin-manager types 窄镜像）：浏览只读
// name/version/description/enabled/installed/optional/removable 七键。
// fail-soft：行集非数组 / 行形状漂移 → 行被跳过或整面收敛不可用态（上游 types 同款纪律）。

/** 目录装载态：ready = 行集在手；unavailable = 反射面缺席/读取失败（fail-soft 降级面） */
export type MarketplaceCatalogStatus = 'ready' | 'unavailable'

/** 一行目录条目（BundleInfo 窄镜像——浏览呈现 name/description/version，动作读其余四键） */
export interface MarketplaceCatalogRow {
  /** 包名（= 安装 spec） */
  readonly name: string
  readonly version?: string
  /** 包清单描述（未本地化原文，官方同径） */
  readonly description?: string
  /** profile 层已选入（启停目标态） */
  readonly enabled: boolean
  /** profile 自持依赖；false = 发行方随装陈列（官方组——安装动作目标） */
  readonly installed: boolean
  /** 发行方为人工开启而随装的官方包（官方 Plugins 页 Official 组判定键） */
  readonly optional: boolean
  /** 宿主允许从 profile 移除 */
  readonly removable: boolean
}

/** 目录快照（装载壳 useSyncExternalStore 直读契约；error = 上一次动作失败的 fail-soft 留场行） */
export interface MarketplaceCatalogSnapshot {
  readonly status: MarketplaceCatalogStatus
  readonly rows?: readonly MarketplaceCatalogRow[]
  readonly error?: string
}

/** 未知值 → 数组窄化（缺席/非数组 = undefined） */
const asArray = (value: unknown): readonly unknown[] | undefined =>
  Array.isArray(value) ? value : undefined

/**
 * listBundles 行集 → 目录行集（纯函数）：逐行窄镜像七键；无名行/形状漂移行跳过
 * （fail-soft——非数组 = 空行集，整面不可用由 status 承担，不在行集内混入哨兵）。
 */
export function catalogRowsOf(bundles: unknown): readonly MarketplaceCatalogRow[] {
  const rows = asArray(bundles)
  if (rows === undefined) return []
  const out: MarketplaceCatalogRow[] = []
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const record = row as Record<string, unknown>
    if (typeof record['name'] !== 'string' || record['name'] === '') continue
    out.push({
      name: record['name'],
      version: typeof record['version'] === 'string' ? record['version'] : undefined,
      description: typeof record['description'] === 'string' ? record['description'] : undefined,
      enabled: record['enabled'] === true,
      installed: record['installed'] === true,
      optional: record['optional'] === true,
      removable: record['removable'] === true,
    })
  }
  return out
}

/**
 * 目录分组（官方 Plugins 页对照基准——Official 组在前）：官方组 = 未装入 profile 的陈列行
 * （installed=false，安装动作目标）；已安装组 = profile 自持行（启停/移除动作目标）。
 * 顺序保证：[官方组, 已安装组]，组内保持宿主回包顺序。
 */
export function catalogGroupsOf(rows: readonly MarketplaceCatalogRow[]): {
  readonly official: readonly MarketplaceCatalogRow[]
  readonly installed: readonly MarketplaceCatalogRow[]
} {
  const official: MarketplaceCatalogRow[] = []
  const installed: MarketplaceCatalogRow[] = []
  for (const row of rows) (row.installed ? installed : official).push(row)
  return { official, installed }
}
