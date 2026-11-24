// forgeFaceOf 形状归一单测（bug 145b3d3b 真根因钉——官方 gateway client 半 rc.2 形态 =
// ClientRemoteService：namespace 面物化为 remote.namespaces Map（entry {service}）+
// remote.<ns> 平铺 cordis 服务，ctx.remote 顶层无五族属性；forgeFaceOf 旧形态只做顶层
// 五属性校验 → face 恒 undefined（fiber 已激活、锚已发布、resolver 恒 undefined）。
// 修复后归一取法复用 namespaceFaceOf 三形态回退（Map → namespaces 对象 → 顶层属性），
// 官方 web 舞台顶层形态（回归钉）与 electron dev Map 形态两界同源解析。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createForgeRpcClient,
  forgeFaceOf,
  installForgeRemoteFace,
  namespaceFaceOf,
  type ForgeRemoteFace,
} from './rpc.js'

const FIVE_NS = ['forgeProjects', 'forgeFs', 'forgeBugs', 'forgeWorktree', 'forgeFeatures'] as const

/** 顶层属性形态（官方 web 舞台形态）——五族对象直挂 remote */
function topLevelFace(): Record<string, unknown> {
  const face: Record<string, unknown> = {}
  for (const ns of FIVE_NS) face[ns] = { probe: () => ({ ok: true, value: ns }) }
  return face
}

/** 官方 gateway rc.2 ClientRemoteService 同构替身（electron dev 断点形态）：
 * namespaces Map 挂 entry {service}，顶层无五族属性 */
function gatewayMapFace(): Record<string, unknown> {
  const namespaces = new Map<string, { service: Record<string, unknown> }>()
  for (const ns of FIVE_NS) namespaces.set(ns, { service: { probe: () => ({ ok: true, value: ns }) } })
  return { namespaces }
}

describe('forgeFaceOf 形状归一（bug 145b3d3b）', () => {
  it('gateway rc.2 Map 形态（electron dev 断点）→ face 解析成功、五族方法可达', () => {
    const face = forgeFaceOf({ remote: gatewayMapFace() })
    expect(face).toBeDefined()
    for (const ns of FIVE_NS) {
      const service = namespaceFaceOf(face as ForgeRemoteFace, ns)
      expect(typeof service?.probe).toBe('function')
    }
  })

  it('顶层属性形态（官方 web 舞台）→ face 解析成功（回归钉）', () => {
    const face = forgeFaceOf({ remote: topLevelFace() })
    expect(face).toBeDefined()
    expect(typeof (face as Record<string, unknown>).forgeProjects).toBe('object')
  })

  it('namespaces 普通对象形态（非 Map holder）→ face 解析成功', () => {
    const holder: Record<string, unknown> = { namespaces: {} }
    for (const ns of FIVE_NS) (holder.namespaces as Record<string, unknown>)[ns] = { probe: () => null }
    expect(forgeFaceOf({ remote: holder })).toBeDefined()
  })

  it('缺一族（Map 形态）→ undefined 诚实降级', () => {
    const namespaces = new Map<string, { service: Record<string, unknown> }>()
    for (const ns of FIVE_NS.slice(0, 4)) namespaces.set(ns, { service: {} })
    expect(forgeFaceOf({ remote: { namespaces } })).toBeUndefined()
  })

  it('缺一族（顶层形态）→ undefined（旧行为不变）', () => {
    const face = topLevelFace()
    delete face.forgeBugs
    expect(forgeFaceOf({ remote: face })).toBeUndefined()
  })

  it('fiberCtx.remote 缺席/劣形 → undefined', () => {
    expect(forgeFaceOf({})).toBeUndefined()
    expect(forgeFaceOf({ remote: null })).toBeUndefined()
    expect(forgeFaceOf({ remote: 'str' })).toBeUndefined()
  })

  it('可选族缺席不阻断五族门控（Map 形态，五族在场 + 可选族全缺）→ face defined、归一面不含可选族', () => {
    const face = forgeFaceOf({ remote: gatewayMapFace() })
    expect(face).toBeDefined()
    expect((face as unknown as Record<string, unknown>).forgeDirs).toBeUndefined()
    expect((face as unknown as Record<string, unknown>).forgeSpecs).toBeUndefined()
  })

  it('可选族在场（Map 形态）→ 并入归一面且五族不受影响', () => {
    const remote = gatewayMapFace()
    const namespaces = remote.namespaces as Map<string, { service: Record<string, unknown> }>
    namespaces.set('forgeDirs', { service: { facts: () => ({ ok: true, value: [] }) } })
    namespaces.set('forgeSpecs', { service: { list: () => ({ ok: true, value: [] }) } })
    const face = forgeFaceOf({ remote }) as ForgeRemoteFace
    expect(typeof namespaceFaceOf(face, 'forgeDirs')?.facts).toBe('function')
    expect(typeof namespaceFaceOf(face, 'forgeSpecs')?.list).toBe('function')
    expect(typeof namespaceFaceOf(face, 'forgeProjects')?.probe).toBe('function')
  })
  it('可选族顶层属性形态（官方 web 舞台可选族语境——评审 E②回归钉）→ 并入归一面且 namespaceFaceOf 可达', () => {
    const remote = topLevelFace()
    remote.forgeDirs = { facts: () => ({ ok: true, value: [{ dir: 'docs' }] }) }
    remote.forgeSpecs = { list: () => ({ ok: true, value: [{ slug: 'a' }] }) }
    const face = forgeFaceOf({ remote }) as ForgeRemoteFace
    expect(face).toBeDefined()
    expect(typeof namespaceFaceOf(face, 'forgeDirs')?.facts).toBe('function')
    expect(typeof namespaceFaceOf(face, 'forgeSpecs')?.list).toBe('function')
    expect(typeof namespaceFaceOf(face, 'forgeProjects')?.probe).toBe('function')
  })
})

