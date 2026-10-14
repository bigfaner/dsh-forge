// 「插件市场」目录动作编排单测（dsh-plugin-marketplace 1.3——AC 安装动作/降级态）：
// 安装 = 官方链 install 调用 + 在途冻结 + 动作后回读清单；启停/移除同链；清单不可达 =
// unavailable 降级 fail-soft；动作失败 = 错误行留场。控制器框架无关——直调直断。
import { describe, expect, it } from 'vitest'
import { createMarketplaceCatalogController } from './marketplace-catalog-controller.js'
import type { ForgeMarketplaceCatalogActions } from './MarketplaceEntry.js'
import type { MarketplaceCatalogRow } from './marketplace-catalog-model.js'

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

/** 动作面桩：list 可编程回包/抛错；各动作记录调用 */
function actionsWith(overrides: Partial<ForgeMarketplaceCatalogActions> = {}): ForgeMarketplaceCatalogActions & {
  readonly calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    list: async () => [OFFICIAL_ROW, INSTALLED_ROW],
    install: async (spec) => {
      calls.push(`install:${spec}`)
      return true
    },
    setEnabled: async (name, enabled) => {
      calls.push(`setEnabled:${name}:${String(enabled)}`)
      return true
    },
    remove: async (name) => {
      calls.push(`remove:${name}`)
      return true
    },
    ...overrides,
  }
}

describe('浏览装载（官方清单链）', () => {
  it('load：listBundles 行集 → ready + 窄镜像行集（官方/已安装分组在纯模型）', async () => {
    const controller = createMarketplaceCatalogController({ catalog: actionsWith() })
    await controller.load()
    expect(controller.getSnapshot().status).toBe('ready')
    expect(controller.getSnapshot().rows).toHaveLength(2)
    expect(controller.getSnapshot().rows?.[0]?.name).toBe(OFFICIAL_ROW.name)
    expect(controller.getSnapshot().rows?.[1]?.installed).toBe(true)
  })

  it('load 失败/反射面缺席 → unavailable 降级（fail-soft，错误留场）', async () => {
    const boom = actionsWith({ list: async () => { throw new Error('registry 不可达') } })
    const controller = createMarketplaceCatalogController({ catalog: boom })
    await controller.load()
    expect(controller.getSnapshot().status).toBe('unavailable')
    expect(controller.getSnapshot().error).toBe('registry 不可达')
  })
})

describe('安装动作（官方链 installBundle——AC 安装动作）', () => {
  it('install：调用官方 install(spec) → busy 冻结 → 回读清单收敛新行集', async () => {
    const catalog = actionsWith({
      install: async (spec) => {
        catalog.calls.push(`install:${spec}`)
        return true
      },
    })
    const controller = createMarketplaceCatalogController({ catalog })
    await controller.load()
    controller.install(OFFICIAL_ROW.name)
    expect(controller.getBusy()).toEqual([OFFICIAL_ROW.name])
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(catalog.calls).toContain(`install:${OFFICIAL_ROW.name}`)
    expect(controller.getBusy()).toEqual([])
    expect(controller.getSnapshot().status).toBe('ready')
  })

  it('在途重入忽略（同键动作冻结）', async () => {
    let releaseInstall: (() => void) | undefined
    const catalog = actionsWith({
      install: (spec) =>
        new Promise<boolean>((resolve) => {
          catalog.calls.push(`install:${spec}`)
          releaseInstall = () => {
            resolve(true)
          }
        }),
    })
    const controller = createMarketplaceCatalogController({ catalog })
    controller.install(OFFICIAL_ROW.name)
    controller.install(OFFICIAL_ROW.name)
    expect(catalog.calls.filter((entry) => entry === `install:${OFFICIAL_ROW.name}`)).toHaveLength(1)
    releaseInstall?.()
  })

  it('install 失败 → 错误行留场，快照仍合法（fail-soft）', async () => {
    const catalog = actionsWith({ install: async () => { throw new Error('pnpm-missing') } })
    const controller = createMarketplaceCatalogController({ catalog })
    await controller.load()
    controller.install(OFFICIAL_ROW.name)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(controller.getSnapshot().status).toBe('ready')
    expect(controller.getSnapshot().error).toBe('pnpm-missing')
  })
})

describe('启停/移除动作（官方链 setBundleEnabled/removeBundle）', () => {
  it('toggle：安装行 → setEnabled(name, !enabled)', async () => {
    const catalog = actionsWith()
    const controller = createMarketplaceCatalogController({ catalog })
    await controller.load()
    controller.toggle(INSTALLED_ROW)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(catalog.calls).toContain(`setEnabled:${INSTALLED_ROW.name}:false`)
  })

  it('remove：可移除行 → removeBundle(name)', async () => {
    const catalog = actionsWith()
    const controller = createMarketplaceCatalogController({ catalog })
    await controller.load()
    controller.remove(INSTALLED_ROW)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(catalog.calls).toContain(`remove:${INSTALLED_ROW.name}`)
  })

  it('订阅：每次收敛通知监听者，退订后不再通知', async () => {
    const controller = createMarketplaceCatalogController({ catalog: actionsWith() })
    let seen = 0
    const unsubscribe = controller.subscribe(() => {
      seen += 1
    })
    await controller.load()
    expect(seen).toBeGreaterThan(0)
    const afterLoad = seen
    unsubscribe()
    await controller.load()
    expect(seen).toBe(afterLoad)
  })
})
