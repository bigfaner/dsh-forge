// G1 pin ⑦（M1 批，任务 3.9）：Cordis 服务定义/注入模式——`ctx.forgeProjects` / `ctx.forgeKnowledge`
// 属性面 + inject 消费（真实 cordis runtime 全链路自证）。
// 权威：tech-design Appendix 契约面清单第 7 项 + Overview 关键缝（Cordis 服务模式——
// workspaceRegistry/agentPresets 同型先例，进程内零 RPC）+ 上游公开面 `@deepseek-ai/cordis`
// （host 锚；dsh 0.2.0-rc.2 栈闭包解析版本 = 4.0.4，独立版本线精确 pin——漂移即红）。
// 我方镜像：packages/core/src/service.ts（双服务 provide）+ packages/knowledge/src/index.ts
// （inject 消费）。同型先例 WorkspaceRegistry 的 Service 基类面已由 pin-04 锚定。
// Hard Rule：只 pin 上游公开面（cordis 导出 + 服务生命周期契约）+ 我方双服务对官方面的
// 符合性（真实 runtime 装配，非结构化桩模拟——与 2.2/3.4 产品单测的桩面互补）。
// 分层：
//   ⑦-1 版本锚（cordis 独立版本线）
//   ⑦-2 官方面语义锚（registry/reflect/service d.ts：inject 门控 + provide 生命周期 + Service 注册径）
//   ⑦-3 运行期双服务注入面（门控加载 → 双属性面五法/七法 → knowledge 插件消费 → 级联卸载）
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import corePlugin from '../../packages/core/src/service.js'
import knowledgePlugin from '../../packages/knowledge/src/index.js'
import { importUpstream, norm, readTypes, upstreamPkg } from './pins.js'

/** cordis 版本线（dsh 0.2.0-rc.2 栈闭包解析版本——与 dsh 包版本线分立 pin） */
const CORDIS_VERSION = '4.0.4'

/** cordis Context 结构化最小面（⑦ 消费位：reflect.provide / get / plugin / fiber） */
interface PluginCtxFace {
  reflect: { provide(name: string, value?: unknown): () => void }
  get(name: string): unknown
  plugin(plugin: PlugFn, config?: unknown): PromiseLike<unknown> & object
  fiber: { dispose(): Promise<void> }
}
type PlugFn = (ctx: never, config: never) => unknown

/** 真实 SystemPrompt 的段装配查询面（完整面由 pin-06 锚定，此处仅消费） */
interface SystemPromptFace {
  assemble(context?: unknown): Promise<{ sections: { name: string; text: string }[] }>
}

/** tools 服务注册收集桩（官方 ToolRuntime.register 子面——dsh 官方面占位） */
function toolCollector() {
  const registered: { name: string }[] = []
  const disposed: string[] = []
  return {
    face: {
      register(def: { name: string }): () => void {
        registered.push({ name: def.name })
        return () => {
          disposed.push(def.name)
        }
      },
    },
    registered,
    disposed,
  }
}

/** workspaceRegistry 最小桩（S4 语义面已由 pin-04 桩证；此处仅服务提供位） */
function registryStub() {
  const records = new Map<string, { id: string; path: string }>()
  return {
    get: (id: string) => records.get(id),
    list: () => [...records.values()],
    async create(path: string) {
      const ws = { id: randomUUID(), path }
      records.set(ws.id, ws)
      return ws
    },
    async delete(id: string) {
      return records.delete(id)
    },
  }
}

/** 等待条件成立（fiber 级联卸载为异步 dispose——setImmediate 宏任务拍） */
async function waitFor(pred: () => boolean | Promise<boolean>, ticks = 50): Promise<boolean> {
  for (let i = 0; i < ticks && !(await pred()); i++) await new Promise((r) => setImmediate(r))
  return await pred()
}

