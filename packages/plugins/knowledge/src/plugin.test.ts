// 插件装配单测（1.7 A2 服务切换后形态）：临时 Cordis runtime（结构化最小面假宿主）装配
// 插件（自持库显式 config.dbFile 指临时文件），验证 inject 面（零 core——仅 dsh 官方面）
// 与注册/provide/disposer 全生命周期。
// 假宿主语义锚定 Cordis：inject 声明的服务全部可提供才加载（service-availability）；
// register/section 各返回注销器（effect disposer 同型）。
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import knowledgePlugin, { KNOWLEDGE_SERVICE_NAME } from './index.js'
import type { KnowledgePromptSection, KnowledgeToolDefinition, ScopedAgentFace } from './tools/index.js'
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

/** 临时 runtime：服务表 + 注册捕获 + provide 捕获 + disposer 记账（stage③ C2：全局段注册退役——段改走 agent/created scoped 接线） */
class TempRuntime {
  readonly registeredTools: KnowledgeToolDefinition[] = []
  readonly sections: KnowledgePromptSection[] = []
  readonly provided = new Map<string, unknown>()
  readonly agentHandlers: Array<(payload: { agent: ScopedAgentFace }) => unknown> = []
  private readonly disposed = { tools: 0, sections: 0, listeners: 0 }
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
      on: (_event: 'agent/created', handler: (payload: { agent: ScopedAgentFace }) => unknown) => {
        this.agentHandlers.push(handler)
        return () => {
          this.disposed.listeners += 1
        }
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

describe('AC1/AC2 装配：服务 provide + 六 tool 注册 + scoped 提示词接线（stage③ C2）', () => {
  it('默认装配（自持库 dbFile）：provide knowledge 服务（八法 + 写门三法）+ 六 tool + agent/created 订阅；全局段注册退役（根 scope 零 section）', () => {
    const rt = freshRt()
    const dispose = knowledgePlugin(rt.ctx(), { dbFile: rt.dbFile() })
    const service = rt.provided.get(KNOWLEDGE_SERVICE_NAME) as BrowseKnowledgeService
    expect(service).toBeDefined()
    for (const method of ['rebuildIndex', 'search', 'readAbstract', 'listEntries', 'getEntryDetail', 'heatByEntry', 'sessionRecall', 'browse', 'browseDomains', 'write', 'read', 'confirm']) {
      expect(typeof (service as unknown as Record<string, unknown>)[method], `knowledge.${method}`).toBe('function')
    }
    expect(rt.registeredTools.map((t) => t.name).sort()).toEqual([
      'knowledge_browse',
      'knowledge_read',
      'knowledge_read_abstract',
      'knowledge_reinstate',
      'knowledge_search',
      'knowledge_supersede',
      'knowledge_write',
    ])
    expect(rt.sections).toHaveLength(0) // 全局段退役——两段改走会话 scope
    expect(rt.agentHandlers).toHaveLength(1) // agent/created 订阅在场（scoped 接线）
    dispose()
  })

  it('scoped 接线两态：绑定会话（cwd 命中绑定行 + 注册库在场）在该会话 scope 注册两段 910/911；未绑定会话零注册', async () => {
    const rt = freshRt()
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-scoped-'))
    try {
      const wsDir = join(root, 'ws')
      mkdirSync(join(wsDir, '.knowledge'), { recursive: true })
      const dispose = knowledgePlugin(rt.ctx(), {
        dbFile: rt.dbFile(),
        projects: [{ wsPath: wsDir, projectId: 'p-5' }],
      })
      // 注册行落自持注册表（服务面写径——插件装配库同文件同连接）
      const service = rt.provided.get(KNOWLEDGE_SERVICE_NAME) as {
        registerProject(q: { wsPath: string; projectId: string }): Promise<unknown>
      }
      await service.registerProject({ wsPath: wsDir, projectId: 'p-5' })
      const fire = (cwd: string | undefined): KnowledgePromptSection[] => {
        const sections: KnowledgePromptSection[] = []
        const agent = {
          session: { id: 's', ...(cwd === undefined ? {} : { header: { cwd } }) },
          ctx: { systemPrompt: { section: (s: KnowledgePromptSection) => (sections.push(s), () => undefined) } },
        }
        for (const h of rt.agentHandlers) h({ agent })
        return sections
      }
      // 绑定 + 注册库在场 → 两段
      const bound = fire(wsDir)
      expect(bound.map((s) => s.name)).toEqual(['forge:knowledge', 'forge:knowledge-domains'])
      expect(bound[0]?.order).toBe(910)
      expect(bound[1]?.order).toBe(911)
      expect((bound[0]!.text as () => string)()).toContain('<knowledge-base>')
      expect((bound[0]!.text as () => string)()).not.toContain('knowledge_write') // 写入面零工具说明（检索面指针行豁免）
      expect((bound[0]!.text as () => string)()).not.toContain('knowledge_supersede')
      // 未绑定 cwd → 零注册
      expect(fire(join(root, 'other'))).toEqual([])
      // 无 cwd → 零注册
      expect(fire(undefined)).toEqual([])
      dispose()
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('disposer 全注销（服务 provide + tool×7 + agent/created 订阅×1，各恰一次；自持库关闭）', () => {
    const rt = freshRt()
    const dispose = knowledgePlugin(rt.ctx(), { dbFile: rt.dbFile() })
    dispose()
    expect(rt.provided.size).toBe(0)
    expect(rt.disposedCounts()).toEqual({ tools: 7, sections: 0, listeners: 1, services: [KNOWLEDGE_SERVICE_NAME, 'dirKeys.knowledge'] })
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

  it('注册表行回退径（bug：Q19 退役 config.projects 注入后一级解析恒空）：config 零绑定、注册行在场 → 工具面 cwd→projectId 经注册表解析，非 not bound', async () => {
    const rt = freshRt()
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-regfb-'))
    try {
      const wsDir = join(root, 'ws')
      mkdirSync(wsDir, { recursive: true })
      const dispose = knowledgePlugin(rt.ctx(), { dbFile: rt.dbFile() }) // 零 config.projects
      const service = rt.provided.get(KNOWLEDGE_SERVICE_NAME) as {
        registerProject(q: { wsPath: string; projectId: string }): Promise<unknown>
      }
      await service.registerProject({ wsPath: wsDir, projectId: 'p-reg' }) // 注册行唯一写径（host 回填径同型）
      const search = rt.registeredTools.find((t) => t.name === 'knowledge_search')
      // cwd 命中注册行 → 解析出 p-reg 注入服务（空知识库零命中、不抛 not bound）
      const result = (await search?.execute({}, { agent: { session: { id: 's', header: { cwd: wsDir } } } })) as {
        content?: string
      }
      expect(result).toBeDefined()
      expect(JSON.stringify(result)).not.toContain('not bound')
      // 注册行缺席的 cwd 仍 not bound（失败口径不变）
      await expect(
        search?.execute({}, { agent: { session: { id: 's', header: { cwd: join(root, 'other') } } } }),
      ).rejects.toThrow(/not bound/)
      dispose()
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('服务面反向解析同获注册表回退径（projectId→wsPath 两级解析第二级）：config 零绑定、注册行在场 → sessionRecall 可用', async () => {
    const rt = freshRt()
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-regfb2-'))
    try {
      const wsDir = join(root, 'ws')
      mkdirSync(join(wsDir, '.knowledge'), { recursive: true })
      const dispose = knowledgePlugin(rt.ctx(), { dbFile: rt.dbFile() })
      const service = rt.provided.get(KNOWLEDGE_SERVICE_NAME) as {
        registerProject(q: { wsPath: string; projectId: string }): Promise<unknown>
        sessionRecall(q: { projectId: string }): Promise<unknown>
      }
      await service.registerProject({ wsPath: wsDir, projectId: 'p-reg2' })
      // projectId → wsPath 解析命中注册行（回退前恒 undefined → 项目不存在）
      await expect(service.sessionRecall({ projectId: 'p-reg2' })).resolves.toBeDefined()
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
