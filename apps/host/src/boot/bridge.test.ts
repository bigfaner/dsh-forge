// fix-1 boot 子进程桥协议 pin：消息形状守卫 / Map wire 编解码 / argv 选项解析 /
// 子侧 RPC 派发（ok 与 fail 双态）/ 主侧代理转发与白名单——child 形态的纯逻辑面
// 逐项锚定（进程编排在 run.ts，e2e 面 = flywheel.spec.ts）。
// fix-28 错误过桥保真：typed error 结构化（code/message/data）/ 非 typed string 形态
// 不变（fail-loud）/ 主侧双形态解码重建——信封面（rpcEnvelope 判型）衔接见 rpc-envelope.test.ts。
// fix-33：子侧 send 防护（sendGuarded 序列化失败保 id 降级）+ 白名单类型锚
// （satisfies/覆盖完备性——服务面改名/漂移编译期显形）。
import { assertType, describe, expect, it } from 'vitest'
import { FORGE_EVENT_CHANNELS } from '@dsh-forge/contracts'
import {
  asEventMessage,
  asReadyMessage,
  BRIDGE_SERVICE_NAMES,
  createBridgeProxy,
  decodeWire,
  dispatchRpc,
  DOCS_SERVICE_METHODS,
  encodeWire,
  extraPatchFiles,
  FEATURES_SERVICE_METHODS,
  KNOWLEDGE_SERVICE_METHODS,
  parseChildOptions,
  PROJECT_SERVICE_METHODS,
  PROJECTS_M2_SERVICE_METHODS,
  PROPOSALS_SERVICE_METHODS,
  rebuildBridgeError,
  sendGuarded,
  serializeBridgeError,
  SETTINGS_SERVICE_METHODS,
  TASKS_SERVICE_METHODS,
  type BridgeRpcRequest,
  type ChildToMainMessage,
  type DocsWhitelistCoverage,
  type FeaturesWhitelistCoverage,
  type KnowledgeWhitelistCoverage,
  type ProjectWhitelistCoverage,
  type ProjectsM2WhitelistCoverage,
  type ProposalsWhitelistCoverage,
  type ServiceNamesCoverage,
  type SettingsWhitelistCoverage,
  type TasksWhitelistCoverage,
} from './bridge.js'

/** typed error 结构替身（core ProjectWriteError 同型：readonly code + data + Error——fix-28 过桥保真锚） */
class ProjectWriteLikeError extends Error {
  readonly code = 'ERR_PROJECT_WRITE' as const
  readonly data: Record<string, unknown>
  constructor(data: Record<string, unknown>) {
    super(`应用库 projects 行写入失败（registry.delete 补偿已执行，dsh 侧零孤儿）：${String(data.wsPath ?? '')}`)
    this.name = 'ProjectWriteError'
    this.data = data
  }
}

describe('encodeWire / decodeWire（Map wire 信封）', () => {
  it('Map → entries 信封 → Map 往返（heatByEntry 形状：number 键）', () => {
    const heat = new Map<number, number>([
      [1, 3],
      [7, 12],
    ])
    const wire = JSON.parse(JSON.stringify(encodeWire(heat))) as unknown // 过 IPC JSON 序列化面
    const decoded = decodeWire(wire)
    expect(decoded).toBeInstanceOf(Map)
    expect([...(decoded as Map<number, number>).entries()]).toEqual([
      [1, 3],
      [7, 12],
    ])
  })

  it('非 Map 值原样（DTO/数组/null 不动）', () => {
    for (const value of [{ id: 'x' }, [1, 2], null, 'text', 42]) {
      expect(encodeWire(value)).toBe(value)
      expect(decodeWire(value)).toBe(value)
    }
  })

  it('信封载荷非法原样降级（不抛、不猜）', () => {
    const malformed = { __dshForgeMap__: 'not-entries' }
    expect(decodeWire(malformed)).toBe(malformed)
  })
})

