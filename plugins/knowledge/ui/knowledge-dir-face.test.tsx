// 知识库目录只读节单测（knowledge-plugin-migration 1.5 提案项 4 UI 侧）：
//   · 锚解析纯异步面：唯一非 archived 项目充锚（project detail-section 同判据）——
//     零/多项目/拉取失败 = absent（fail-soft 不猜锚）；ready = deriveKnowledgeDir 缺省派生；
//   · 节注册面：knowledgeGateOf 复用（1.4 双门控）+ 官方槽键逐字（project.section.knowledge-dir）
//     + safeRegister 降级只降本节 + 缺席路径 diag 留痕不静默（AC5）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KnowledgeDirSectionView, KNOWLEDGE_DIR_SECTION_KEY, loadKnowledgeDirAnchor } from './knowledge-dir-section.js'
import { registerKnowledgeDirSection } from './faces.js'
import type { SectionSlotsFace } from './keyed-section.js'
import type { ProjectSummary } from '@dsh-forge/lib-api/dto/project'
import type { RpcClientFactory } from './rpc-channels.js'

function project(partial: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: 'p1',
    workspaceId: 'w1',
    name: 'demo',
    wsPath: 'Z:\\ws\\demo',
    archived: false,
    ...partial,
  }
}

function clientOf(projects: ProjectSummary[] | Error): RpcClientFactory {
  // 只读节单测仅消费 projects.list——其余 RPC 族以 never 桩填形（ForgeRpcClient 形状完备性）
  const client = {
    projects: {
      list: () => (projects instanceof Error ? Promise.reject(projects) : Promise.resolve(projects)),
      get: () => Promise.resolve(null),
      register: () => Promise.reject(new Error('unused in test')),
      update: () => Promise.reject(new Error('unused in test')),
      reconcile: () => Promise.reject(new Error('unused in test')),
    },
    knowledge: {} as never,
    worktree: {} as never,
  } as unknown as ReturnType<RpcClientFactory>
  return () => client
}

describe('loadKnowledgeDirAnchor 锚解析（纯异步面）', () => {
  it('唯一非 archived 项目 → ready + 缺省派生知识目录（deriveKnowledgeDir 单源）', async () => {
    const out = await loadKnowledgeDirAnchor(clientOf([project({ wsPath: 'Z:\\ws\\demo' })]))
    expect(out).toEqual({ state: 'ready', knowledgeDir: 'Z:\\ws\\demo\\.knowledge' })
  })

  it('archived 行不充锚；零项目 = absent（不猜锚）', async () => {
    expect(await loadKnowledgeDirAnchor(clientOf([project({ archived: true })]))).toEqual({ state: 'absent' })
    expect(await loadKnowledgeDirAnchor(clientOf([]))).toEqual({ state: 'absent' })
  })

  it('多项目 = absent（锚歧义不猜首个——detail-section 同判据）；拉取失败 = absent（fail-soft）', async () => {
    expect(
      await loadKnowledgeDirAnchor(clientOf([project({ id: 'a' }), project({ id: 'b' })])),
    ).toEqual({ state: 'absent' })
    expect(await loadKnowledgeDirAnchor(clientOf(new Error('rpc down')))).toEqual({ state: 'absent' })
  })
})

describe('KnowledgeDirSectionView 只读呈现（单向零写面）', () => {
  it('ready：节标题 + 目录路径呈现（机械锚 data-dswf-knowledge-dir / data-dswf-knowledge-dir-path）', () => {
    const markup = renderToStaticMarkup(<KnowledgeDirSectionView knowledgeDir={'Z:\\ws\\demo\\.knowledge'} />)
    expect(markup).toContain('data-dswf-knowledge-dir')
    expect(markup).toContain('data-dswf-knowledge-dir-path')
    expect(markup).toContain('Z:\\ws\\demo\\.knowledge')
    expect(markup).toContain('知识库目录')
  })
})

describe('registerKnowledgeDirSection 注册面（gate 复用 + 官方缝 + diag 可观测）', () => {
  /** 形状合法假 slots（inject 声明缝 + register 落座均计数） */
  function fakeSlots(registerThrows = false): SectionSlotsFace & { registered: string[] } {
    const registered: string[] = []
    return {
      registered,
      inject: (key, cb) => {
        cb()
        return () => {}
      },
      register: (options) => {
        if (registerThrows) throw new Error('keyed slot cell occupied')
        const o = options as { name?: string; key?: string; id?: string }
        registered.push(`${o.name ?? ''}:${o.key ?? o.id ?? ''}`)
        return () => {}
      },
    }
  }
  /** 集成态显式关闭缝（壳缝 knowledge:false——fix-3 门控唯一 fail-closed 分支） */
  const gateOffGlobal = { __DSH_FORGE_HOST_PLUGINS__: { knowledge: false } }

  it('槽键核销（AC4 只插孔纪律）：slot = project.section.knowledge-dir 逐字 + key = dswf-knowledge-dir + label/组件在行协议形状内', () => {
    const slots = fakeSlots()
    const out = registerKnowledgeDirSection(slots, {})
    expect(out).toEqual({ registered: true, knowledgeEnabled: true })
    expect(slots.registered).toEqual([`project.section.knowledge-dir:${KNOWLEDGE_DIR_SECTION_KEY}`])
    expect(KNOWLEDGE_DIR_SECTION_KEY).toBe('dswf-knowledge-dir')
  })

  it('gate false（集成态壳缝显式 false）→ 零登记零异常（缺席路径 diag info 留痕——AC5 不静默）', () => {
    const slots = fakeSlots()
    const out = registerKnowledgeDirSection(slots, gateOffGlobal)
    expect(out).toEqual({ registered: false, knowledgeEnabled: false })
    expect(slots.registered).toEqual([])
  })

  it('slots 劣形（inject/register 缺席）→ fail-soft 不注册 + warn 留痕（缺席可观测）', () => {
    const out = registerKnowledgeDirSection({}, {})
    expect(out).toEqual({ registered: false, knowledgeEnabled: true })
  })

  it('safeRegister 降级只降本节：register 抛（同 cell 占用等）→ 不外溢炸 apply，registered=false + error 留痕', () => {
    const slots = fakeSlots(true)
    expect(() => registerKnowledgeDirSection(slots, {})).not.toThrow()
    expect(slots.registered).toEqual([])
  })
})
