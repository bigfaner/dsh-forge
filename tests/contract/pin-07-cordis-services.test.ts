// G1 pin ⑦（M1 批，任务 3.9）：Cordis 服务定义/注入模式——`ctx.forgeProjects` 属性面 +
// inject 消费（真实 cordis runtime 全链路自证）。
// 权威：tech-design Appendix 契约面清单第 7 项 + Overview 关键缝（Cordis 服务模式——
// workspaceRegistry/agentPresets 同型先例，进程内零 RPC）+ 上游公开面 `@deepseek-ai/cordis`
// （host 锚；dsh 0.2.0-rc.2 栈闭包解析版本 = 4.0.4，独立版本线精确 pin——漂移即红）。
// 我方镜像：packages/core/src/index.ts（forgeProjects provide——knowledge 域已随
// knowledge-stage1-foundation 1.8 退役，forgeKnowledge 面移除）+
// packages/plugins/knowledge/src/index.ts（自有 knowledge 服务 provide）。
// 同型先例 WorkspaceRegistry 的 Service 基类面已由 pin-04 锚定。
// Hard Rule：只 pin 上游公开面（cordis 导出 + 服务生命周期契约）+ 我方服务对官方面的
// 符合性（真实 runtime 装配，非结构化桩模拟——与 2.2/3.4 产品单测的桩面互补）。
// 分层：
//   ⑦-1 版本锚（cordis 独立版本线）
//   ⑦-2 官方面语义锚（registry/reflect/service d.ts：inject 门控 + provide 生命周期 + Service 注册径）
//   ⑦-3 运行期服务注入面（门控加载 → 属性面五法 → knowledge 插件消费 → 级联卸载）
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import corePlugin from '../../packages/core/src/index.js'
import knowledgePlugin from '../../packages/plugins/knowledge/src/index.js'
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

