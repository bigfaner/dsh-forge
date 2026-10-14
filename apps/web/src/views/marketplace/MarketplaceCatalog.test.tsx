// 「插件市场」目录面组件单测（dsh-plugin-marketplace 1.3——AC 浏览/安装动作/降级态）：
// 渲染面 = renderToStaticMarkup 纯 Body（设置分区静态可测口径同 ForgeSettingsSection.test）；
// 动作编排 = marketplace-catalog-controller（框架无关直测，见 controller 单测）。
// 含 Forge设置 分区接线负样例：catalog 动作面缺席 = 目录面不渲染（1.2 装配形制不变）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ForgeSettingsSectionBody } from '../settings/ForgeSettingsSection.js'
import {
  MARKETPLACE_CATALOG_UNAVAILABLE,
  MarketplaceCatalogBody,
  type MarketplaceCatalogBusy,
} from './MarketplaceCatalog.js'
import type { ForgeMarketplaceSource } from './MarketplaceEntry.js'
import type { MarketplaceCatalogRow, MarketplaceCatalogSnapshot } from './marketplace-catalog-model.js'

const NOOP = (): void => {}

const OFFICIAL_ROW: MarketplaceCatalogRow = {
  name: '@deepseek-ai/dsh-official-extra',
  version: '0.1.0',
  description: '官方随装陈列',
  enabled: false,
  installed: false,
  optional: true,
  removable: false,
}
const INSTALLED_ROW: MarketplaceCatalogRow = {
  name: '@deepseek-ai/dsh-marketplace',
  version: '0.2.0',
  description: '官方插件市场',
  enabled: true,
  installed: true,
  optional: false,
  removable: true,
}

function body(snapshot: MarketplaceCatalogSnapshot, busy: MarketplaceCatalogBusy = []): string {
  return renderToStaticMarkup(
    MarketplaceCatalogBody({ snapshot, busy, onInstall: NOOP, onToggle: NOOP, onRemove: NOOP, onRetry: NOOP }),
  )
}

function forgeBody(marketplace: ForgeMarketplaceSource | undefined): string {
  return renderToStaticMarkup(
    ForgeSettingsSectionBody({
      load: 'ready',
      draft: { provider: 'dsh-openai', model: 'glm-5.3', reasoning: 'default' },
      saved: undefined,
      saving: false,
      savedFlash: false,
      error: undefined,
      onEditProvider: NOOP,
      onEditModel: NOOP,
      onEditReasoning: NOOP,
      onSave: NOOP,
      onRetryLoad: NOOP,
      marketplace,
    }),
  )
}

/** 1.2 形制源（catalog 动作面缺席） */
function sourceWithoutCatalog(phase: 'absent' | 'installing' | 'enabled'): ForgeMarketplaceSource {
  return {
    source: { getSnapshot: () => ({ phase }), subscribe: () => () => {} },
    refresh: async () => undefined,
    install: async () => phase === 'enabled',
  }
}

/** 1.3 源（catalog 动作面在场） */
function sourceWithCatalog(): ForgeMarketplaceSource {
  return {
    ...sourceWithoutCatalog('enabled'),
    catalog: {
      list: async () => [],
      install: async () => true,
      setEnabled: async () => true,
      remove: async () => true,
    },
  }
}

describe('AC 浏览：官方清单目录陈列（官方 Plugins 页对照基准）', () => {
  it('ready：官方组在前 + 已安装组；行陈列名称/描述/版本', () => {
    const html = body({ status: 'ready', rows: [OFFICIAL_ROW, INSTALLED_ROW] })
    expect(html).toContain('data-dswf-fs-mkt-cat="ready"')
    expect(html.indexOf('data-dswf-fs-mkt-group="official"')).toBeLessThan(
      html.indexOf('data-dswf-fs-mkt-group="installed"'),
    )
    expect(html).toContain('data-dswf-fs-mkt-row="@deepseek-ai/dsh-official-extra"')
    expect(html).toContain('官方随装陈列')
    expect(html).toContain('0.1.0')
    expect(html).toContain('data-dswf-fs-mkt-row="@deepseek-ai/dsh-marketplace"')
  })

  it('动作呈现：未安装行 = 安装钮；已安装行 = 启停钮 + 可移除行的移除钮', () => {
    const html = body({ status: 'ready', rows: [OFFICIAL_ROW, INSTALLED_ROW] })
    expect(html).toContain('data-dswf-fs-mkt-install-row="@deepseek-ai/dsh-official-extra"')
    expect(html).toContain('data-dswf-fs-mkt-toggle="@deepseek-ai/dsh-marketplace"')
    expect(html).toContain('data-dswf-fs-mkt-toggle-to="disable"')
    expect(html).toContain('data-dswf-fs-mkt-remove="@deepseek-ai/dsh-marketplace"')
    expect(html).not.toContain('data-dswf-fs-mkt-remove="@deepseek-ai/dsh-official-extra"')
  })

  it('空清单 = 空态行（fail-soft，不炸分区）', () => {
    const html = body({ status: 'ready', rows: [] })
    expect(html).toContain('data-dswf-fs-mkt-cat-empty')
    expect(html).toContain('清单为空')
  })

  it('在途行动作冻结（busy 键 → disabled + 安装中…）', () => {
    const html = body({ status: 'ready', rows: [OFFICIAL_ROW] }, [OFFICIAL_ROW.name])
    expect(html).toContain('disabled')
    expect(html).toContain('安装中…')
  })
})

describe('AC 降级态：清单不可达 fail-soft', () => {
  it('unavailable：不可用降级行 + 重试钮（无任何目录行/动作钮在场）', () => {
    const html = body({ status: 'unavailable' })
    expect(html).toContain('data-dswf-fs-mkt-cat="unavailable"')
    expect(html).toContain(MARKETPLACE_CATALOG_UNAVAILABLE)
    expect(html).toContain('data-dswf-fs-mkt-cat-retry')
    expect(html).not.toContain('data-dswf-fs-mkt-install-row')
    expect(html).not.toContain('data-dswf-fs-mkt-toggle')
  })

  it('设置分区接线：catalog 动作面缺席 = 目录面不渲染（1.2 装配形制不变，其余分区不受影响）', () => {
    const html = forgeBody(sourceWithoutCatalog('absent'))
    expect(html).toContain('data-dswf-fs-part="marketplace"')
    expect(html).not.toContain('data-dswf-fs-mkt-cat')
  })

  it('设置分区接线：catalog 动作面在场 = 目录面挂载（初始 unavailable——装载前相位）', () => {
    const html = forgeBody(sourceWithCatalog())
    expect(html).toContain('data-dswf-fs-mkt-cat="unavailable"')
    expect(html).toContain(MARKETPLACE_CATALOG_UNAVAILABLE)
  })
})
