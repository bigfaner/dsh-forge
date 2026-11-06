// forge-dirs-query-tool 1.2 —— 首个第三方声明者（declare merge）单测：
// knowledge 插件装配期经根 scope 约定服务名 dirKeys.knowledge provide 声明数组
// （bug 04d445f4 裁定反向拉取缝——跨 scope 装配形态下推式注册被隔离过滤不可达，
// plugin-forge 消费点枚举 dirKeys.* 现取）；reflect/provide 缺席环境零生效零抛
// （AGENTS 1.6 在场性现查 fail-soft）；声明后 forgeDirs 全量查询可见（集成断言——
// forge 侧反向拉取合并 + forgeDirs 全量查询行为在本测试内同构模拟）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import knowledgePlugin, { KNOWLEDGE_ROOT_DIR_KEY } from './index.js'
import type { KnowledgePromptSection, KnowledgeToolDefinition } from './tools/index.js'

// 自持存储锚摘除（hermetic——plugin.test.ts 同口径）：装配走显式 dbFile。
const prevEnv = { DSH_HOME: process.env.DSH_HOME, DSH_FORGE_TASKS_HOME: process.env.DSH_FORGE_TASKS_HOME }
delete process.env.DSH_HOME
delete process.env.DSH_FORGE_TASKS_HOME
const tempDirs: string[] = []
afterAll(() => {
  for (const [k, v] of Object.entries(prevEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

function tempDbFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-dirs-'))
  tempDirs.push(dir)
  return join(dir, 'knowledge.db')
}

/** 假宿主 ctx 骨架（plugin.test.ts TempRuntime 同型——tool/段注册捕获） */
interface CtxOverrides {
  readonly reflectProvide?: (name: string, service: unknown) => () => void
  readonly reflectProvideThrows?: boolean
}

function makeCtx(overrides: CtxOverrides = {}): Record<string, unknown> {
  const reflect =
    overrides.reflectProvideThrows === true
      ? { provide: () => { throw new Error('already registered') } }
      : overrides.reflectProvide !== undefined
        ? { provide: overrides.reflectProvide }
        : undefined
  return {
    tools: { register: (_d: KnowledgeToolDefinition) => () => {} },
    systemPrompt: { section: (_s: KnowledgePromptSection) => () => {} },
    ...(reflect !== undefined ? { reflect } : {}),
  }
}

/** reflect 桩：props/get 同构（plugin-forge collectDeclaredDirKeys 消费面镜像） */
function makeFakeReflect() {
  const services = new Map<string, unknown>()
  return {
    provide: (name: string, service: unknown) => {
      services.set(name, service)
      return () => services.delete(name)
    },
    get props(): Record<string, unknown> {
      return Object.fromEntries([...services.keys()].map((k) => [k, {}]))
    },
    get: (name: string) => services.get(name),
    size: () => services.size,
  }
}

/** forge 侧同构模拟：本体五键 + 反向拉取合并（tools/forge-paths.ts mergedDirKeyEntries 同构） */
function makeFakeForgeDirs() {
  const forgeAnchors = [
    'forge.project_home',
    'forge.task_home',
    'forge.docs_root',
    'forge.tmp',
    'forge.worktrees',
  ].map((dirKey) => ({ dirKey, description: `${dirKey} 桩`, resolve: () => `D:\\stub\\${dirKey}` }))
  const merged = new Map(forgeAnchors.map((e) => [e.dirKey, e]))
  return {
    /** 反向拉取合并视图（既有键胜出去重——消费点现算不落注册表） */
    mergeDeclared(reflect: { props: Record<string, unknown>; get(name: string): unknown }) {
      for (const name of Object.keys(reflect.props)) {
        if (!name.startsWith('dirKeys.')) continue
        const value = reflect.get(name)
        if (!Array.isArray(value)) continue
        for (const entry of value) {
          const e = entry as { dirKey: string }
          if (!merged.has(e.dirKey)) merged.set(e.dirKey, entry as (typeof forgeAnchors)[number])
        }
      }
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

describe('装配期声明（根 scope provide——bug 04d445f4 反向拉取缝）', () => {
  it('reflect.provide 在场：dirKeys.knowledge 收到声明数组 [knowledge.root]', () => {
    const reflect = makeFakeReflect()
    const dispose = knowledgePlugin(makeCtx({ reflectProvide: reflect.provide }) as never, { dbFile: tempDbFile() })
    expect(reflect.get('dirKeys.knowledge')).toEqual([KNOWLEDGE_ROOT_DIR_KEY])
    dispose()
    expect(reflect.size()).toBe(0) // provide 注销随插件 dispose
  })

  it('集成断言：反向拉取合并后 forgeDirs 全量查询可见 knowledge.root（dir = 工作区根/.knowledge）', () => {
    const reflect = makeFakeReflect()
    const fake = makeFakeForgeDirs()
    const dispose = knowledgePlugin(makeCtx({ reflectProvide: reflect.provide }) as never, { dbFile: tempDbFile() })
    fake.mergeDeclared(reflect) // plugin-forge 消费点同构：枚举 dirKeys.* 现取合并
    const all = fake.listAll(ANCHORS)
    expect(all.map((p) => p.dirKey)).toContain('knowledge.root')
    const knowledgeEntry = all.find((p) => p.dirKey === 'knowledge.root')
    expect(knowledgeEntry?.dir).toBe('Z:\\ws\\proj\\.knowledge')
    expect(knowledgeEntry?.description).toBe(KNOWLEDGE_ROOT_DIR_KEY.description)
    // forge 本体五键不被遮蔽
    expect(all).toHaveLength(6)
    dispose()
  })

  it('fail-soft：reflect 缺席 / provide 抛 零生效零抛，双 tool 照常注册', () => {
    const cases: CtxOverrides[] = [{}, { reflectProvideThrows: true }]
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
        const dispose = knowledgePlugin(ctx as never, { dbFile: tempDbFile() })
        dispose()
      }).not.toThrow()
      expect(registered.sort()).toEqual([
        'knowledge_browse',
        'knowledge_read',
        'knowledge_read_abstract',
        'knowledge_reinstate',
        'knowledge_search',
        'knowledge_supersede',
        'knowledge_write',
      ])
    }
  })

  it('声明为一次性装配动作，不进 inject 数组（cordis 无可选 inject——缺席不阻载）', () => {
    expect(knowledgePlugin.inject).toEqual(['tools', 'systemPrompt'])
  })
})
