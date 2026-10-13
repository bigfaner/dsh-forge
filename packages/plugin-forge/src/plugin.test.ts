// 3.4/3.5 单测 —— 插件装配（AC1 inject 面（3.4 增 forgeProjects——事件日志落位目录
// 单源派生；forgeSettings 可选消费不走 inject）/ 注册面集合 pin（M3 终态六 tool——
// dispatchTask 3.4 补位成六；新面 pin = 5.1 #17/#18）/ 参数 schema pin（容器双参 +
// 旧参删除机械断言）/ AC5 段注册）：临时 Cordis runtime（结构化最小面假宿主，
// knowledge plugin.test 同型）装配 core 服务桩 + 插件，验证 inject 声明、注册/disposer
// 全生命周期与 forge:pipeline 段。
import { describe, expect, it } from 'vitest'
import type { ForgeProposalsService, ForgeTasksService, ProjectServiceM2 } from '@dsh-forge/contracts'
import forgePlugin from './index.js'
import { FORGE_COMMAND_NAMES } from './commands/index.js'
import type { ForgeCommandDefinition } from './faces.js'
import { createForgeTools, FORGE_TOOL_NAMES } from './tools/index.js'
import { FORGE_SECTION_NAME } from './prompt/index.js'
import type { ForgePromptSection, ForgeToolDefinition } from './tools/index.js'

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

describe('AC5 段注册（forge:pipeline / order 510 + forge:doc-style / order 511）', () => {
  it('默认装配：双段（pipeline + doc-style，name/order/text 三件在场）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    expect(rt.sections).toHaveLength(2)
    const pipeline = rt.sections.find((s) => s.name === FORGE_SECTION_NAME)
    const docStyle = rt.sections.find((s) => s.name === 'forge:doc-style')
    expect(pipeline?.order).toBe(510)
    expect(pipeline?.text).toContain('forge-pipeline')
    // doc-style 独立段（dual-mode-overhaul：文档风格公约拆段——双模式共用注入，段注册无条件）
    expect(docStyle?.order).toBe(511)
    expect(docStyle?.text).toContain('doc-style')
    expect(docStyle?.text).toContain('文档风格公约')
    // pipeline 段本体不再携带公约（拆段后单一归属）
    expect(pipeline?.text).not.toContain('文档风格公约')
    dispose()
  })

  it('config.mode 双模式渲染：blitz → 突击模板；缺省/未知 → 远征回退', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin(rt1.ctx(), { mode: 'blitz' })
    const p1 = rt1.sections.find((s) => s.name === FORGE_SECTION_NAME)
    expect(p1?.text).toContain('## Forge 任务管线（突击模式）')
    expect(p1?.text).toContain('B -->|"accept"| C[quick-tasks]')
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin(rt2.ctx(), { mode: 'unknown-mode' })
    const p2 = rt2.sections.find((s) => s.name === FORGE_SECTION_NAME)
    expect(p2?.text).toContain('## Forge 任务管线（远征模式）')
    d2()
  })

  it('disposer 全注销（tool×6 + 段×2，各恰一次）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    dispose()
    expect(rt.disposedCounts()).toEqual({ tools: 6, sections: 2 })
  })
})

describe('1.16 段 forgeDir 注入（中央 projects 行——外部化 forgeDir 取实际值）', () => {
  /** 绑定项目 forgeProjects 桩（getProject 返回给定行/未注册 null） */
  function projectsWith(project: { forgeDir: string } | null) {
    return {
      deriveTaskStoreDir: async () => ({ dir: 'D:/containers/demo@abcd1234' }),
      getProject: async () => project,
    } as Pick<ProjectServiceM2, 'deriveTaskStoreDir' | 'getProject'> as ProjectServiceM2
  }
  const BOUND = { projects: [{ wsPath: 'C:\\ws\\demo', projectId: 'p-9' }] }

  it('绑定项目 forge_dir 解析命中：段重注册升级，注入值出现在段文本（含目录树段）', async () => {
    const rt = new TempRuntime()
    const ctx = { ...rt.ctx(), forgeProjects: projectsWith({ forgeDir: 'Z:/external/ws/.forge' }) }
    const dispose = forgePlugin(ctx, BOUND)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(rt.sections).toHaveLength(3) // 缺省 pipeline 段 + doc-style 段 + forge_dir 升级段
    const upgraded = rt.sections[2]
    expect(upgraded?.name).toBe('forge:pipeline')
    expect(upgraded?.order).toBe(510)
    expect(upgraded?.text).toContain('Z:/external/ws/.forge\\docs')
    expect(upgraded?.text).toContain('文档位置与存储约束')
    expect(upgraded?.text).toContain('proposals/{slug}/')
    dispose()
    // 重注册升级面：新旧 pipeline 注销器 + doc-style 注销器各恰一次
    expect(rt.disposedCounts()).toEqual({ tools: 6, sections: 3 })
  })

  it('项目未注册（getProject → null）：缺省段原样（无目录树段，单段，回退不炸）', async () => {
    const rt = new TempRuntime()
    const ctx = { ...rt.ctx(), forgeProjects: projectsWith(null) }
    const dispose = forgePlugin(ctx, BOUND)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(rt.sections).toHaveLength(2)
    expect(rt.sections.find((s) => s.name === FORGE_SECTION_NAME)?.text).not.toContain('文档位置')
    dispose()
    expect(rt.disposedCounts()).toEqual({ tools: 6, sections: 2 })
  })

  it('无绑定项目 / forgeProjects 面缺 getProject：缺省段原样（fail-soft 零外抛）', async () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(rt.sections).toHaveLength(2)
    expect(rt.sections.find((s) => s.name === FORGE_SECTION_NAME)?.text).not.toContain('文档位置')
    dispose()
    expect(rt.disposedCounts()).toEqual({ tools: 6, sections: 2 })
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

  it('无绑定（无 config.projects/bindingsFile）= 零触发；服务面同步缺席 = fail-soft 不阻载装配（六 tool 照常注册）', async () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.ctx()) // forgeTasks = {} 桩——reconcileInterrupted 缺席
    expect(rt.registeredTools).toHaveLength(6)
    dispose()

    const h2 = reconcileCtx({})
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(h2.calls).toEqual([])
    h2.dispose()
  })
})

