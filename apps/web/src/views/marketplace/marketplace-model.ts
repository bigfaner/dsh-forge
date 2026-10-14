// 「插件市场」两段式启用纯模型（dsh-plugin-marketplace 1.2——定位：业务纯面，零副作用可测）。
// 态机：缺席（官方市场插件未安装——设置对话框无「插件市场」分区）→ 安装中（设置内安装
// 入口点击，官方链 install_bundle 在途）→ 启用（安装完成 + 官方 reconcile + reload 后，
// 官方市场插件 client 半经 settings.section slot 自注册分区出现——UF-2 同机械，产品零
// 自绘分区，探针点②结论驱动：官方 client UI 件直用成立）。
// 数据源 = 官方 `remote.pluginManager`（api-remotes Remote BFF——探针点①结论：client 反射
// 官方 Remote，零产品 rpc 通道）。BundleInfo 行形状（上游 dsh-plugin-manager types 窄镜像）：
// { name, enabled, installed, ... }——安装启用判定只读 name/enabled 两键。

/** 官方「插件市场」插件 npm spec（= 安装 spec = listBundles 行 name 包名；单一常量单源） */
export const MARKETPLACE_PLUGIN_SPEC = '@deepseek-ai/dsh-plugin-marketplace'

/** 两段式启用相位（AC5 态机：缺席 → 安装中 → 启用） */
export type MarketplacePhase = 'absent' | 'installing' | 'enabled'

/** 快照（装载壳 useSyncExternalStore 直读契约；error = 上一次安装失败的 fail-soft 留场行） */
export interface MarketplaceSnapshot {
  readonly phase: MarketplacePhase
  readonly error?: string
}

/** 未知值 → 数组窄化（缺席/非数组 = undefined） */
const asArray = (value: unknown): readonly unknown[] | undefined =>
  Array.isArray(value) ? value : undefined

/**
 * listBundles 行集 → 相位（纯函数）：目标包名行在场且 enabled = 'enabled'（安装默认启用
 * ——官方口径 "Installation enables a new bundle by default"）；行缺席/未启用 = 'absent'
 * （未安装与装而未启用同归缺席——分区均不出现）。行形状漂移/异常 = 'absent' fail-soft。
 */
export function marketplacePhaseOf(bundles: unknown, spec: string = MARKETPLACE_PLUGIN_SPEC): MarketplacePhase {
  const rows = asArray(bundles)
  if (rows === undefined) return 'absent'
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const record = row as Record<string, unknown>
    if (record['name'] !== spec) continue
    return record['enabled'] === true ? 'enabled' : 'absent'
  }
  return 'absent'
}

/**
 * 「插件市场」设置分区可见性（AC1/AC3 判定面）：仅启用相位可见。分区本体 = 官方市场
 * 插件 client 半经 settings.section slot 自注册（UF-2 同机械）——产品零注册零自绘；
 * 缺席/安装中相位官方件不在场 = 分区不出现（负样例断言锚）。
 */
export function marketSectionVisible(phase: MarketplacePhase): boolean {
  return phase === 'enabled'
}
