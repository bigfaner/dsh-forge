// forge-dirs-unification 3.4 —— knowledge 目录键声明合并单测：
// knowledge 插件装配期经根 scope 约定服务名 dirKeys.knowledge provide 条目对象
// （Record<目录键, ForgeDirEntry>——plugin-forge collectDeclaredDirKeys 消费面同构）；
// 反射/提供缺席环境零生效零抛（AGENTS 1.6 在场性现查 fail-soft）；声明后经注册表
// 解析可查（resolveForgeDirs + 注入 ForgeDirSources 事实断言——forge-dirs 基座单源）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import knowledgePlugin, { KNOWLEDGE_DIR_ENTRIES } from '../host/index.js'
import { FORGE_BASE_DIR_ENTRIES, resolveForgeDirs, type ForgeDirSources } from '@dsh-forge/lib-path'
import type { KnowledgePromptSection, KnowledgeToolDefinition } from '../host/tools/index.js'

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

const SOURCES: ForgeDirSources = {
  dshHome: 'X:\\dsh-home',
  projectRoot: 'Z:\\ws\\proj-main',
  workspaceRoot: 'Z:\\ws\\proj',
}

/** 注册表解析（lib/path resolveForgeDirs 单源——本体基座声明 + dirKeys.knowledge 声明合并） */
function resolveDeclaredEntries(sources: ForgeDirSources = SOURCES): Record<string, string> {
  return resolveForgeDirs(
    [
      { source: 'forge 本体（@dsh-forge/lib-path）', entries: FORGE_BASE_DIR_ENTRIES },
      { source: 'dirKeys.knowledge', entries: KNOWLEDGE_DIR_ENTRIES },
    ],
    sources,
  )
}

describe('knowledge 目录键声明形状（satisfies Partial<ForgeDirs> 编译期受检 + 运行期断言）', () => {
  it('登记键 = knowledge.root / knowledge.store / knowledge.global（带插件前缀，非 forge.* 保留段）', () => {
    expect(Object.keys(KNOWLEDGE_DIR_ENTRIES).sort()).toEqual([
      'knowledge.global',
      'knowledge.root',
      'knowledge.store',
    ])
    for (const key of Object.keys(KNOWLEDGE_DIR_ENTRIES)) {
      expect(key.startsWith('forge.')).toBe(false)
      expect(key.includes('.')).toBe(true)
    }
  })

  it('deps：root 依赖 workspaceRoot；store 依赖 forge.db；global 依赖 forge.home（与声明合并文件逐一相同）', () => {
    expect(KNOWLEDGE_DIR_ENTRIES['knowledge.root'].deps).toEqual(['workspaceRoot'])
    expect(KNOWLEDGE_DIR_ENTRIES['knowledge.store'].deps).toEqual(['forge.db'])
    expect(KNOWLEDGE_DIR_ENTRIES['knowledge.global'].deps).toEqual(['forge.home'])
  })

  it('注册表解析（注入事实断言）：root = {workspaceRoot}/.knowledge；store = {forge.db}/knowledge；global 只随 forge 根 = {forge.home}/knowledge/global', () => {
    const resolved = resolveDeclaredEntries()
    expect(resolved['knowledge.root']).toBe(join('Z:\\ws\\proj', '.knowledge'))
    expect(resolved['knowledge.store']).toBe(join('X:\\dsh-home', 'forge', 'db', 'knowledge'))
    expect(resolved['knowledge.global']).toBe(join('X:\\dsh-home', 'forge', 'knowledge', 'global'))
  })

  it('全局目录只随 forge 根，不随库文件路径（换 dbFile 事实不影响 global 解析）', () => {
    const a = resolveDeclaredEntries({ ...SOURCES, dshHome: 'X:\\dsh-home' })
    const b = resolveDeclaredEntries({ ...SOURCES, dshHome: 'Y:\\other-home' })
    expect(a['knowledge.global']).toBe(join('X:\\dsh-home', 'forge', 'knowledge', 'global'))
    expect(b['knowledge.global']).toBe(join('Y:\\other-home', 'forge', 'knowledge', 'global'))
    expect(a['knowledge.store']).not.toBe(b['knowledge.store'])
  })
})

describe('装配期声明（根 scope provide——bug 04d445f4 反向拉取缝）', () => {
  it('reflect.provide 在场：dirKeys.knowledge 收到条目对象 KNOWLEDGE_DIR_ENTRIES', () => {
    const reflect = makeFakeReflect()
    const dispose = knowledgePlugin(makeCtx({ reflectProvide: reflect.provide }) as never, { dbFile: tempDbFile() })
    expect(reflect.get('dirKeys.knowledge')).toEqual(KNOWLEDGE_DIR_ENTRIES)
    dispose()
    expect(reflect.size()).toBe(0) // provide 注销随插件 dispose
  })

  it('集成断言：声明对象经注册表解析后三键全可见（dirKey + dir + description 同源）', () => {
    const reflect = makeFakeReflect()
    const dispose = knowledgePlugin(makeCtx({ reflectProvide: reflect.provide }) as never, { dbFile: tempDbFile() })
    const pulled = reflect.get('dirKeys.knowledge') as Record<string, { description: string }>
    const resolved = resolveDeclaredEntries({ ...SOURCES, dshHome: '', projectRoot: '' })
    for (const key of Object.keys(KNOWLEDGE_DIR_ENTRIES)) {
      expect(Object.keys(resolved)).toContain(key)
      expect(typeof pulled[key].description).toBe('string')
      expect(pulled[key].description.trim()).not.toBe('')
    }
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
    expect(knowledgePlugin.inject).toEqual(['tools', 'systemPrompt', 'connection', 'workspaceRegistry'])
  })
})
