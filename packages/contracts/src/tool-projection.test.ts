// tool-projection 单测（bug a5b12254 集中化锚定——用例集合平移自 plugin-forge in-flight
// 红测试 + expert-squad tools/compose 既有行为等价锚定）。
import { describe, expect, it } from 'vitest'
import {
  createUnionToolNamesProbe,
  globalToolNamesOfToolsFace,
  intersectToolNames,
  platformShellToolName,
  probeIsSubdomain,
  SHELL_TOOL_CANDIDATES,
  unionAcrossPresets,
  type AgentPresetsFace,
} from './tool-projection.js'

/** global 层仅 expert 域 10 名形态（bug e3b045dc 已定谳）——官方工具全随 preset 装 preset scope 层 */
const globalExpertOnly = [
  'recruit_expert', 'update_expert', 'rename_expert', 'enable_expert', 'disable_expert',
  'list_experts', 'delegate_expert', 'list_tools', 'list_skills', 'expert_misc',
]
const officialMacView = [
  { name: 'read' }, { name: 'write' }, { name: 'edit' }, { name: 'bash' },
  { name: 'todo_write' }, { name: 'submitTask' }, { name: 'recordBug' },
  { name: 'resolveBug' }, { name: 'getBug' }, { name: 'web_search' },
]

/** ScopedLayers 双层 tools 面：无参 = global 单层；携 scope key = 该 preset 装配面视图 */
function toolsFaceOf(scopeViews: Map<object, readonly { name: string }[]>) {
  return {
    schemas: (scope?: object) =>
      scope === undefined ? globalExpertOnly.map((name) => ({ name })) : [...(scopeViews.get(scope) ?? [])],
  }
}

describe('SHELL_TOOL_CANDIDATES / platformShellToolName / probeIsSubdomain', () => {
  it('shell 候选 = bash/pwsh；win32 → pwsh、其余平台 → bash（与官方装配面一致）', () => {
    expect(SHELL_TOOL_CANDIDATES).toEqual(['bash', 'pwsh'])
    expect(platformShellToolName('win32')).toBe('pwsh')
    expect(platformShellToolName('darwin')).toBe('bash')
    expect(platformShellToolName('linux')).toBe('bash')
  })

  it('金丝雀判读：空表可信（不裁剪分支）、含 read 可信、非空缺 read = 子域不可信', () => {
    expect(probeIsSubdomain([])).toBe(false)
    expect(probeIsSubdomain(['read'])).toBe(false)
    expect(probeIsSubdomain(globalExpertOnly)).toBe(true)
  })
})

describe('globalToolNamesOfToolsFace——unknown 面形状校验读取', () => {
  it('正常面逐 schema 取 name；携 scope = scope 视图', () => {
    const views = new Map<object, readonly { name: string }[]>([[{}, [{ name: 'read' }]]])
    const face = toolsFaceOf(views)
    expect(globalToolNamesOfToolsFace(face)).toEqual(globalExpertOnly)
  })

  it('形状漂移/抛错/缺席 = undefined', () => {
    expect(globalToolNamesOfToolsFace({})).toBeUndefined()
    expect(globalToolNamesOfToolsFace({ schemas: () => ({ nope: 1 }) })).toBeUndefined()
    expect(globalToolNamesOfToolsFace({ schemas: () => [{ noName: 1 }] })).toBeUndefined()
    expect(globalToolNamesOfToolsFace({
      schemas: () => {
        throw new Error('registry unavailable')
      },
    })).toBeUndefined()
    expect(globalToolNamesOfToolsFace(undefined)).toBeUndefined()
    expect(globalToolNamesOfToolsFace('garbage')).toBeUndefined()
  })
})

describe('createUnionToolNamesProbe 跨 preset 并集（bug a5b12254/e3b045dc）', () => {
  it('并集含 read 金丝雀与 bash：探针可信 → 档案 pwsh 求交解析为 bash', async () => {
    const scopedViews = new Map<object, readonly { name: string }[]>()
    const presets = {
      list: async () => [{ id: 'default' }],
      acquireScope: async () => {
        const key = {}
        scopedViews.set(key, officialMacView)
        return { key, [Symbol.asyncDispose]: async () => {} }
      },
    } as unknown as AgentPresetsFace
    const probe = createUnionToolNamesProbe((scope?: object) => toolsFaceOf(scopedViews).schemas(scope), () => presets)
    const union = await probe()
    expect(union).toContain('read')
    expect(union).toContain('bash')
    expect(union).toContain('recruit_expert') // global 层并入
    expect(probeIsSubdomain(union!)).toBe(false)
    expect(intersectToolNames(['read', 'pwsh'], union)).toEqual(expect.arrayContaining(['read', 'bash']))
    expect(intersectToolNames(['read', 'pwsh'], union)).not.toContain('pwsh')
  })

  it('agentPresets 缺席/形状漂移 = fail-soft 降级 global 单层（子域不可信 → 求交不裁剪）', async () => {
    const probe = createUnionToolNamesProbe((scope?: object) => toolsFaceOf(new Map()).schemas(scope), () => undefined)
    expect(await probe()).toEqual(globalExpertOnly)
    const { note } = await unionAcrossPresets(() => [{ name: 'read' }], () => undefined, undefined)
    expect(note).toMatch(/agentPresets absent/)
  })

  it('list 抛错 = global 单层降级；单 preset acquireScope 失败不外溢（部分并集）；租约 asyncDispose 释放', async () => {
    const disposed: string[] = []
    const scopedViews = new Map<object, readonly { name: string }[]>()
    const presets = {
      list: async () => [{ id: 'ok' }, { id: 'bad' }],
      acquireScope: async (id: string) => {
        if (id === 'bad') throw new Error('lease denied')
        const key = {}
        scopedViews.set(key, officialMacView)
        return { key, [Symbol.asyncDispose]: async () => { disposed.push(id) } }
      },
    } as unknown as AgentPresetsFace
    const probe = createUnionToolNamesProbe((scope?: object) => toolsFaceOf(scopedViews).schemas(scope), () => presets)
    const union = await probe()
    expect(union).toContain('read')
    expect(union).toContain('bash')
    expect(disposed).toEqual(['ok']) // 成功租约释放；失败租约无泄漏
    const listThrow = {
      list: async () => {
        throw new Error('registry down')
      },
      acquireScope: async () => {
        throw new Error('unreachable')
      },
    } as unknown as AgentPresetsFace
    expect(await createUnionToolNamesProbe((scope?: object) => toolsFaceOf(scopedViews).schemas(scope), () => listThrow)())
      .toEqual(globalExpertOnly)
  })

  it('global 读取失败（tools 面缺席/形状漂移）= undefined（调用方回落）', async () => {
    expect(await createUnionToolNamesProbe(() => undefined, () => undefined)()).toBeUndefined()
    expect(await createUnionToolNamesProbe(() => undefined, () => ({} as AgentPresetsFace))()).toBeUndefined()
    expect(await createUnionToolNamesProbe(() => 'garbage' as unknown as never, () => undefined)()).toBeUndefined()
  })
})

