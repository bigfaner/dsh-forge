// forgeFaceOf 形状归一单测（bug 145b3d3b 真根因钉——官方 gateway client 半 rc.2 形态 =
// ClientRemoteService：namespace 面物化为 remote.namespaces Map（entry {service}）+
// remote.<ns> 平铺 cordis 服务，ctx.remote 顶层无六族属性；forgeFaceOf 旧形态只做顶层
// 六属性校验 → face 恒 undefined（fiber 已激活、锚已发布、resolver 恒 undefined）。
// 修复后归一取法复用 namespaceFaceOf 三形态回退（Map → namespaces 对象 → 顶层属性），
// 官方 web 舞台顶层形态（回归钉）与 electron dev Map 形态两界同源解析。
import { describe, expect, it } from 'vitest'
import { forgeFaceOf, namespaceFaceOf, type ForgeRemoteFace } from './rpc.js'

const SIX_NS = ['forgeProjects', 'forgeFs', 'forgeBugs', 'forgeWorktree', 'forgeProposals', 'forgeFeatures'] as const

/** 顶层属性形态（官方 web 舞台形态）——六族对象直挂 remote */
function topLevelFace(): Record<string, unknown> {
  const face: Record<string, unknown> = {}
  for (const ns of SIX_NS) face[ns] = { probe: () => ({ ok: true, value: ns }) }
  return face
}

/** 官方 gateway rc.2 ClientRemoteService 同构替身（electron dev 断点形态）：
 * namespaces Map 挂 entry {service}，顶层无六族属性 */
function gatewayMapFace(): Record<string, unknown> {
  const namespaces = new Map<string, { service: Record<string, unknown> }>()
  for (const ns of SIX_NS) namespaces.set(ns, { service: { probe: () => ({ ok: true, value: ns }) } })
  return { namespaces }
}

describe('forgeFaceOf 形状归一（bug 145b3d3b）', () => {
  it('gateway rc.2 Map 形态（electron dev 断点）→ face 解析成功、六族方法可达', () => {
    const face = forgeFaceOf({ remote: gatewayMapFace() })
    expect(face).toBeDefined()
    for (const ns of SIX_NS) {
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
    for (const ns of SIX_NS) (holder.namespaces as Record<string, unknown>)[ns] = { probe: () => null }
    expect(forgeFaceOf({ remote: holder })).toBeDefined()
  })

  it('缺一族（Map 形态）→ undefined 诚实降级', () => {
    const namespaces = new Map<string, { service: Record<string, unknown> }>()
    for (const ns of SIX_NS.slice(0, 5)) namespaces.set(ns, { service: {} })
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
})
