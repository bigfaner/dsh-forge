// 3.4 单测 —— 插件装配（AC2/AC3 装配面）：临时 Cordis runtime（结构化最小面假宿主）
// 装配 core 桩 + 插件，验证 inject 面（实现Notes口径）与注册/disposer 全生命周期。
// 假宿主语义锚定 Cordis：inject 声明的服务全部可提供才加载（service-availability）；
// register/section 各返回注销器（effect disposer 同型）。
import { describe, expect, it } from 'vitest'
import type { KnowledgeService } from '@dsh-forge/contracts'
import knowledgePlugin from './index.js'
import { KNOWLEDGE_SECTION_NAME } from './prompt/index.js'
import type { KnowledgePromptSection, KnowledgeToolDefinition } from './tools/index.js'

/** 临时 runtime：服务表 + 注册捕获 + disposer 记账 */
class TempRuntime {
  readonly registeredTools: KnowledgeToolDefinition[] = []
  readonly sections: KnowledgePromptSection[] = []
  private readonly disposed = { tools: 0, sections: 0 }
  readonly knowledge: KnowledgeService = {} as KnowledgeService // 桩：装配面不触方法

  ctx() {
    return {
      forgeKnowledge: this.knowledge,
      tools: {
        register: (d: KnowledgeToolDefinition) => {
          this.registeredTools.push(d)
          return () => {
            this.disposed.tools += 1
          }
        },
      },
      systemPrompt: {
        section: (s: KnowledgePromptSection) => {
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

describe('AC3 inject 面（对 core 的唯一依赖 = forgeKnowledge 服务）', () => {
  it("inject 声明 = ['forgeKnowledge', 'tools', 'systemPrompt']——core 面仅 forgeKnowledge，其余为 dsh 官方面", () => {
    expect([...knowledgePlugin.inject].sort()).toEqual(['forgeKnowledge', 'systemPrompt', 'tools'])
  })

  it('缺任一声明服务即不加载（Cordis service-availability 语义）；三服务齐备才装配', () => {
    const rt = new TempRuntime()
    const full = rt.ctx()
    expect(injectSatisfied(knowledgePlugin, full)).toBe(true)
    for (const name of knowledgePlugin.inject) {
      const hole: Record<string, unknown> = { ...full }
      delete hole[name]
      expect(injectSatisfied(knowledgePlugin, hole)).toBe(false)
    }
  })
})

describe('AC1/AC2 装配：两 tool 注册 + forge:knowledge 段注册', () => {
  it('默认装配（无 config）：两 tool + 段（name/order 500/文本三部分在场）', () => {
    const rt = new TempRuntime()
    const dispose = knowledgePlugin(rt.ctx())
    expect(rt.registeredTools.map((t) => t.name).sort()).toEqual(['knowledge.read-abstract', 'knowledge.search'])
    expect(rt.sections).toHaveLength(1)
    const section = rt.sections[0]
    expect(section?.name).toBe(KNOWLEDGE_SECTION_NAME)
    expect(section?.name).toBe('forge:knowledge')
    expect(section?.order).toBe(500)
    expect(section?.text).toContain('Project knowledge base')
    expect(section?.text).toContain('knowledge.search')
    expect(section?.text).toContain('knowledge.read-abstract')
    dispose()
  })

  it('disposer 全注销（tool×2 + 段×1，各恰一次）', () => {
    const rt = new TempRuntime()
    const dispose = knowledgePlugin(rt.ctx())
    dispose()
    expect(rt.disposedCounts()).toEqual({ tools: 2, sections: 1 })
  })

  it('config.projects 绑定表进入解析链（装配缝消费验证）', async () => {
    const rt = new TempRuntime()
    let queried = ''
    const service = {
      search: async (q: { projectId: string }) => {
        queried = q.projectId
        return []
      },
    } as unknown as KnowledgeService
    const ctx = { ...rt.ctx(), forgeKnowledge: service }
    const dispose = knowledgePlugin(ctx, { projects: [{ wsPath: 'C:\\ws\\bound', projectId: 'p-9' }] })
    const search = rt.registeredTools.find((t) => t.name === 'knowledge.search')
    // 绑定命中：解析出 p-9 注入服务 query（空命中为桩返回）
    const hits = await search?.execute({}, { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\bound' } } } })
    expect(hits).toEqual([])
    expect(queried).toBe('p-9')
    // 绑定缺席：同表下其它 cwd 拒绝
    await expect(
      search?.execute({}, { agent: { session: { id: 's', header: { cwd: 'C:\\ws\\other' } } } }),
    ).rejects.toThrow(/not bound/)
    dispose()
  })
})
