// fix-1 boot 子进程桥协议 pin：消息形状守卫 / Map wire 编解码 / argv 选项解析 /
// 子侧 RPC 派发（ok 与 fail 双态）/ 主侧代理转发与白名单——child 形态的纯逻辑面
// 逐项锚定（进程编排在 run.ts，e2e 面 = flywheel.spec.ts）。
// fix-28 错误过桥保真：typed error 结构化（code/message/data）/ 非 typed string 形态
// 不变（fail-loud）/ 主侧双形态解码重建——信封面（rpcEnvelope 判型）衔接见 rpc-envelope.test.ts。
// fix-33：子侧 send 防护（sendGuarded 序列化失败保 id 降级）+ 白名单类型锚
// （satisfies/覆盖完备性——服务面改名/漂移编译期显形）。
import { assertType, describe, expect, it, vi } from 'vitest'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval/types'
import { FORGE_EVENT_CHANNELS, type RemoteApprovalDecisionInput } from '@dsh-forge/contracts'
import {
  approvalWaterfallAnswer,
  APPROVAL_SERVICE_METHODS,
  asEventMessage,
  asDiagMessage,
  asPairMessage,
  asPairConnectedMessage,
  asReadyMessage,
  asTunnelMessage,
  asTunnelToggleMessage,
  asTunnelFallbackMessage,
  asPinConsentMessage,
  asPinResetMessage,
  BRIDGE_SERVICE_NAMES,
  BUGS_SERVICE_METHODS,
  createApprovalRelay,
  createBridgeProxy,
  decodeWire,
  dispatchRpc,
  DOCS_SERVICE_METHODS,
  encodeWire,
  extraPatchFiles,
  FEATURES_SERVICE_METHODS,
  KNOWLEDGE_SERVICE_METHODS,
  parseChildOptions,
  isTunnelHost,
  pairRedirectOf,
  remoteViewFilePathOf,
  remoteViewIndexTap,
  REMOTE_VIEW_BOUNCE_MARKUP,
  PROJECT_SERVICE_METHODS,
  PROJECTS_M2_SERVICE_METHODS,
  PROPOSALS_SERVICE_METHODS,
  rebuildBridgeError,
  redactTokenQuery,
  sanitizeLogLine,
  sendGuarded,
  serializeBridgeError,
  SETTINGS_SERVICE_METHODS,
  TASKS_SERVICE_METHODS,
  type BridgeRpcRequest,
  type ApprovalWhitelistCoverage,
  type BugsWhitelistCoverage,
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
  it('形状齐备 → ready 消息（url/injections/八服务在场位——Interface 6 六位 + M3 3.8 设置域第七位 + fix-bug bugs 域第八位）', () => {
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
        forgeBugs: true,
        approval: true,
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
        forgeBugs: true,
        approval: true,
      },
    })
  })

  it('M2 四域 + M3 设置域 + bugs 域 + approval 位缺席任一 → undefined（九位齐备才可作 manifest 面）', () => {
    for (const missing of ['forgeTasks', 'forgeFeatures', 'forgeProposals', 'forgeDocs', 'forgeSettings', 'forgeBugs', 'approval'] as const) {
      const services = {
        forgeProjects: true,
        forgeKnowledge: true,
        forgeTasks: true,
        forgeFeatures: true,
        forgeProposals: true,
        forgeDocs: true,
        forgeSettings: true,
        forgeBugs: true,
        approval: true,
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
        forgeBugs: true,
        approval: true,
      },
    } as const
    expect(asReadyMessage({ ...base, tools: ['addTask', 'claimTask'] })?.tools).toEqual(['addTask', 'claimTask'])
    expect(asReadyMessage(base)?.tools).toBeUndefined() // 缺席（旧 child）不阻 ready
    expect(asReadyMessage({ ...base, tools: ['ok', 42] })?.tools).toBeUndefined() // 畸形降级
    expect(asReadyMessage({ ...base, tools: 'addTask' })?.tools).toBeUndefined()
  })

  it('fix-5：remotePairUrl 可选透传（官方配对地址单源）；缺席（旧 child）/非串/空串 = 降级不阻 ready', () => {
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
        forgeBugs: true,
        approval: true,
      },
    } as const
    expect(asReadyMessage({ ...base, remotePairUrl: 'http://192.168.1.7:1/?token=t' })?.remotePairUrl).toBe(
      'http://192.168.1.7:1/?token=t',
    )
    expect(asReadyMessage(base)?.remotePairUrl).toBeUndefined()
    expect(asReadyMessage({ ...base, remotePairUrl: '' })?.remotePairUrl).toBeUndefined()
    expect(asReadyMessage({ ...base, remotePairUrl: 42 })?.remotePairUrl).toBeUndefined()
  })

  it('fix-6：remotePairExpiresAt 可选透传（token TTL 读数——桌面倒计时单源）；缺席/非正数 = 降级不阻 ready', () => {
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
        forgeBugs: true,
        approval: true,
      },
    } as const
    expect(asReadyMessage({ ...base, remotePairExpiresAt: 123456 })?.remotePairExpiresAt).toBe(123456)
    expect(asReadyMessage(base)?.remotePairExpiresAt).toBeUndefined()
    expect(asReadyMessage({ ...base, remotePairExpiresAt: 0 })?.remotePairExpiresAt).toBeUndefined()
    expect(asReadyMessage({ ...base, remotePairExpiresAt: -5 })?.remotePairExpiresAt).toBeUndefined()
    expect(asReadyMessage({ ...base, remotePairExpiresAt: 'soon' })?.remotePairExpiresAt).toBeUndefined()
  })
})

