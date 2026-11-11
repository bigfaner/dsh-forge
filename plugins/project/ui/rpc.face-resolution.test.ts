// forge remote face 解析回归钉（bug e1662696——真机宿主侧 registered 正常而 client
// 反复「官方 forge remote 面缺席」）：用真实 cordis 复刻官方 client runtime 握手面——
// remote 服务 + $mount 异步挂 namespace（remote.<ns> Service，dsh-api-gateway client.js
// createNamespace 同型），走 ui/index.ts apply 期同一解析缝安装路径，钉住 face 解析。
import { describe, expect, it, afterEach } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { createForgeRpcClient, FORGE_REMOTE_FACE_ANCHOR_KEY, installForgeRemoteFace, type ForgeRemoteFace } from './rpc.js'
import { ForgeProjectsRemote } from '../host/assembly/typert-remotes.js'
import type { Context as CordisContext } from '@deepseek-ai/cordis'

const NAMESPACES = ['forgeProjects', 'forgeFs', 'forgeBugs', 'forgeWorktree', 'forgeProposals', 'forgeFeatures'] as const

/** 官方 ClientRemoteService 手写同型（$mount 异步建 namespace 子 Service） */
class FakeClientRemote extends Service {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }

  async $mount(): Promise<() => Promise<void>> {
    await new Promise((r) => setTimeout(r, 0))
    for (const ns of NAMESPACES) {
      this.ctx.plugin({
        name: `remote.${ns}`,
        apply: (scope: CordisContext) => {
          const svc = new Service(scope, `remote.${ns}`)
          // 官方 RemoteNamespaceService.installDirect 同型：方法 = getter 函数属性
          Object.defineProperty(svc, 'list', {
            configurable: true,
            enumerable: true,
            get() {
              return async () => ({ ok: true, value: [{ id: 'p1' }] })
            },
          })
          Object.defineProperty(svc, 'listDir', {
            configurable: true,
            enumerable: true,
            get() {
              return async () => ({ ok: true, value: { path: '/', parentPath: null, entries: [] } })
            },
          })
        },
      })
    }
    return async () => {}
  }
}

describe('forge remote face 解析（真实 cordis 握手面回归钉）', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY]
  })

  it('remote 服务 + $mount 异步挂 namespace → inject 子 fiber 激活解析缝 → list 走通', async () => {
    const ctx = new Context()
    const projectsPort = { listProjects: async () => [{ id: 'p1' }], registerProject: async () => ({}) }
    // 宿主侧同型：namespace 控制器 Service（host 半真身——本测试只钉 client 解析缝，
    // 用 FakeClientRemote 直挂投影模拟 gateway 遥控面）
    void ForgeProjectsRemote
    void projectsPort
    new FakeClientRemote(ctx)
    // ── ui/index.ts apply 期同一安装路径（逐字镜像）──
    const rec = ctx as unknown as Record<string, unknown>
    const reflect = rec['reflect'] as { get?: (key: string) => unknown }
    const readReflect = (key: string): unknown => reflect.get(key)
    const remote = readReflect('remote') as { $mount?: (c: unknown) => Promise<unknown> }
    expect(typeof remote?.$mount).toBe('function')
    const mountP = Promise.resolve((remote as { $mount: (c: unknown) => Promise<unknown> }).$mount({}))
    const injectFn = rec['inject'] as (deps: readonly string[], mixin: (c: unknown) => unknown) => unknown
    // 真机时序同型：inject 先开（$mount 未完成），namespace 服务后到——钉握手时序
    let installed = false
    injectFn.call(rec, ['remote', ...NAMESPACES.map((ns) => `remote.${ns}`)], (fiberCtx: unknown) => {
      installForgeRemoteFace(() => {
        try {
          const face = (fiberCtx as { remote?: unknown })['remote']
          if (face === undefined || face === null || typeof face !== 'object') return undefined
          for (const ns of NAMESPACES) {
            const value = (face as unknown as Record<string, unknown>)[ns]
            if (value === undefined || value === null || typeof value !== 'object') return undefined
          }
          return face as ForgeRemoteFace
        } catch {
          return undefined
        }
      }, () => {})
      installed = true
      return undefined
    })
    await mountP
    await new Promise((r) => setTimeout(r, 10))
    expect(installed).toBe(true)
    const client = createForgeRpcClient()
    const rows = await client.projects.list()
    expect(rows).toEqual([{ id: 'p1' }])
  })
})
