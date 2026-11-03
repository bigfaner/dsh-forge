// G1 pin ⑳（prompt-scoping-and-desc-trim 任务 1.3，圆桌 architect Major-1）：pipeline 段角色分流的
// 承重假设机器化——ForgeAssembleContext（faces.ts 结构收窄面）与官方声明面零静态链接：上游删改
// agent 字段 tsc 全绿、运行期静默回退，本 pin 把漂移检测前置到 CI（pin-06-system-prompt-section 同式
// 官方公开面形状断言）。
//
// pin 命名声明（圆桌 RT2 固化，编号规约）：
//   编号 = 不透明注册键——新增 pin 取当前最大号 + 1（下一空号），永不 renumber：既有引用（提案/
//   台账/注释）携带的编号不因池内增删而漂移，重号以主题后缀消歧（pin-06 两文件并存为既成事实，
//   不改号）；任何引用一律使用带主题后缀的全名（如 pin-06-system-prompt-section），裸编号引用（“pin 6”）
//   不足以消歧，禁止。
//
// 权威：proposals/prompt-scoping-and-desc-trim/proposal.md §2.1 判据核销 + §四.3 + roundtable.md
// （architect Major-1 / RT2「pin 命名声明」）。官方锚点（0.2.0-rc.2 实装，行号锚以该版为准）：
//   dsh-agent lib/index.js L291 assembleContextFor 返回 { agent, scope: agent }（signal 缺席不落键）
//   dsh-session lib/types/types.d.ts SessionHeader.origin?: 'subagent'（origin 唯一字面值；该文件为
//     canonical 类型面，dsh-subagent typert.host.js 的 SessionHeader 声明为其 wire 镜像）
//   dsh-subagent lib/types/child-agent.js L121 子会话出生自写 origin: 'subagent'（meta 枚举构造，
//     不 spread 父 header）
//   dsh-api-session-controller lib/index.js fork：create meta 枚举 cwd?/parentSession/isSeeded/agentPreset?
//     ——无 origin（“A fork shares the lineage field without the origin”，dsh-subagent lib/index.js L2264 注释）
// Hard Rule：只 pin 上游公开面（npm 包导出、d.ts 随包分发面、公开服务的运行期契约），不 pin 内部实现；
//   fork meta 枚举一节为该规则的例外（controller fork 的 meta 构造非公开导出面，无行为径可孤立
//   驱动）：机械文本审计即 fork 继承性断言的唯一主锚（该枚举是 origin 能进入 fork header 的
//   唯一上游位）。锚强度弱于 pin-16-jobs-log-channel 先例（行为主锚 + 文本辅证双保险——此处
//   文本独挑，非「同式」）：上游字段重命名（meta:/agentOptions: 锚位漂移）即假红 = 人工复核
//   触发（读 controller fork 实现 confirm meta 枚举成员集），非承重假设失效判据。
// 锚定链（pin-16 同式）：dsh-agent / dsh-subagent / dsh-session 均非宿主直依赖——经 host 实依赖的
//   @deepseek-ai/dsh-api-session-controller（三包均其 peerDependencies 声明面）解析，pnpm 布局下该包
//   sibling node_modules 即真相；自宿主锚直解析将被严格布局拒绝。
// 分层：
//   ⑳-1 版本锚（dsh-agent / dsh-subagent / dsh-session @ controller 锚定链）
//   ⑳-2 assembleContextFor 形状（运行期 agent/scope 同引用 + 声明面签名与盲区自证）
//   ⑳-3 SessionHeader origin 单字面值锚（canonical 类型面：成员集 + 全部 origin 声明）
//   ⑳-4 fork/seed 创建路径不继承 origin（childSessionMeta 出生写 + SessionStore.prepare meta 折叠
//        + fork meta 文本审计——fork 创建侧唯一主锚，锚强度声明见上 Hard Rule）
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { interfaceMembers, importUpstream, norm, PIN_VERSION, readUpstream, ROOT } from './pins.js'

// 锚定链：host 直依赖 controller（peer 声明三目标包）→ dsh-agent / dsh-subagent / dsh-session
const requireFromHost = createRequire(join(ROOT, 'apps/host/package.json'))
const CONTROLLER_DIR = dirname(requireFromHost.resolve('@deepseek-ai/dsh-api-session-controller/package.json'))
const requireFromController = createRequire(join(CONTROLLER_DIR, 'package.json'))
const AGENT_DIR = dirname(requireFromController.resolve('@deepseek-ai/dsh-agent/package.json'))
const SUBAGENT_DIR = dirname(requireFromController.resolve('@deepseek-ai/dsh-subagent/package.json'))
const SESSION_DIR = dirname(requireFromController.resolve('@deepseek-ai/dsh-session/package.json'))

/** 经锚定链动态引入上游模块（bare 说明符在 tests/ 不解析——转文件 URL，importUpstream 同径） */
async function importViaController(specifier: string): Promise<Record<string, unknown>> {
  return await import(pathToFileURL(requireFromController.resolve(specifier)).href) as Record<string, unknown>
}

