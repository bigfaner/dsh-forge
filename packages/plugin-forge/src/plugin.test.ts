// 3.4/3.5 单测 —— 插件装配（AC1 inject 面（3.4 增 forgeProjects——事件日志落位目录
// 单源派生；forgeSettings 可选消费不走 inject）/ 注册面集合 pin（M3 终态六 tool——
// dispatchTask 3.4 补位成六；新面 pin = 5.1 #17/#18）/ 参数 schema pin（容器双参 +
// 旧参删除机械断言）/ AC5 段注册）：临时 Cordis runtime（结构化最小面假宿主，
// knowledge plugin.test 同型）装配 core 服务桩 + 插件，验证 inject 声明、注册/disposer
// 全生命周期与 forge:pipeline 段。
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, beforeEach, expect, it, vi } from 'vitest'
import type { ForgeProposalsService, ForgeTasksService, ProjectServiceM2 } from '@dsh-forge/contracts'
import forgePlugin, { _resetExpertResolverSingletonForTests } from './index.js'
import { createExpertProfileResolver, FORGE_EXPERTS_ROOT_DIR } from './faces.js'
import type { ExpertProfileResolver } from './faces.js'
import { FORGE_COMMAND_NAMES } from './commands/index.js'
import type { ForgeCommandDefinition, ForgeEventRegisterFace } from './faces.js'
import { createForgeTools, FORGE_TOOL_NAMES } from './tools/index.js'
import { createLoopRegistry } from './loop/index.js'
import { FORGE_SECTION_NAME } from './prompt/index.js'
import type { ForgePromptSection, ForgeToolDefinition, ForgeToolDeps } from './tools/index.js'

/** 容器目录桩值（平台无关绝对路径——#61：'D:/...' 盘符拼写 POSIX 下为相对路径，
 *  log-listener isAbsolute 守卫丢行；Windows 侧则写真实 D: 盘根。tmpdir 锚定各平台安全） */
const DEMO_CONTAINER_DIR = join(tmpdir(), 'dsh-forge-containers', 'demo@abcd1234')

/** 临时 runtime：服务表 + 注册捕获 + disposer 记账 */
class TempRuntime {
  readonly registeredTools: ForgeToolDefinition[] = []
  readonly sections: ForgePromptSection[] = []
  readonly registeredCommands: ForgeCommandDefinition[] = []
  private readonly disposed = { tools: 0, sections: 0 }
  disposedCommands = 0
  disposedProjection = 0

