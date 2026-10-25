// 3.4/3.5 单测 —— 插件装配（AC1 inject 面（3.4 增 forgeProjects——事件日志落位目录
// 单源派生；forgeSettings 可选消费不走 inject）/ 注册面集合 pin（M3 终态六 tool——
// dispatchTask 3.4 补位成六；新面 pin = 5.1 #17/#18）/ 参数 schema pin（容器双参 +
// 旧参删除机械断言）/ AC5 段注册）：临时 Cordis runtime（结构化最小面假宿主，
// knowledge plugin.test 同型）装配 core 服务桩 + 插件，验证 inject 声明、注册/disposer
// 全生命周期与 forge:pipeline 段。
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ForgeProposalsService, ForgeTasksService, ProjectServiceM2 } from '@dsh-forge/contracts'
import forgePlugin from './index.js'
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
    expect(rt.registeredTools).toHaveLength(17)
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

describe('AC5 段注册（forge:pipeline / order 510 + forge:doc-style / order 511 + forge:dispatch-loop / order 512）', () => {
  it('默认装配：三段（pipeline + doc-style + dispatch-loop，name/order/text 三件在场）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    expect(rt.sections).toHaveLength(3)
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

  it('disposer 全注销（tool×14 + 段×3，各恰一次）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    dispose()
    expect(rt.disposedCounts()).toEqual({ tools: 17, sections: 3 })
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
    expect(rt.disposedCounts()).toEqual({ tools: 17, sections: 3 })
  })
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
    expect(rt.registeredTools).toHaveLength(17)
    dispose()
  })

  it('reflect.get 抛异常 / 返回非函数面：降级缺席不阻载（十三 tool 照常注册）', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin({ ...rt1.ctx(), reflect: { get: () => { throw new Error('inactive fiber') } } })
    expect(rt1.registeredTools).toHaveLength(17)
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin({ ...rt2.ctx(), reflect: { get: () => 'not-a-service' } })
    expect(rt2.registeredTools).toHaveLength(17)
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
    expect(rt.registeredTools).toHaveLength(17)
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
    expect(rt.registeredTools).toHaveLength(17)
    dispose()
    expect(rt.disposedProjection).toBe(2)
  })

  it('sessionProjections 面缺席（reflect 无该键）：键不注册、装配照常（fail-soft——capability absence = key absence）', () => {
    const rt = new TempRuntime()
    const { registered, face } = projectionsFace(rt)
    const dispose = forgePlugin(rt.withReflect({})) // commands 亦缺席——仅验证投影面
    void face
    expect(registered).toHaveLength(0)
    expect(rt.registeredTools).toHaveLength(17)
    dispose()
    expect(rt.disposedProjection).toBe(0)
  })

  it('reflect.get 抛异常 / 非函数面：同降级（键不注册、六 tool 照常）', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin({ ...rt1.ctx(), reflect: { get: () => { throw new Error('inactive fiber') } } })
    expect(rt1.registeredTools).toHaveLength(17)
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin(rt2.withReflect({ sessionProjections: 'not-a-registry' }))
    expect(rt2.registeredTools).toHaveLength(17)
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
    expect(rt.registeredTools).toHaveLength(17)
    dispose()
    expect(rt.disposedCommands).toBe(2) // 注销器并入插件 disposer（两指令各恰一次）
  })

  it('commands 面缺席（reflect 无该键）：零指令注册、六 tool 照常（fail-soft 不阻载——R3）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.withReflect({}))
    expect(rt.registeredCommands).toHaveLength(0)
    expect(rt.registeredTools).toHaveLength(17)
    dispose()
    expect(rt.disposedCommands).toBe(0)
  })

  it('reflect.get 抛异常 / 非函数面：同降级（零指令、装配照常）', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin({ ...rt1.ctx(), reflect: { get: () => { throw new Error('inactive fiber') } } })
    expect(rt1.registeredCommands).toHaveLength(0)
    expect(rt1.registeredTools).toHaveLength(17)
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin(rt2.withReflect({ commands: 'not-a-registry' }))
    expect(rt2.registeredCommands).toHaveLength(0)
    expect(rt2.registeredTools).toHaveLength(17)
    d2()
  })
})