// ── fix-6 配对令牌轮换推送（child → 主单向——官方 reload 轮换的桥载体） ──

describe('asPairConnectedMessage（fix-7 /pair 握手成功推送守卫——run.ts connected 分支消费）', () => {
  it('type pair-connected → 消息对象（零载荷面）', () => {
    expect(asPairConnectedMessage({ type: 'pair-connected' })).toEqual({ type: 'pair-connected' })
  })
  it('非 pair-connected / 畸形 → undefined（静默忽略不转发）', () => {
    expect(asPairConnectedMessage({ type: 'pair', remotePairUrl: 'http://x/pair?token=t', remotePairExpiresAt: 1 })).toBeUndefined()
    expect(asPairConnectedMessage({ type: 'ready', url: 'x', injections: [], services: {} })).toBeUndefined()
    expect(asPairConnectedMessage(undefined)).toBeUndefined()
    expect(asPairConnectedMessage({ type: 'pair-connected ', extra: 1 })).toBeUndefined()
  })
})

describe('asPairMessage（pair 消息守卫——run.ts 轮换分支消费）', () => {
  it('形状齐备 → pair 消息（remotePairUrl 非空串 + remotePairExpiresAt 正数）', () => {
    expect(asPairMessage({ type: 'pair', remotePairUrl: 'http://192.168.1.7:1/pair?token=t', remotePairExpiresAt: 300_000 })).toEqual({
      type: 'pair',
      remotePairUrl: 'http://192.168.1.7:1/pair?token=t',
      remotePairExpiresAt: 300_000,
    })
  })

  it('非 pair 消息 / URL 残缺 / TTL 非正数 → undefined（静默忽略不转发）', () => {
    expect(asPairMessage({ type: 'ready', url: 'x', injections: [], services: {} })).toBeUndefined()
    expect(asPairMessage({ type: 'event', channel: 'forge:events/tasks-changed', payload: { projectId: 'p' } })).toBeUndefined()
    expect(asPairMessage({ type: 'pair', remotePairUrl: '', remotePairExpiresAt: 1 })).toBeUndefined()
    expect(asPairMessage({ type: 'pair', remotePairUrl: 'http://x/pair?token=t' })).toBeUndefined()
    expect(asPairMessage({ type: 'pair', remotePairUrl: 'http://x/pair?token=t', remotePairExpiresAt: 0 })).toBeUndefined()
    expect(asPairMessage({ type: 'pair', remotePairUrl: 42, remotePairExpiresAt: 1 })).toBeUndefined()
  })
})

// ── fix-17：PIN 读数透传（官方 6 位 PIN + TTL——互联网 tab PIN 卡单源） ──