describe('parseChildOptions（argv[2] BootDshOptions JSON）', () => {
  const valid = JSON.stringify({
    profileDir: 'C:/p',
    installAnchor: 'C:/a/package.json',
    port: 19400,
    stateDb: 'C:/ud/state.db',
    bindingsFile: 'C:/ud/bindings.json',
  })

  it('合法 JSON → 完整选项', () => {
    expect(parseChildOptions(['electron.exe', 'child.js', valid])).toEqual({
      profileDir: 'C:/p',
      installAnchor: 'C:/a/package.json',
      port: 19400,
      stateDb: 'C:/ud/state.db',
      bindingsFile: 'C:/ud/bindings.json',
    })
  })

  it('argv 缺席 / 非 JSON / 形状非法 → undefined', () => {
    expect(parseChildOptions(['electron.exe', 'child.js'])).toBeUndefined()
    expect(parseChildOptions(['electron.exe', 'child.js', 'not-json'])).toBeUndefined()
    expect(parseChildOptions(['electron.exe', 'child.js', '{"port":19400}'])).toBeUndefined() // 路径字段缺席
    expect(
      parseChildOptions(['electron.exe', 'child.js', JSON.stringify({ ...JSON.parse(valid), port: 0 })]),
    ).toBeUndefined() // 非法端口
  })

  it('credentialsPath 可选透传（fix-26 凭据桥；空串/缺席视为不桥）', () => {
    const bridged = parseChildOptions([
      'electron.exe',
      'child.js',
      JSON.stringify({ ...JSON.parse(valid), credentialsPath: 'C:/Users/u/.dsh/.credentials.yaml' }),
    ])
    expect(bridged?.credentialsPath).toBe('C:/Users/u/.dsh/.credentials.yaml')
    const empty = parseChildOptions([
      'electron.exe',
      'child.js',
      JSON.stringify({ ...JSON.parse(valid), credentialsPath: '' }),
    ])
    expect(empty?.credentialsPath).toBeUndefined()
    expect(parseChildOptions(['electron.exe', 'child.js', valid])?.credentialsPath).toBeUndefined()
  })

  it('M2 装配两缝可选透传（3.4：tasksHome / skillsDir；空串/缺席 = 不注入降级）', () => {
    const m2 = parseChildOptions([
      'electron.exe',
      'child.js',
      JSON.stringify({ ...JSON.parse(valid), tasksHome: 'C:/ud/forge-workspaces', skillsDir: 'C:/pkg/skills' }),
    ])
    expect(m2?.tasksHome).toBe('C:/ud/forge-workspaces')
    expect(m2?.skillsDir).toBe('C:/pkg/skills')
    const legacy = parseChildOptions(['electron.exe', 'child.js', valid]) // 旧载荷（3.4 前主进程）零破坏
    expect(legacy?.tasksHome).toBeUndefined()
    expect(legacy?.skillsDir).toBeUndefined()
    const empty = parseChildOptions([
      'electron.exe',
      'child.js',
      JSON.stringify({ ...JSON.parse(valid), tasksHome: '', skillsDir: '' }),
    ])
    expect(empty?.tasksHome).toBeUndefined()
    expect(empty?.skillsDir).toBeUndefined()
  })

  it('M3 装配缝可选透传（3.7 specSkillsDir / 3.8 settingsFile；空串/缺席 = 不注入降级）', () => {
    const m3 = parseChildOptions([
      'electron.exe',
      'child.js',
      JSON.stringify({
        ...JSON.parse(valid),
        specSkillsDir: 'C:/pkg/spec-skills',
        settingsFile: 'C:/ud/forge-settings.json',
      }),
    ])
    expect(m3?.specSkillsDir).toBe('C:/pkg/spec-skills')
    expect(m3?.settingsFile).toBe('C:/ud/forge-settings.json')
    const legacy = parseChildOptions(['electron.exe', 'child.js', valid]) // 旧载荷（M3 前主进程）零破坏
    expect(legacy?.specSkillsDir).toBeUndefined()
    expect(legacy?.settingsFile).toBeUndefined()
    const empty = parseChildOptions([
      'electron.exe',
      'child.js',
      JSON.stringify({ ...JSON.parse(valid), specSkillsDir: '', settingsFile: '' }),
    ])
    expect(empty?.specSkillsDir).toBeUndefined()
    expect(empty?.settingsFile).toBeUndefined()
  })
})

