// 真 cordis 契约测试（bug 83729990——dirKeys.expert_squad 真机「取值非对象」降级钉）：
// 用真实 @deepseek-ai/cordis 包经 ctx.plugin 装载真实 expertSquadPlugin（生产 loader
// 同型：inject 硬声明四服务 + async apply），钉两条：
//   a) 装载完成后约定名 dirKeys.expert_squad 在消费缝可取（真机缺陷 = 登记的注销器被
//      `ctx.effect(() => disposeDirKeys())` 惯用法在 apply 当场执行——provide 后立即注销，
//      props 名表残留而 store 已删，消费缝 strict reflect.get 恒 undefined 命中
//      「取值非对象」降级零贡献；修复前本用例红于 get = undefined）；
//   b) 条目形状 Record<目录键, ForgeDirEntry> 受检（删登记 = a 红；改错形状/复制体 = b 红）。
// 消费缝拉取逻辑与 project/host/dirs/anchors.ts collectDeclaredDirKeys 同构
// （props 枚举 dirKeys.* + strict get + 非对象零贡献——anchors.cordis.test 同款钉法）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context, type Context as CordisContext, type Plugin } from '@deepseek-ai/cordis'
import expertSquadPlugin from '../host/index.js'
import { DIR_KEYS_SERVICE_NAME, EXPERT_SQUAD_DIR_ENTRIES } from '../host/index.js'

/** 消费缝镜像（collectDeclaredDirKeys 同构——见文件头注） */
function pullDirKeys(reflect: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const r = reflect as { props?: Record<string, unknown>; get?(name: string): unknown } | undefined
  const props = r?.props
  if (props === undefined) return out
  for (const name of Object.keys(props)) {
    if (!name.startsWith('dirKeys.')) continue
    let value: unknown
    try {
      value = r?.get?.(name)
    } catch {
      continue // 取值抛 = 该名零贡献（fail-soft）
    }
    if (value === null || typeof value !== 'object') continue // 非对象 = 该名零贡献（真机降级行同判）
    Object.assign(out, value as Record<string, unknown>)
  }
  return out
}

type EsPlugin = Plugin.Function<Record<string, never>>
const esPlugin = expertSquadPlugin as unknown as EsPlugin
const consumerPlugin = ((c2: CordisContext) => {
  consumerReflect = c2.reflect
}) as unknown as EsPlugin
const sessionPlugin = (async (c: CordisContext) => {
  const scoped = c.isolate('forgeDirs')
  await scoped.plugin(consumerPlugin)
}) as unknown as EsPlugin

let ctx: CordisContext
let consumerReflect: unknown

beforeAll(async () => {
  ctx = new Context()
  // 生产宿主 core 行桩：expertSquadPlugin.inject 四服务的最小形状（缺席面按插件自身
  // 降级径走——subagents/agentPresets 劣形 = 委派/preset 同步诚实降级，不阻载装载）。
  ctx.provide('connection', { fetch: { register: () => {} } })
  ctx.provide('subagents', {})
  ctx.provide('skills', {})
  ctx.provide('agentPresets', {})
  // 消费侧（plugin-forge 会话隔离 scope 形态）：隔离 scope 内 reflect 拉取根 scope 声明。
  await ctx.plugin(sessionPlugin, { name: 'session-runtime' } as never)
})

afterAll(async () => {
  await (ctx as unknown as { shutdown?: () => Promise<void> }).shutdown?.()
  ;(ctx as unknown as { destroy?: () => void }).destroy?.()
})

describe('真装载 + 消费缝拉取（bug 83729990——修复前红于 get undefined）', () => {
  it('装载完成后 dirKeys.expert_squad 经消费缝可取（登记未被当场注销）', async () => {
    const applying = ctx.plugin(esPlugin, { name: 'expert-squad' } as never)
    const outcome = await applying.then(() => 'ok', (error: unknown) => `rejected: ${String(error)}`)
    expect(outcome).toBe('ok')
    const pulled = pullDirKeys(consumerReflect)
    expect(
      Object.keys(pulled),
      '装载完成后消费缝应取到 expert_squad.experts（登记不得在 apply 期被注销）',
    ).toContain('expert_squad.experts')
  })

  it('约定名取值 = 登记对象本体，条目形状 Record<expert_squad.experts, ForgeDirEntry>（删登记或改错形状 = 红）', () => {
    const reflect = consumerReflect as { get(name: string): unknown; props: Record<string, unknown> }
    expect(Object.keys(reflect.props)).toContain(DIR_KEYS_SERVICE_NAME)
    expect(reflect.get(DIR_KEYS_SERVICE_NAME)).toBe(EXPERT_SQUAD_DIR_ENTRIES) // 同一登记对象
    expect(Object.keys(EXPERT_SQUAD_DIR_ENTRIES)).toEqual(['expert_squad.experts'])
    expect(EXPERT_SQUAD_DIR_ENTRIES['expert_squad.experts'].deps).toEqual(['forge.home'])
    expect(
      EXPERT_SQUAD_DIR_ENTRIES['expert_squad.experts'].resolve({ 'forge.home': 'X:\\home' }),
    ).toBe('X:\\home\\experts')
  })
})
