// 3.4/3.5 单测 —— 插件装配（AC1 inject 面（3.4 增 forgeProjects——事件日志落位目录
// 单源派生；forgeSettings 可选消费不走 inject）/ 注册面集合 pin（M3 终态六 tool——
// dispatchTask 3.4 补位成六；新面 pin = 5.1 #17/#18）/ 参数 schema pin（容器双参 +
// 旧参删除机械断言）/ AC5 段注册）：临时 Cordis runtime（结构化最小面假宿主，
// knowledge plugin.test 同型）装配 core 服务桩 + 插件，验证 inject 声明、注册/disposer
// 全生命周期与 forge:pipeline 段。
import { describe, expect, it } from 'vitest'
import type { ForgeProposalsService, ForgeTasksService, ProjectServiceM2 } from '@dsh-forge/contracts'
import forgePlugin from './index.js'
import { createForgeTools, FORGE_TOOL_NAMES } from './tools/index.js'
import { FORGE_SECTION_NAME } from './prompt/index.js'
import type { ForgePromptSection, ForgeToolDefinition } from './tools/index.js'

/** 临时 runtime：服务表 + 注册捕获 + disposer 记账 */
class TempRuntime {
  readonly registeredTools: ForgeToolDefinition[] = []
  readonly sections: ForgePromptSection[] = []
  private readonly disposed = { tools: 0, sections: 0 }

  ctx() {
    return {
      forgeTasks: {} as ForgeTasksService, // 桩：装配面不触方法
      forgeProposals: {} as ForgeProposalsService,
      forgeProjects: {
        deriveTaskStoreDir: async () => ({ dir: 'D:/containers/demo@abcd1234' }),
      } as Pick<ProjectServiceM2, 'deriveTaskStoreDir'> as ProjectServiceM2,
      tools: {
        register: (d: ForgeToolDefinition) => {
          this.registeredTools.push(d)
          return () => {
            this.disposed.tools += 1
          }
        },
      },
      systemPrompt: {
        section: (s: ForgePromptSection) => {
          this.sections.push(s)
          return () => {
            this.disposed.sections += 1
          }
        },
      },
    }
  }

  disposedCounts() {
    return { ...this.disposed }
  }
}

/** Cordis inject 语义模拟：inject 声明的每个服务名都在 ctx 上才可加载 */
function injectSatisfied(plugin: { inject: readonly string[] }, ctx: object): boolean {
  return plugin.inject.every((name) => name in ctx && (ctx as Record<string, unknown>)[name] !== undefined)
}

describe('AC1 inject 面（对 core 的依赖 = forgeTasks + forgeProposals + forgeProjects 三服务）', () => {
  it("inject 声明 = ['forgeTasks', 'forgeProposals', 'forgeProjects', 'tools', 'systemPrompt']——core 面三域服务（3.4 增 forgeProjects），其余为 dsh 官方面", () => {
    expect([...forgePlugin.inject].sort()).toEqual(['forgeProjects', 'forgeProposals', 'forgeTasks', 'systemPrompt', 'tools'])
  })

  it('缺任一声明服务即不加载（Cordis service-availability 语义）；五服务齐备才装配', () => {
    const rt = new TempRuntime()
    const full = rt.ctx()
    expect(injectSatisfied(forgePlugin, full)).toBe(true)
    for (const name of forgePlugin.inject) {
      const hole: Record<string, unknown> = { ...full }
      delete hole[name]
      expect(injectSatisfied(forgePlugin, hole), `缺 ${name} 应不加载`).toBe(false)
    }
  })
})