describe('asReadyMessage（ready 守卫）', () => {
  it('形状齐备 → ready 消息（url/injections/七服务在场位——Interface 6 六位 + M3 3.8 设置域第七位）', () => {
    const ready = asReadyMessage({
      type: 'ready',
      url: 'http://127.0.0.1:1/#t',
      injections: [{ url: 'x.js' }],
      services: {
        forgeProjects: true,
        forgeKnowledge: false,
        forgeTasks: true,
        forgeFeatures: true,
        forgeProposals: false,
        forgeDocs: true,
        forgeSettings: false,
      },
    })
    expect(ready).toEqual({
      type: 'ready',
      url: 'http://127.0.0.1:1/#t',
      injections: [{ url: 'x.js' }],
      services: {
        forgeProjects: true,
        forgeKnowledge: false,
        forgeTasks: true,
        forgeFeatures: true,
        forgeProposals: false,
        forgeDocs: true,
        forgeSettings: false,
      },
    })
  })

  it('M2 四域 + M3 设置域在场位缺席任一 → undefined（七位齐备才可作 manifest 面）', () => {
    for (const missing of ['forgeTasks', 'forgeFeatures', 'forgeProposals', 'forgeDocs', 'forgeSettings'] as const) {
      const services = {
        forgeProjects: true,
        forgeKnowledge: true,
        forgeTasks: true,
        forgeFeatures: true,
        forgeProposals: true,
        forgeDocs: true,
        forgeSettings: true,
        [missing]: undefined,
      }
      expect(asReadyMessage({ type: 'ready', url: 'http://x', injections: [], services })).toBeUndefined()
    }
  })

  it('非 ready 消息（rpc-result/event 等）与形状残缺 → undefined', () => {
    expect(asReadyMessage({ type: 'rpc-result', id: 1, ok: true, data: 1 })).toBeUndefined()
    expect(asReadyMessage({ type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: { projectId: 'p' } })).toBeUndefined()
    expect(asReadyMessage({ type: 'ready', injections: [], services: { forgeProjects: true } })).toBeUndefined()
    expect(asReadyMessage(null)).toBeUndefined()
  })

  it('tools 清单可选透传（3.4 冒烟观测面）：在场 = string[]；缺席/畸形 = 降级不阻 ready', () => {
    const base = {
      type: 'ready',
      url: 'http://127.0.0.1:1/#t',
      injections: [],
      services: {
        forgeProjects: true,
        forgeKnowledge: true,
        forgeTasks: true,
        forgeFeatures: true,
        forgeProposals: true,
        forgeDocs: true,
        forgeSettings: true,
      },
    } as const
    expect(asReadyMessage({ ...base, tools: ['addTask', 'claimTask'] })?.tools).toEqual(['addTask', 'claimTask'])
    expect(asReadyMessage(base)?.tools).toBeUndefined() // 缺席（旧 child）不阻 ready
    expect(asReadyMessage({ ...base, tools: ['ok', 42] })?.tools).toBeUndefined() // 畸形降级
    expect(asReadyMessage({ ...base, tools: 'addTask' })?.tools).toBeUndefined()
  })
})

// ── 3.1 桥事件信封（G1-09 pin：信封形状 + channel 常量） ──

describe('asEventMessage（事件消息守卫——run.ts event 分支消费）', () => {
  it('形状齐备 → 事件消息（channel = FORGE_EVENT_CHANNELS 常量值本尊；载荷只读 { projectId }）', () => {
    const event = asEventMessage({
      type: 'event',
      channel: 'forge:events/tasks-changed',
      payload: { projectId: 'p-1' },
    })
    expect(event).toEqual({
      type: 'event',
      channel: FORGE_EVENT_CHANNELS.tasksChanged,
      payload: { projectId: 'p-1' },
    })
  })

  it('非 event 消息 / channel 越allowlist / 载荷形状残缺 → undefined（静默忽略不转发）', () => {
    expect(asEventMessage({ type: 'rpc-result', id: 1, ok: true })).toBeUndefined()
    expect(asEventMessage({ type: 'event', channel: 'forge:events/evil', payload: { projectId: 'p' } })).toBeUndefined()
    expect(asEventMessage({ type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged })).toBeUndefined()
    expect(asEventMessage({ type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: null })).toBeUndefined()
    expect(
      asEventMessage({ type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: { projectId: 42 } }),
    ).toBeUndefined()
    expect(
      asEventMessage({ type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload: { other: 'x' } }),
    ).toBeUndefined()
  })

  it('载荷只读面：守卫重建新载荷对象（不透传原引用——channel/payload Hard Rule 只读口径）', () => {
    const payload = { projectId: 'p-1' }
    const event = asEventMessage({ type: 'event', channel: FORGE_EVENT_CHANNELS.tasksChanged, payload })!
    expect(event.payload).not.toBe(payload)
    expect(event.payload).toEqual(payload)
  })
})

