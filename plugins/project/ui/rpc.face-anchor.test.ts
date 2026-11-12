// forge remote face 跨 bundle 单例缝（bug 837a70fc——1.38 回归钉）：rpc.ts 的解析缝是
// 模块级状态，页面同时存在两份 rpc 模块实例（plugins/project bundle + 壳 bundle 内联
// 副本），壳侧副本从不调用 installForgeRemoteFace → resolver 恒缺席反复诚实降级。
// 收口 = installForgeRemoteFace 发布页内全局锚（KEY 契约 `__dshForgeRemoteFace`——
// open-workspace-face-install/worktree-switch-gate-install 双注先例同型），缺本地缝的
// 副本回退读锚。本文件以独立模块实例模拟壳侧副本：仅写锚、零本地 install。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createForgeRpcClient,
  FORGE_REMOTE_FACE_ANCHOR_KEY,
  type ForgeRemoteFace,
} from './rpc.js'

const NAMESPACES = ['forgeProjects', 'forgeFs', 'forgeBugs', 'forgeWorktree', 'forgeProposals', 'forgeFeatures'] as const

/** namespace 代理（方法 = `ns.method` 表驱动——getter 函数属性同型） */
function makeNamespace(ns: string, table: Record<string, (args: unknown[]) => unknown>): Record<string, unknown> {
  return new Proxy({}, {
    get(_t, method: string) {
      const key = `${ns}.${method}`
      if (table[key] === undefined) return undefined
      return (...args: unknown[]) => table[key](args)
    },
  })
}

function stubFace(table: Record<string, (args: unknown[]) => unknown>): ForgeRemoteFace {
  const make = (ns: string): Record<string, unknown> => makeNamespace(ns, table)
  return Object.fromEntries(NAMESPACES.map((ns) => [ns, make(ns)])) as unknown as ForgeRemoteFace
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY]
})

describe('forge remote face 页内锚（跨 bundle 副本回退读锚）', () => {
  it('壳侧副本形态：本地零 install、仅页内锚在场 → projects.list 走锚回数据', async () => {
    const list = vi.fn(async () => ({ ok: true, value: [{ id: 'p1' }] }))
    ;(globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY] = {
      resolver: () => stubFace({ 'forgeProjects.list': (args) => list(...args) }),
      diag: () => {},
    }
    const rows = await createForgeRpcClient().projects.list()
    expect(rows).toEqual([{ id: 'p1' }])
    expect(list).toHaveBeenCalledWith()
  })

  it('官方 face 形状（namespaces Map<string,{service}>）→ projects.list 走锚回数据（bug bead3e88 回归钉）', async () => {
    const list = vi.fn(async () => ({ ok: true, value: [{ id: 'p1' }] }))
    const namespaces = new Map(
      NAMESPACES.map((ns) => [ns, { service: makeNamespace(ns, { 'forgeProjects.list': (args) => list(...args) }) }]),
    )
    ;(globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY] = {
      resolver: () => ({ namespaces }) as unknown as ForgeRemoteFace,
      diag: () => {},
    }
    const rows = await createForgeRpcClient().projects.list()
    expect(rows).toEqual([{ id: 'p1' }])
    expect(list).toHaveBeenCalledWith()
  })

  it('namespaces 纯对象形状（Map 缺席回退）→ projects.list 走锚回数据', async () => {
    const list = vi.fn(async () => ({ ok: true, value: [{ id: 'p2' }] }))
    const namespaces = Object.fromEntries(
      NAMESPACES.map((ns) => [ns, makeNamespace(ns, { 'forgeProjects.list': (args) => list(...args) })]),
    )
    ;(globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY] = {
      resolver: () => ({ namespaces }) as unknown as ForgeRemoteFace,
      diag: () => {},
    }
    const rows = await createForgeRpcClient().projects.list()
    expect(rows).toEqual([{ id: 'p2' }])
  })

  it('锚缺席降级也走锚 diag（壳副本自身 console 无前缀污染——诊断单门）', async () => {
    const diag = vi.fn()
    ;(globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY] = {
      resolver: () => undefined,
      diag,
    }
    await expect(createForgeRpcClient().projects.list()).rejects.toThrow('官方 forge remote 面缺席')
    expect(diag).toHaveBeenCalledWith(expect.stringContaining('通道不可用'))
  })
})