// ─────────────────────────── jobs 注册表可选消费（async-dispatch §7 任务 1.2——reflect.get 防御读取） ───────────────────────────
describe('jobs 可选消费（DispatchJobsFace 收窄注入——run_in_background 降级守卫联动）', () => {  const BOUND_CONFIG = { projects: [{ wsPath: 'C:\\ws\\demo', projectId: 'p-9' }] }
  const EXEC = { agent: { session: { id: 's-jobs', header: { cwd: 'C:\\ws\\demo' } } } }

  /** 装配桩：claim 记账 + no-task 结算（零 spawn 触达——守卫行为的最短观察径） */
  function dispatchCtx(reflect?: { get(name: string): unknown }) {
    const rt = new TempRuntime()
    let claims = 0
    const tasks = {
      claimTask: async () => {
        claims += 1
        return { task: null, dispatchPrompt: '', digest: '', reclaimed: false }
      },
      taskStats: async () => ({
        total: 0,
        byStatus: { pending: 0, in_progress: 0, blocked: 0, completed: 0, skipped: 0, rejected: 0, suspended: 0 },
        unmetPending: 0,
      }),
    } as unknown as ForgeTasksService
    const ctx = { ...rt.ctx(), forgeTasks: tasks, ...(reflect !== undefined ? { reflect } : {}) }
    const dispose = forgePlugin(ctx, BOUND_CONFIG)
    const dispatch = rt.registeredTools.find((t) => t.name === 'dispatchTask')!
    return { rt, dispose, dispatch, claimsOf: () => claims }
  }

  it('reflect jobs 在场：run_in_background 调用通过降级守卫进入 claim（deps.jobs 已注入；1.3 起 jobs 在场 = 后台形态启用——无就绪任务仍 no-task 零建 job）', async () => {
    const h = dispatchCtx({ get: (name) => (name === 'jobs' ? { start: () => 'forge-dispatch-1' } : undefined) })
    const out = (await h.dispatch.execute({ run_in_background: true }, EXEC)) as { kind: string }
    expect(out.kind).toBe('no-task')
    expect(h.claimsOf()).toBe(1)
    h.dispose()
  })

  it('reflect jobs 缺席：run_in_background 调用被拒绝并提示（claim 零触达——拒绝在领任务前）', async () => {
    const h = dispatchCtx()
    const out = (await h.dispatch.execute({ run_in_background: true }, EXEC)) as {
      ok: boolean
      code: string
      violations: string[]
    }
    expect(out.ok).toBe(false)
    expect(out.code).toBe('ERR_SPAWN_FAILED')
    expect(out.violations.some((v) => v.includes('without run_in_background'))).toBe(true)
    expect(h.claimsOf()).toBe(0)
    h.dispose()
  })

  it('reflect jobs 异常 / 非函数面：降级缺席不阻载（六 tool 照常注册）且后台调用被拒绝', async () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin({ ...rt1.ctx(), reflect: { get: () => { throw new Error('inactive fiber') } } }, BOUND_CONFIG)
    expect(rt1.registeredTools).toHaveLength(6)
    d1()
    const h2 = dispatchCtx({ get: (name) => (name === 'jobs' ? 'not-a-registry' : undefined) })
    const out = (await h2.dispatch.execute({ run_in_background: true }, EXEC)) as { ok: boolean }
    expect(out.ok).toBe(false)
    h2.dispose()
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

  it('sessionProjections 面在场：forge-dispatch-loop 投影注册（plain object 定义——key/stateVersion/init/apply/wire 五件齐备）+ 注销器并入插件 disposer', () => {
    const rt = new TempRuntime()
    const { registered, face } = projectionsFace(rt)
    const dispose = forgePlugin(rt.withReflect({ sessionProjections: face }))
    expect(registered).toHaveLength(1)
    const definition = registered[0] as { key?: string; stateVersion?: number; init?: unknown; apply?: unknown; wire?: unknown }
    expect(definition.key).toBe('forge-dispatch-loop')
    expect(definition.stateVersion).toBe(1)
    expect(typeof definition.init).toBe('function')
    expect(typeof definition.apply).toBe('function')
    expect(definition.wire).toBeDefined()
    // 六 tool 照常注册（投影面 additive——tool 面零波及）
    expect(rt.registeredTools).toHaveLength(6)
    dispose()
    expect(rt.disposedProjection).toBe(1)
  })

  it('sessionProjections 面缺席（reflect 无该键）：键不注册、装配照常（fail-soft——capability absence = key absence）', () => {
    const rt = new TempRuntime()
    const { registered, face } = projectionsFace(rt)
    const dispose = forgePlugin(rt.withReflect({})) // commands 亦缺席——仅验证投影面
    void face
    expect(registered).toHaveLength(0)
    expect(rt.registeredTools).toHaveLength(6)
    dispose()
    expect(rt.disposedProjection).toBe(0)
  })

  it('reflect.get 抛异常 / 非函数面：同降级（键不注册、六 tool 照常）', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin({ ...rt1.ctx(), reflect: { get: () => { throw new Error('inactive fiber') } } })
    expect(rt1.registeredTools).toHaveLength(6)
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin(rt2.withReflect({ sessionProjections: 'not-a-registry' }))
    expect(rt2.registeredTools).toHaveLength(6)
    d2()
  })
})