describe('dispatchRpc（子侧派发——结果面永不 reject）', () => {
  const request = (over: Partial<BridgeRpcRequest> = {}): BridgeRpcRequest => ({
    type: 'rpc',
    id: 7,
    service: 'forgeProjects',
    method: 'listProjects',
    args: [],
    ...over,
  })
  const services = {
    forgeProjects: {
      listProjects: async () => [{ id: 'p1', wsPath: 'C:/ws' }],
      getProject: () => {
        throw new Error('ERR_PROJECT_NOT_FOUND')
      },
    },
  }

  it('ok 态：方法执行 + wire 编码应用（Map → 信封）', async () => {
    const result = await dispatchRpc(
      { forgeKnowledge: { heatByEntry: async () => new Map([[3, 5]]) } },
      request({ service: 'forgeKnowledge', method: 'heatByEntry' }),
    )
    expect(result).toEqual({ type: 'rpc-result', id: 7, ok: true, data: { __dshForgeMap__: [[3, 5]] } })
  })

  it('服务方法异常 → ok=false + 错误信息（服务层 error code 透传）', async () => {
    const result = await dispatchRpc(services, request({ method: 'getProject', args: ['x'] }))
    expect(result.ok).toBe(false)
    expect((result as { error?: unknown }).error).toBe('ERR_PROJECT_NOT_FOUND')
  })

  it('typed error（fix-28）→ ok=false + 结构化形态（code/message/data 过桥保真）', async () => {
    const failure = new ProjectWriteLikeError({
      wsPath: 'C:\\ws\\demo',
      compensated: { workspaceId: 'ws-uuid-1', reason: '③ 应用库写入失败（registry.delete 补偿已执行）' },
    })
    const failing = { forgeProjects: { registerProject: () => { throw failure } } }
    const result = await dispatchRpc(failing, request({ method: 'registerProject', args: [{}] }))
    expect(result.ok).toBe(false)
    expect((result as { error?: unknown }).error).toEqual({
      code: 'ERR_PROJECT_WRITE',
      message: failure.message,
      data: {
        wsPath: 'C:\\ws\\demo',
        compensated: { workspaceId: 'ws-uuid-1', reason: '③ 应用库写入失败（registry.delete 补偿已执行）' },
      },
    })
  })

  it('伪造码 typed 形态（fix-28）→ 判型拒绝 → string 形态（fail-loud 语义不变）', async () => {
    const fake = new Error('fake code') as Error & { code: string }
    fake.code = 'ERR_MADE_UP'
    expect(serializeBridgeError(fake)).toBe('fake code')
    const plain = new Error('boom')
    expect(serializeBridgeError(plain)).toBe('boom')
    expect(serializeBridgeError('raw string')).toBe('raw string')
    expect(serializeBridgeError({ not: 'error' })).toBe('[object Object]')
  })

  it('服务/方法不在场 → ok=false（白名单外不可达）', async () => {
    expect((await dispatchRpc(services, request({ service: 'forgeKnowledge' }))).ok).toBe(false)
    expect((await dispatchRpc(services, request({ method: 'nope' }))).ok).toBe(false)
  })
})

