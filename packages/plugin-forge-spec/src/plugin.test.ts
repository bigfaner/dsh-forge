// 3.1 单测 —— 插件装配（AC1 导出面 / AC5 faces 注入面 + 注册面 + 段注册）：
// 临时 Cordis runtime（结构化最小面假宿主，plugin-forge plugin.test 同型）装配
// 双 core 服务桩 + 插件，验证 inject 声明（forgeTasks 为 validateFeatureTasks 只读
// 校验面在场——Interface 1「签名不变」钉在任务域服务，Layer Placement inject 简写
// 的勘正）、注册/disposer 全生命周期与 forge:spec 段（name/order/text）。
import { describe, expect, it } from 'vitest'
import type { ForgeFeaturesService, ForgeTasksService, RegisterFeatureInput } from '@dsh-forge/contracts'
import forgeSpecPlugin from './index.js'
import { FORGE_SPEC_TOOL_NAMES } from './tools/index.js'
import { SPEC_SECTION_NAME } from './prompt/index.js'
import type { ForgePromptSection, ForgeToolDefinition } from './tools/index.js'

/** 临时 runtime：服务表 + 注册捕获 + disposer 记账 */
class TempRuntime {
  readonly registeredTools: ForgeToolDefinition[] = []
  readonly sections: ForgePromptSection[] = []
  private readonly disposed = { tools: 0, sections: 0 }

  ctx() {
    return {
      forgeFeatures: {} as ForgeFeaturesService, // 桩：装配面不触方法
      forgeTasks: {} as ForgeTasksService,
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

describe('AC5 faces 注入面（对 core 的依赖 = forgeFeatures + forgeTasks 双服务）', () => {
  it("inject 声明 = ['forgeFeatures', 'forgeTasks', 'tools', 'systemPrompt']——core 面两域服务，其余为 dsh 官方面", () => {
    // forgeTasks = validateFeatureTasks 只读校验面（Interface 1 签名不变——钉在任务域）
    expect([...forgeSpecPlugin.inject].sort()).toEqual(['forgeFeatures', 'forgeTasks', 'systemPrompt', 'tools'])
  })

  it('缺任一声明服务即不加载（Cordis service-availability 语义）；四服务齐备才装配', () => {
    const rt = new TempRuntime()
    const full = rt.ctx()
    expect(injectSatisfied(forgeSpecPlugin, full)).toBe(true)
    for (const name of forgeSpecPlugin.inject) {
      const hole: Record<string, unknown> = { ...full }
      delete hole[name]
      expect(injectSatisfied(forgeSpecPlugin, hole), `缺 ${name} 应不加载`).toBe(false)
    }
  })
})

describe('AC1/AC5 注册面：三 tool（名 = 动词透传）+ transitionFeature 缺席（人类纠偏面）', () => {
  it('三 tool 注册且名 = 列序全集（FORGE_SPEC_TOOL_NAMES 单源——5.1 pin #18 两包分置的 spec 侧）', () => {
    const rt = new TempRuntime()
    const dispose = forgeSpecPlugin(rt.ctx())
    expect(rt.registeredTools.map((t) => t.name)).toEqual([...FORGE_SPEC_TOOL_NAMES])
    dispose()
  })

  it('transitionFeature 不注册（裁决②收窄——人类纠偏面；plugin-forge 侧 G1-11 pin 同锚）', () => {
    const rt = new TempRuntime()
    const dispose = forgeSpecPlugin(rt.ctx())
    const names = rt.registeredTools.map((t) => t.name)
    expect(names).not.toContain('transitionFeature')
    expect(names).not.toContain('transitionTask')
    dispose()
  })

  it('每 tool 形状齐备：description / object 根 parameters / output schema+render / execute', () => {
    const rt = new TempRuntime()
    const dispose = forgeSpecPlugin(rt.ctx())
    expect(rt.registeredTools).toHaveLength(3)
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

  it('tool 名形 pin（OpenAI 兼容端点强校验名形）：^[a-zA-Z0-9_-]+$', () => {
    const rt = new TempRuntime()
    const dispose = forgeSpecPlugin(rt.ctx())
    for (const tool of rt.registeredTools) {
      expect(tool.name, `tool 名形违规（端点 400 面）：${tool.name}`).toMatch(/^[a-zA-Z0-9_-]+$/)
    }
    dispose()
  })

  it('config 装配缝消费：config.projects 进入解析链（绑定命中 → 解析 projectId 注入服务调用）', async () => {
    const rt = new TempRuntime()
    let routed: string | undefined
    const features = {
      registerFeature: async (input: RegisterFeatureInput) => {
        routed = input.projectId
        return {
          featureId: 'f-1',
          slug: input.slug,
          title: input.title,
          featureStatus: 'prd',
          createdAt: '2026-10-08T00:00:00.000Z',
          updatedAt: '2026-10-08T00:00:00.000Z',
        }
      },
    } as unknown as ForgeFeaturesService
    const ctx = { ...rt.ctx(), forgeFeatures: features }
    const dispose = forgeSpecPlugin(ctx, { projects: [{ wsPath: 'C:\\ws\\bound', projectId: 'p-9' }] })
    const register = rt.registeredTools.find((t) => t.name === 'registerFeature')
    const exec = { agent: { session: { id: 's1', header: { cwd: 'C:\\ws\\bound' } } } }
    await register?.execute({ slug: 'feat-a', title: 'T' }, exec)
    expect(routed).toBe('p-9')
    // 绑定缺席：同表下其它 cwd → typed 拒（ERR_WORKSPACE_NOT_REGISTERED）
    await expect(
      register?.execute({ slug: 'feat-a', title: 'T' }, { agent: { session: { id: 's1', header: { cwd: 'C:\\ws\\other' } } } }),
    ).rejects.toThrow(/not bound to a registered project/)
    dispose()
  })
})

describe('AC5 段注册（forge:spec / order 520）', () => {
  it('默认装配：一段（name/order/text 三件在场）——knowledge 500 → pipeline 510 之后', () => {
    const rt = new TempRuntime()
    const dispose = forgeSpecPlugin(rt.ctx())
    expect(rt.sections).toHaveLength(1)
    const section = rt.sections[0]
    expect(section?.name).toBe(SPEC_SECTION_NAME)
    expect(section?.name).toBe('forge:spec')
    expect(section?.order).toBe(520)
    expect(section?.text).toContain('Forge spec chain')
    dispose()
  })

  it('disposer 全注销（tool×3 + 段×1，各恰一次）', () => {
    const rt = new TempRuntime()
    const dispose = forgeSpecPlugin(rt.ctx())
    dispose()
    expect(rt.disposedCounts()).toEqual({ tools: 3, sections: 1 })
  })
})