describe('asReadyMessage/asPairMessage PIN 读数透传（fix-17 ③）', () => {
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
      forgeBugs: true,
      approval: true,
    },
  } as const

  it('ready：remotePin（6 位数字）+ remotePinExpiresAt（正数）透传；畸形 = 降级不阻 ready', () => {
    const withPin = asReadyMessage({ ...base, remotePin: '482913', remotePinExpiresAt: 123456 })
    expect(withPin?.remotePin).toBe('482913')
    expect(withPin?.remotePinExpiresAt).toBe(123456)
    expect(asReadyMessage(base)?.remotePin).toBeUndefined()
    for (const badPin of ['', '12345', '1234567', 'abcdef', 42]) {
      expect(asReadyMessage({ ...base, remotePin: badPin })?.remotePin).toBeUndefined()
    }
    expect(asReadyMessage({ ...base, remotePin: '482913', remotePinExpiresAt: 0 })?.remotePinExpiresAt).toBeUndefined()
  })

  it('pair：remotePin/remotePinExpiresAt 可选透传（随轮换换新）；畸形降级缺席', () => {
    const withPin = asPairMessage({ type: 'pair', remotePairUrl: 'http://x/pair?token=t', remotePairExpiresAt: 1, remotePin: '654321', remotePinExpiresAt: 2 })
    expect(withPin).toEqual({ type: 'pair', remotePairUrl: 'http://x/pair?token=t', remotePairExpiresAt: 1, remotePin: '654321', remotePinExpiresAt: 2 })
    const without = asPairMessage({ type: 'pair', remotePairUrl: 'http://x/pair?token=t', remotePairExpiresAt: 1 })
    expect(without).toEqual({ type: 'pair', remotePairUrl: 'http://x/pair?token=t', remotePairExpiresAt: 1 })
    const bad = asPairMessage({ type: 'pair', remotePairUrl: 'http://x/pair?token=t', remotePairExpiresAt: 1, remotePin: 'abc', remotePinExpiresAt: 2 })
    expect('remotePin' in (bad ?? {})).toBe(false)
  })
})

// ── fix-17 ②：tunnel-toggle 主 → 子消息（tab 切换重连缝载体） ──

describe('asTunnelToggleMessage（tunnel-toggle 守卫——child.ts tab 重连分支消费）', () => {
  it('{type: tunnel-toggle} → 消息对象；他形 → undefined', () => {
    expect(asTunnelToggleMessage({ type: 'tunnel-toggle' })).toEqual({ type: 'tunnel-toggle' })
    expect(asTunnelToggleMessage({ type: 'shutdown' })).toBeUndefined()
    expect(asTunnelToggleMessage({ type: 'tunnel' })).toBeUndefined()
    expect(asTunnelToggleMessage(null)).toBeUndefined()
    expect(asTunnelToggleMessage(undefined)).toBeUndefined()
  })
})

// ── fix-18：tunnel-fallback / pin-reset 主 → 子消息（换线遮罩缝 + PIN 重置缝载体） ──

describe('asTunnelFallbackMessage（tunnel-fallback 守卫——child.ts 换线分支消费）', () => {
  it('{type: tunnel-fallback} → 消息对象；他形 → undefined', () => {
    expect(asTunnelFallbackMessage({ type: 'tunnel-fallback' })).toEqual({ type: 'tunnel-fallback' })
    expect(asTunnelFallbackMessage({ type: 'tunnel-toggle' })).toBeUndefined()
    expect(asTunnelFallbackMessage(null)).toBeUndefined()
    expect(asTunnelFallbackMessage(undefined)).toBeUndefined()
  })
})

describe('asPinResetMessage（pin-reset 守卫——child.ts PIN 重置分支消费）', () => {
  it('{type: pin-reset} → 消息对象；他形 → undefined', () => {
    expect(asPinResetMessage({ type: 'pin-reset' })).toEqual({ type: 'pin-reset' })
    expect(asPinResetMessage({ type: 'tunnel-toggle' })).toBeUndefined()
    expect(asPinResetMessage(null)).toBeUndefined()
    expect(asPinResetMessage(undefined)).toBeUndefined()
  })
})