describe('rebuildBridgeError（主侧双形态解码——fix-28 wire 兼容）', () => {
  it('string 旧形态 → 普通 Error（现行为不变——无 code/data 属性）', () => {
    const err = rebuildBridgeError('bridge: forgeProjects.nope 不在场')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('bridge: forgeProjects.nope 不在场')
    expect('code' in err).toBe(false)
    expect('data' in err).toBe(false)
  })

  it('结构化形态 → Error 重建 code/data 属性（rpcEnvelope 判型素材齐备）', () => {
    const err = rebuildBridgeError({
      code: 'ERR_PROJECT_WRITE',
      message: '应用库 projects 行写入失败（registry.delete 补偿已执行）',
      data: { wsPath: 'C:\\ws\\demo', compensated: { workspaceId: 'ws-uuid-1' } },
    }) as Error & { code?: unknown; data?: unknown }
    expect(err.message).toBe('应用库 projects 行写入失败（registry.delete 补偿已执行）')
    expect(err.code).toBe('ERR_PROJECT_WRITE')
    expect(err.data).toEqual({ wsPath: 'C:\\ws\\demo', compensated: { workspaceId: 'ws-uuid-1' } })
  })

  it('结构化形态字段缺席 → 按在场属性重建；message 非法 → 字符串化降级（绝不抛）', () => {
    const noCode = rebuildBridgeError({ message: 'x' }) as Error & { code?: unknown }
    expect(noCode.message).toBe('x')
    expect(noCode.code).toBeUndefined()
    const malformed = rebuildBridgeError({ message: 42, code: 'ERR_PROJECT_WRITE' } as unknown as { message: string })
    expect(malformed.message).toBe('[object Object]')
    expect((malformed as Error & { code?: unknown }).code).toBe('ERR_PROJECT_WRITE')
  })

  it('往返保真：serializeBridgeError → rebuildBridgeError → code/message/data 等值', () => {
    const failure = new ProjectWriteLikeError({ wsPath: 'C:\\ws\\rt', compensated: { workspaceId: 'ws-2' } })
    const rebuilt = rebuildBridgeError(serializeBridgeError(failure)) as Error & { code?: unknown; data?: unknown }
    expect(rebuilt.message).toBe(failure.message)
    expect(rebuilt.code).toBe('ERR_PROJECT_WRITE')
    expect(rebuilt.data).toEqual(failure.data)
  })
})

describe('createBridgeProxy（主侧代理）', () => {
  it('白名单方法逐一转发 (service, method, args) 并 wire 解码', async () => {
    const calls: Array<[string, string, readonly unknown[]]> = []
    const proxy = createBridgeProxy<Record<string, () => Promise<unknown>>>('forgeKnowledge', ['heatByEntry'], async (s, m, a) => {
      calls.push([s, m, a])
      return { __dshForgeMap__: [[2, 9]] } // 子侧 encodeWire 产物形状
    })
    const heat = (await proxy.heatByEntry!()) as Map<number, number>
    expect(calls).toEqual([['forgeKnowledge', 'heatByEntry', []]])
    expect(heat).toBeInstanceOf(Map)
    expect(heat.get(2)).toBe(9)
  })

  it('方法白名单常量 = contracts 服务面全集（代理可达面锚；M2 四域 + projects 扩族——G1-10）', () => {
    expect([...PROJECT_SERVICE_METHODS]).toEqual([
      'registerProject',
      'listProjects',
      'getProject',
      'updateProject',
      'reconcileAtStartup',
    ])
    expect([...KNOWLEDGE_SERVICE_METHODS]).toEqual([
      'rebuildIndex',
      'search',
      'readAbstract',
      'listEntries',
      'getEntryDetail',
      'heatByEntry',
      'sessionRecall',
      'browse',
    ])
    expect([...TASKS_SERVICE_METHODS]).toEqual([
      'addTask',
      'claimTask',
      'submitTask',
      'transitionTask',
      'queryTask',
      'validateFeatureTasks',
      'listTasks',
      'taskStats',
      'taskGraph',
      'taskDetail',
      'sessionLinks',
    ])
    expect([...FEATURES_SERVICE_METHODS]).toEqual([
      'registerFeature',
      'transitionFeature',
      'upsertFeatureDoc',
      'listFeatures',
      'listFeatureDocs',
    ])
    expect([...PROPOSALS_SERVICE_METHODS]).toEqual([
      'createProposal',
      'transitionProposal',
      'listProposals',
      // M3（1.1 契约对齐）：两新面透传名（core 垫片 fail-loud；语义实现归 2.2/2.3）
      'setProposalMode',
      'listProposalDocs',
    ])
    expect([...DOCS_SERVICE_METHODS]).toEqual(['read'])
    expect([...SETTINGS_SERVICE_METHODS]).toEqual(['get', 'set'])
    expect([...PROJECTS_M2_SERVICE_METHODS]).toEqual(['deriveTaskStoreDir'])
    expect([...BRIDGE_SERVICE_NAMES]).toEqual([
      'forgeProjects',
      'forgeKnowledge',
      'forgeTasks',
      'forgeFeatures',
      'forgeProposals',
      'forgeDocs',
      'forgeSettings',
    ])
  })
})

describe('extraPatchFiles（DSH_FORGE_PATCH_FILES 外部叠层清单）', () => {
  it("';' 分隔 + trim + 空段滤除；缺席 = 空清单", () => {
    expect(extraPatchFiles({ DSH_FORGE_PATCH_FILES: ' C:/a.yml ; ;C:/b.yml ' })).toEqual(['C:/a.yml', 'C:/b.yml'])
    expect(extraPatchFiles({})).toEqual([])
    expect(extraPatchFiles({ DSH_FORGE_PATCH_FILES: '' })).toEqual([])
  })
})