  ctx() {
    return {
      forgeTasks: {} as ForgeTasksService, // 桩：装配面不触方法
      forgeProposals: {} as ForgeProposalsService,
      forgeBugs: {} as ForgeToolDeps['bugs'], // 桩：装配面不触方法
      forgeCheckpoints: {} as ForgeToolDeps['checkpoints'], // 桩：装配面不触方法（机械⑥）
      forgeProjects: {
        deriveTaskStoreDir: async () => ({ dir: DEMO_CONTAINER_DIR }),
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

  /** reflect 桩（S2 指令注册面——commands 经 reflect.get 防御读取） */
  withReflect(services: Record<string, unknown>) {
    return { ...this.ctx(), reflect: { get: (name: string) => services[name] } }
  }

  commandsFace() {
    return {
      register: (d: ForgeCommandDefinition) => {
        this.registeredCommands.push(d)
        return () => {
          this.disposedCommands += 1
        }
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
  it("inject 声明 = ['forgeTasks', 'forgeProposals', 'forgeBugs', 'forgeProjects', 'tools', 'systemPrompt']——core 面四域服务（fix-bug 增 forgeBugs），其余为 dsh 官方面", () => {
    expect([...forgePlugin.inject].sort()).toEqual(['forgeBugs', 'forgeCheckpoints', 'forgeProjects', 'forgeProposals', 'forgeTasks', 'systemPrompt', 'tools'])
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

describe('注册面集合 pin（十四 tool：M3 九员 + recordBug/resolveBug 两 bug 写径 + listBugs/getBug 两 bug 读径 + 3b stopTaskLoop 停止入口）', () => {
  it('十四 tool 注册且名 = FORGE_TOOL_NAMES 列序（单源——3b stopTaskLoop 补位成十四）', () => {
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
      'stopTaskLoop',
      'updateTask',
      'taskStats',
      'listTasks',
      'recordBug',
      'resolveBug',
      'listBugs',
      'getBug',
      'recordImplCheckpoint',
      'queryImplCheckpoint',
      'listImplCheckpoints',
      'pauseTask',
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
    expect(rt.registeredTools).toHaveLength(18)
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
    // createProposal mode 预设自动填充（参数面不收 mode——所处容器即溯源）/ transitionProposal superseded_by 透传
    expect(byName.get('createProposal')?.parameters.properties).not.toHaveProperty('mode')
    expect(byName.get('transitionProposal')?.parameters.properties).toHaveProperty('superseded_by')
    // 机械②承接链：两动词 parent_proposal_id 透传参数在场
    expect(byName.get('createProposal')?.parameters.properties).toHaveProperty('parent_proposal_id')
    expect(byName.get('transitionProposal')?.parameters.properties).toHaveProperty('parent_proposal_id')
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

  it('bug: additionalProperties 对象形逃逸宿主子集校验（taskStats byStatus 曾炸会话创建/resume）', () => {
    // 宿主引擎 schema 子集校验器：additionalProperties 只认布尔形——对象形（{ type: 'number' }）
    // 令插件工具面注册即拒（agent-preset/invalid + resume RemoteError：unsupported JSON schema:
    // schema.oneOf[0].properties.byStatus.additionalProperties must be a boolean）。深走双面钉住。
    const walk = (node: unknown, path: string, violations: string[]): void => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${path}[${i}]`, violations))
        return
      }
      if (node === null || typeof node !== 'object') return
      for (const [key, value] of Object.entries(node)) {
        if (key === 'additionalProperties') {
          if (typeof value !== 'boolean') violations.push(`${path}.additionalProperties`)
          continue
        }
        walk(value, `${path}.${key}`, violations)
      }
    }
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    for (const tool of rt.registeredTools) {
      const violations: string[] = []
      walk(tool.parameters, `${tool.name}.parameters`, violations)
      walk(tool.output.schema, `${tool.name}.output.schema`, violations)
      expect(violations, `${tool.name} 宿主 schema 子集违规（additionalProperties 须布尔形或缺席）`).toEqual([])
    }
    dispose()
  })

  it('bug: 单元素 oneOf 嵌套逃逸宿主子集校验（stopTaskLoop 曾炸会话创建/resume）', () => {
    // 宿主引擎 schema 子集校验器：oneOf 必须是 ≥2 个 schema 的数组——stopTaskLoop 成功支仅
    // 'stopped' 一种却包了层 oneOf:[单支]，经 withFailureVariant 再嵌后 schema.oneOf[0].oneOf
    // 为单元素数组，插件工具面注册即拒（resume RemoteError：unsupported JSON schema:
    // schema.oneOf[0].oneOf must be an array of at least two schemas）。同锚深走双面钉住。
    const walk = (node: unknown, path: string, violations: string[]): void => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${path}[${i}]`, violations))
        return
      }
      if (node === null || typeof node !== 'object') return
      for (const [key, value] of Object.entries(node)) {
        if (key === 'oneOf' && (!Array.isArray(value) || value.length < 2)) {
          violations.push(`${path}.oneOf`)
        }
        walk(value, `${path}.${key}`, violations)
      }
    }
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    for (const tool of rt.registeredTools) {
      const violations: string[] = []
      walk(tool.parameters, `${tool.name}.parameters`, violations)
      walk(tool.output.schema, `${tool.name}.output.schema`, violations)
      expect(violations, `${tool.name} 宿主 schema 子集违规（oneOf 须 ≥2 元素数组）`).toEqual([])
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

/** forge:pipeline 段 text 求值（官方函数形态——按装配上下文 agent.id 分会话） */
function pipelineTextOf(rt: TempRuntime, agentId: string | undefined): string {
  const section = rt.sections.find((s) => s.name === FORGE_SECTION_NAME)
  const text = section?.text
  if (typeof text !== 'function') throw new Error(`forge:pipeline 段 text 应为按装配求值的函数，实际 ${typeof text}`)
  return (text as (context: { agent?: { id?: string } }) => string)({ agent: { id: agentId } })
}

describe('AC5 段注册（forge:pipeline / order 510 + forge:doc-style / order 511 + forge:dispatch-loop / order 512 + forge:commander / order 513）', () => {
  it('默认装配：四段（pipeline + doc-style + dispatch-loop + commander，name/order/text 三件在场）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    expect(rt.sections).toHaveLength(4)
    const pipeline = rt.sections.find((s) => s.name === FORGE_SECTION_NAME)
    const docStyle = rt.sections.find((s) => s.name === 'forge:doc-style')
    expect(pipeline?.order).toBe(510)
    expect(pipelineTextOf(rt, undefined)).toContain('forge-pipeline')
    // doc-style 独立段（dual-mode-overhaul：文档风格公约拆段——双模式共用注入，段注册无条件）
    expect(docStyle?.order).toBe(511)
    expect(docStyle?.text).toContain('doc-style')
    expect(docStyle?.text).toContain('文档风格公约')
    // pipeline 段本体不再携带公约（拆段后单一归属）
    expect(pipelineTextOf(rt, undefined)).not.toContain('文档风格公约')
    // 3b dispatch-loop 段（registry 单例闭包注入——无活登记 = 空串零固定税）
    const dispatchLoop = rt.sections.find((s) => s.name === 'forge:dispatch-loop')
    expect(dispatchLoop?.order).toBe(512)
    expect(typeof dispatchLoop?.text).toBe('function')
    const dispatchLoopText = dispatchLoop?.text as (context: { agent?: { id?: string } }) => string
    expect(dispatchLoopText({ agent: { id: 'sess-a1' } })).toBe('')
    // expert-squad-forge-2 指挥者段（条件注入——experts 服务缺席 = 空串整体过滤）
    const commander = rt.sections.find((s) => s.name === 'forge:commander')
    expect(commander?.order).toBe(513)
    expect(typeof commander?.text).toBe('function')
    const commanderText = commander?.text as () => string
    expect(commanderText()).toBe('')
    dispose()
  })

  it('config.mode 双模式渲染：blitz → 突击模板；缺省/未知 → 远征回退', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin(rt1.ctx(), { mode: 'blitz' })
    expect(pipelineTextOf(rt1, undefined)).toContain('## Forge 任务管线（突击模式）')
    expect(pipelineTextOf(rt1, undefined)).toContain('B -->|"accept"| C[quick-tasks]')
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin(rt2.ctx(), { mode: 'unknown-mode' })
    expect(pipelineTextOf(rt2, undefined)).toContain('## Forge 任务管线（远征模式）')
    d2()
  })

  it('disposer 全注销（tool×14 + 段×4，各恰一次）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    dispose()
    expect(rt.disposedCounts()).toEqual({ tools: 18, sections: 4 })  })
})

describe('expert-squad-forge-2 指挥者段条件注入（forge:commander——ctx.experts 服务在场性惰性检测）', () => {
  const commanderTextOf = (rt: TempRuntime): string => {
    const section = rt.sections.find((s) => s.name === 'forge:commander')
    expect(typeof section?.text).toBe('function')
    return (section!.text as () => string)()
  }

  it('experts 服务在场：注入指挥者段（委派边界话术在场）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.withReflect({ experts: { get: () => undefined } }) as never)
    const text = commanderTextOf(rt)
    expect(text).toContain('指挥者模式')
    expect(text).toContain('信息搜索与核实')
    expect(text).toContain('技术调研')
    expect(text).toContain('提案评审')
    expect(text).toContain('PRD 评审')
    expect(text).toContain('设计评审')
    expect(text).toContain('用户访谈')
    expect(text).toContain('任务拆解')
    dispose()
  })

  it('experts 服务缺席/面畸形：零注入（空串 = 官方整体过滤）', () => {
    const rtAbsent = new TempRuntime()
    const d1 = forgePlugin(rtAbsent.ctx())
    expect(commanderTextOf(rtAbsent)).toBe('')
    d1()
    const rtMalformed = new TempRuntime()
    const d2 = forgePlugin(rtMalformed.withReflect({ experts: {} }) as never)
    expect(commanderTextOf(rtMalformed)).toBe('')
    d2()
  })
})

describe('1.16 段 forgeDir 注入（按会话工作区解析——bug 5adb5960：多项目下不得取首个绑定项目）', () => {
  /** 两绑定项目（首行 learn / 次行 demo——次序即 bug 触发条件）+ 按 id 分流的 getProject 桩 */
  const ROWS = [
    { wsPath: 'C:\\ws\\learn', projectId: 'p-1', forgeDir: 'C:/ws/learn/.forge' },
    { wsPath: 'C:\\ws\\demo', projectId: 'p-2', forgeDir: 'C:/ws/demo/.forge' },
  ]
  function projectsWith(rows: typeof ROWS | null) {
    return {
      deriveTaskStoreDir: async () => ({ dir: DEMO_CONTAINER_DIR }),
      ...(rows === null ? {} : { getProject: async (id: string) => rows.find((r) => r.projectId === id) ?? null }),
    } as Pick<ProjectServiceM2, 'deriveTaskStoreDir' | 'getProject'> as ProjectServiceM2
  }
  const BOUND = { projects: ROWS.map(({ wsPath, projectId }) => ({ wsPath, projectId })) }

  /** 装配 + 捕获事件监听面（session/created 由此发炮；注册参数全量记账） */
  const sessionEventRegistrations: () => { event: string; options?: { global?: boolean } }[] = () => registrationsRef
  let registrationsRef: { event: string; options?: { global?: boolean } }[] = []
  function assembleWith(projects: ProjectServiceM2) {
    const rt = new TempRuntime()
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    registrationsRef = []
    // 桩面：ctx.on 双重载（agent/pre-step waterfall + session 生命周期）——stub 以宽参收拢，
    // 断言面按 ForgeEventRegisterFace 形状结算（emit 侧逐事件分发）
    const onImpl = (name: string, cb: (...args: unknown[]) => void, options?: { global?: boolean }): (() => void) => {
      registrationsRef.push({ event: name, ...(options !== undefined ? { options } : {}) })
      const list = listeners.get(name) ?? []
      list.push(cb)
      listeners.set(name, list)
      return () => {}
    }
    const ctx = {
      ...rt.ctx(),
      forgeProjects: projects,
      on: onImpl as unknown as ForgeEventRegisterFace,
    }
    const dispose = forgePlugin(ctx, BOUND)
    const emit = (name: string, session: unknown) => {
      for (const cb of listeners.get(name) ?? []) cb(session)
    }
    return { rt, dispose, emit }
  }

  it('bug 4e9bf600：session/created·disposed 监听注册必须携带 { global: true }（scope carrier 过滤派发——不带则收不到他作用域会话）', () => {
    const { dispose } = assembleWith(projectsWith(ROWS))
    const registrations = sessionEventRegistrations()
    expect(registrations).toContainEqual({ event: 'session/created', options: { global: true } })
    expect(registrations).toContainEqual({ event: 'session/disposed', options: { global: true } })
    dispose()
  })

  /** 段 text 求值走模块级 pipelineTextOf（函数形态——按装配上下文 agent.id 分会话） */
  it('bug 复现面：第二绑定项目的会话拿到自己的 forgeDir（不落入首行 learn 项目）', async () => {
    const { rt, dispose, emit } = assembleWith(projectsWith(ROWS))
    emit('session/created', { id: 'sess-demo', header: { cwd: 'C:\\ws\\demo' } })
    emit('session/created', { id: 'sess-learn', header: { cwd: 'C:\\ws\\learn' } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(pipelineTextOf(rt, 'sess-demo')).toContain('C:/ws/demo/.forge\\docs')
    expect(pipelineTextOf(rt, 'sess-learn')).toContain('C:/ws/learn/.forge\\docs')
    dispose()
  })

  it('会话未预热（缓存缺席）/ 项目未注册：缺省段（无文档位置，不注入他人路径）', async () => {
    const { rt, dispose, emit } = assembleWith(projectsWith(ROWS))
    expect(pipelineTextOf(rt, 'sess-cold')).not.toContain('文档位置')
    emit('session/created', { id: 'sess-null', header: { cwd: 'C:\\ws\\unregistered' } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(pipelineTextOf(rt, 'sess-null')).not.toContain('文档位置')
    dispose()
  })

  it('forgeProjects 面缺 getProject / 无绑定：缺省段原样（fail-soft 零外抛）', async () => {
    const { rt, dispose, emit } = assembleWith(projectsWith(null))
    emit('session/created', { id: 'sess-x', header: { cwd: 'C:\\ws\\demo' } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(pipelineTextOf(rt, 'sess-x')).not.toContain('文档位置')
    dispose()
    expect(rt.disposedCounts()).toEqual({ tools: 18, sections: 4 })  })
})

describe('createForgeTools 直装配（工厂面——注册器之外的单源消费）', () => {
  it('deps 注入即得十四 tool 定义组（键 = FORGE_TOOL_NAMES 列序；loop 驱动器/登记表必给）', () => {
    const tools = createForgeTools({
      tasks: {} as ForgeTasksService,
      proposals: {} as ForgeProposalsService,
      bugs: {} as ForgeToolDeps['bugs'],
      checkpoints: {
        appendCheckpoint: async () => {
          throw new Error('not used')
        },
        listCheckpoints: async () => [],
        ensureCheckpoint: async () => {
          throw new Error('not used')
        },
      },
      resolveProjectId: () => undefined,
      loop: { driver: {} as import('./loop/index.js').LoopDriver, registry: createLoopRegistry() },
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
    expect(rt.registeredTools).toHaveLength(18)
    dispose()
  })

  it('reflect.get 抛异常 / 返回非函数面：降级缺席不阻载（十三 tool 照常注册）', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin({ ...rt1.ctx(), reflect: { get: () => { throw new Error('inactive fiber') } } })
    expect(rt1.registeredTools).toHaveLength(18)
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin({ ...rt2.ctx(), reflect: { get: () => 'not-a-service' } })
    expect(rt2.registeredTools).toHaveLength(18)
    d2()
  })
})

// ─────────────────────────── S3 启动对账（run-tasks-host-command 图 D——装配期逐绑定项目 fail-soft） ───────────────────────────

describe('S3 启动对账装配（reconcileInterrupted——registryEmpty=true 装配期结构事实）', () => {
  /** 装配桩：reconcileInterrupted 调用记账（静态绑定表一枚 + bindingsFile 去重面） */
  function reconcileCtx(config: { projects?: { wsPath: string; projectId: string }[]; bindingsFile?: string }) {
    const rt = new TempRuntime()
    const calls: unknown[] = []
    const tasks = {
      claimTask: async () => ({ task: null, dispatchPrompt: '', digest: '', reclaimed: false }),
      taskStats: async () => ({
        total: 0,
        byStatus: { pending: 0, in_progress: 0, blocked: 0, completed: 0, skipped: 0, rejected: 0, suspended: 0, interrupted: 0 },
        unmetPending: 0,
      }),
      reconcileInterrupted: async (input: unknown) => {
        calls.push(input)
        return { reconciled: [] }
      },
    } as unknown as ForgeTasksService
    const dispose = forgePlugin({ ...rt.ctx(), forgeTasks: tasks }, config)
    return { rt, dispose, calls }
  }

  it('装配即触发：逐绑定项目 reconcileInterrupted({projectId, registryEmpty: true})——三重判据之③装配期恒真', async () => {
    const h = reconcileCtx({ projects: [{ wsPath: 'C:\\ws\\demo', projectId: 'p-9' }] })
    await new Promise((resolve) => setTimeout(resolve, 0)) // fire-and-forget 异步段
    expect(h.calls).toEqual([{ projectId: 'p-9', registryEmpty: true }])
    h.dispose()
  })

  it('无绑定（无 config.projects/bindingsFile）= 零触发；服务面同步缺席 = fail-soft 不阻载装配（十三 tool 照常注册）', async () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx()) // forgeTasks = {} 桩——reconcileInterrupted 缺席
    expect(rt.registeredTools).toHaveLength(18)
    dispose()

    const h2 = reconcileCtx({})
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(h2.calls).toEqual([])
    h2.dispose()
  })
})

// ─────────────────────────── 3b 契约归一装配（dispatchTask 循环入口——去 job 模式） ───────────────────────────
describe('3b dispatchTask 装配契约（run-tasks-host-command 1.2 jobs 降级守卫随 job 模式退役——工具面成对必填收口）', () => {
  const BOUND_CONFIG = { projects: [{ wsPath: 'C:\\ws\\demo', projectId: 'p-9' }] }
  const EXEC = { agent: { session: { id: 's-jobs', header: { cwd: 'C:\\ws\\demo' } } } }

  /** 装配桩：claim 记账（零触达观察径） */
  function dispatchCtx() {
    const rt = new TempRuntime()
    let claims = 0
    const tasks = {
      claimTask: async () => {
        claims += 1
        return { task: null, dispatchPrompt: '', digest: '', reclaimed: false }
      },
      taskStats: async () => ({
        total: 0,
        byStatus: { pending: 0, in_progress: 0, blocked: 0, completed: 0, skipped: 0, rejected: 0, suspended: 0, interrupted: 0 },
        unmetPending: 0,
      }),
    } as unknown as ForgeTasksService
    const ctx = { ...rt.ctx(), forgeTasks: tasks }
    const dispose = forgePlugin(ctx, BOUND_CONFIG)
    const dispatch = rt.registeredTools.find((t) => t.name === 'dispatchTask')!
    const stop = rt.registeredTools.find((t) => t.name === 'stopTaskLoop')!
    return { rt, dispose, dispatch, stop, claimsOf: () => claims }
  }

  it('去 job 模式：run_in_background 落未知键零效应——缺失 source 对被拒（fail-loud，claim 零触达）', async () => {
    const h = dispatchCtx()
    await expect(h.dispatch.execute({ run_in_background: true }, EXEC)).rejects.toThrow(/both required/)
    expect(h.claimsOf()).toBe(0)
    h.dispose()
  })

  it('stopTaskLoop 注册在环（十四 tool——3b 停止入口与 dispatchTask 同装配面）', () => {
    const h = dispatchCtx()
    expect(h.stop).toBeDefined()
    expect(typeof h.stop.execute).toBe('function')
    h.dispose()
  })
})

// ─────────────────────────── S7 会话投影键注册（run-tasks-host-command 1.8——reflect.get 防御读取 fail-soft） ───────────────────────────
describe('S7 会话投影键注册（forge-dispatch-loop——sessionProjections 面可选消费）', () => {
  /** 投影注册表捕获桩（register 记账 + 注销器计数） */
  function projectionsFace(rt: TempRuntime) {
    const registered: unknown[] = []
    return {
      registered,
      face: {
        register: (definition: unknown) => {
          registered.push(definition)
          return () => {
            rt.disposedProjection += 1
          }
        },
      },
    }
  }

  it('sessionProjections 面在场：两投影键注册（forge-dispatch-loop + forge-dispatch-events——plain object 定义齐备）+ 注销器并入插件 disposer', () => {
    const rt = new TempRuntime()
    const { registered, face } = projectionsFace(rt)
    const dispose = forgePlugin(rt.withReflect({ sessionProjections: face }))
    expect(registered).toHaveLength(2)
    const definition = registered[0] as { key?: string; stateVersion?: number; init?: unknown; apply?: unknown; wire?: unknown }
    expect(definition.key).toBe('forge-dispatch-loop')
    expect(definition.stateVersion).toBe(1)
    expect(typeof definition.init).toBe('function')
    expect(typeof definition.apply).toBe('function')
    expect(definition.wire).toBeDefined()
    const events = registered[1] as { key?: string; stateVersion?: number; init?: unknown; apply?: unknown; wire?: unknown }
    expect(events.key).toBe('forge-dispatch-events')
    expect(events.stateVersion).toBe(1)
    expect(typeof events.init).toBe('function')
    expect(typeof events.apply).toBe('function')
    expect(events.wire).toBeDefined()
    // 六 tool 照常注册（投影面 additive——tool 面零波及）
    expect(rt.registeredTools).toHaveLength(18)
    dispose()
    expect(rt.disposedProjection).toBe(2)
  })

  it('sessionProjections 面缺席（reflect 无该键）：键不注册、装配照常（fail-soft——capability absence = key absence）', () => {
    const rt = new TempRuntime()
    const { registered, face } = projectionsFace(rt)
    const dispose = forgePlugin(rt.withReflect({})) // commands 亦缺席——仅验证投影面
    void face
    expect(registered).toHaveLength(0)
    expect(rt.registeredTools).toHaveLength(18)
    dispose()
    expect(rt.disposedProjection).toBe(0)
  })

  it('reflect.get 抛异常 / 非函数面：同降级（键不注册、六 tool 照常）', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin({ ...rt1.ctx(), reflect: { get: () => { throw new Error('inactive fiber') } } })
    expect(rt1.registeredTools).toHaveLength(18)
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin(rt2.withReflect({ sessionProjections: 'not-a-registry' }))
    expect(rt2.registeredTools).toHaveLength(18)
    d2()
  })
})

// ─────────────────────────── S2 指令两枚注册（run-tasks-host-command——reflect.get 防御读取 fail-soft） ───────────────────────────
describe('S2 指令注册（/run-dag-tasks 与 /stop-dag-tasks——UI command plane 零模型消息）', () => {
  it('commands 面在场：两指令注册（FORGE_COMMAND_NAMES 名序 pin）+ run-dag-tasks 带 <slug> hint + stop 无 input 描述符', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.withReflect({ commands: rt.commandsFace() }))
    expect(rt.registeredCommands.map((c) => c.name)).toEqual([...FORGE_COMMAND_NAMES])
    expect([...FORGE_COMMAND_NAMES]).toEqual(['run-dag-tasks', 'stop-dag-tasks'])
    const run = rt.registeredCommands.find((c) => c.name === 'run-dag-tasks')
    const stop = rt.registeredCommands.find((c) => c.name === 'stop-dag-tasks')
    expect(run?.input?.hint).toBe('[<slug>]')
    expect(run?.description.length).toBeGreaterThan(4)
    expect(stop?.input).toBeUndefined() // 无参指令——composer 零占位
    expect(typeof run?.handler).toBe('function')
    expect(typeof stop?.handler).toBe('function')
    // 六 tool 照常注册（指令面 additive——tool 面零波及）
    expect(rt.registeredTools).toHaveLength(18)
    dispose()
    expect(rt.disposedCommands).toBe(2) // 注销器并入插件 disposer（两指令各恰一次）
  })

  it('commands 面缺席（reflect 无该键）：零指令注册、六 tool 照常（fail-soft 不阻载——R3）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.withReflect({}))
    expect(rt.registeredCommands).toHaveLength(0)
    expect(rt.registeredTools).toHaveLength(18)
    dispose()
    expect(rt.disposedCommands).toBe(0)
  })

  it('reflect.get 抛异常 / 非函数面：同降级（零指令、装配照常）', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin({ ...rt1.ctx(), reflect: { get: () => { throw new Error('inactive fiber') } } })
    expect(rt1.registeredCommands).toHaveLength(0)
    expect(rt1.registeredTools).toHaveLength(18)
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin(rt2.withReflect({ commands: 'not-a-registry' }))
    expect(rt2.registeredCommands).toHaveLength(0)
    expect(rt2.registeredTools).toHaveLength(18)
    d2()
  })
})

// ─────────────────────────── 专家团装配面（expert-squad-forge 1.2——experts 服务接入 + settings 映射表） ───────────────────────────

describe('experts 装配面（expert-squad-forge 1.2——reflect.get 防御读取 fail-soft）', () => {
  beforeEach(() => {
    // 模块级本地单例（bug dfa41a72/ad32e240）用例间隔离
    _resetExpertResolverSingletonForTests()
  })

  /** experts 服务桩（registerRoot/refresh 调用记账 + 按键返回档案桩） */
  function expertsFace() {
    const calls: { root?: string; refresh: number } = { refresh: 0 }
    return {
      calls,
      face: {
        get: (key: string) => ({ name: key, title: `T:${key}`, personaMd: `md:${key}`, tools: ['read'] }),
        registerRoot: (_ctx: unknown, dir: string) => {
          calls.root = dir
        },
        refresh: async () => {
          calls.refresh += 1
        },
      },
    }
  }

  /** reflect 桩（get + provide 双面——provide 记账注入服务） */
  function reflectWith(services: Record<string, unknown>) {
    const provided = new Map<string, unknown>()
    return {
      provided,
      face: {
        get: (name: string) => services[name],
        provide: (name: string, service: unknown) => {
          provided.set(name, service)
        },
      },
    }
  }

  it('experts 面在场：registerRoot(随包 experts 目录) + refresh 恰一次 + 档案取用面经 provide 注入（fail-soft 装配零波及）', async () => {
    const rt = new TempRuntime()
    const { face, calls } = expertsFace()
    const { provided, face: reflect } = reflectWith({ experts: face, forgeSettings: { get: async () => ({}) } })
    const dispose = forgePlugin({ ...rt.ctx(), reflect })
    expect(calls.root).toBe(FORGE_EXPERTS_ROOT_DIR)
    expect(calls.refresh).toBe(1) // registerRoot 只追加 root 不重扫——注册后须显式 refresh 一次
    const resolver = provided.get('forgeExperts') as ExpertProfileResolver
    expect(typeof resolver).toBe('function')
    expect(rt.registeredTools).toHaveLength(18) // 装配面 additive——tool 面零波及（main 并入 pauseTask 后 18）
    dispose()
  })

  it('refresh 完成屏障：resolver 首调等待 refresh 结算后才 get（未结算窗口不触发 not-found fail-loud）', async () => {
    let releaseRefresh!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })
    const order: string[] = []
    const face = {
      get: (key: string) => {
        order.push(`get:${key}`)
        return { name: key, personaMd: `md:${key}` }
      },
      registerRoot: (_ctx: unknown, _dir: string) => {},
      refresh: async () => {
        order.push('refresh:start')
        await gate
        order.push('refresh:done')
      },
    }
    // ready promise 按生产装配配方（index.ts）构造：refresh 调起 + 吞错归一 settled-safe
    const ready = face.refresh().catch(() => undefined).then(() => undefined)
    const resolver = createExpertProfileResolver({ experts: face, ready })
    const pending = resolver('doc')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(order).toEqual(['refresh:start']) // refresh 未结算 → get 未发生
    releaseRefresh()
    await expect(pending).resolves.toMatchObject({ name: 'tech-writer' })
    expect(order).toEqual(['refresh:start', 'refresh:done', 'get:tech-writer'])
  })

  it('档案取用面解析：预设映射命中取人格键；未用类型预设缺键且无覆盖 → undefined（persona 仅程序段形态兼容）', async () => {
    const { face } = expertsFace()
    const resolver = createExpertProfileResolver({ experts: face })
    await expect(resolver('gate')).resolves.toMatchObject({ name: 'gate-keeper', personaMd: 'md:gate-keeper' })
    await expect(resolver('coding-fix')).resolves.toMatchObject({ name: 'bug-hunter' }) // 1.12 后 13 键联测
    await expect(resolver('test-gen-journeys')).resolves.toMatchObject({ name: 'test-journey-author' }) // expert-squad-forge-2：gen 三类型入预设映射
    await expect(resolver('validation-code')).resolves.toBeUndefined() // 排除名单（eval 两类型/validation-code）= 无预设不取用不阻断
  })

  it('档案取用面解析：settings.experts.mapping 覆盖命中取覆盖键（含未用类型指到自定义档案）', async () => {
    const { face } = expertsFace()
    const resolver = createExpertProfileResolver({
      experts: face,
      settings: { get: async () => ({ experts: { mapping: { 'coding-fix': 'my-fix-expert', 'test-gen-journeys': 'my-journey-expert' } } }) },
    })
    await expect(resolver('coding-fix')).resolves.toMatchObject({ name: 'my-fix-expert', personaMd: 'md:my-fix-expert' })
    await expect(resolver('test-gen-journeys')).resolves.toMatchObject({ name: 'my-journey-expert', personaMd: 'md:my-journey-expert' })
  })

  it('档案取用面 fail-loud 边界：用户覆盖指向缺失档案外抛；预设命中键档案缺失同样外抛', async () => {
    const override = createExpertProfileResolver({
      experts: { get: () => { throw new Error('expert not found: ghost-expert') }, registerRoot: () => {} },
      settings: { get: async () => ({ experts: { mapping: { doc: 'ghost-expert' } } }) },
    })
    await expect(override('doc')).rejects.toThrow(/expert not found: ghost-expert/) // 用户显式指向 = fail-loud
    const preset = createExpertProfileResolver({
      experts: { get: () => { throw new Error('expert not found: gate-keeper') }, registerRoot: () => {} },
    })
    await expect(preset('gate')).rejects.toThrow(/expert not found: gate-keeper/) // 随包预设缺席 = 同样外抛
  })

  it('settings 读失败：回落默认映射（fail-soft 诊断）；experts.get 错误原样外抛（claim 期 fail-loud 语义由实现侧承担）', async () => {
    const { face } = expertsFace()
    const resolver = createExpertProfileResolver({
      experts: face,
      settings: { get: async () => { throw new Error('settings file broken') } },
    })
    await expect(resolver('doc')).resolves.toMatchObject({ name: 'tech-writer' })
    const failing = createExpertProfileResolver({
      experts: { get: () => { throw new Error('expert not found: doc-reviewer') }, registerRoot: () => {} },
    })
    await expect(failing('doc-review')).rejects.toThrow(/expert not found: doc-reviewer/)
  })

// ─────────────────────────── expert-squad-forge-2：claim 变量路由 + provider 投影 ───────────────────────────

describe('expert-squad-forge-2：claim 变量路由 + provider 投影（faces resolver）', () => {
  /** experts 服务桩（按键返回档案——entries 控制可选字段） */
  function faceWith(entries: Record<string, { provider?: string; model?: string }>) {
    return {
      get: (key: string) => ({
        name: key,
        personaMd: `md:${key}`,
        ...(entries[key] !== undefined ? entries[key] : {}),
      }),
      registerRoot: () => {},
    }
  }

  it('变量路由两态：expertKey 在场压倒 settings 覆盖与预设映射；缺席 = 既有映射链不变（settings 覆盖生效）', async () => {
    const resolver = createExpertProfileResolver({
      experts: faceWith({ 'retro-reviewer': { provider: 'p1', model: 'm1' } }),
      settings: { get: async () => ({ experts: { mapping: { doc: 'my-writer' } } }) },
    })
    // 变量在场：零 settings 依赖直取（单点注入面优先于一切映射）
    await expect(resolver('doc', 'retro-reviewer')).resolves.toMatchObject({
      name: 'retro-reviewer',
      provider: 'p1',
      model: 'm1',
    })
    // 变量缺席：settings 覆盖 → 预设映射既有链
    await expect(resolver('doc')).resolves.toMatchObject({ name: 'my-writer' })
    await expect(resolver('gate')).resolves.toMatchObject({ name: 'gate-keeper' })
  })

  it('变量键指向不存在专家 = fail-loud 错误含键名（任务留 pending 由 claim 期外抛语义承担）', async () => {
    const resolver = createExpertProfileResolver({
      experts: {
        get: (key: string) => {
          throw new Error(`expert not found: ${key}`)
        },
        registerRoot: () => {},
      },
    })
    await expect(resolver('doc', 'ghost-expert')).rejects.toThrow(/ghost-expert/)
  })

  it('provider 投影：档案 provider 字段入 ForgeExpertProfile 投影（spawn agentOptions 成对消费归 workerAgentOptionsOf）', async () => {
    const resolver = createExpertProfileResolver({
      experts: faceWith({ 'code-reviewer': { provider: 'anthropic', model: 'claude-x' } }),
    })
    await expect(resolver('coding-fix', 'code-reviewer')).resolves.toMatchObject({
      provider: 'anthropic',
      model: 'claude-x',
    })
  })
})

  /** cordis 忠实 reflect 桩（bug 763de653 复现面）：store 单源——get 读 store，
   *  provide 撞已注册名抛 cordis 同文错误（"service X has been registered"）。 */
  function reflectStoreBacked(initial: Record<string, unknown> = {}) {
    const store = new Map<string, unknown>(Object.entries(initial))
    const provideCalls: string[] = []
    return {
      store,
      provideCalls,
      face: {
        get: (name: string) => store.get(name),
        provide: (name: string, service: unknown) => {
          if (store.has(name)) throw new Error(`service ${name} has been registered at <scope>`)
          provideCalls.push(name)
          store.set(name, service)
        },
      },
    }
  }

  it('bug 763de653：父/子会话双次装配（同一 reflect scope）不降级——provide 撞车前幂等短路，expertResolver 两轮均在场', () => {
    const experts = expertsFace().face
    const { face, provideCalls } = reflectStoreBacked({ experts, forgeSettings: { get: async () => ({}) } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const dispose1 = forgePlugin({ ...new TempRuntime().ctx(), reflect: face })
      expect(provideCalls).toContain('forgeExperts') // 首次装配正常 provide
      const dispose2 = forgePlugin({ ...new TempRuntime().ctx(), reflect: face }) // 子会话二次装配——同一 scope
      // 修复前：第二次 provide 抛 "service forgeExperts has been registered" → catch 降级
      // expertResolver=undefined（resolveWorkerProfile 缺席 → 路由回落 inherit）。修复后：
      // provide 前 reflect.get 探测已注册即短路，第二轮零降级告警、装配照常。
      const degraded = warn.mock.calls.some((args) => String(args[0]).includes('forge experts 装配面降级'))
      expect(degraded).toBe(false)
      expect(provideCalls.filter((n) => n === 'forgeExperts')).toHaveLength(1) // 幂等短路：恰一次 provide
      dispose1()
      dispose2()
    } finally {
      warn.mockRestore()
    }
  })

  /** cordis 忠实 reflect 桩（bug d327323b 复现面）：探测与 provide 跨时点不互见——
   *  探测时点 get 读不到既有注册（父子 scope 时序），provide 撞已注册名抛 cordis 同文
   *  错误（"service X has been registered"），撞车后取回可读到已注册实例。 */
  function reflectRaceBacked(initial: Record<string, unknown> = {}) {
    const store = new Map<string, unknown>(Object.entries(initial))
    let probed = false
    const getCalls: string[] = []
    return {
      store,
      getCalls,
      face: {
        get: (name: string) => {
          getCalls.push(name)
          // check-then-act 竞态：探测时点（首轮 get）既注册不可见，撞车后取回可见
          if (name === 'forgeExperts' && !probed) return undefined
          return store.get(name)
        },
        provide: (name: string, service: unknown) => {
          probed = true
          if (store.has(name)) throw new Error(`service ${name} has been registered at <scope>`)
          store.set(name, service)
        },
      },
    }
  }

  it('bug d327323b：同进程双次 apply 探测击穿（provide 撞车）不降级——取回已注册实例继续装配', () => {
    const experts = expertsFace().face
    const { face, store, getCalls } = reflectRaceBacked({
      experts,
      forgeSettings: { get: async () => ({}) },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const registered = Object.assign(() => undefined, { marker: 'round-1' })
      store.set('forgeExperts', registered) // 首轮已注册（探测时点不可见）
      const dispose1 = forgePlugin({ ...new TempRuntime().ctx(), reflect: face })
      // 修复前：探测 undefined → provide 抛 "has been registered" → 外层 catch 降级
      // 修复后：撞车即复用——取回已注册实例继续装配，零降级告警
      const degraded = warn.mock.calls.some((args) => String(args[0]).includes('forge experts 装配面降级'))
      expect(degraded).toBe(false)
      expect(getCalls.filter((n) => n === 'forgeExperts')).toHaveLength(1) // 撞车后取回（provide 抛错 → 反射取回恰一次）
      expect(store.get('forgeExperts')).toBe(registered) // 已注册实例未被覆盖
      dispose1()
    } finally {
      warn.mockRestore()
    }
  })

  it('bug d327323b：父子两 scope 撞车即复用——provide 抛错后 reflect 取回在位服务，装配零降级', () => {
    const experts = expertsFace().face
    const parent = reflectStoreBacked({ experts, forgeSettings: { get: async () => ({}) } })
    const dispose1 = forgePlugin({ ...new TempRuntime().ctx(), reflect: parent.face })
    expect(parent.provideCalls).toContain('forgeExperts') // 父 scope 正常 provide

    // 子 scope：探测时点父注册不可见（跨 scope 时序），provide 撞名抛错
    const childStore = new Map<string, unknown>()
    let probed = false
    const childFace = {
      get: (name: string) => (name === 'forgeExperts' && !probed ? undefined : parent.store.get(name)),
      provide: (name: string, service: unknown) => {
        probed = true
        if (parent.store.has(name)) throw new Error(`service ${name} has been registered at <scope>`)
        childStore.set(name, service)
      },
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const dispose2 = forgePlugin({ ...new TempRuntime().ctx(), reflect: childFace })
      const degraded = warn.mock.calls.some((args) => String(args[0]).includes('forge experts 装配面降级'))
      expect(degraded).toBe(false)
      expect(parent.store.get('forgeExperts')).toBeDefined() // 父轮实例仍是唯一在位实现
      dispose1()
      dispose2()
    } finally {
      warn.mockRestore()
    }
  })

  it('bug dfa41a72/ad32e240：父子两 scope（子 scope 服务面全不互见）双次 apply 复用同一本地单例且功能完整、零降级', async () => {
    _resetExpertResolverSingletonForTests()
    const experts = expertsFace().face
    const parent = reflectStoreBacked({ experts, forgeSettings: { get: async () => ({}) } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const dispose1 = forgePlugin({ ...new TempRuntime().ctx(), reflect: parent.face })
      const parentResolver = parent.store.get('forgeExperts') as ExpertProfileResolver
      expect(typeof parentResolver).toBe('function')

      // 子 scope：experts 服务面跨 scope 不互见（get('experts') = undefined）——装配期
      // 取不到任何 cordis 服务面，撞车/缺席路径一律复用模块级本地单例
      const child = reflectStoreBacked({ forgeSettings: { get: async () => ({}) } })
      const dispose2 = forgePlugin({ ...new TempRuntime().ctx(), reflect: child.face })
      const degraded = warn.mock.calls.some((args) => String(args[0]).includes('forge experts 装配面降级'))
      expect(degraded).toBe(false) // 撞车路径 = 复用路径：boot 日志零降级行
      const childResolver = child.store.get('forgeExperts') as ExpertProfileResolver
      expect(childResolver).toBe(parentResolver) // 双 scope resolve 到同一本地单例实例
      // 功能完整：单例可实际取到专家档案（doc 经默认映射路由到预设档案）
      await expect(childResolver('doc')).resolves.toMatchObject({ name: 'tech-writer', personaMd: 'md:tech-writer' })
      dispose1()
      dispose2()
    } finally {
      warn.mockRestore()
    }
  })

  it('experts 面缺席 / reflect.get 抛异常 / 非函数面：装配面整体降级不阻载（十七 tool 照常、零 provide）', () => {
    for (const reflect of [
      reflectWith({}).face, // 无 experts 键
      { get: () => { throw new Error('inactive fiber') } },
      reflectWith({ experts: 'not-a-service' }).face,
    ]) {
      const rt = new TempRuntime()
      const provided = new Map<string, unknown>()
      const dispose = forgePlugin({
        ...rt.ctx(),
        reflect: { ...reflect, provide: (name: string, service: unknown) => provided.set(name, service) },
      })
      expect(rt.registeredTools).toHaveLength(18)
      expect([...provided.keys()]).not.toContain('forgeExperts')
      dispose()
    }
  })
})
