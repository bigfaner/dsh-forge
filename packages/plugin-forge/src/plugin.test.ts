// 3.2 单测 —— 插件装配（AC1 inject 面 / AC2 六 tool 注册 / AC3 G1-11 pin 六在场两缺席 /
// AC5 段注册）：临时 Cordis runtime（结构化最小面假宿主，knowledge plugin.test 同型）
// 装配双 core 服务桩 + 插件，验证 inject 声明、注册/disposer 全生命周期与
// forge:pipeline 段（name/order/text）。
import { describe, expect, it } from 'vitest'
import type { ForgeProposalsService, ForgeTasksService } from '@dsh-forge/contracts'
import forgePlugin from './index.js'
import { FORGE_TOOL_NAMES } from './tools/index.js'
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

describe('AC1 inject 面（对 core 的依赖 = forgeTasks + forgeProposals 双服务）', () => {
  it("inject 声明 = ['forgeTasks', 'forgeProposals', 'tools', 'systemPrompt']——core 面两域服务，其余为 dsh 官方面", () => {
    expect([...forgePlugin.inject].sort()).toEqual(['forgeProposals', 'forgeTasks', 'systemPrompt', 'tools'])
  })

  it('缺任一声明服务即不加载（Cordis service-availability 语义）；四服务齐备才装配', () => {
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

describe('AC2/AC3 注册面：六 tool（名 = 动词透传）+ 两缺席（SC7 代码审计 + G1-11 pin）', () => {
  it('六 tool 注册且名 = Interface 8 列序全集（FORGE_TOOL_NAMES 单源）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    expect(rt.registeredTools.map((t) => t.name)).toEqual([...FORGE_TOOL_NAMES])
    dispose()
  })

  it('G1-11 pin：transitionTask / transitionFeature 不注册（人类通道专属——交互四面分治）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    const names = rt.registeredTools.map((t) => t.name)
    expect(names).not.toContain('transitionTask')
    expect(names).not.toContain('transitionFeature')
    // 面分治反向注记：提案域 transitionProposal 在册（Interface 8 六动词列明）
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
      claimTask: async (input: { projectId: string; sessionId: string }) => {
        routed = input.projectId
        return { task: null, dispatchPrompt: '', digest: '', reclaimed: false }
      },
    } as unknown as ForgeTasksService
    const ctx = { ...rt.ctx(), forgeTasks: tasks }
    const dispose = forgePlugin(ctx, { projects: [{ wsPath: 'C:\\ws\\bound', projectId: 'p-9' }] })
    const claim = rt.registeredTools.find((t) => t.name === 'claimTask')
    const exec = { agent: { session: { id: 's1', header: { cwd: 'C:\\ws\\bound' } } } }
    await claim?.execute({}, exec)
    expect(routed).toBe('p-9')
    // 绑定缺席：同表下其它 cwd → typed 拒（ERR_WORKSPACE_NOT_REGISTERED）
    await expect(
      claim?.execute({}, { agent: { session: { id: 's1', header: { cwd: 'C:\\ws\\other' } } } }),
    ).rejects.toThrow(/not bound to a registered project/)
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