// ── fix-33 ① 子侧 send 防护（IPC 序列化失败不落 unhandled rejection） ──

describe('sendGuarded（fix-33 ①：子侧消息发送防护）', () => {
  it('rpc-result 载荷序列化失败（BigInt/循环引用）→ 回填保 id 降级 error-result（主侧 pending 可结算）', () => {
    const sent: ChildToMainMessage[] = []
    const failOnPayload = (message: ChildToMainMessage): void => {
      if (message.type === 'rpc-result' && message.ok) {
        throw new TypeError('Do not know how to serialize a BigInt')
      }
      sent.push(message)
    }
    expect(() =>
      sendGuarded({ type: 'rpc-result', id: 7, ok: true, data: { heat: 1n } }, failOnPayload),
    ).not.toThrow()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'rpc-result', id: 7, ok: false }) // 保 id
    expect((sent[0] as { error?: unknown }).error).toEqual(expect.stringContaining('序列化失败'))
  })

  it('ready/fatal 面序列化失败 → 静默降级丢弃（无 id 可保——boot 失败由主侧 waitForReady/close 兜底）', () => {
    const sent: ChildToMainMessage[] = []
    const failAll = (): void => {
      throw new TypeError('circular structure')
    }
    const sixBits = {
      forgeProjects: true,
      forgeKnowledge: true,
      forgeTasks: true,
      forgeFeatures: true,
      forgeProposals: true,
      forgeDocs: true,
      forgeSettings: true,
    }
    expect(() => sendGuarded({ type: 'ready', url: 'http://x', injections: [], services: sixBits }, failAll)).not.toThrow()
    expect(() => sendGuarded({ type: 'fatal', message: 'boom' }, failAll)).not.toThrow()
    expect(sent).toEqual([])
  })

  it('降级面自身再失败（通道已死）→ 静默不抛；正常发送零变化（直通）', () => {
    const failAll = (): void => {
      throw new Error('channel closed')
    }
    expect(() => sendGuarded({ type: 'rpc-result', id: 1, ok: true, data: 1 }, failAll)).not.toThrow()
    const sent: ChildToMainMessage[] = []
    sendGuarded({ type: 'rpc-result', id: 2, ok: true, data: 1 }, (m) => {
      sent.push(m)
    })
    expect(sent).toEqual([{ type: 'rpc-result', id: 2, ok: true, data: 1 }])
  })
})

// ── fix-33 ⑮ 白名单类型锚（编译期：satisfies + 覆盖完备性收敛 never） ──

describe('方法白名单类型锚（fix-33 ⑮——经测试类型门消费的编译期断言）', () => {
  it('覆盖完备性类型收敛 never：服务面缺席方法在此显形（assertType 零运行期——类型漂移由 lint:test-types 拦截）', () => {
    assertType<never>(undefined as ProjectWhitelistCoverage)
    assertType<never>(undefined as KnowledgeWhitelistCoverage)
    assertType<never>(undefined as TasksWhitelistCoverage)
    assertType<never>(undefined as FeaturesWhitelistCoverage)
    assertType<never>(undefined as ProposalsWhitelistCoverage)
    assertType<never>(undefined as DocsWhitelistCoverage)
    assertType<never>(undefined as SettingsWhitelistCoverage)
    assertType<never>(undefined as ProjectsM2WhitelistCoverage)
    assertType<never>(undefined as ServiceNamesCoverage)
    expect(PROJECT_SERVICE_METHODS).toHaveLength(5)
    expect(KNOWLEDGE_SERVICE_METHODS).toHaveLength(8)
    expect(TASKS_SERVICE_METHODS).toHaveLength(11)
    expect(FEATURES_SERVICE_METHODS).toHaveLength(5)
    expect(PROPOSALS_SERVICE_METHODS).toHaveLength(5)
    expect(DOCS_SERVICE_METHODS).toHaveLength(1)
    expect(SETTINGS_SERVICE_METHODS).toHaveLength(2)
    expect(PROJECTS_M2_SERVICE_METHODS).toHaveLength(1)
    expect(BRIDGE_SERVICE_NAMES).toHaveLength(7)
  })
})