let dir: string
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})
const dbFile = () => join((dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-pin07-'))), `${randomUUID()}.db`)

/** 起一套真实 runtime：cordis Context + 真实 SystemPrompt + tools 桩（调方负责 fiber.dispose） */
async function bootRuntime(): Promise<{ ctx: PluginCtxFace; sys: SystemPromptFace; tools: ReturnType<typeof toolCollector> }> {
  const cordis = await importUpstream('host', '@deepseek-ai/cordis')
  const sp = await importUpstream('host', '@deepseek-ai/dsh-system-prompt')
  const Ctx = cordis['Context'] as new () => PluginCtxFace
  const SystemPromptCtor = sp['SystemPrompt'] as new (ctx: PluginCtxFace, config: Record<string, never>) => SystemPromptFace
  const ctx = new Ctx()
  const sys = new SystemPromptCtor(ctx, {}) // 提供 systemPrompt 服务（官方 Service 注册径）
  const tools = toolCollector()
  ctx.reflect.provide('tools', tools.face) // dsh 官方 tools 面占位（注册收集桩）
  return { ctx, sys, tools }
}

describe('pin ⑦-1 版本锚（cordis 独立版本线）', () => {
  it('@deepseek-ai/cordis（host 锚）= dsh 0.2.0-rc.2 栈闭包解析版本（漂移即红）', () => {
    expect(upstreamPkg('host', '@deepseek-ai/cordis')['version']).toBe(CORDIS_VERSION)
  })
})

describe('pin ⑦-2 官方面语义锚（cordis d.ts 随包分发面）', () => {
  it('Plugin.Base.inject：声明服务全可用才加载（门控语义原文）', () => {
    const types = norm(readTypes('host', '@deepseek-ai/cordis', 'lib/types/registry.d.ts'))
    expect(types).toContain('Services the plugin requires; it only loads while all are available')
  })

  it('Context.provide：fiber 拥有 + 同隔离域对依赖可见 + disposer/卸载注销并唤醒依赖（生命周期原文）', () => {
    const types = norm(readTypes('host', '@deepseek-ai/cordis', 'lib/types/reflect.d.ts'))
    expect(types).toContain('Register a service implementation owned by the current fiber')
    expect(types).toContain('visible to dependents in the same isolation scope once the fiber is active')
    expect(types).toContain('unregistered (waking dependents) when the returned disposer runs or the fiber unloads')
  })

  it('Service 基类注册径：构造即 ctx.reflect.provide(name, this)（workspaceRegistry 同型先例）', () => {
    const types = norm(readTypes('host', '@deepseek-ai/cordis', 'lib/types/service.d.ts'))
    expect(types).toContain('Calls `ctx.reflect.provide(name, this, this[Service.check])`')
  })

  it('运行期导出面：Service 基类 + Context 均为可构造类（ReflectService 仅类型导出）', async () => {
    const cordis = await importUpstream('host', '@deepseek-ai/cordis')
    for (const name of ['Context', 'Service']) {
      const Ctor = cordis[name] as { prototype: object }
      expect(typeof cordis[name], `${name} 导出`).toBe('function')
      expect(Ctor.prototype).toBeDefined()
    }
  })
})

describe('pin ⑦-3 运行期双服务注入面（真实 cordis + 真实 core/knowledge 插件 + 临时 SQLite）', () => {
  it('inject 门控：workspaceRegistry 缺席时 core 不加载；provide 后加载（Plugin.Base 语义实跑）', async () => {
    const { ctx } = await bootRuntime()
    try {
      const fiber = ctx.plugin(corePlugin as unknown as PlugFn, { dbFile: dbFile() })
      await new Promise((r) => setImmediate(r))
      expect(ctx.get('forgeProjects'), '依赖缺席：不加载不注册').toBeUndefined()
      const disposeWs = ctx.reflect.provide('workspaceRegistry', registryStub())
      await fiber
      expect(ctx.get('forgeProjects'), '依赖就绪：加载并注册').toBeDefined()
      disposeWs()
    } finally {
      await ctx.fiber.dispose() // core 卸载关库（单句柄生命周期）
    }
  })

  it('双服务属性面：forgeProjects 五法 + forgeKnowledge 七法（Interface 1/2 全法在场）', async () => {
    const { ctx } = await bootRuntime()
    try {
      ctx.reflect.provide('workspaceRegistry', registryStub())
      await ctx.plugin(corePlugin as unknown as PlugFn, { dbFile: dbFile() })
      const projects = ctx.get('forgeProjects') as Record<string, unknown>
      for (const method of ['registerProject', 'listProjects', 'getProject', 'updateProject', 'reconcileAtStartup']) {
        expect(typeof projects[method], `forgeProjects.${method}`).toBe('function')
      }
      const knowledge = ctx.get('forgeKnowledge') as Record<string, unknown>
      for (const method of [
        'rebuildIndex',
        'search',
        'readAbstract',
        'listEntries',
        'getEntryDetail',
        'heatByEntry',
        'sessionRecall',
      ]) {
        expect(typeof knowledge[method], `forgeKnowledge.${method}`).toBe('function')
      }
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('inject 消费全链路：knowledge 插件注入三服务 → 两 tool 注册 + forge:knowledge 段入真实装配', async () => {
    const { ctx, sys, tools } = await bootRuntime()
    try {
      ctx.reflect.provide('workspaceRegistry', registryStub())
      await ctx.plugin(corePlugin as unknown as PlugFn, { dbFile: dbFile() })
      await ctx.plugin(knowledgePlugin as unknown as PlugFn, { projects: [] })
      expect(tools.registered.map((t) => t.name)).toEqual(['knowledge.search', 'knowledge.read-abstract'])
      const assembly = await sys.assemble()
      expect(assembly.sections.map((s) => s.name)).toContain('forge:knowledge')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('级联卸载：撤销 workspaceRegistry → core 卸载（服务注销+关库）→ 依赖者随之卸载（tool/段全清）', async () => {
    const { ctx, sys, tools } = await bootRuntime()
    try {
      const disposeWs = ctx.reflect.provide('workspaceRegistry', registryStub())
      await ctx.plugin(corePlugin as unknown as PlugFn, { dbFile: dbFile() })
      await ctx.plugin(knowledgePlugin as unknown as PlugFn, { projects: [] })
      expect(ctx.get('forgeProjects')).toBeDefined()
      disposeWs()
      // 官方语义：unregistered (waking dependents)——core fiber 卸载、双服务注销、knowledge 依赖失效卸载
      expect(
        await waitFor(() => ctx.get('forgeProjects') === undefined && ctx.get('forgeKnowledge') === undefined),
        '双服务级联注销',
      ).toBe(true)
      expect(await waitFor(() => tools.disposed.length === 2), 'tool 注册随 fiber 卸载全清').toBe(true)
      expect(
        await waitFor(() => sys.assemble().then((a) => !a.sections.some((s) => s.name === 'forge:knowledge'))),
        'forge:knowledge 段随插件卸载移除',
      ).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
