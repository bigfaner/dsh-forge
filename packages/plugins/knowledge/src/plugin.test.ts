// 插件装配单测（1.7 A2 服务切换后形态）：临时 Cordis runtime（结构化最小面假宿主）装配
// 插件（自持库显式 config.dbFile 指临时文件），验证 inject 面（零 core——仅 dsh 官方面）
// 与注册/provide/disposer 全生命周期。
// 假宿主语义锚定 Cordis：inject 声明的服务全部可提供才加载（service-availability）；
// register/section 各返回注销器（effect disposer 同型）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import knowledgePlugin, { KNOWLEDGE_SERVICE_NAME } from './index.js'
import { KNOWLEDGE_SECTION_NAME } from './prompt/index.js'
import type { KnowledgePromptSection, KnowledgeToolDefinition } from './tools/index.js'
import type { BrowseKnowledgeService } from './service/index.js'

// 自持存储自启的宿主环境锚摘除（hermetic）：本文件全部装配走显式 config.dbFile——
// 开发机 shell 携带 DSH_HOME/DSH_FORGE_TASKS_HOME 时避免缺省锚落盘真数据域。
const prevEnv = {
  DSH_HOME: process.env.DSH_HOME,
  DSH_FORGE_TASKS_HOME: process.env.DSH_FORGE_TASKS_HOME,
}
delete process.env.DSH_HOME
delete process.env.DSH_FORGE_TASKS_HOME
afterAll(() => {
  for (const [k, v] of Object.entries(prevEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

/** 临时 runtime：服务表 + 注册捕获 + provide 捕获 + disposer 记账 */
class TempRuntime {
  readonly registeredTools: KnowledgeToolDefinition[] = []
  readonly sections: KnowledgePromptSection[] = []
  readonly provided = new Map<string, unknown>()
  private readonly disposed = { tools: 0, sections: 0 }
  private readonly disposedServices: string[] = []
  private dir: string | undefined

  /** 自持库临时文件（每 ctx 独立——storage 自启开门） */
  dbFile(): string {
    this.dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-kn-plugin-'))
    return join(this.dir, 'knowledge.db')
  }

  ctx() {
    return {
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
      reflect: {
        get: () => undefined,
        provide: (name: string, service: unknown) => {
          this.provided.set(name, service)
          return () => {
            this.provided.delete(name)
            this.disposedServices.push(name)
          }
        },
      },
    }
  }

  disposedCounts() {
    return { ...this.disposed, services: [...this.disposedServices] }
  }

  cleanup() {
    if (this.dir !== undefined) rmSync(this.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
}

const runtimes: TempRuntime[] = []
afterAll(() => {
  for (const rt of runtimes) rt.cleanup()
})

function freshRt(): TempRuntime {
  const rt = new TempRuntime()
  runtimes.push(rt)
  return rt
}

/** Cordis inject 语义模拟：inject 声明的每个服务名都在 ctx 上才可加载 */
function injectSatisfied(plugin: { inject: readonly string[] }, ctx: object): boolean {
  return plugin.inject.every((name) => name in ctx && (ctx as Record<string, unknown>)[name] !== undefined)
}

describe('AC3 inject 面（零 core 依赖——A2 服务切换后仅 dsh 官方面）', () => {
  it("inject 声明 = ['tools', 'systemPrompt']——core 面（forgeKnowledge）已退役", () => {
    expect([...knowledgePlugin.inject].sort()).toEqual(['systemPrompt', 'tools'])
  })

  it('缺任一声明服务即不加载（Cordis service-availability 语义）；两服务齐备才装配', () => {
    const rt = freshRt()
    const full = rt.ctx()
    expect(injectSatisfied(knowledgePlugin, full)).toBe(true)
    for (const name of knowledgePlugin.inject) {
      const hole: Record<string, unknown> = { ...full }
      delete hole[name]
      expect(injectSatisfied(knowledgePlugin, hole)).toBe(false)
    }
  })
})

describe('AC1/AC2 装配：服务 provide + 六 tool 注册 + forge:knowledge 段注册', () => {
  it('默认装配（自持库 dbFile）：provide knowledge 服务（八法 + 写门三法）+ 六 tool + 段（name/order 500/文本三部分在场）', () => {
    const rt = freshRt()
    const dispose = knowledgePlugin(rt.ctx(), { dbFile: rt.dbFile() })
    const service = rt.provided.get(KNOWLEDGE_SERVICE_NAME) as BrowseKnowledgeService
    expect(service).toBeDefined()
    for (const method of ['rebuildIndex', 'search', 'readAbstract', 'listEntries', 'getEntryDetail', 'heatByEntry', 'sessionRecall', 'browse', 'write', 'read', 'confirm']) {
      expect(typeof (service as unknown as Record<string, unknown>)[method], `knowledge.${method}`).toBe('function')
    }
    expect(rt.registeredTools.map((t) => t.name).sort()).toEqual([
      'knowledge_merge',
      'knowledge_read',
      'knowledge_read_abstract',
      'knowledge_revert',
      'knowledge_search',
      'knowledge_write',
    ])
    expect(rt.sections).toHaveLength(1)
    const section = rt.sections[0]
    expect(section?.name).toBe(KNOWLEDGE_SECTION_NAME)
    expect(section?.name).toBe('forge:knowledge')
    expect(section?.order).toBe(500)
    expect(section?.text).toContain('Project knowledge base')
    expect(section?.text).toContain('knowledge_search')
    expect(section?.text).toContain('knowledge_read_abstract')
    expect(section?.text).toContain('knowledge_read')
    expect(section?.text).toContain('knowledge_write')
    expect(section?.text).toContain('knowledge_merge')
    expect(section?.text).toContain('knowledge_revert')
    dispose()
  })

  it('disposer 全注销（服务 provide + tool×6 + 段×1，各恰一次；自持库关闭）', () => {
    const rt = freshRt()
    const dispose = knowledgePlugin(rt.ctx(), { dbFile: rt.dbFile() })
    dispose()
    expect(rt.provided.size).toBe(0)
    expect(rt.disposedCounts()).toEqual({ tools: 6, sections: 1, services: [KNOWLEDGE_SERVICE_NAME, 'dirKeys.knowledge'] })
  })

  it('config.projects 绑定表进入解析链（装配缝消费验证——工具面 cwd→projectId）', async () => {
    const rt = freshRt()
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-bind-'))
    try {
      const wsDir = join(root, 'ws')
      const dispose = knowledgePlugin(rt.ctx(), {
        dbFile: rt.dbFile(),
        projects: [{ wsPath: wsDir, projectId: 'p-9' }],
      })
      const search = rt.registeredTools.find((t) => t.name === 'knowledge_search')
      // 绑定命中：解析出 p-9 注入服务 query（未注册项目 → 服务面 fail-loud，零命中面以桩路径验证）
      await expect(
        search?.execute({}, { agent: { session: { id: 's', header: { cwd: wsDir } } } }),
      ).rejects.toThrow(/项目不存在/)
      // 绑定缺席：同表下其它 cwd 拒绝
      await expect(
        search?.execute({}, { agent: { session: { id: 's', header: { cwd: join(root, 'other') } } } }),
      ).rejects.toThrow(/not bound/)
      dispose()
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('裸环境降级（锚缺席且无 dbFile）：fail-soft 零注册零 provide（不向 ~/.dsh 静默落盘）', () => {
    const rt = freshRt()
    const dispose = knowledgePlugin(rt.ctx())
    expect(rt.registeredTools).toHaveLength(0)
    expect(rt.sections).toHaveLength(0)
    expect(rt.provided.size).toBe(0)
    expect(() => dispose()).not.toThrow()
  })
})

describe('名形 pin（fix-19）：注册 tool 名全集匹配供应商工具名形', () => {
  it('全部注册 tool 名匹配 ^[a-zA-Z0-9_-]+$（OpenAI 兼容端点强校验名形——含官方件在场时亦然，防未来再犯）', () => {
    const rt = freshRt()
    // 官方件占位先行注册（dsh ToolRuntime 同场注册面——全集迭代断言不区分来源）
    rt.ctx().tools.register({ name: 'read_file' } as KnowledgeToolDefinition)
    const dispose = knowledgePlugin(rt.ctx(), { dbFile: rt.dbFile() })
    expect(rt.registeredTools.length, '官方占位 + 产品双 tool 同场').toBeGreaterThanOrEqual(3)
    for (const tool of rt.registeredTools) {
      // 点号等违例名形 = 严格校验端点（DeepSeek）逐请求 400、会话不可用——fix-19 回归锚
      expect(tool.name, `tool 名形违规（端点 400 面）：${tool.name}`).toMatch(/^[a-zA-Z0-9_-]+$/)
    }
    dispose()
  })
})
