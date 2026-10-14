// 「插件市场」两段式启用单测（dsh-plugin-marketplace 1.2）——AC1 负样例（缺席相位：入口
// 不渲染启用注记、无「已启用」；未注入 marketplace 面 = Forge设置 分区无插件市场小节——
// 设置对话框零「插件市场」分区）+ AC5 态机（缺席 → 安装中 → 启用逐相位迁移）+ 纯模型
// （listBundles 行集相位判定 fail-soft + 分区可见性仅启用相位）。渲染面 = renderToStaticMarkup
// 纯 Body（设置分区静态可测口径同 ForgeSettingsSection.test）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ForgeSettingsSectionBody,
} from '../settings/ForgeSettingsSection.js'
import {
  MARKETPLACE_ENABLED_NOTE,
  MarketplaceEntryBody,
  marketplaceActionLabel,
  type ForgeMarketplaceSource,
} from './MarketplaceEntry.js'
import {
  MARKETPLACE_PLUGIN_SPEC,
  marketplacePhaseOf,
  marketSectionVisible,
} from './marketplace-model.js'

const NOOP = (): void => {}

function body(overrides: Partial<Parameters<typeof MarketplaceEntryBody>[0]> = {}): string {
  return renderToStaticMarkup(MarketplaceEntryBody({ phase: 'absent', ...overrides }))
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

/** 空源（源在场面——相位由快照直出） */
function sourceWith(phase: 'absent' | 'installing' | 'enabled'): ForgeMarketplaceSource {
  return {
    source: {
      getSnapshot: () => ({ phase }),
      subscribe: () => () => {},
    },
    refresh: async () => undefined,
    install: async () => phase === 'enabled',
  }
}

describe('两段式启用态机（AC5：缺席 → 安装中 → 启用）', () => {
  it('缺席相位：说明行 + 可点安装钮，无「已启用」注记（AC1 负样例——分区未启用面）', () => {
    const html = body({ phase: 'absent' })
    expect(html).toContain('data-dswf-fs-mkt-phase="absent"')
    expect(html).toContain('安装')
    expect(html).not.toContain(MARKETPLACE_ENABLED_NOTE)
    expect(html).not.toContain('disabled')
    expect(html).toContain(MARKETPLACE_PLUGIN_SPEC)
  })

  it('安装中相位：钮冻结（disabled + 安装中…）', () => {
    const html = body({ phase: 'installing' })
    expect(html).toContain('data-dswf-fs-mkt-phase="installing"')
    expect(html).toContain('disabled')
    expect(html).toContain('安装中…')
    expect(html).not.toContain(MARKETPLACE_ENABLED_NOTE)
  })

  it('启用相位：已启用注记 + 钮退役（disabled），无安装说明行', () => {
    const html = body({ phase: 'enabled' })
    expect(html).toContain('data-dswf-fs-mkt-phase="enabled"')
    expect(html).toContain(MARKETPLACE_ENABLED_NOTE)
    expect(html).toContain('disabled')
    expect(html).not.toContain(MARKETPLACE_PLUGIN_SPEC)
  })

  it('marketplaceActionLabel：三相位文案映射', () => {
    expect(marketplaceActionLabel('absent')).toBe('安装')
    expect(marketplaceActionLabel('installing')).toBe('安装中…')
    expect(marketplaceActionLabel('enabled')).toBe('已启用 ✓')
  })

  it('marketplacePhaseOf：listBundles 行集判定——行在场且 enabled = 启用；未启用/缺席/形状漂移 = 缺席', () => {
    expect(
      marketplacePhaseOf([{ name: MARKETPLACE_PLUGIN_SPEC, enabled: true, installed: true }]),
    ).toBe('enabled')
    expect(
      marketplacePhaseOf([{ name: MARKETPLACE_PLUGIN_SPEC, enabled: false, installed: true }]),
    ).toBe('absent')
    expect(marketplacePhaseOf([{ name: '@deepseek-ai/dsh-other', enabled: true }])).toBe('absent')
    expect(marketplacePhaseOf([])).toBe('absent')
    expect(marketplacePhaseOf(undefined)).toBe('absent')
    expect(marketplacePhaseOf('not-an-array')).toBe('absent')
    expect(marketplacePhaseOf([null, 42, { enabled: true }])).toBe('absent')
  })

  it('marketSectionVisible：仅启用相位可见（缺席/安装中 = 分区不出现——AC1/AC3 判定面）', () => {
    expect(marketSectionVisible('absent')).toBe(false)
    expect(marketSectionVisible('installing')).toBe(false)
    expect(marketSectionVisible('enabled')).toBe(true)
  })
})

describe('AC1 负样例：初始态设置对话框无「插件市场」分区', () => {
  it('未注入 marketplace 面（初始装配）= Forge设置 分区零插件市场小节', () => {
    const html = forgeBody(undefined)
    expect(html).not.toContain('插件市场')
    expect(html).not.toContain('data-dswf-fs-part="marketplace"')
  })

  it('注入 marketplace 面且缺席相位 = 安装入口在场、启用注记不在场（分区仍未出现）', () => {
    const html = forgeBody(sourceWith('absent'))
    expect(html).toContain('data-dswf-fs-part="marketplace"')
    expect(html).toContain('data-dswf-fs-mkt-phase="absent"')
    expect(html).not.toContain(MARKETPLACE_ENABLED_NOTE)
  })

  it('安装失败：错误行留场可重试（fail-soft，不炸分区）', () => {
    const html = body({ phase: 'absent', error: 'registry 不可达' })
    expect(html).toContain('data-dswf-fs-mkt-error')
    expect(html).toContain('安装失败：registry 不可达')
  })
})