describe('注册面集合 pin（M3 终态六 tool：3.4 切片六在场 / 缺席面改写）', () => {
  it('六 tool 注册且名 = Interface 4 列序（FORGE_TOOL_NAMES 单源——dispatchTask 3.4 补位成六）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    expect(rt.registeredTools.map((t) => t.name)).toEqual([...FORGE_TOOL_NAMES])
    expect([...FORGE_TOOL_NAMES]).toEqual([
      'addTask',
      'submitTask',
      'queryTask',
      'createProposal',
      'transitionProposal',
      'dispatchTask',
    ])
    dispose()
  })

  it('缺席面（M2 G1-11「两缺席」随之改写——drift #1）：transitionTask / transitionFeature / claimTask / setProposalMode 不注册', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    const names = rt.registeredTools.map((t) => t.name)
    expect(names).not.toContain('transitionTask')
    expect(names).not.toContain('transitionFeature')
    // claimTask tool 退役（3.5·drift #1）：并入 dispatchTask 复合动词（3.4 落地），
    // core 服务 API 保留（dispatchTask/桥/回放消费）——tool 面不再注册
    expect(names).not.toContain('claimTask')
    // 模式改写唯一正门 = setProposalMode RPC（UI 专属）——agent tool 面无此动词（SC6）
    expect(names).not.toContain('setProposalMode')
    // 面分治反向注记：提案域 transitionProposal 在册（Interface 4 双面动词）
    expect(names).toContain('transitionProposal')
    dispose()
  })

  it('每 tool 形状齐备：description / object 根 parameters / output schema+render / execute', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    expect(rt.registeredTools).toHaveLength(6)
    for (const tool of rt.registeredTools) {
      expect(tool.description.length, `${tool.name} description`).toBeGreaterThan(20)
      expect(tool.parameters.type).toBe('object')
      expect(Object.keys(tool.parameters.properties).length).toBeGreaterThan(0)
      expect(tool.output.schema).toBeDefined()
      expect(typeof tool.output.render).toBe('function')
      expect(typeof tool.execute).toBe('function')
    }
    dispose()
  })

  it('参数 schema pin：容器双参（addTask source_kind/source_slug 必填、feature_slug 旧参删除）+ mode/superseded_by 新参在场', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    const byName = new Map(rt.registeredTools.map((t) => [t.name, t]))
    const addTask = byName.get('addTask')
    // 容器化迁移（旧参删除——feature_slug 不在参数面）
    expect(addTask?.parameters.properties).not.toHaveProperty('feature_slug')
    expect(addTask?.parameters.properties).toHaveProperty('source_kind')
    expect(addTask?.parameters.properties).toHaveProperty('source_slug')
    expect(addTask?.parameters.required).toEqual(['source_kind', 'source_slug', 'title', 'type'])
    // createProposal mode 透传 / transitionProposal superseded_by 透传
    expect(byName.get('createProposal')?.parameters.properties).toHaveProperty('mode')
    expect(byName.get('transitionProposal')?.parameters.properties).toHaveProperty('superseded_by')
    // 任务定位两显式参口径
    expect(byName.get('submitTask')?.parameters.required).toEqual(['slug', 'local_id', 'result'])
    expect(byName.get('queryTask')?.parameters.required).toEqual(['slug', 'local_id'])
    dispose()
  })

  it('输出面双支 pin（裁决⑨）：每 tool output.schema = oneOf [成功, 失败 DTO]（失败支四键 required）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    for (const tool of rt.registeredTools) {
      const schema = tool.output.schema as { oneOf?: { required?: readonly string[] }[] }
      expect(Array.isArray(schema.oneOf), `${tool.name} 输出面应为成功/失败双支`).toBe(true)
      expect(schema.oneOf?.[1]?.required).toEqual(['ok', 'code', 'message', 'violations'])
    }
    dispose()
  })

  it('tool 名形 pin（fix-19 同锚）：^[a-zA-Z0-9_-]+$（OpenAI 兼容端点强校验名形）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    for (const tool of rt.registeredTools) {
      expect(tool.name, `tool 名形违规（端点 400 面）：${tool.name}`).toMatch(/^[a-zA-Z0-9_-]+$/)
    }
    dispose()
  })

  it('config 装配缝消费：config.projects 进入解析链（绑定命中 → 解析 projectId 注入服务调用）', async () => {
    const rt = new TempRuntime()
    let routed: string | undefined
    const tasks = {
      queryTask: async (input: { projectId: string }) => {
        routed = input.projectId
        return {
          task: {
            taskId: 't',
            slug: 'f',
            localId: '1',
            source: { kind: 'feature', slug: 'f' },
            title: 'T',
            taskType: 'doc',
            taskStatus: 'pending',
            breaking: false,
            complexity: 'low',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          container: { kind: 'feature', slug: 'f', title: 'F' },
        }
      },
    } as unknown as ForgeTasksService
    const ctx = { ...rt.ctx(), forgeTasks: tasks }
    const dispose = forgePlugin(ctx, { projects: [{ wsPath: 'C:\\ws\\bound', projectId: 'p-9' }] })
    const query = rt.registeredTools.find((t) => t.name === 'queryTask')
    const exec = { agent: { session: { id: 's1', header: { cwd: 'C:\\ws\\bound' } } } }
    await query?.execute({ slug: 'f', local_id: '1' }, exec)
    expect(routed).toBe('p-9')
    // 绑定缺席：同表下其它 cwd → typed 拒转失败 DTO（ERR_WORKSPACE_NOT_REGISTERED——formatErr 面）
    const out = await query?.execute({ slug: 'f', local_id: '1' }, { agent: { session: { id: 's1', header: { cwd: 'C:\\ws\\other' } } } })
    expect(out).toMatchObject({ ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED' })
    dispose()
  })
})

describe('AC5 段注册（forge:pipeline / order 510）', () => {
  it('默认装配：一段（name/order/text 三件在场）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    expect(rt.sections).toHaveLength(1)
    const section = rt.sections[0]
    expect(section?.name).toBe(FORGE_SECTION_NAME)
    expect(section?.name).toBe('forge:pipeline')
    expect(section?.order).toBe(510)
    expect(section?.text).toContain('forge-pipeline')
    dispose()
  })

  it('disposer 全注销（tool×6 + 段×1，各恰一次）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    dispose()
    expect(rt.disposedCounts()).toEqual({ tools: 6, sections: 1 })
  })
})