// ── fix-26：pin-consent 主 → 子消息（长效密码开关——child.ts durable 缝消费） ──

describe('asPinConsentMessage（pin-consent 守卫——child.ts setDurable 分支消费）', () => {
  it('{type: pin-consent, consent: boolean} → 消息对象；consent 非布尔/他形 → undefined', () => {
    expect(asPinConsentMessage({ type: 'pin-consent', consent: true })).toEqual({ type: 'pin-consent', consent: true })
    expect(asPinConsentMessage({ type: 'pin-consent', consent: false })).toEqual({ type: 'pin-consent', consent: false })
    expect(asPinConsentMessage({ type: 'pin-consent' })).toBeUndefined()
    expect(asPinConsentMessage({ type: 'pin-consent', consent: 'yes' })).toBeUndefined()
    expect(asPinConsentMessage({ type: 'pin-reset' })).toBeUndefined()
    expect(asPinConsentMessage(null)).toBeUndefined()
    expect(asPinConsentMessage(undefined)).toBeUndefined()
  })
})

describe('fix-26 ready/pair：remotePinDurable 透传（长效位——UI hint 双态单源）', () => {
  const base = {
    type: 'ready',
    url: 'http://127.0.0.1:19400/',
    injections: [],
    services: {
      forgeProjects: true,
      forgeKnowledge: true,
      forgeTasks: true,
      forgeFeatures: true,
      forgeProposals: true,
      forgeDocs: true,
      forgeSettings: true,
      forgeBugs: true,
      approval: true,
    },
  } as Record<string, unknown>

  it('ready：remotePinDurable === true 透传；他值 = 降级缺席', () => {
    const durable = asReadyMessage({ ...base, remotePin: '482913', remotePinDurable: true })
    expect(durable?.remotePinDurable).toBe(true)
    expect(asReadyMessage({ ...base, remotePin: '482913', remotePinDurable: false })?.remotePinDurable).toBeUndefined()
    expect(asReadyMessage(base)?.remotePinDurable).toBeUndefined()
  })

  it('pair：remotePinDurable === true 透传（随 consent 轮换回推）；他值 = 降级缺席', () => {
    const pairBase = { type: 'pair', remotePairUrl: 'http://x/pair?token=t', remotePairExpiresAt: 1 }
    const durable = asPairMessage({ ...pairBase, remotePin: '482913', remotePinDurable: true })
    expect(durable?.remotePinDurable).toBe(true)
    expect(asPairMessage(pairBase)?.remotePinDurable).toBeUndefined()
  })
})

// ── dsh-mobile-tunnel 隧道状态推送（child → 主单向——manifest 隧道面单源载体） ──

