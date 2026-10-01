// 1.3 AC3 —— 通道名常量 pin（Interface 4：Web RPC 面，两域全通道）。
// 权威来源：tech-design §Interface 4（`forge:projects/*` ｜ `forge:knowledge/*`）。
import { describe, expect, it } from 'vitest'
import { FORGE_CHANNEL_ALLOWLIST, KNOWLEDGE_CHANNELS, PROJECTS_CHANNELS } from './channels.js'

describe('AC3 通道名常量覆盖 Interface 4 两域全部通道', () => {
  it('forge:projects/* 五通道（register/list/get/update/reconcile）', () => {
    expect(PROJECTS_CHANNELS).toEqual({
      register: 'forge:projects/register',
      list: 'forge:projects/list',
      get: 'forge:projects/get',
      update: 'forge:projects/update',
      reconcile: 'forge:projects/reconcile',
    })
  })

  it('forge:knowledge/* 五通道（browse/listEntries/entryDetail/heat/sessionRecall）', () => {
    expect(KNOWLEDGE_CHANNELS).toEqual({
      browse: 'forge:knowledge/browse',
      listEntries: 'forge:knowledge/listEntries',
      entryDetail: 'forge:knowledge/entryDetail',
      heat: 'forge:knowledge/heat',
      sessionRecall: 'forge:knowledge/sessionRecall',
    })
  })

  it('allowlist = 两域十通道全列、无重复（main 侧 allowlist 校验唯一源）', () => {
    expect(FORGE_CHANNEL_ALLOWLIST).toHaveLength(10)
    expect(new Set(FORGE_CHANNEL_ALLOWLIST).size).toBe(10)
    expect([...FORGE_CHANNEL_ALLOWLIST].sort()).toEqual(
      [...Object.values(PROJECTS_CHANNELS), ...Object.values(KNOWLEDGE_CHANNELS)].sort(),
    )
  })

  it('通道名一律 forge: 命名空间前缀（与 dsh 自有面隔离）', () => {
    for (const channel of FORGE_CHANNEL_ALLOWLIST) {
      expect(channel.startsWith('forge:')).toBe(true)
    }
  })

  it('search/readAbstract 不在 web RPC 通道面（agent 面唯一门 = 插件 tool，双门分工）', () => {
    const names = FORGE_CHANNEL_ALLOWLIST.join(' ')
    expect(names).not.toContain('search')
    expect(names).not.toContain('readAbstract')
  })
})