/** dsh-agent assembleContextFor 运行期签名子面 */
type AssembleContextFor = (agent: unknown, signal?: AbortSignal) => Record<string, unknown>

/** dsh-subagent childSessionMeta 消费面（父 agent 结构子面——仅读 header 与 ctx.get） */
type ChildSessionMeta = (
  parent: { session: { header: Record<string, unknown> }; ctx: { get(name: string): unknown } },
  childDepth: number,
  isSeeded: boolean,
) => Record<string, unknown>

/** dsh-session SessionStore 公开服务子面（prepare：枚举 meta → 不可变 header 的唯一折叠点） */
interface SessionStoreFace {
  prepare(id: string, options: unknown): { header: Record<string, unknown> }
}

/** 起一套真实 runtime（cordis Context + SessionStore；调方负责 ctx.fiber.dispose()） */
async function bootSessionStore(): Promise<{ store: SessionStoreFace; dispose(): Promise<void> }> {
  const cordis = await importUpstream('host', '@deepseek-ai/cordis')
  const sessionMod = await importViaController('@deepseek-ai/dsh-session')
  const Ctx = cordis['Context'] as new () => { fiber: { dispose(): Promise<void> } }
  const Store = sessionMod['SessionStore'] as new (ctx: unknown) => SessionStoreFace
  const ctx = new Ctx()
  return { store: new Store(ctx), dispose: () => ctx.fiber.dispose() }
}

describe('pin ⑳-1 版本锚（controller 锚定链）', () => {
  it('dsh-agent / dsh-subagent / dsh-session = 精确 pin 版本', () => {
    for (const dir of [AGENT_DIR, SUBAGENT_DIR, SESSION_DIR]) {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string; version?: string }
      expect(pkg.version, `${String(pkg.name)}@controller 链 实装版本漂移`).toBe(PIN_VERSION)
    }
  })
})

describe('pin ⑳-2 assembleContextFor 形状（dsh-agent 公开面）', () => {
  it('运行期：assembleContextFor(fakeAgent) 返回携带 agent 且 scope === agent（同一引用）', async () => {
    const mod = await importViaController('@deepseek-ai/dsh-agent')
    const assembleContextFor = mod['assembleContextFor'] as AssembleContextFor | undefined
    expect(typeof assembleContextFor).toBe('function')
    const fakeAgent = { id: 'session-pin20-agent' }
    const context = (assembleContextFor as AssembleContextFor)(fakeAgent)
    expect(context['agent']).toBe(fakeAgent)
    expect(context['scope']).toBe(fakeAgent)
    expect(Object.keys(context).sort()).toEqual(['agent', 'scope'])
  })

  it('运行期：signal 显式传入即第三键透传（缺席不落键——形状完备面）', async () => {
    const mod = await importViaController('@deepseek-ai/dsh-agent')
    const assembleContextFor = mod['assembleContextFor'] as (agent: unknown, signal?: AbortSignal) => Record<string, unknown>
    const fakeAgent = { id: 'session-pin20-agent' }
    const controller = new AbortController()
    const context = assembleContextFor(fakeAgent, controller.signal)
    expect(context['agent']).toBe(fakeAgent)
    expect(context['scope']).toBe(fakeAgent)
    expect(context['signal']).toBe(controller.signal)
    expect(Object.keys(context).sort()).toEqual(['agent', 'scope', 'signal'])
  })

  it('声明面签名：assembleContextFor(agent: Agent, signal?: AbortSignal): AssembleContext（lib/types/dispatch.d.ts）', () => {
    const types = norm(readFileSync(join(AGENT_DIR, 'lib/types/dispatch.d.ts'), 'utf8'))
    expect(types).toContain('export declare function assembleContextFor(agent: Agent, signal?: AbortSignal): AssembleContext')
  })

  it('声明面盲区自证：官方 AssembleContext 成员集 = {scope, signal}——无 agent（零静态链接前提：上游删 agent 字段 tsc 全绿）', () => {
    const raw = readUpstream('host', '@deepseek-ai/dsh-system-prompt', 'lib/types/index.d.ts')
    expect(interfaceMembers(raw, 'AssembleContext')).toEqual(['scope', 'signal'])
  })
})

describe('pin ⑳-3 SessionHeader origin 单字面值锚（dsh-session canonical 类型面）', () => {
  const raw = readFileSync(join(SESSION_DIR, 'lib/types/types.d.ts'), 'utf8')

  it('成员集锚：SessionHeader 公开面成员增删即红', () => {
    expect(interfaceMembers(raw, 'SessionHeader')).toEqual([
      'agentPreset',
      'createdAt',
      'cwd',
      'delegationDepth',
      'id',
      'isSeeded',
      'origin',
      'parentSession',
      'version',
    ])
  })

  it("origin 唯一字面值：类型面全部 origin 声明 = 'subagent'（SessionHeader + CreateSessionOptions.meta 两处；新字面值加入即红）", () => {
    const originTypes = [...raw.matchAll(/readonly origin\?:\s*([^;\n]+);/g)].map((m) => (m[1] ?? '').trim())
    expect(originTypes).toEqual(["'subagent'", "'subagent'"])
  })
})