describe('asTunnelMessage（tunnel 消息守卫——run.ts tunnel 分支消费）', () => {
  it('激活态：tunnelUrl 非空串 + provider ∈ {cloudflared, pinggy} → 消息对象（expiresAt 可选透传）', () => {
    expect(
      asTunnelMessage({ type: 'tunnel', tunnelUrl: 'https://x.trycloudflare.com/pair?token=t', tunnelProvider: 'cloudflared' }),
    ).toEqual({ type: 'tunnel', tunnelUrl: 'https://x.trycloudflare.com/pair?token=t', tunnelProvider: 'cloudflared' })
    expect(
      asTunnelMessage({ type: 'tunnel', tunnelUrl: 'https://x.pinggy.link/pair?token=t', tunnelProvider: 'pinggy', tunnelExpiresAt: 360_000 }),
    ).toEqual({ type: 'tunnel', tunnelUrl: 'https://x.pinggy.link/pair?token=t', tunnelProvider: 'pinggy', tunnelExpiresAt: 360_000 })
  })

  it('关闭/失效态：零载荷 {type: tunnel} → 消息对象（无 url——manifest 隧道字段撤除面）', () => {
    expect(asTunnelMessage({ type: 'tunnel' })).toEqual({ type: 'tunnel' })
  })

  it('畸形 → undefined（静默忽略不转发）', () => {
    expect(asTunnelMessage({ type: 'tunnel', tunnelUrl: '' , tunnelProvider: 'pinggy' })).toBeUndefined()
    expect(asTunnelMessage({ type: 'tunnel', tunnelUrl: 'https://x/pair?token=t' })).toBeUndefined() // url 在场缺 provider
    expect(asTunnelMessage({ type: 'tunnel', tunnelUrl: 'https://x/pair?token=t', tunnelProvider: 'evil' })).toBeUndefined()
    expect(asTunnelMessage({ type: 'tunnel', tunnelProvider: 'pinggy' })).toBeUndefined() // provider 在场缺 url
    // TTL 非法 = 字段降级缺席（不阻消息——与 ready 可选字段同降级口径）
    expect(
      asTunnelMessage({ type: 'tunnel', tunnelUrl: 'https://x/pair?token=t', tunnelProvider: 'pinggy', tunnelExpiresAt: 0 }),
    ).toEqual({ type: 'tunnel', tunnelUrl: 'https://x/pair?token=t', tunnelProvider: 'pinggy' })
    expect(
      asTunnelMessage({ type: 'tunnel', tunnelUrl: 'https://x/pair?token=t', tunnelProvider: 'pinggy', tunnelExpiresAt: 'soon' }),
    ).toEqual({ type: 'tunnel', tunnelUrl: 'https://x/pair?token=t', tunnelProvider: 'pinggy' })
    expect(asTunnelMessage({ type: 'pair', remotePairUrl: 'x', remotePairExpiresAt: 1 })).toBeUndefined()
    expect(asTunnelMessage(null)).toBeUndefined()
  })

  it('fix-19 ⑦：unexpectedlyClosed 透传（意外死亡撤面事件携位——UI 自动重开守卫单源）；健康面不携位', () => {
    expect(
      asTunnelMessage({ type: 'tunnel', tunnelUrl: 'https://x.pinggy.link/pair?token=t', tunnelProvider: 'pinggy', unexpectedlyClosed: true }),
    ).toEqual({ type: 'tunnel', tunnelUrl: 'https://x.pinggy.link/pair?token=t', tunnelProvider: 'pinggy', unexpectedlyClosed: true })
    expect(
      asTunnelMessage({ type: 'tunnel', tunnelUrl: 'https://x/pair?token=t', tunnelProvider: 'pinggy' }),
    ).toEqual({ type: 'tunnel', tunnelUrl: 'https://x/pair?token=t', tunnelProvider: 'pinggy' })
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
      // 78b9227e spawn 审计行：执行会话事实诞生即入库（桥白名单全集锚）
      'recordSpawn',
      'submitTask',
      // S3（run-tasks-host-command）：启动对账动词（桥白名单全集锚——锚定服务面而非 RPC 面）
      'reconcileInterrupted',
      'transitionTask',
      // main-agent-task-tools 1.1：主 agent 修改动词（桥白名单全集锚——锚定服务面而非 RPC 面）
      'updateTask',
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
    // fix-bug：bug 域三读面（listBugs/commitFiles/fileDiff——recordBug/resolveBug 写径不上 RPC）
    expect([...BUGS_SERVICE_METHODS]).toEqual(['listBugs', 'commitFiles', 'fileDiff'])
    expect([...PROJECTS_M2_SERVICE_METHODS]).toEqual(['deriveTaskStoreDir'])
    expect([...BRIDGE_SERVICE_NAMES]).toEqual([
      'forgeProjects',
      'forgeKnowledge',
      'forgeTasks',
      'forgeFeatures',
      'forgeProposals',
      'forgeDocs',
      'forgeSettings',
      'forgeBugs',
      // mobile-remote-approval fix-2：审批决策中继面（main → worker 单向 deposit）
      'approval',
    ])
  })
})

// ── mobile-remote-approval fix-2 审批桥（跨进程审批决策中继 + waterfall fail-open 应答） ──

