// 「插件市场」安装入口（dsh-plugin-marketplace 1.2——定位：业务装配，落位 Forge设置 分区
// 内小节）。两段式启用：缺席相位 = 安装钮（点击经官方链 install_bundle——宿主侧自动
// reconcile + reload 生命周期，fix-20 双形态实证）；安装中 = 冻结反馈；启用相位 = 已启用
// ✓（官方市场插件 client 半自注册「插件市场」settings.section 分区——产品零自绘分区，
// 探针点②结论：官方 client UI 件直用成立，无兜底复刻件）。数据源 = 插件 inject face
// （remote.pluginManager 反射——结构与 views/remote 同型）。组装分工沿设置分区形制：
// Body = 纯渲染体（renderToStaticMarkup 全相位可测）；MarketplaceEntry = 装载壳
// （useSyncExternalStore 直读快照——状态单源零本地副本）。
import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  MARKETPLACE_PLUGIN_SPEC,
  marketSectionVisible,
  type MarketplacePhase,
  type MarketplaceSnapshot,
} from './marketplace-model.js'

/**
 * 目录动作面（dsh-plugin-marketplace 1.3——全走官方 dsh-plugin-manager 链，零产品 rpc）：
 * list = listBundles 原始行集（浏览）；install = installBundle(spec)（官方链安装 + 宿主
 * reconcile + reload）；setEnabled/remove = setBundleEnabled/removeBundle（启停/移除）。
 * 可选注入：缺席 = 目录面不渲染（1.2 装配负样例不变）。
 */
export interface ForgeMarketplaceCatalogActions {
  /** 官方清单原始行集（listBundles——窄镜像与分组在 views 纯模型） */
  list(): Promise<unknown>
  /** 安装清单内插件（官方链；true = 调用收敛未抛） */
  install(spec: string): Promise<boolean>
  /** 启停已安装插件（profile 层持久——宿主 reconcile + reload） */
  setEnabled(name: string, enabled: boolean): Promise<boolean>
  /** 移除已安装插件（removable 行限定） */
  remove(name: string): Promise<boolean>
}

/**
 * 插件 inject face（client-plugin/plugin.ts buildMarketplaceSource 递达；逐位缺席 fail-soft
 * ——source 缺席 = 入口不渲染，宿主未装配官方 pluginManager 反射面 = 灰态缺席）。
 */
export interface ForgeMarketplaceSource {
  /** 快照源（useSyncExternalStore 直连契约） */
  readonly source: {
    getSnapshot(): MarketplaceSnapshot
    subscribe(listener: () => void): () => void
  }
  /** 重新读官方反射面（mount 装载 + 安装后回读——成功/失败均收敛合法快照并通知） */
  refresh(): Promise<void>
  /** 安装官方「插件市场」插件（官方链 install_bundle + 宿主 reconcile + reload；true = 已入启用态） */
  install(): Promise<boolean>
  /** 目录动作面（1.3——缺席 = 目录面不渲染，仅存安装入口） */
  readonly catalog?: ForgeMarketplaceCatalogActions
}

/** 安装钮标签三态（相位 → 文案） */
export function marketplaceActionLabel(phase: MarketplacePhase): string {
  if (phase === 'installing') return '安装中…'
  if (phase === 'enabled') return '已启用 ✓'
  return '安装'
}

/** 目录面入参契约（catalog 动作面非空收窄——dsh-plugin-marketplace 1.3） */
export type ForgeMarketplaceSourceWithCatalog = ForgeMarketplaceSource & {
  readonly catalog: ForgeMarketplaceCatalogActions
}

/**
 * catalog 动作面收窄守卫（渲染装配用）：动作面在场 = 返回收窄入参（目录面可挂）；
 * 缺席 = undefined（目录面不渲染——1.2 装配负样例不变）。TS 不因属性检查收窄父对象
 * 赋值类型，收窄经此单点显式完成。
 */
export function withCatalog(
  source: ForgeMarketplaceSource | undefined,
): ForgeMarketplaceSourceWithCatalog | undefined {
  return source?.catalog !== undefined ? (source as ForgeMarketplaceSourceWithCatalog) : undefined
}

/** 启用相位注记行（分区出现指引） */
export const MARKETPLACE_ENABLED_NOTE = '已启用 ✓——「插件市场」分区已出现在设置导航'

/** 缺席相位说明行 */
export const MARKETPLACE_ABSENT_HINT = `安装官方「插件市场」插件（${MARKETPLACE_PLUGIN_SPEC}）后，设置中将出现「插件市场」分区`

export interface MarketplaceEntryBodyProps {
  readonly phase: MarketplacePhase
  readonly error?: string
  readonly onInstall?: () => void
}

/**
 * 安装入口纯渲染体（全相位 renderToStaticMarkup 可测）：缺席 = 说明行 + 安装钮；
 * 安装中 = 钮冻结；启用 = 已启用注记（安装钮退役）；安装失败 = 错误行留场可重试。
 */
export function MarketplaceEntryBody({ phase, error, onInstall }: MarketplaceEntryBodyProps): ReactNode {
  return (
    <div className="dswf-fs-mkt" data-dswf-fs-mkt="">
      {phase === 'absent' ? <p className="dswf-fs-hint">{MARKETPLACE_ABSENT_HINT}</p> : null}
      <div className="dswf-fs-actions">
        <Button
          variant="primary"
          size="sm"
          className="dswf-fs-mkt-install"
          data-dswf-fs-mkt-install=""
          data-dswf-fs-mkt-phase={phase}
          disabled={phase === 'installing' || marketSectionVisible(phase)}
          onClick={onInstall}
        >
          {marketplaceActionLabel(phase)}
        </Button>
      </div>
      {phase === 'enabled' ? (
        <p className="dswf-fs-saved-note" data-dswf-fs-mkt-enabled="">
          {MARKETPLACE_ENABLED_NOTE}
        </p>
      ) : null}
      {error !== undefined && error !== '' ? (
        <p className="dswf-fs-err" role="alert" data-dswf-fs-mkt-error="">
          安装失败：{error}——可重试
        </p>
      ) : null}
    </div>
  )
}

/** 安装入口装载壳：mount 回读官方反射面 → useSyncExternalStore 直读快照 → 纯渲染体 */
export function MarketplaceEntry({ source }: { readonly source: ForgeMarketplaceSource }): ReactNode {
  const subscribe = useCallback((onChange: () => void) => source.source.subscribe(onChange), [source])
  const read = useCallback(() => source.source.getSnapshot(), [source])
  const snapshot = useSyncExternalStore(subscribe, read, read)
  useEffect(() => {
    void source.refresh()
  }, [source])
  return (
    <MarketplaceEntryBody
      phase={snapshot.phase}
      error={snapshot.error}
      onInstall={() => {
        void source.install()
      }}
    />
  )
}