// ─────────────────────────── S2 指令两枚注册（run-tasks-host-command——reflect.get 防御读取 fail-soft） ───────────────────────────
describe('S2 指令注册（/run-dag-tasks 与 /stop-dag-tasks——UI command plane 零模型消息）', () => {
  it('commands 面在场：两指令注册（FORGE_COMMAND_NAMES 名序 pin）+ run-dag-tasks 带 <source-slug> hint + stop 无 input 描述符', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.withReflect({ commands: rt.commandsFace() }))
    expect(rt.registeredCommands.map((c) => c.name)).toEqual([...FORGE_COMMAND_NAMES])
    expect([...FORGE_COMMAND_NAMES]).toEqual(['run-dag-tasks', 'stop-dag-tasks'])
    const run = rt.registeredCommands.find((c) => c.name === 'run-dag-tasks')
    const stop = rt.registeredCommands.find((c) => c.name === 'stop-dag-tasks')
    expect(run?.input?.hint).toBe('[<source-slug>]')
    expect(run?.description.length).toBeGreaterThan(4)
    expect(stop?.input).toBeUndefined() // 无参指令——composer 零占位
    expect(typeof run?.handler).toBe('function')
    expect(typeof stop?.handler).toBe('function')
    // 六 tool 照常注册（指令面 additive——tool 面零波及）
    expect(rt.registeredTools).toHaveLength(6)
    dispose()
    expect(rt.disposedCommands).toBe(2) // 注销器并入插件 disposer（两指令各恰一次）
  })

  it('commands 面缺席（reflect 无该键）：零指令注册、六 tool 照常（fail-soft 不阻载——R3）', () => {
    const rt = new TempRuntime()
    const dispose = forgePlugin(rt.withReflect({}))
    expect(rt.registeredCommands).toHaveLength(0)
    expect(rt.registeredTools).toHaveLength(6)
    dispose()
    expect(rt.disposedCommands).toBe(0)
  })

  it('reflect.get 抛异常 / 非函数面：同降级（零指令、装配照常）', () => {
    const rt1 = new TempRuntime()
    const d1 = forgePlugin({ ...rt1.ctx(), reflect: { get: () => { throw new Error('inactive fiber') } } })
    expect(rt1.registeredCommands).toHaveLength(0)
    expect(rt1.registeredTools).toHaveLength(6)
    d1()
    const rt2 = new TempRuntime()
    const d2 = forgePlugin(rt2.withReflect({ commands: 'not-a-registry' }))
    expect(rt2.registeredCommands).toHaveLength(0)
    expect(rt2.registeredTools).toHaveLength(6)
    d2()
  })
})
