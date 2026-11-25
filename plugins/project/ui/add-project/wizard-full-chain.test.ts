// 添加项目向导全链路单测（overview-dockkit-alignment 2.15——preload 清理②收口验证）：
// 缺省四步数据源（list→derive→listDir→register）在无 window.dshForge 环境下全部可调——
// 数据通路 = ui/rpc Typert 切片（官方宿主可达），零 preload 依赖注入；face 替身经
// installForgeRemoteFace 安装（rpc.typert.test 同族替身形态），信封按 RemoteResult 回。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FORGE_REMOTE_FACE_ANCHOR_KEY,
  installForgeRemoteFace,
  type ForgeRemoteFace,
} from '../rpc.js'
import { rpcRegisteredPathsSource } from './AddProjectFlow.js'
import { rpcDeriveSource } from './derive-source.js'
import { rpcDirSource } from './dir-source.js'
import { rpcRegisterSource } from './flow-actions.js'

/** 官方 ctx.remote face 替身（按 ns.method 表回 RemoteResult 信封——rpc.typert.test 同族） */
function stubRemoteFace(table: Record<string, (args: unknown[]) => unknown>): ForgeRemoteFace {
  const make = (ns: string): Record<string, unknown> =>
    new Proxy({}, {
      get(_t, method: string) {
        const fn = table[`${ns}.${method}`]
        if (fn === undefined) return undefined
        return (...args: unknown[]) => fn(args)
      },
    })
  return {
    forgeProjects: make('forgeProjects') as ForgeRemoteFace['forgeProjects'],
    forgeFs: make('forgeFs') as ForgeRemoteFace['forgeFs'],
    forgeBugs: make('forgeBugs') as ForgeRemoteFace['forgeBugs'],
    forgeWorktree: make('forgeWorktree') as ForgeRemoteFace['forgeWorktree'],
    forgeFeatures: make('forgeFeatures') as ForgeRemoteFace['forgeFeatures'],
  }
}

/** 前置断言：window.dshForge 缺席（本组数据通路不得依赖 preload 通道） */
function expectDshForgeAbsent(): void {
  const w = (globalThis as { window?: { dshForge?: unknown } }).window
  expect(w === undefined || w.dshForge === undefined, 'window.dshForge 必须缺席（无 preload 环境）').toBe(true)
  expect('dshForge' in globalThis).toBe(false)
}

afterEach(() => {
  installForgeRemoteFace(() => undefined)
  delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY]
})

describe('添加项目向导全链路（无 window.dshForge 环境——Typert 切片单通路）', () => {
  it('前置：window.dshForge 缺席时 list→derive→listDir→register 四步缺省数据源均可调', async () => {
    expectDshForgeAbsent()

    const list = vi.fn(async () => ({ ok: true, value: [{ id: 'p-1', name: 'demo' }] }))
    const derive = vi.fn(async () => ({ ok: true, value: { dir: 'Z:\\store\\demo' } }))
    const listDir = vi.fn(async () => ({ ok: true, value: { path: 'Z:\\demo', entries: [] } }))
    const register = vi.fn(async () => ({ ok: true, value: { id: 'p-9', attachedToExisting: false } }))
    installForgeRemoteFace(() =>
      stubRemoteFace({
        'forgeProjects.list': (args) => list(...args),
        'forgeProjects.deriveTaskStoreDir': (args) => derive(...args),
        'forgeProjects.register': (args) => register(...args),
        'forgeFs.listDir': (args) => listDir(...args),
      }) as ForgeRemoteFace,
    )

    const registered = await rpcRegisteredPathsSource()()
    expect(registered).toEqual([{ id: 'p-1', name: 'demo' }])
    expect(list).toHaveBeenCalledTimes(1)

    const derived = await rpcDeriveSource()('Z:\\demo')
    expect(derived).toEqual({ dir: 'Z:\\store\\demo' })
    expect(derive).toHaveBeenCalledWith('Z:\\demo')

    const listing = await rpcDirSource()('Z:\\demo')
    expect(listing).toEqual({ path: 'Z:\\demo', entries: [] })
    expect(listDir).toHaveBeenCalledWith('Z:\\demo')

    const result = await rpcRegisterSource()({ name: 'demo', path: 'Z:\\demo' } as never)
    expect(result).toEqual({ id: 'p-9', attachedToExisting: false })
    expect(register).toHaveBeenCalledTimes(1)
  })
})