describe('pin ⑳-4 fork/seed 创建路径不继承 origin（官方公开面可测路径）', () => {
  /** 子会话父 agent 假体（dsh-subagent childSessionMeta 消费子面——header 结构子集 + ctx.get 缺席服务） */
  const fakeParent = (header: Record<string, unknown>): { session: { header: Record<string, unknown> }; ctx: { get(name: string): unknown } } => ({
    session: { header },
    ctx: { get: () => undefined },
  })

  it('seed 出生写：childSessionMeta 枚举构造子 meta——origin 为构造器自写分类，父 header 不被 spread（父 lineage 字段不透传）', async () => {
    const mod = await importViaController('@deepseek-ai/dsh-subagent')
    const childSessionMeta = mod['childSessionMeta'] as ChildSessionMeta
    // 父 = 深度 3 的子会话（header 携带自身 origin/parentSession/delegationDepth）
    const parent = fakeParent({
      version: 4,
      id: 'session-pin20-parent',
      createdAt: 1,
      cwd: 'Z:/pin20',
      parentSession: 'session-pin20-grandparent',
      isSeeded: false,
      origin: 'subagent',
      delegationDepth: 3,
    })
    const meta = childSessionMeta(parent, 4, true)
    expect(meta['origin']).toBe('subagent')
    // 直接 lineage 新建：parentSession = 父自身 id（≠ 父的 parentSession 'grandparent' → 非继承拷贝）
    expect(meta['parentSession']).toBe('session-pin20-parent')
    expect(meta['isSeeded']).toBe(true)
    expect(meta['delegationDepth']).toBe(4)
  })

  it('seed 出生写：主会话父（header 无 origin）→ 子仍 origin=subagent（origin 是出生分类，不是继承物）', async () => {
    const mod = await importViaController('@deepseek-ai/dsh-subagent')
    const childSessionMeta = mod['childSessionMeta'] as ChildSessionMeta
    const parent = fakeParent({ version: 4, id: 'session-pin20-main', createdAt: 1, isSeeded: false })
    const meta = childSessionMeta(parent, 1, false)
    expect(meta['origin']).toBe('subagent')
    expect(meta['parentSession']).toBe('session-pin20-main')
  })

  it('fork header 折叠：fork 形 meta（lineage + isSeeded、无 origin）→ header 不落 origin（SessionStore.prepare 公开面）', async () => {
    const { store, dispose } = await bootSessionStore()
    try {
      const fork = store.prepare('session-pin20-fork', {
        seed: [],
        inheritedEventCount: 0,
        meta: { parentSession: 'session-pin20-src', isSeeded: true },
      })
      expect(fork.header['parentSession']).toBe('session-pin20-src')
      expect(fork.header['isSeeded']).toBe(true)
      expect('origin' in fork.header).toBe(false)
    } finally {
      await dispose()
    }
  })

  it('对称锚：meta 携带 origin → header 落 origin（meta 是 header origin 的唯一进路——折叠点只认枚举字段）', async () => {
    const { store, dispose } = await bootSessionStore()
    try {
      const child = store.prepare('session-pin20-sub', {
        seed: [],
        inheritedEventCount: 0,
        meta: { parentSession: 'session-pin20-src', isSeeded: true, origin: 'subagent', delegationDepth: 1 },
      })
      expect(child.header['origin']).toBe('subagent')
      expect(child.header['delegationDepth']).toBe(1)
    } finally {
      await dispose()
    }
  })

  it('fork meta 文本审计（controller 公开入口 lib/index.js）：fork 的 create meta 枚举无 origin——origin 进 fork header 的唯一上游位', () => {
    const indexJs = readFileSync(join(CONTROLLER_DIR, 'lib/index.js'), 'utf8')
    const forkStart = indexJs.indexOf('async fork(request)')
    expect(forkStart, 'dsh-api-session-controller 公开入口未找到 fork(request) 实现').toBeGreaterThanOrEqual(0)
    const forkBody = indexJs.slice(forkStart)
    const metaStart = forkBody.indexOf('meta:')
    const metaEnd = forkBody.indexOf('agentOptions:')
    expect(metaStart).toBeGreaterThanOrEqual(0)
    expect(metaEnd, 'fork 实现的 create meta 块形状漂移（meta:/agentOptions: 锚缺失）').toBeGreaterThan(metaStart)
    const metaLiteral = forkBody.slice(metaStart, metaEnd)
    expect(metaLiteral, 'fork 丢失 lineage 字段（“shares the lineage field”）').toContain('parentSession:')
    expect(metaLiteral).toContain('isSeeded: true')
    expect(metaLiteral, 'fork meta 出现 origin——fork 开始继承 origin，承重假设失效方向被打开').not.toContain('origin')
  })
})