describe('createForgeTools 直装配（工厂面——注册器之外的单源消费）', () => {
  it('deps 注入即得六 tool 定义组（键 = FORGE_TOOL_NAMES 列序；spawn 必给）', () => {
    const tools = createForgeTools({
      tasks: {} as ForgeTasksService,
      proposals: {} as ForgeProposalsService,
      resolveProjectId: () => undefined,
      spawn: async () => {
        throw new Error('not reached')
      },
    })
    expect(Object.keys(tools)).toEqual([...FORGE_TOOL_NAMES])
  })
})


// ─────────────────────────── 3.4 forgeSettings 可选消费（reflect.get 防御读取） ───────────────────────────

describe('forgeSettings 可选消费（cordis 4.0.4 无 "?" 可选 inject——reflect.get 降级读取）', () => {
  it('reflect 在场返回 get 函数对象：插件照常装配（settings 面进入 deps）', () => {
    const rt = new TempRuntime()
    const ctx = {
      ...rt.ctx(),
      reflect: { get: (name: string) => (name === 'forgeSettings' ? { get: async () => ({}) } : undefined) },
    }
    const dispose = forgePlugin(ctx)
    expect(rt.registeredTools).toHaveLength(6)
    dispose()
  })

  it('reflect.get 抛异常 / 返回非函数面：降级缺席不阻载（六 tool 照常注册）', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin({ ...rt1.ctx(), reflect: { get: () => { throw new Error('inactive fiber') } } })
    expect(rt1.registeredTools).toHaveLength(6)
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin({ ...rt2.ctx(), reflect: { get: () => 'not-a-service' } })
    expect(rt2.registeredTools).toHaveLength(6)
    d2()
  })
})
