// G1 pin ㉒（M3 pin 池扩池 #22，任务 5.1）：RPC 新通道 allowlist 三处一体一致性。
// 权威：tech-design Appendix「契约面 pin 扩池」第 22 项（RPC 新通道 allowlist——
// settings / proposals.{transition,setMode,listDocs} / features.listDocs）+ §Interface 4
// （三处一体：contracts → web/rpc → host ipc）+ docs/conventions/rpc-and-contracts.md
// （新增通道 = 三处一体，禁单侧私改）。
// 审计面（机械断言）：
//   1. contracts：族常量值精确 + 平铺视图键（族前缀）+ allowlist 全收 + dto 负载映射键 ↔ 族常量键；
//   2. host ipc：三域注册文件逐通道 ipc.register(<族常量>.<键>) + m2-wiring 装配行；
//   3. web/rpc：client.ts 逐通道 invokeRpc(...<族常量>.<键>) 消费行。
// 任一侧私改（加通道/改值/漏注册/漏消费）即红——M2 G1-13 机制 pin（forge-channels.test.ts
// allowlist 校验机制）之上的新通道内容 pin。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  FEATURES_CHANNELS,
  FORGE_CHANNEL_ALLOWLIST,
  FORGE_CHANNELS,
  PROPOSALS_CHANNELS,
  SETTINGS_CHANNELS,
} from '../../packages/contracts/src/channels.js'
import type {
  FeaturesChannelRequests,
  ProposalsChannelRequests,
  SettingsChannelRequests,
} from '../../packages/contracts/src/dto/forge.js'
import { ROOT } from './pins.js'

const host = (rel: string): string => readFileSync(join(ROOT, 'apps/host/src/ipc', rel), 'utf8')
const webClient = readFileSync(join(ROOT, 'apps/web/src/rpc/client.ts'), 'utf8')

describe('pin ㉒-1 contracts 面（族常量 + 平铺视图 + allowlist + dto 键对账）', () => {
  it('forge:settings/* 族 = get/set 两通道（值精确）', () => {
    expect({ ...SETTINGS_CHANNELS }).toEqual({ get: 'forge:settings/get', set: 'forge:settings/set' })
  })

  it('forge:proposals/* 族 = list/transition/setMode/listDocs 四通道（M3 三新 + M2 list）', () => {
    expect({ ...PROPOSALS_CHANNELS }).toEqual({
      list: 'forge:proposals/list',
      transition: 'forge:proposals/transition',
      setMode: 'forge:proposals/setMode',
      listDocs: 'forge:proposals/listDocs',
    })
  })

  it('forge:features/* 族含 listDocs（fix-2 读面 + M3 UF-4 消费）', () => {
    expect(FEATURES_CHANNELS.listDocs).toBe('forge:features/listDocs')
  })

  it('平铺视图族前缀键收新六通道（跨族重名保全——M2 G1-13 键约定沿袭）', () => {
    expect(FORGE_CHANNELS.proposalsTransition).toBe(PROPOSALS_CHANNELS.transition)
    expect(FORGE_CHANNELS.proposalsSetMode).toBe(PROPOSALS_CHANNELS.setMode)
    expect(FORGE_CHANNELS.proposalsListDocs).toBe(PROPOSALS_CHANNELS.listDocs)
    expect(FORGE_CHANNELS.settingsGet).toBe(SETTINGS_CHANNELS.get)
    expect(FORGE_CHANNELS.settingsSet).toBe(SETTINGS_CHANNELS.set)
    expect(FORGE_CHANNELS.featuresListDocs).toBe(FEATURES_CHANNELS.listDocs)
  })

  it('invoke allowlist 全收新六通道（未知通道拒绝面——electron-ipc-security）', () => {
    const allow = new Set<string>(FORGE_CHANNEL_ALLOWLIST)
    for (const channel of [
      ...Object.values(SETTINGS_CHANNELS),
      PROPOSALS_CHANNELS.transition,
      PROPOSALS_CHANNELS.setMode,
      PROPOSALS_CHANNELS.listDocs,
      FEATURES_CHANNELS.listDocs,
    ]) {
      expect(allow.has(channel), `${channel} 不在 FORGE_CHANNEL_ALLOWLIST`).toBe(true)
    }
    // 平铺键唯一性沿袭（族前缀键全集 = allowlist 基数——P1/M2 键约定不回退）
    expect(new Set(Object.values(FORGE_CHANNELS)).size).toBe(Object.values(FORGE_CHANNELS).length)
    expect(FORGE_CHANNEL_ALLOWLIST).toHaveLength(Object.values(FORGE_CHANNELS).length)
  })

  it('dto 负载映射键 ↔ 族常量键全等（三处一体的类型面——增通道漏映射即编译红）', () => {
    expectTypeOf<keyof ProposalsChannelRequests>().toEqualTypeOf<keyof typeof PROPOSALS_CHANNELS>()
    expectTypeOf<keyof SettingsChannelRequests>().toEqualTypeOf<keyof typeof SETTINGS_CHANNELS>()
    expectTypeOf<keyof FeaturesChannelRequests>().toEqualTypeOf<keyof typeof FEATURES_CHANNELS>()
  })
})

