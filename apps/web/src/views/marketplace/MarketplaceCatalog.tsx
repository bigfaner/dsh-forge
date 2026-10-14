// 「插件市场」目录面（dsh-plugin-marketplace 1.3——定位：业务装配，落位 Forge设置 插件市场
// 分区内小节，官方 Plugins 页对照基准）。交互全走官方 dsh-plugin-manager 链（探针点①结论
// ——client 反射官方 Remote，零产品 rpc 通道）：浏览 = listBundles 窄镜像分组陈列
// （名称/描述/版本）；安装 = installBundle（官方链安装 + 宿主 reconcile + reload——fix-20
// 双形态实证）；启停 = setBundleEnabled；移除 = removeBundle（removable 行限定）。
// fail-soft：清单不可达（反射面缺席/读取失败）= 不可用态降级行 + 重试，不炸设置分区
// 其余内容。组装分工沿设置分区形制：Body = 纯渲染体（renderToStaticMarkup 全态可测）；
// MarketplaceCatalog = 装载壳（useSyncExternalStore 直读快照——状态单源零本地副本）。
import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  catalogGroupsOf,
  type MarketplaceCatalogRow,
  type MarketplaceCatalogSnapshot,
} from './marketplace-catalog-model.js'
import { createMarketplaceCatalogController, type MarketplaceCatalogBusy } from './marketplace-catalog-controller.js'
import type { ForgeMarketplaceSource } from './MarketplaceEntry.js'

/** 不可用态降级行文案（清单不可达——离线/网络受限/宿主未装配管理面） */
export const MARKETPLACE_CATALOG_UNAVAILABLE = '官方清单不可达——插件市场暂不可用'

/** 动作在途集合 → 行键（安装/启停/移除共用——在途行动作冻结；控制器单源） */
export type { MarketplaceCatalogBusy } from './marketplace-catalog-controller.js'

export interface MarketplaceCatalogBodyProps {
  readonly snapshot: MarketplaceCatalogSnapshot
  readonly busy: MarketplaceCatalogBusy
  readonly onInstall?: (spec: string) => void
  readonly onToggle?: (row: MarketplaceCatalogRow) => void
  readonly onRemove?: (row: MarketplaceCatalogRow) => void
  readonly onRetry?: () => void
}

/** 单行动作钮组（installed=false = 安装；installed 行 = 启停 + 可移除行的移除） */
function CatalogRowActions({
  row,
  busy,
  onInstall,
  onToggle,
  onRemove,
}: {
  readonly row: MarketplaceCatalogRow
  readonly busy: MarketplaceCatalogBusy
  readonly onInstall?: (spec: string) => void
  readonly onToggle?: (row: MarketplaceCatalogRow) => void
  readonly onRemove?: (row: MarketplaceCatalogRow) => void
}): ReactNode {
  const frozen = busy.includes(row.name)
  if (!row.installed) {
    return (
      <Button
        variant="primary"
        size="sm"
        className="dswf-fs-mkt-cat-act"
        data-dswf-fs-mkt-install-row={row.name}
        disabled={frozen}
        onClick={() => {
          onInstall?.(row.name)
        }}
      >
        {frozen ? '安装中…' : '安装'}
      </Button>
    )
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="dswf-fs-mkt-cat-act"
        data-dswf-fs-mkt-toggle={row.name}
        data-dswf-fs-mkt-toggle-to={row.enabled ? 'disable' : 'enable'}
        disabled={frozen}
        onClick={() => {
          onToggle?.(row)
        }}
      >
        {row.enabled ? '停用' : '启用'}
      </Button>
      {row.removable ? (
        <Button
          variant="outline"
          size="sm"
          className="dswf-fs-mkt-cat-act"
          data-dswf-fs-mkt-remove={row.name}
          disabled={frozen}
          onClick={() => {
            onRemove?.(row)
          }}
        >
          移除
        </Button>
      ) : null}
    </>
  )
}

/** 单行卡片（名称/描述/版本陈列——官方 Plugins 页卡片信息面对照基准） */
function CatalogRowCard(props: {
  readonly row: MarketplaceCatalogRow
  readonly busy: MarketplaceCatalogBusy
  readonly onInstall?: (spec: string) => void
  readonly onToggle?: (row: MarketplaceCatalogRow) => void
  readonly onRemove?: (row: MarketplaceCatalogRow) => void
}): ReactNode {
  const { row, busy, onInstall, onToggle, onRemove } = props
  return (
    <div className="dswf-fs-mkt-cat-row" data-dswf-fs-mkt-row={row.name}>
      <div className="dswf-fs-mkt-cat-meta">
        <span className="dswf-fs-mkt-cat-name">
          {row.name}
          {row.version !== undefined ? <span className="dswf-fs-mkt-cat-ver"> {row.version}</span> : null}
        </span>
        {row.description !== undefined ? (
          <span className="dswf-fs-mkt-cat-desc">{row.description}</span>
        ) : null}
      </div>
      <div className="dswf-fs-mkt-cat-actions">
        <CatalogRowActions row={row} busy={busy} onInstall={onInstall} onToggle={onToggle} onRemove={onRemove} />
      </div>
    </div>
  )
}

