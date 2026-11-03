// forge-dirs-query-tool 1.2 —— 首个第三方声明者（declare merge）单测：
// knowledge 插件装配期经 forgeDirs 服务键（reflect.get 防御读取——cordis 4.0.4 无可选
// inject，同 plugin-forge forgeSettings 先例配方）声明 knowledge.root；plugin-forge
// 缺席环境零生效零抛（AGENTS 1.6 在场性现查 fail-soft）；注册后 forgeDirs 全量查询
// 可见（集成断言——forge 侧合并注册表 + forgeDirs 全量查询行为在本测试内同构模拟）。
import { describe, expect, it } from 'vitest'
import knowledgePlugin, { KNOWLEDGE_ROOT_DIR_KEY } from './index.js'
import type { KnowledgePromptSection, KnowledgeToolDefinition } from './tools/index.js'

/** 假宿主 ctx 骨架（plugin.test.ts TempRuntime 同型——tool/段注册捕获） */
interface CtxOverrides {
  readonly reflectGet?: (name: string) => unknown
  readonly reflectThrows?: boolean
  /** 事件面缺席（默认）或注入（晚到场景）——真 Context ctx.on 经 events mixin 转发 */
  readonly eventsOn?: (name: string, listener: (...args: unknown[]) => void) => () => boolean
}

function makeCtx(overrides: CtxOverrides = {}): Record<string, unknown> {
  return {
    forgeKnowledge: {},
    tools: { register: (_d: KnowledgeToolDefinition) => () => {} },
    systemPrompt: { section: (_s: KnowledgePromptSection) => () => {} },
    ...(overrides.eventsOn !== undefined ? { events: { on: overrides.eventsOn } } : {}),
    ...(overrides.reflectThrows === true
      ? { reflect: { get: () => { throw new Error('cannot get property') } } }
      : overrides.reflectGet !== undefined
        ? { reflect: { get: overrides.reflectGet } }
        : {}),
  }
}

/** forge 侧同构模拟：合并注册表（forge 本体五键桩 + registerDirKeys 注册面） */
function makeFakeForgeDirs() {
  const forgeAnchors = [
    'forge.projectHome',
    'forge.taskHome',
    'forge.docsRoot',
    'forge.tmp',
    'forge.worktrees',
  ].map((dirKey) => ({ dirKey, description: `${dirKey} 桩`, resolve: () => `D:\\stub\\${dirKey}` }))
  const merged = new Map(forgeAnchors.map((e) => [e.dirKey, e]))
  return {
    registered: [] as readonly object[],
    service: {
      registerDirKeys: (entries: readonly object[]) => {
        for (const e of entries) merged.set((e as { dirKey: string }).dirKey, e)
      },
    },
    /** forgeDirs 全量查询同构（tools/forge-paths.ts execute 全量分支） */
    listAll(anchors: object): { dirKey: string; dir: string; description: string }[] {
      return [...merged.values()].map((e) => {
        const entry = e as { dirKey: string; description: string; resolve(ctx: object): string }
        return { dirKey: entry.dirKey, dir: entry.resolve(anchors), description: entry.description }
      })
    },
  }
}

const ANCHORS = {
  projectHome: 'D:\\tasksHome',
  taskHome: 'D:\\tasksHome\\ws@ab12cd34',
  forgeDir: 'Z:\\ws\\proj\\.forge',
}

describe('knowledge.root 声明项形状（注册面校验规则同构）', () => {
  it('dirKey = knowledge.root（插件前缀命名空间，非 forge.* 保留段）', () => {
    expect(KNOWLEDGE_ROOT_DIR_KEY.dirKey).toBe('knowledge.root')
    expect(KNOWLEDGE_ROOT_DIR_KEY.dirKey.startsWith('forge.')).toBe(false)
    expect(KNOWLEDGE_ROOT_DIR_KEY.dirKey.includes('.')).toBe(true)
  })

  it('description 非空 + resolve 为函数（forgeDirs 输出 description 同源）', () => {
    expect(KNOWLEDGE_ROOT_DIR_KEY.description.trim()).not.toBe('')
    expect(typeof KNOWLEDGE_ROOT_DIR_KEY.resolve).toBe('function')
    expect(KNOWLEDGE_ROOT_DIR_KEY.declaredBy).toBe('knowledge')
  })

  it('resolve：forgeDir 锚派生工作区根 + .knowledge（Windows 与 POSIX 各一）', () => {
    expect(KNOWLEDGE_ROOT_DIR_KEY.resolve({ forgeDir: 'Z:\\ws\\proj\\.forge' })).toBe('Z:\\ws\\proj\\.knowledge')
    expect(KNOWLEDGE_ROOT_DIR_KEY.resolve({ forgeDir: '/ws/proj/.forge' })).toBe('/ws/proj/.knowledge')
  })

  it('resolve：forgeDir 缺席 fail-loud（装配缺口不静默）', () => {
    expect(() => KNOWLEDGE_ROOT_DIR_KEY.resolve({})).toThrow(/forgeDir/)
    expect(() => KNOWLEDGE_ROOT_DIR_KEY.resolve({ forgeDir: 'Z:\\ws\\proj' })).toThrow(/\.forge/)
  })
})