describe('createApprovalRelay（worker 侧审批决策中继表）', () => {
  it('deposit → forwarded:true（中继面在场即受理——产品不自持审批状态，仅内存转交）', async () => {
    const relay = createApprovalRelay()
    await expect(
      relay.deposit({ requestId: 'req-1', decision: 'allow', reason: '远程批准' }),
    ).resolves.toEqual({ forwarded: true })
  })

  it('take：FIFO 消费（deposit 序 = 消费序）；空表 → undefined（未命中）', async () => {
    const relay = createApprovalRelay()
    expect(relay.take()).toBeUndefined()
    const a: RemoteApprovalDecisionInput = { requestId: 'req-a', decision: 'allow' }
    const b: RemoteApprovalDecisionInput = { requestId: 'req-b', decision: 'reject' }
    await relay.deposit(a)
    await relay.deposit(b)
    expect(relay.take()).toEqual(a)
    expect(relay.take()).toEqual(b)
    expect(relay.take()).toBeUndefined()
  })
})

describe('approvalWaterfallAnswer（approval/request waterfall 应答——fail-open 语义，用户裁决 2026-10-14）', () => {
  it('deposit 未命中 → 不消费：透传 next()（放行桌面工作台 answerer / 官方 fallback）', async () => {
    const relay = createApprovalRelay()
    const next = vi.fn(async (): Promise<ApprovalOutcome> => 'rejected')
    await expect(approvalWaterfallAnswer(relay, next)).resolves.toBe('rejected')
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('deposit 命中 allow → 返回 allowed-once 且不触 next（不与桌面 answerer 竞争）', async () => {
    const relay = createApprovalRelay()
    await relay.deposit({ requestId: 'req-1', decision: 'allow' })
    const next = vi.fn(async (): Promise<ApprovalOutcome> => 'unavailable')
    await expect(approvalWaterfallAnswer(relay, next)).resolves.toBe('allowed-once')
    expect(next).not.toHaveBeenCalled()
  })

  it('deposit 命中 reject → 返回 rejected 且不触 next', async () => {
    const relay = createApprovalRelay()
    await relay.deposit({ requestId: 'req-2', decision: 'reject' })
    const next = vi.fn(async (): Promise<ApprovalOutcome> => 'allowed-once')
    await expect(approvalWaterfallAnswer(relay, next)).resolves.toBe('rejected')
    expect(next).not.toHaveBeenCalled()
  })

  it('中继面经桥 RPC 可达（dispatchRpc approval.deposit——白名单通路端到端）', async () => {
    const relay = createApprovalRelay()
    const result = await dispatchRpc(
      { approval: relay as unknown as object },
      { type: 'rpc', id: 1, service: 'approval', method: 'deposit', args: [{ requestId: 'r', decision: 'allow' }] },
    )
    expect(result).toMatchObject({ type: 'rpc-result', id: 1, ok: true, data: { forwarded: true } })
    expect(relay.take()).toEqual({ requestId: 'r', decision: 'allow' })
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
      forgeBugs: true,
      approval: true,
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
    assertType<never>(undefined as BugsWhitelistCoverage)
    assertType<never>(undefined as ProjectsM2WhitelistCoverage)
    assertType<never>(undefined as ApprovalWhitelistCoverage) // fix-2 审批桥白名单覆盖完备性
    assertType<never>(undefined as ServiceNamesCoverage)
    expect(PROJECT_SERVICE_METHODS).toHaveLength(5)
    expect(KNOWLEDGE_SERVICE_METHODS).toHaveLength(8)
    expect(TASKS_SERVICE_METHODS).toHaveLength(14) // S3 +reconcileInterrupted；1.1 +updateTask；78b9227e +recordSpawn
    expect(FEATURES_SERVICE_METHODS).toHaveLength(5)
    expect(PROPOSALS_SERVICE_METHODS).toHaveLength(5)
    expect(DOCS_SERVICE_METHODS).toHaveLength(1)
    expect(SETTINGS_SERVICE_METHODS).toHaveLength(2)
    expect(BUGS_SERVICE_METHODS).toHaveLength(3) // fix-bug +listBugs/commitFiles/fileDiff
    expect(APPROVAL_SERVICE_METHODS).toHaveLength(1) // fix-2 审批桥 +deposit
    expect(PROJECTS_M2_SERVICE_METHODS).toHaveLength(1)
    expect(BRIDGE_SERVICE_NAMES).toHaveLength(9) // fix-2 审批桥 +approval
  })
})

// fix-16 配对 302 重定向权威面（官方 main.js:1489 同形——authority 尊重请求 Host 头，
// scheme 按到达域判定；Location 由产品构造，authority 仅取自本次请求 Host——零开放重定向面）
describe('pairRedirectOf（fix-16 隧道域尊重 Host 头）', () => {
  const LAN = '192.168.1.7'
  const PORT = 8787

  it('隧道域 Host 头 → https + 原样 authority（不再强制回退 LAN）', () => {
    expect(pairRedirectOf('swift-words.trycloudflare.com', LAN, PORT)).toEqual({
      authority: 'swift-words.trycloudflare.com',
      origin: 'https://swift-words.trycloudflare.com',
    })
  })

  it('LAN Host 头 → http + LAN 权威（本地扫码路径不回归）', () => {
    expect(pairRedirectOf(`${LAN}:${PORT}`, LAN, PORT)).toEqual({
      authority: `${LAN}:${PORT}`,
      origin: `http://${LAN}:${PORT}`,
    })
  })

  it('回环/空/缺席 Host 头 → 回退构造 LAN 权威 + http（零开放重定向语义保持）', () => {
    const fallback = { authority: `${LAN}:${PORT}`, origin: `http://${LAN}:${PORT}` }
    expect(pairRedirectOf('localhost:8787', LAN, PORT)).toEqual(fallback)
    expect(pairRedirectOf('127.0.0.1:8787', LAN, PORT)).toEqual(fallback)
    expect(pairRedirectOf('[::1]:8787', LAN, PORT)).toEqual(fallback)
    expect(pairRedirectOf('', LAN, PORT)).toEqual(fallback)
    expect(pairRedirectOf(undefined, LAN, PORT)).toEqual(fallback)
  })
})

// fix-28 隧道 Host 判定（纯化可测——/pair PIN 门消费面：隧道域强制 PIN 第二因子）
describe('isTunnelHost（fix-28 隧道域判定）', () => {
  const LAN = '192.168.1.7'

  it('隧道域（公网域名/非 LAN 非回环 host）= true', () => {
    expect(isTunnelHost('swift-words.trycloudflare.com', LAN)).toBe(true)
    expect(isTunnelHost('abc.pinggy.io', LAN)).toBe(true)
    expect(isTunnelHost('203.0.113.9:8787', LAN)).toBe(true)
  })

  it('回环/LAN 本身/空/缺席 = false（LAN 信任直连语义保持）', () => {
    expect(isTunnelHost('localhost:8787', LAN)).toBe(false)
    expect(isTunnelHost('127.0.0.1:8787', LAN)).toBe(false)
    expect(isTunnelHost('[::1]:8787', LAN)).toBe(false)
    expect(isTunnelHost(`${LAN}:8787`, LAN)).toBe(false)
    expect(isTunnelHost('', LAN)).toBe(false)
    expect(isTunnelHost(undefined, LAN)).toBe(false)
  })
})

// fix-22 诊断日志面：URL 行脱敏 + 单行消毒（/pair 决策链日志与 /forge-remote-log 信箱的消费面）
describe('redactTokenQuery / sanitizeLogLine（fix-22 诊断日志面）', () => {
  it('token/pin 查询参数值 → ***（键与 he 值域外参数原样保留）', () => {
    expect(redactTokenQuery('http://192.168.1.7:8787/?forgeRemote=1&token=v1.secret')).toBe(
      'http://192.168.1.7:8787/?forgeRemote=1&token=***',
    )
    expect(redactTokenQuery('http://h/pair/verify?pin=123456')).toBe('http://h/pair/verify?pin=***')
    expect(redactTokenQuery('http://h/?a=1&b=2')).toBe('http://h/?a=1&b=2')
  })
  it('非法 URL = 占位不抛（日志面 fail-soft）', () => {
    expect(redactTokenQuery('::not-a-url::')).toBe('(unparsable-url)')
  })
  it('单行化：CR/LF/TAB/NUL 剥空格，非打印剔除，超 302 截断', () => {
    expect(sanitizeLogLine('a\r\nb\tc\0d')).toBe('a b c d')
    expect(sanitizeLogLine('中文\x01ok')).toBe('中文ok')
    expect(sanitizeLogLine('x'.repeat(400)).length).toBe(302)
  })
})

// fix-23 诊断日志落盘链：diag 消息守卫（子 → 主诊断行分流——run.ts/main.ts 消费落 harness.log）
describe('asDiagMessage（fix-23 diag 桥消息守卫）', () => {
  it('type=diag 且 line 非空 → 透传 {type, line}', () => {
    expect(asDiagMessage({ type: 'diag', line: '[pair-diag] /pair tokenVerify=pass' })).toEqual({
      type: 'diag',
      line: '[pair-diag] /pair tokenVerify=pass',
    })
  })
  it('他形（非 diag / line 缺席 / line 非串 / line 空串）→ undefined 静默忽略', () => {
    expect(asDiagMessage({ type: 'diag', line: '' })).toBeUndefined()
    expect(asDiagMessage({ type: 'diag' })).toBeUndefined()
    expect(asDiagMessage({ type: 'diag', line: 42 })).toBeUndefined()
    expect(asDiagMessage({ type: 'event', line: 'x' })).toBeUndefined()
    expect(asDiagMessage(null)).toBeUndefined()
    expect(asDiagMessage('diag')).toBeUndefined()
  })
})

// fix-22 真机修复（bug cbb9131e 架构级根因）：webserver 移动面静态服务纯逻辑——挂载点路径
// 映射（dist 相对路径）与官方 index 弹射脚本注入（tapIndex 消费）。
describe('remoteViewFilePathOf（/remote 移动面路径映射）', () => {
  it('挂载点本体与尾斜杠 → index.html', () => {
    expect(remoteViewFilePathOf('/remote')).toBe('index.html')
    expect(remoteViewFilePathOf('/remote/')).toBe('index.html')
    expect(remoteViewFilePathOf('/remote/?x=1')).toBe('index.html')
  })
  it('挂载点下相对路径原样透出（dist 相对形态）', () => {
    expect(remoteViewFilePathOf('/remote/assets/index-abc123.js')).toBe('assets/index-abc123.js')
    expect(remoteViewFilePathOf('/remote/favicon.ico')).toBe('favicon.ico')
  })
  it('挂载点外 → undefined（webserver 面其余路由不受扰）', () => {
    expect(remoteViewFilePathOf('/')).toBeUndefined()
    expect(remoteViewFilePathOf('/pair')).toBeUndefined()
    expect(remoteViewFilePathOf('/remoteize/x')).toBeUndefined()
    expect(remoteViewFilePathOf('/remotex')).toBeUndefined()
  })
  it('路径逃逸与畸形 → undefined（逃逸守卫前置）', () => {
    expect(remoteViewFilePathOf('/remote/..%2f..%2fsecret')).toBeUndefined()
    expect(remoteViewFilePathOf('/remote/%00')).toBeUndefined()
    expect(remoteViewFilePathOf('::bad::')).toBeUndefined()
  })
})

describe('remoteViewIndexTap（官方 index 弹射注入）', () => {
  it('<head> 后注入弹射脚本（dswf cookie 在场 → /remote/）', () => {
    const out = remoteViewIndexTap('<!doctype html><html><head><meta charset=utf-8></head><body></body></html>')
    expect(out).toContain('<head>')
    const headEnd = out.indexOf('<head>') + '<head>'.length
    expect(out.slice(headEnd, headEnd + REMOTE_VIEW_BOUNCE_MARKUP.length)).toBe(REMOTE_VIEW_BOUNCE_MARKUP)
  })
  it('无 <head> → 原样返回（fail-soft 不改写）', () => {
    const html = '<html><body>x</body></html>'
    expect(remoteViewIndexTap(html)).toBe(html)
  })
  it('弹射脚本形态 pin：仅 dswf_forge_remote=1 命中且 replace 到挂载点', () => {
    expect(REMOTE_VIEW_BOUNCE_MARKUP).toContain('dswf_forge_remote=1')
    expect(REMOTE_VIEW_BOUNCE_MARKUP).toContain('location.replace("/remote/")')
  })
})
