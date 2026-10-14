// 「插件市场」目录动作编排控制器（dsh-plugin-marketplace 1.3——定位：框架无关纯编排，
// 零 DOM 可直测；MarketplaceCatalog 装载壳 = useSyncExternalStore 薄绑定）。
// 动作（安装/启停/移除）= 官方链调用（catalog 动作面）→ 回读清单收敛新行集；在途行动作
// 冻结（busy 单键一行，同键重入忽略）。清单不可达/动作失败均 fail-soft 收敛合法快照。
import {
  catalogRowsOf,
  type MarketplaceCatalogRow,
  type MarketplaceCatalogSnapshot,
} from './marketplace-catalog-model.js'
import type { ForgeMarketplaceCatalogActions } from './MarketplaceEntry.js'

/** 动作在途集合 → 行键（安装/启停/移除共用——在途行动作冻结） */
export type MarketplaceCatalogBusy = readonly string[]

/** 控制器契约（装载壳 useSyncExternalStore 直读——快照引用稳定至下次 publish） */
export interface MarketplaceCatalogController {
  /** 当前快照（稳定引用直到下次收敛） */
  getSnapshot(): MarketplaceCatalogSnapshot
  /** 当前在途行动作键集 */
  getBusy(): MarketplaceCatalogBusy
  subscribe(listener: () => void): () => void
  /** 读官方清单（mount 装载 + 动作后回读——失败收敛 unavailable fail-soft） */
  load(): Promise<void>
  /** 安装清单内插件（官方链 installBundle——宿主 reconcile + reload） */
  install(spec: string): void
  /** 启停已安装插件（profile 层持久） */
  toggle(row: MarketplaceCatalogRow): void
  /** 移除已安装插件（removable 行限定） */
  remove(row: MarketplaceCatalogRow): void
}

/** 目录动作面入参（catalog 非空契约收窄） */
export type MarketplaceCatalogActionsSource = {
  readonly catalog: ForgeMarketplaceCatalogActions
}

export function createMarketplaceCatalogController(source: MarketplaceCatalogActionsSource): MarketplaceCatalogController {
  const listeners = new Set<() => void>()
  let snapshot: MarketplaceCatalogSnapshot = { status: 'unavailable' }
  let busy: MarketplaceCatalogBusy = []
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  const setSnapshot = (next: MarketplaceCatalogSnapshot): void => {
    snapshot = next
    notify()
  }
  const load = (): Promise<void> =>
    Promise.resolve()
      .then(() => source.catalog.list())
      .then(
        (bundles) => {
          setSnapshot({ status: 'ready', rows: catalogRowsOf(bundles) })
        },
        (cause: unknown) => {
          const message = cause instanceof Error ? cause.message : String(cause)
          setSnapshot({ status: 'unavailable', error: message })
        },
      )
  const runAction = (key: string, action: () => Promise<boolean>): void => {
    if (busy.includes(key)) return
    busy = [...busy, key]
    notify()
    // 动作同步起步（action() 立即求值——在途重入判读在同步段即可见）；
    // 失败消息暂存，动作后回读收敛行集后再回贴（load 成功收敛不带 error——
    // 否则失败错误行被清，fail-soft 留场不成立）。
    let actionError: string | undefined
    Promise.resolve(action()).then(
      () => undefined,
      (cause: unknown) => {
        actionError = cause instanceof Error ? cause.message : String(cause)
      },
    )
    Promise.resolve()
      .then(() => {
        busy = busy.filter((entry) => entry !== key)
        notify()
        return load()
      })
      .then(() => {
        if (actionError !== undefined) setSnapshot({ ...snapshot, error: actionError })
      })
  }
  return {
    getSnapshot: () => snapshot,
    getBusy: () => busy,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load,
    install: (spec) => {
      runAction(spec, () => source.catalog.install(spec))
    },
    toggle: (row) => {
      runAction(row.name, () => source.catalog.setEnabled(row.name, !row.enabled))
    },
    remove: (row) => {
      runAction(row.name, () => source.catalog.remove(row.name))
    },
  }
}