describe('生产装配形状全链回归（forgeFaceOf → installForgeRemoteFace → createForgeRpcClient）', () => {
  afterEach(() => {
    installForgeRemoteFace(() => undefined)
    vi.restoreAllMocks()
  })

  /** 官方 gateway 真机装配替身：Map 形 namespaces + 仅五族在场（forgeSpecs/forgeDirs 缺席形态）；
   *  service 方法 = Proxy 万能应答（任意方法名 → RemoteResult ok 信封） */
  function productionFiberCtx(): Record<string, unknown> {
    const namespaces = new Map<string, { service: Record<string, unknown> }>()
    for (const ns of FIVE_NS) {
      namespaces.set(ns, {
        service: new Proxy(
          {},
          {
            get: (_t, method) =>
              typeof method === 'string'
                ? (...args: readonly unknown[]) => ({ ok: true, value: { ns, method, args } })
                : undefined,
          },
        ),
      })
    }
    return { remote: { namespaces } }
  }

  function installProductionResolver(fiberCtx: Record<string, unknown>): void {
    installForgeRemoteFace(() => forgeFaceOf(fiberCtx) as ForgeRemoteFace | undefined)
  }

  it('五族健全 + forgeSpecs 缺席 = face 归一成功、五族调用不受阻、specs 通道 typed 缺席', async () => {
    const fiberCtx = productionFiberCtx()
    installProductionResolver(fiberCtx)
    const client = createForgeRpcClient()
    // 五族调用不受阻（envelope ok → data 直透）
    await expect(client.projects.list()).resolves.toEqual({
      ns: 'forgeProjects',
      method: 'list',
      args: [],
    })
    // specs 通道 = typed 缺席（typed Error 抛出，非 undefined 静默）
    await expect(client.specs.list({ projectId: 'p' })).rejects.toThrow(/forgeSpecs\.list/)
  })

  it('forgeSpecs/forgeDirs 在场 = 两通道可达', async () => {
    const fiberCtx = productionFiberCtx()
    const namespaces = (fiberCtx.remote as Record<string, unknown>).namespaces as Map<
      string,
      { service: Record<string, unknown> }
    >
    namespaces.set('forgeDirs', { service: { facts: () => ({ ok: true, value: [{ dir: 'docs' }] }) } })
    namespaces.set('forgeSpecs', { service: { list: () => ({ ok: true, value: [{ slug: 'a' }] }) } })
    installProductionResolver(fiberCtx)
    const client = createForgeRpcClient()
    await expect(client.dirs.facts('p')).resolves.toEqual([{ dir: 'docs' }])
    await expect(client.specs.list({ projectId: 'p' })).resolves.toEqual([{ slug: 'a' }])
  })
})