/**
 * 目录纯渲染体（全态 renderToStaticMarkup 可测）：ready = 官方组在前 + 已安装组
 * （官方 Plugins 页对照基准）；unavailable = 不可用降级行 + 重试（设置分区其余内容不受影响
 * ——fail-soft）；动作失败 = 错误行留场可重试。
 */
export function MarketplaceCatalogBody({
  snapshot,
  busy,
  onInstall,
  onToggle,
  onRemove,
  onRetry,
}: MarketplaceCatalogBodyProps): ReactNode {
  if (snapshot.status === 'unavailable') {
    return (
      <div className="dswf-fs-mkt-cat" data-dswf-fs-mkt-cat="unavailable">
        <p className="dswf-fs-hint" data-dswf-fs-mkt-cat-unavailable="">
          {MARKETPLACE_CATALOG_UNAVAILABLE}
        </p>
        <div className="dswf-fs-actions">
          <Button
            variant="outline"
            size="sm"
            className="dswf-fs-mkt-cat-retry"
            data-dswf-fs-mkt-cat-retry=""
            onClick={onRetry}
          >
            重试
          </Button>
        </div>
        {snapshot.error !== undefined && snapshot.error !== '' ? (
          <p className="dswf-fs-err" role="alert" data-dswf-fs-mkt-cat-error="">
            {snapshot.error}
          </p>
        ) : null}
      </div>
    )
  }
  const groups = catalogGroupsOf(snapshot.rows ?? [])
  return (
    <div className="dswf-fs-mkt-cat" data-dswf-fs-mkt-cat="ready">
      {groups.official.length > 0 ? (
        <div className="dswf-fs-mkt-cat-group" data-dswf-fs-mkt-group="official">
          <p className="dswf-fs-mkt-cat-group-title">官方</p>
          {groups.official.map((row) => (
            <CatalogRowCard
              key={row.name}
              row={row}
              busy={busy}
              onInstall={onInstall}
              onToggle={onToggle}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : null}
      {groups.installed.length > 0 ? (
        <div className="dswf-fs-mkt-cat-group" data-dswf-fs-mkt-group="installed">
          <p className="dswf-fs-mkt-cat-group-title">已安装</p>
          {groups.installed.map((row) => (
            <CatalogRowCard
              key={row.name}
              row={row}
              busy={busy}
              onInstall={onInstall}
              onToggle={onToggle}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : null}
      {groups.official.length === 0 && groups.installed.length === 0 ? (
        <p className="dswf-fs-hint" data-dswf-fs-mkt-cat-empty="">
          清单为空
        </p>
      ) : null}
      {snapshot.error !== undefined && snapshot.error !== '' ? (
        <p className="dswf-fs-err" role="alert" data-dswf-fs-mkt-cat-error="">
          操作失败：{snapshot.error}——可重试
        </p>
      ) : null}
    </div>
  )
}

/** 目录动作面（ForgeMarketplaceSource.catalog 非空契约——装载壳入参收窄） */
type CatalogSource = ForgeMarketplaceSource & {
  readonly catalog: NonNullable<ForgeMarketplaceSource['catalog']>
}

/**
 * 目录装载壳：mount 读官方清单（listBundles 官方链）→ useSyncExternalStore 直读控制器
 * 快照 → 纯渲染体。动作编排（busy 冻结 / 失败留场 / 动作后回读）在
 * marketplace-catalog-controller（框架无关——单测直测），壳零本地副本。
 */
export function MarketplaceCatalog({ source }: { readonly source: CatalogSource }): ReactNode {
  const controller = useMemo(() => createMarketplaceCatalogController(source), [source])
  const subscribe = useCallback((onChange: () => void) => controller.subscribe(onChange), [controller])
  const read = useCallback(() => controller.getSnapshot(), [controller])
  const readBusy = useCallback(() => controller.getBusy(), [controller])
  const snapshot = useSyncExternalStore(subscribe, read, read)
  const busy = useSyncExternalStore(subscribe, readBusy, readBusy)
  useEffect(() => {
    void controller.load()
  }, [controller])

  return (
    <MarketplaceCatalogBody
      snapshot={snapshot}
      busy={busy}
      onInstall={(spec) => {
        controller.install(spec)
      }}
      onToggle={(row) => {
        controller.toggle(row)
      }}
      onRemove={(row) => {
        controller.remove(row)
      }}
      onRetry={() => {
        void controller.load()
      }}
    />
  )
}
