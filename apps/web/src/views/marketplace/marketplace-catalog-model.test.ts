// 「插件市场」目录纯模型单测（dsh-plugin-marketplace 1.3）——行窄镜像（七键 + 形状漂移
// 跳行 fail-soft）+ 官方/已安装分组（官方 Plugins 页对照基准：官方组在前）。
import { describe, expect, it } from 'vitest'
import { catalogGroupsOf, catalogRowsOf } from './marketplace-catalog-model.js'

describe('catalogRowsOf：listBundles 行集窄镜像', () => {
  it('合法行逐键窄化（浏览呈现 name/version/description + 动作四键）', () => {
    expect(
      catalogRowsOf([
        {
          name: '@deepseek-ai/dsh-plugin-marketplace',
          version: '0.1.0',
          description: '官方插件市场',
          enabled: true,
          installed: true,
          optional: false,
          removable: true,
          rows: [],
          overrides: [],
        },
      ]),
    ).toEqual([
      {
        name: '@deepseek-ai/dsh-plugin-marketplace',
        version: '0.1.0',
        description: '官方插件市场',
        enabled: true,
        installed: true,
        optional: false,
        removable: true,
      },
    ])
  })

  it('缺省键收敛 false/undefined（BundleInfo 可选键缺席合法）', () => {
    expect(catalogRowsOf([{ name: '@deepseek-ai/dsh-lean' }])).toEqual([
      {
        name: '@deepseek-ai/dsh-lean',
        version: undefined,
        description: undefined,
        enabled: false,
        installed: false,
        optional: false,
        removable: false,
      },
    ])
  })

  it('无名行/形状漂移行跳过；非数组 = 空行集（fail-soft 不抛）', () => {
    expect(catalogRowsOf([{ enabled: true }, null, 42, { name: '' }, { name: 'ok', installed: true }])).toEqual([
      {
        name: 'ok',
        version: undefined,
        description: undefined,
        enabled: false,
        installed: true,
        optional: false,
        removable: false,
      },
    ])
    expect(catalogRowsOf(undefined)).toEqual([])
    expect(catalogRowsOf('not-an-array')).toEqual([])
  })
})

describe('catalogGroupsOf：官方组在前（官方 Plugins 页对照基准）', () => {
  const officialRow = { name: 'official-x', installed: false, enabled: false, optional: true, removable: false }
  const installedRow = { name: 'installed-y', installed: true, enabled: true, optional: false, removable: true }

  it('installed=false 入官方组、installed=true 入已安装组，顺序保官方组在前', () => {
    const groups = catalogGroupsOf([installedRow, officialRow])
    expect(groups.official).toEqual([officialRow])
    expect(groups.installed).toEqual([installedRow])
  })

  it('空行集 = 双空组', () => {
    expect(catalogGroupsOf([])).toEqual({ official: [], installed: [] })
  })
})
