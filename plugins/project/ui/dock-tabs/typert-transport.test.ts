// typert-transport specs 通道 pin 单测（评审 B P1-a 覆盖真空补齐）：typert-transport.ts
// SEG_NAMESPACE specs:'forgeSpecs' 行 + rpc.ts specs 切片 invokeRemote 路径零触达的收口——
//   ① forge:specs/list 通道经 Typert namespace 命中 + RemoteResult 信封投影（ok/failure 双支）；
//   ② face 在场但 forgeSpecs 单边缺席（spec 插件缺席——可选边）= typed 拒绝信封降级，
//      不拖垮五族 face（同 transport 同调 projects 通道照常可达）。
// 替身纪律：替身落 installForgeRemoteFace 解析缝（测试侧组合根构造——零生产口）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FORGE_REMOTE_FACE_ANCHOR_KEY,
  installForgeRemoteFace,
  type ForgeRemoteFace,
  type ForgeRemoteNamespaceFace,
} from '../rpc.js'
import { typertTransport } from './typert-transport.js'

/** namespace 方法替身（调用记录 + 按表回 RemoteResult 信封—— rpc.typert.test 同族） */
function stubFace(
  table: Record<string, (args: unknown) => unknown>,
  extraNamespaces: readonly string[] = [],
): ForgeRemoteFace {
  const make = (ns: string): ForgeRemoteNamespaceFace =>
    new Proxy({} as ForgeRemoteNamespaceFace, {
      get(_t, method: string) {
        const key = `${ns}.${method}`
        const handler = table[key]
        if (handler === undefined) return undefined
        return (arg?: unknown) => handler(arg)
      },
    })
  const face = {
    forgeProjects: make('forgeProjects'),
    forgeFs: make('forgeFs'),
    forgeBugs: make('forgeBugs'),
    forgeWorktree: make('forgeWorktree'),
    forgeFeatures: make('forgeFeatures'),
  } as ForgeRemoteFace
  for (const ns of extraNamespaces) {
    ;(face as unknown as Record<string, unknown>)[ns] = make(ns)
  }
  return face
}

afterEach(() => {
  installForgeRemoteFace(() => undefined)
  delete (globalThis as Record<string, unknown>)[FORGE_REMOTE_FACE_ANCHOR_KEY]
})

describe('typertTransport tasks 通道（SEG_NAMESPACE tasks 行 pin）', () => {
  const TASKS_METHODS = ['transition', 'query', 'validateFeatureTasks', 'list', 'stats', 'graph', 'detail', 'sessionLinks'] as const

  it('forge:tasks/<method> 八通道全部命中 forgeTasks.<method>（载荷单参透传）', async () => {
    const calls: string[] = []
    const table: Record<string, (arg: unknown) => unknown> = {}
    for (const m of TASKS_METHODS) {
      table[`forgeTasks.${m}`] = (arg) => {
        calls.push(`${m}:${JSON.stringify(arg)}`)
        return { ok: true, value: `v-${m}` }
      }
    }
    installForgeRemoteFace(() => stubFace(table, ['forgeTasks']))
    const transport = typertTransport()
    for (const m of TASKS_METHODS) {
      await expect(transport(`forge:tasks/${m}`, { projectId: 'p-1' })).resolves.toEqual({ ok: true, data: `v-${m}` })
    }
    expect(calls).toEqual(TASKS_METHODS.map((m) => `${m}:{"projectId":"p-1"}`))
  })

  it('forgeTasks 缺席（task-loop 插件缺席）→ typed 拒绝信封（可选边降级不抛构造错）', async () => {
    installForgeRemoteFace(() => stubFace({})) // 无 forgeTasks
    const result = await typertTransport()('forge:tasks/list', { projectId: 'p-1' })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: { message: string } }).error.message).toContain('forge:tasks/list')
  })
})

describe('typertTransport specs 通道（SEG_NAMESPACE specs 行 pin）', () => {
  it('forge:specs/list 命中 forgeSpecs.list：载荷单参透传 + value → data 信封投影', async () => {
    const list = vi.fn(() => ({ ok: true, value: [{ slug: 'demo', title: 'Demo', specStatus: 'confirmed' }] }))
    installForgeRemoteFace(() => stubFace({ 'forgeSpecs.list': (q) => list(q) }, ['forgeSpecs']))
    const result = await typertTransport()('forge:specs/list', { projectId: 'p-1' })
    expect(result).toEqual({
      ok: true,
      data: [{ slug: 'demo', title: 'Demo', specStatus: 'confirmed' }],
    })
    expect(list).toHaveBeenCalledWith({ projectId: 'p-1' })
  })

  it('failure 信封 → typed 拒绝投影（code/message/data 逐字透传）', async () => {
    installForgeRemoteFace(() =>
      stubFace(
        {
          'forgeSpecs.list': () => ({
            ok: false,
            error: { code: 'ERR_ENTRY_NOT_FOUND', message: 'spec 未命中', details: { slug: 'demo' } },
          }),
        },
        ['forgeSpecs'],
      ),
    )
    const result = await typertTransport()('forge:specs/list', { projectId: 'p-1' })
    expect(result).toEqual({
      ok: false,
      error: { code: 'ERR_ENTRY_NOT_FOUND', message: 'spec 未命中', data: { slug: 'demo' } },
    })
  })

  it('forgeSpecs 单边缺席（face 在场、五族健全）→ typed 拒绝信封（optional 边降级不抛构造错）', async () => {
    installForgeRemoteFace(() => stubFace({})) // 无 forgeSpecs——spec 插件缺席形态
    const result = await typertTransport()('forge:specs/list', { projectId: 'p-1' })
    expect(result.ok).toBe(false)
    const err = (result as { ok: false; error: { code: string; message: string } }).error
    expect(err.code).toBe('internal')
    expect(err.message).toContain('forge:specs/list')
    expect(err.message).toContain('typed 降级')
  })

  it('specs 缺席不拖垮五族：同 transport 同调 forge:projects/list 照常可达', async () => {
    const list = vi.fn(() => ({ ok: true, value: [] }))
    installForgeRemoteFace(() => stubFace({ 'forgeProjects.list': () => list() })) // 无 forgeSpecs
    const transport = typertTransport()
    await expect(transport('forge:specs/list', { projectId: 'p-1' })).resolves.toMatchObject({ ok: false })
    await expect(transport('forge:projects/list')).resolves.toEqual({ ok: true, data: [] })
    expect(list).toHaveBeenCalledTimes(1)
  })
})