describe('pin ㉒-2 host ipc 面（注册行逐通道机械审计）', () => {
  it('settings-rpc.ts：SETTINGS_CHANNELS.get/.set 各一行 ipc.register（族常量引用非字面量）', () => {
    const src = host('settings-rpc.ts')
    expect(src).toContain('ipc.register(SETTINGS_CHANNELS.get,')
    expect(src).toContain('ipc.register(SETTINGS_CHANNELS.set,')
    expect(src.match(/ipc\.register\(/g)).toHaveLength(2)
    expect(src).toContain("from '@dsh-forge/contracts'")
  })

  it('proposals-rpc.ts：族四通道逐行注册（transition/setMode/listDocs 新三 + list）', () => {
    const src = host('proposals-rpc.ts')
    for (const key of ['list', 'transition', 'setMode', 'listDocs'] as const) {
      // 换行拆参格式容忍（ipc.register(\n  PROPOSALS_CHANNELS.x,）——族常量引用断言
      expect(src, `proposals-rpc.ts 应注册 PROPOSALS_CHANNELS.${key}`).toMatch(
        new RegExp(`ipc\\.register\\(\\s*PROPOSALS_CHANNELS\\.${key},`),
      )
    }
    expect(src.match(/ipc\.register\(/g)).toHaveLength(4)
  })

  it('features-rpc.ts：listDocs 在族注册面（五通道整族——含 M3 UF-4 消费面）', () => {
    const src = host('features-rpc.ts')
    expect(src).toMatch(new RegExp('ipc\\.register\\(\\s*FEATURES_CHANNELS\\.listDocs,'))
    expect(src.match(/ipc\.register\(/g)).toHaveLength(Object.keys(FEATURES_CHANNELS).length)
  })

  it('m2-wiring.ts：三域注册器装配行在场（服务缺席 fail-soft 降级分支成对）', () => {
    const src = host('m2-wiring.ts')
    expect(src).toContain('registerProposalsChannels(ipc, services.forgeProposals)')
    expect(src).toContain('registerSettingsChannels(ipc, services.forgeSettings)')
    expect(src).toContain('registerFeaturesChannels(ipc, services.forgeFeatures)')
  })
})

describe('pin ㉒-3 web/rpc 面（client 消费行逐通道机械审计）', () => {
  it('client.ts：proposals transition/setMode/listDocs 三消费行（族常量引用）', () => {
    for (const key of ['transition', 'setMode', 'listDocs'] as const) {
      expect(webClient, `client.ts 应消费 PROPOSALS_CHANNELS.${key}`).toContain(
        `PROPOSALS_CHANNELS.${key}`,
      )
    }
  })

  it('client.ts：settings get/set 两消费行 + features.listDocs 消费行', () => {
    expect(webClient).toContain('SETTINGS_CHANNELS.get')
    expect(webClient).toContain('SETTINGS_CHANNELS.set')
    expect(webClient).toContain('FEATURES_CHANNELS.listDocs')
  })

  it('通道常量消费零字面量私改（web 面禁硬编码通道名——族常量唯一源纪律）', () => {
    const literals = webClient.match(/['"]forge:(settings|proposals|features)\/[\w/]+['"]/g) ?? []
    expect(literals, `client.ts 硬编码通道名：${literals.join(', ')}`).toEqual([])
  })
})
