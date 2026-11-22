// 无 expert-squad 单装行为零变化验证（builtin-redistribution t-ac12）：
// knowledge 只注册档案不消费 experts 服务（SC-2 零依赖红线）——
//   ① inject 名单零增（不含 'experts'）；
//   ② registerRoot 接收方缺席（reflect.get → undefined）：静默跳过（仅一次 warn 事件留痕、
//      零注册调用、零抛）；
//   ③ 整体装配无 expert-squad：插件照常装配（工具注册 + RPC 路由照常），行为面零变化。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import knowledgePlugin, {
  KNOWLEDGE_PACKAGE_NAME,
  registerBuiltinExpertsRoot,
} from '../host/index.js'

// 自持存储自启的宿主环境锚摘除（hermetic——同 plugin.test.ts）
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

const tempRoots: string[] = []
afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

interface DiagEvent {
  event: string
  level: string
  message: string
  process?: string
}

describe('SC-2 零依赖红线：knowledge 只注册档案不消费 experts 服务', () => {
  it("inject 名单零增（不含 'experts'）——experts 缺席不构成装载前置", () => {
    expect(knowledgePlugin.inject).not.toContain('experts')
  })

  it('registerRoot 接收方缺席（reflect.get → undefined）：静默跳过——仅一次 warn 事件、零注册、零抛', () => {
    const events: DiagEvent[] = []
    const registrations: unknown[] = []
    const ctx = {
      reflect: {
        get: (name: string): unknown => {
          expect(name).toBe('experts') // 唯一被现查的服务键（零其他消费面）
          return undefined
        },
      },
      // 若被误调即留证
      __registerRootCall: (arg: unknown) => registrations.push(arg),
    } as never
    expect(() => registerBuiltinExpertsRoot(ctx, (payload) => events.push(payload as DiagEvent))).not.toThrow()
    expect(registrations).toHaveLength(0)
    expect(events).toHaveLength(1)
    expect(events[0]!.event).toBe('knowledge-experts-register')
    expect(events[0]!.level).toBe('warn')
    expect(events[0]!.message).toContain('experts 服务缺席')
    expect(events[0]!.process).toBe('main')
  })

  it('emit 缝缺席（undefined）：静默跳过零抛、零副作用', () => {
    expect(() =>
      registerBuiltinExpertsRoot({ reflect: { get: () => undefined } } as never),
    ).not.toThrow()
  })

  it('reflect.get 抛错（宿主反射面劣形）：视同缺席静默跳过——仅一次 warn', () => {
    const events: DiagEvent[] = []
    expect(() =>
      registerBuiltinExpertsRoot(
        { reflect: { get: () => { throw new Error('boom') } } } as never,
        (payload) => events.push(payload as DiagEvent),
      ),
    ).not.toThrow()
    expect(events).toHaveLength(1)
    expect(events[0]!.level).toBe('warn')
  })
})

describe('整体装配无 expert-squad（单装常态）——行为面零变化', () => {
  it('插件照常装配：恰一条 experts 缺席 warn + 工具注册照常 + 卸载收口正常', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-noexp-'))
    tempRoots.push(tempRoot)
    const diag: Record<string, unknown>[] = []
    const registeredTools: Array<{ name: string }> = []
    const rpcPaths = new Set<string>()
    const ctx = {
      tools: {
        register: (d: { name: string }) => {
          registeredTools.push(d)
          return () => {}
        },
      },
      systemPrompt: { section: () => () => {} },
      on: () => () => {},
      reflect: {
        get: () => undefined, // expert-squad 缺席
        provide: () => () => {},
      },
      connection: {
        fetch: {
          register: (route: { path: string }) => {
            rpcPaths.add(route.path)
            return () => {
              rpcPaths.delete(route.path)
            }
          },
        },
      },
      workspaceRegistry: { list: async () => [], get: async () => undefined },
      emit: (_event: string, payload: Record<string, unknown>) => {
        diag.push(payload)
      },
    } as never
    const dispose = knowledgePlugin(ctx, { dbFile: join(tempRoot, 'knowledge.db') })
    // 恰一条 experts 缺席 warn（唯一行为面差异 = 诊断留痕）
    const expertWarns = diag.filter(
      (p) => p['event'] === 'knowledge-experts-register' && p['level'] === 'warn',
    )
    expect(expertWarns).toHaveLength(1)
    expect(String(expertWarns[0]!['message'])).toContain('experts 服务缺席')
    // 本体照常：工具注册非空 + RPC 路由族在场
    expect(registeredTools.length).toBeGreaterThan(0)
    expect(rpcPaths.size).toBeGreaterThan(0)
    dispose()
    expect(rpcPaths.size).toBe(0)
  })

  it('接收方在场对照：注册面非退化（缝生效位）——缺席径属退化形态而非缝失效', () => {
    const events: DiagEvent[] = []
    const registrations: Array<{ dir: string; pluginName?: string }> = []
    const ctx = {
      reflect: {
        get: (name: string): unknown =>
          name === 'experts'
            ? { registerRoot: (_ctx: unknown, dir: string, pluginName?: string) => registrations.push({ dir, pluginName }) }
            : undefined,
      },
    } as never
    registerBuiltinExpertsRoot(ctx, (payload) => events.push(payload as DiagEvent))
    expect(registrations).toHaveLength(1)
    expect(registrations[0]!.pluginName).toBe(KNOWLEDGE_PACKAGE_NAME)
    expect(events.filter((e) => e.level === 'warn')).toHaveLength(0)
  })
})