/** workspaceController 最小桩（fix-24 ②：官方 workspace/rename 命令窄面——core 双注入之二） */
function renameStub() {
  return { rename: async () => ({}) }
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
async function bootRuntime(): Promise<{ ctx: PluginCtxFace; sys: SystemPromptFace; tools: ReturnType<typeof toolCollector>; disposeTools: () => void }> {
  const cordis = await importUpstream('host', '@deepseek-ai/cordis')
  const sp = await importUpstream('host', '@deepseek-ai/dsh-system-prompt')
  const Ctx = cordis['Context'] as new () => PluginCtxFace
  const SystemPromptCtor = sp['SystemPrompt'] as new (ctx: PluginCtxFace, config: Record<string, never>) => SystemPromptFace
  const ctx = new Ctx()
  const sys = new SystemPromptCtor(ctx, {}) // 提供 systemPrompt 服务（官方 Service 注册径）
  const tools = toolCollector()
  const disposeTools = ctx.reflect.provide('tools', tools.face) // dsh 官方 tools 面占位（注册收集桩）
  return { ctx, sys, tools, disposeTools }
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

describe('pin ⑦-3 运行期服务注入面（真实 cordis + 真实 core/knowledge 插件 + 临时 SQLite）', () => {
  it('inject 门控：双依赖（fix-24 ② 后 registry+controller）任一缺席 core 不加载；双 provide 后加载（Plugin.Base 语义实跑）', async () => {
    const { ctx } = await bootRuntime()
    try {
      const fiber = ctx.plugin(corePlugin as unknown as PlugFn, { dbFile: dbFile() })
      await new Promise((r) => setImmediate(r))
      expect(ctx.get('forgeProjects'), '依赖缺席：不加载不注册').toBeUndefined()
      const disposeWs = ctx.reflect.provide('workspaceRegistry', registryStub())
      // 单就绪门：workspaceController 仍缺席（fix-24 ② 双注入——全可用才加载）
      expect(await waitFor(() => ctx.get('forgeProjects') !== undefined), '半依赖不加载').toBe(false)
      const disposeRn = ctx.reflect.provide('workspaceController', renameStub())
      await fiber
      expect(ctx.get('forgeProjects'), '依赖就绪：加载并注册').toBeDefined()
      disposeRn()
      disposeWs()
    } finally {
      await ctx.fiber.dispose() // core 卸载关库（单句柄生命周期）
    }
  })

  it('服务属性面：forgeProjects 五法（Interface 1 全法在场）；forgeKnowledge 已退役（1.8——零注册）', async () => {
    const { ctx } = await bootRuntime()
    try {
      ctx.reflect.provide('workspaceRegistry', registryStub())
      ctx.reflect.provide('workspaceController', renameStub())
      await ctx.plugin(corePlugin as unknown as PlugFn, { dbFile: dbFile() })
      const projects = ctx.get('forgeProjects') as Record<string, unknown>
      for (const method of ['registerProject', 'listProjects', 'getProject', 'updateProject', 'reconcileAtStartup']) {
        expect(typeof projects[method], `forgeProjects.${method}`).toBe('function')
      }
      expect(ctx.get('forgeKnowledge'), 'knowledge 域退役：core 零 forgeKnowledge 注册').toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('inject 消费全链路（1.7 A2 后形态：knowledge 零 core 依赖）：knowledge 插件注入两官方面 → 自有 knowledge 服务 provide + 六 tool 注册 + 提示词两段 scoped 接线（根级零全局段——stage③ 裁决 #9）', async () => {
    const { ctx, sys, tools } = await bootRuntime()
    try {
      ctx.reflect.provide('workspaceRegistry', registryStub())
      ctx.reflect.provide('workspaceController', renameStub())
      await ctx.plugin(corePlugin as unknown as PlugFn, { dbFile: dbFile() })
      await ctx.plugin(knowledgePlugin as unknown as PlugFn, { projects: [], dbFile: dbFile() })
      expect(ctx.get('knowledge'), 'knowledge 插件 provide 自有服务（去 forge 前缀）').toBeDefined()
      expect(tools.registered.map((t) => t.name)).toEqual([
        'knowledge_search',
        'knowledge_read_abstract',
        // stage② 1.4 写门双 tool（§2.3 读 + 写）
        'knowledge_write',
        'knowledge_read',
        // fix-评审2（裁决 #1 修订 2026-11-05）：merge/revert 开为 agent tool；
        // followups #1 重命名：knowledge_supersede / knowledge_reinstate
        'knowledge_supersede',
        'knowledge_reinstate',
      ])
      const assembly = await sys.assemble()
      // stage③ C2 裁决 #9：装配期零全局段——forge:knowledge 两段改走 agent/created
      // scoped 注册（绑定会话才注入）；根级装配面不出现（scoped 全链断言由
      // knowledge-isolated-profile-assembly 旅程承载）
      expect(assembly.sections.map((s) => s.name)).not.toContain('forge:knowledge')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('级联卸载（1.7 A2 后形态）：core 卸载不牵动 knowledge（零依赖独立性——SC-2）；knowledge 依赖失效自卸 = 服务注销 + tool/段全清', async () => {
    const { ctx, sys, tools, disposeTools } = await bootRuntime()
    try {
      const disposeWs = ctx.reflect.provide('workspaceRegistry', registryStub())
      ctx.reflect.provide('workspaceController', renameStub())
      await ctx.plugin(corePlugin as unknown as PlugFn, { dbFile: dbFile() })
      await ctx.plugin(knowledgePlugin as unknown as PlugFn, { projects: [], dbFile: dbFile() })
      expect(ctx.get('forgeProjects')).toBeDefined()
      disposeWs()
      // 官方语义：unregistered (waking dependents)——core fiber 卸载、core 服务注销；
      // knowledge 零 core 依赖（1.7 A2）——独立存活，服务/tool/段不受牵动
      expect(
        await waitFor(() => ctx.get('forgeProjects') === undefined),
        'core 服务级联注销',
      ).toBe(true)
      expect(ctx.get('knowledge'), 'knowledge 独立于 core（SC-2）').toBeDefined()
      expect(tools.registered).toHaveLength(6)
      // knowledge 依赖面 = dsh 官方面（tools）——撤销 tools 即依赖失效自卸（官方 waking dependents 语义）
      disposeTools()
      expect(await waitFor(() => ctx.get('knowledge') === undefined), 'knowledge 服务随 fiber 卸载注销').toBe(true)
      expect(await waitFor(() => tools.disposed.length === 6), 'tool 注册随 fiber 卸载全清').toBe(true)
      expect(
        await waitFor(() => sys.assemble().then((a) => !a.sections.some((s) => s.name === 'forge:knowledge'))),
        'forge:knowledge 段随插件卸载移除',
      ).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