describe('intersectToolNames——求交/同族解析/平台兜底/空集 fail-loud', () => {
  const macRegistered = ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'web_fetch', 'web_search', 'todo_write', 'submitTask', 'recordBug', 'resolveBug', 'getBug']

  it('探针可信：已知名保序保留；shell 同族解析为在场者；未知名 fail-soft 剔除', () => {
    expect(intersectToolNames(['read', 'pwsh'], macRegistered)).toEqual(['read', 'bash'])
    expect(intersectToolNames(['ghost-unknown-tool', 'pwsh'], macRegistered)).toEqual(['bash'])
    expect(intersectToolNames(['read', 'ghost'], macRegistered)).toEqual(['read'])
  })

  it('探针缺席/空 = 不裁剪；platform 在场时 shell 同族兜底解析（win32 反向同证）', () => {
    expect(intersectToolNames(['read', 'pwsh'], undefined)).toEqual(['read', 'pwsh'])
    expect(intersectToolNames(['read', 'pwsh'], undefined, { platform: 'darwin' })).toEqual(['read', 'bash'])
    expect(intersectToolNames(['read', 'bash'], undefined, { platform: 'win32' })).toEqual(['read', 'pwsh'])
    expect(intersectToolNames(['read', 'pwsh'], [], { platform: 'darwin' })).toEqual(['read', 'bash'])
  })

  it('兜底仅作用于 shell 同族名：其余未知名原样放行（不借兜底扩大裁剪面）', () => {
    expect(intersectToolNames(['ghost-unknown-tool', 'pwsh'], undefined, { platform: 'darwin' }))
      .toEqual(['ghost-unknown-tool', 'bash'])
  })

  it('子域投影（不可信探针）= 不裁剪分支 + 平台兜底；排除集所有分支恒生效', () => {
    expect(intersectToolNames(['read', 'pwsh'], globalExpertOnly, { platform: 'darwin' })).toEqual(['read', 'bash'])
    expect(intersectToolNames(['pwsh'], globalExpertOnly)).toEqual(['pwsh'])
    expect(intersectToolNames(['delegate_expert', 'pwsh'], undefined, { excluded: ['delegate_expert'] })).toEqual(['pwsh'])
    expect(intersectToolNames(['delegate_expert'], macRegistered, { excluded: ['delegate_expert'] })).toEqual([])
  })

  it('保留传输名 run_code 全分支剔除：不可信透传分支/平台兜底分支/可信分支均不携带（bug 0a6a1055）', () => {
    expect(intersectToolNames(['read', 'run_code'], undefined)).toEqual(['read'])
    expect(intersectToolNames(['read', 'run_code'], undefined, { platform: 'win32' })).toEqual(['read'])
    expect(intersectToolNames(['read', 'run_code'], globalExpertOnly)).toEqual(['read'])
    expect(intersectToolNames(['read', 'run_code'], macRegistered)).toEqual(['read'])
    // 保留名剔除不可被 excluded 豁免（excluded 不含 run_code 也剔除）
    expect(intersectToolNames(['run_code', 'pwsh'], undefined, { excluded: ['delegate_expert'] })).toEqual(['pwsh'])
  })

  it('仅保留名入表 = 档案配置错误，fail-loud（可信/不可信分支同口径，避免 allow:[] 空表炸官方 empty-filter 守卫）', () => {
    expect(() => intersectToolNames(['run_code'], macRegistered)).toThrow(/empty tool allow-list/)
    expect(() => intersectToolNames(['run_code'], undefined)).toThrow(/empty tool allow-list/)
  })

  it('解析后空集 fail-loud（异常类型经 emptyError 注入）；排除集清空入表 = 空集不炸', () => {
    expect(() => intersectToolNames(['ghost'], macRegistered)).toThrow(/empty tool allow-list/)
    class CustomError extends Error {}
    expect(() => intersectToolNames(['ghost'], macRegistered, { emptyError: (m) => new CustomError(m) }))
      .toThrow(CustomError)
    expect(intersectToolNames(['excluded-only'], macRegistered, { excluded: ['excluded-only'] })).toEqual([])
  })
})