describe('装配期声明（reflect.get 防御读取——AGENTS 1.6 在场性现查）', () => {
  it('forgeDirs 在场：registerDirKeys 收到 knowledge.root 声明项', () => {
    const fake = makeFakeForgeDirs()
    let seen: unknown
    const service = {
      registerDirKeys: (entries: readonly object[]) => {
        seen = entries
        fake.service.registerDirKeys(entries)
      },
    }
    const dispose = knowledgePlugin(makeCtx({ reflectGet: (name) => (name === 'forgeDirs' ? service : undefined) }) as never)
    expect(seen).toEqual([KNOWLEDGE_ROOT_DIR_KEY])
    dispose()
  })

  it('集成断言：注册后 forgeDirs 全量查询可见 knowledge.root（dir 解析 = 工作区根/.knowledge）', () => {
    const fake = makeFakeForgeDirs()
    const dispose = knowledgePlugin(makeCtx({ reflectGet: (name) => (name === 'forgeDirs' ? fake.service : undefined) }) as never)
    const all = fake.listAll(ANCHORS)
    expect(all.map((p) => p.dirKey)).toContain('knowledge.root')
    const knowledgeEntry = all.find((p) => p.dirKey === 'knowledge.root')
    expect(knowledgeEntry?.dir).toBe('Z:\\ws\\proj\\.knowledge')
    expect(knowledgeEntry?.description).toBe(KNOWLEDGE_ROOT_DIR_KEY.description)
    // forge 本体五键不被遮蔽
    expect(all).toHaveLength(6)
    dispose()
  })

  it('fail-soft：plugin-forge 缺席（reflect 缺席 / 读取抛 / 服务非函数面 / registerDirKeys 缺席）零生效零抛，双 tool 照常注册', () => {
    const cases: CtxOverrides[] = [
      {},
      { reflectThrows: true },
      { reflectGet: () => undefined },
      { reflectGet: (name) => (name === 'forgeDirs' ? {} : undefined) },
    ]
    for (const overrides of cases) {
      const ctx = makeCtx(overrides)
      const registered: string[] = []
      ctx.tools = {
        register: (d: KnowledgeToolDefinition) => {
          registered.push(d.name)
          return () => {}
        },
      }
      expect(() => {
        const dispose = knowledgePlugin(ctx as never)
        dispose()
      }).not.toThrow()
      expect(registered.sort()).toEqual(['knowledge_read_abstract', 'knowledge_search'])
    }
  })

  it('声明为一次性装配动作，不进 inject 数组（cordis 无可选 inject——forgeDirs 缺席不阻载）', () => {
    expect(knowledgePlugin.inject).toEqual(['forgeKnowledge', 'tools', 'systemPrompt'])
  })
})

describe('晚到服务感知（bug 62208a31——cordis internal/service 拦截钩子官方缝）', () => {
  /** events 面桩：listener 登记 + 手动派发（同构 cordis emit('internal/service', name, value)） */
  function makeEventBus() {
    const listeners: { name: string; listener: (...args: unknown[]) => void }[] = []
    return {
      on: (name: string, listener: (...args: unknown[]) => void) => {
        listeners.push({ name, listener })
        return () => {
          const i = listeners.findIndex((l) => l.listener === listener)
          if (i >= 0) listeners.splice(i, 1)
          return true
        }
      },
      emit: (name: string, ...args: unknown[]) => {
        for (const { name: n, listener } of listeners) if (n === name) listener(...args)
      },
      size: () => listeners.length,
    }
  }

  it('初始缺席 → 服务后到（internal/service 派发 forgeDirs + 服务值）→ 注册生效且监听自注销', () => {
    const fake = makeFakeForgeDirs()
    const bus = makeEventBus()
    const dispose = knowledgePlugin(
      makeCtx({ reflectGet: () => undefined, eventsOn: bus.on }) as never,
    )
    expect(fake.listAll(ANCHORS)).toHaveLength(5) // 未注册
    bus.emit('internal/service', 'forgeDirs', fake.service)
    const all = fake.listAll(ANCHORS)
    expect(all).toHaveLength(6)
    expect(all.map((p) => p.dirKey)).toContain('knowledge.root')
    expect(bus.size()).toBe(0) // 注册成功即注销监听
    dispose()
  })

  it('非目标服务事件不触发；钩子携带非函数面不注册、监听保留', () => {
    const fake = makeFakeForgeDirs()
    const bus = makeEventBus()
    const dispose = knowledgePlugin(makeCtx({ eventsOn: bus.on }) as never)
    bus.emit('internal/service', 'otherService', {})
    expect(bus.size()).toBe(1)
    bus.emit('internal/service', 'forgeDirs', {})
    expect(bus.size()).toBe(1) // 非函数面不注销
    expect(fake.listAll(ANCHORS)).toHaveLength(5)
    bus.emit('internal/service', 'forgeDirs', fake.service)
    expect(fake.listAll(ANCHORS)).toHaveLength(6)
    dispose()
  })

  it('插件卸载注销监听（dispose 后服务到场零注册）', () => {
    const fake = makeFakeForgeDirs()
    const bus = makeEventBus()
    const dispose = knowledgePlugin(makeCtx({ eventsOn: bus.on }) as never)
    dispose()
    expect(bus.size()).toBe(0)
    bus.emit('internal/service', 'forgeDirs', fake.service)
    expect(fake.listAll(ANCHORS)).toHaveLength(5)
  })

  it('已在场直接注册：不挂监听（事件面零残留）', () => {
    const fake = makeFakeForgeDirs()
    const bus = makeEventBus()
    const dispose = knowledgePlugin(
      makeCtx({ reflectGet: (name) => (name === 'forgeDirs' ? fake.service : undefined), eventsOn: bus.on }) as never,
    )
    expect(fake.listAll(ANCHORS)).toHaveLength(6)
    expect(bus.size()).toBe(0)
    dispose()
  })
})
