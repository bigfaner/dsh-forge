// overview-data 单测 —— AC6 搜索传参（Hard Rule「搜索过滤服务端承载」的通道面锚：
// search 关键词经 rpc mock 断言服务端过滤调用——前端零本地过滤逻辑可断言）+ 头路四路并发
// 归一 + 派生行 fail-soft + typed error 三态映射 + 落点纯函数。
// 口径沿 use-knowledge-browse 先例：effect 胶水不在 Node 测面；纯异步面全量单测。
import { describe, expect, it } from 'vitest'
import type { FeatureCard, FeatureDocumentRow, Project, ProposalCard, ProposalStatus, TaskStatus } from '@dsh-forge/contracts'
import {
  FEATURES_CHANNELS,
  PROJECTS_CHANNELS,
  PROJECTS_M2_CHANNELS,
  PROPOSALS_CHANNELS,
  TASKS_CHANNELS,
} from '@dsh-forge/contracts'
import { createForgeRpcClient, type ForgeRpcClient } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import {
  applyOverviewHead,
  applyOverviewList,
  fetchOverviewList,
  initialOverviewLoadState,
  loadOverviewHead,
  mapOverviewError,
  overviewHeadRows,
  overviewListPlan,
  pendingOverviewList,
} from './overview-data.js'

const PROJECT: Project = {
  id: 'p-1',
  workspaceId: 'w-1',
  wsPath: 'Z:/ws/demo',
  name: 'demo',
  forgeDir: 'Z:/ws/demo/.forge',
  forgeDirExternal: false,
  knowledgeDir: 'Z:/ws/demo/.knowledge',
  archived: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

function featureCard(slug: string): FeatureCard {
  return {
    featureId: `fid-${slug}`,
    slug,
    title: slug,
    featureStatus: 'in-progress',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    byStatus: Object.fromEntries(
      (['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected'] as const).map((s) => [
        s,
        0,
      ]),
    ) as Record<TaskStatus, number>,
    docCount: 3,
    proposalSlug: 'prop-1',
  }
}

function proposalCard(id: string, slug: string, status: ProposalStatus = 'under-review'): ProposalCard {
  return {
    proposalId: id,
    slug,
    title: `提案 ${slug}`,
    proposalStatus: status,
    relPath: `docs/proposals/${slug}/proposal.md`,
    author: 'faner',
    taskCount: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

const STATS = {
  total: 9,
  byStatus: {
    pending: 2,
    in_progress: 1,
    completed: 3,
    blocked: 1,
    suspended: 0,
    skipped: 1,
    rejected: 1,
  } as Record<TaskStatus, number>,
}

/** 通道 responder 替身（捕获通道 + 请求负载——服务端过滤调用的断言面） */
interface Captured {
  readonly channel: string
  readonly payload: unknown
}

function clientResponding(
  respond: (channel: string, payload: unknown) => unknown | Promise<unknown>,
): { readonly client: ForgeRpcClient; readonly calls: Captured[] } {
  const calls: Captured[] = []
  const client = createForgeRpcClient(async (channel, payload) => {
    calls.push({ channel, payload })
    const data = await respond(channel, payload)
    return { ok: true, data }
  })
  return { client, calls }
}

/** 头路全通替身 */
function headOkClient(overrides: { deriveTaskStoreDir?: () => unknown } = {}) {
  return clientResponding((channel) => {
    if (channel === PROJECTS_CHANNELS.get) return PROJECT
    if (channel === PROJECTS_M2_CHANNELS.deriveTaskStoreDir) {
      return overrides.deriveTaskStoreDir?.() ?? { dir: 'C:/forge-home/demo@a1b2c3d4' }
    }
    if (channel === FEATURES_CHANNELS.list) return [featureCard('m2-pipeline')]
    if (channel === FEATURES_CHANNELS.listDocs) return [featureDocRow()]
    if (channel === TASKS_CHANNELS.stats) return STATS
    if (channel === PROPOSALS_CHANNELS.list) return [proposalCard('pr-1', 'prop-1')]
    throw new Error(`unexpected channel: ${channel}`)
  })
}

/** feature 文档行（fix-2 列举读面替身——fid-m2-pipeline 归属） */
function featureDocRow(docKind: 'prd-spec' | 'tech-design' = 'tech-design'): FeatureDocumentRow {
  return {
    featureId: 'fid-m2-pipeline',
    docKind,
    relPath: `docs/features/m2-pipeline/${docKind === 'tech-design' ? 'design/tech-design.md' : 'prd/prd-spec.md'}`,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

describe('loadOverviewHead（头路四路并发）', () => {
  it('get ∥ derive ∥ features.list(无参) ∥ stats 归一为 ov-head 信息束', async () => {
    const { client, calls } = headOkClient()
    const out = await loadOverviewHead(client, 'p-1')
    expect(out).toEqual({
      ok: true,
      data: {
        projectName: 'demo',
        workspaceDir: 'Z:/ws/demo',
        forgeDir: 'Z:/ws/demo/.forge',
        knowledgeDir: 'Z:/ws/demo/.knowledge',
        taskStoreDir: 'C:/forge-home/demo@a1b2c3d4',
        features: [featureCard('m2-pipeline')],
        stats: STATS,
      },
    })
    // 头路 features.list 无搜索参（摘要/谱系查找源不随搜索漂移）
    const featuresCall = calls.find((c) => c.channel === FEATURES_CHANNELS.list)
    expect(featuresCall?.payload).toEqual({ projectId: 'p-1' })
  })

  it('deriveTaskStoreDir 失败 = fail-soft（null → 任务清单行回退「—」，头部整体不受累）', async () => {
    const { client } = headOkClient({ deriveTaskStoreDir: () => { throw new Error('派生缺席') } })
    const out = await loadOverviewHead(client, 'p-1')
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.data.taskStoreDir).toBeNull()
      expect(overviewHeadRows(out.data).find((r) => r.label === '任务清单')).toEqual({ label: '任务清单', value: '—' })
    }
  })

  it('AC1 ov-head 四行：工作区/文档位置/知识目录/任务清单@hash8', async () => {
    const { client } = headOkClient()
    const out = await loadOverviewHead(client, 'p-1')
    expect(out.ok).toBe(true)
    if (out.ok) {
      const rows = overviewHeadRows(out.data)
      expect(rows.map((r) => r.label)).toEqual(['工作区', '文档位置', '知识目录', '任务清单'])
      expect(rows.find((r) => r.label === '任务清单')?.value).toContain('@a1b2c3d4')
    }
  })

  it('projects.get null → error 归一（错误条）', async () => {
    const { client } = clientResponding((channel) => {
      if (channel === PROJECTS_CHANNELS.get) return null
      throw new Error(`unexpected channel: ${channel}`)
    })
    const out = await loadOverviewHead(client, 'p-1')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error.uiState).toBe('error-bar')
  })
})

describe('fetchOverviewList（AC6 搜索传参——服务端过滤调用断言）', () => {
  it('proposals 子 tab：search 关键词 + sort 原样入 proposals.list 查询参（前端零本地过滤）', async () => {
    const { client, calls } = headOkClient()
    const out = await fetchOverviewList(client, { projectId: 'p-1', subtab: 'proposals', search: ' 网关 ', sort: 'created' })
    expect(out?.ok).toBe(true)
    const call = calls.find((c) => c.channel === PROPOSALS_CHANNELS.list)
    expect(call?.payload).toEqual({ projectId: 'p-1', search: '网关', sort: 'created' })
  })

  it('空搜索 = 不带 search 参（undefined 归一——空参即全量）', async () => {
    const { client, calls } = headOkClient()
    await fetchOverviewList(client, { projectId: 'p-1', subtab: 'proposals', search: '   ', sort: 'active' })
    const call = calls.find((c) => c.channel === PROPOSALS_CHANNELS.list)
    expect(call?.payload).toEqual({ projectId: 'p-1', search: undefined, sort: 'active' })
  })

  it('features 子 tab：features.list 带 search/sort ∥ proposals.list 无参 ∥ features.listDocs（fix-2 文档行数据源）', async () => {
    const { client, calls } = headOkClient()
    const out = await fetchOverviewList(client, { projectId: 'p-1', subtab: 'features', search: 'pipeline', sort: 'active' })
    expect(out?.ok).toBe(true)
    if (out?.ok && out.data.kind === 'features') {
      expect(out.data.features).toEqual([featureCard('m2-pipeline')])
      expect(out.data.proposals).toEqual([proposalCard('pr-1', 'prop-1')])
      expect(out.data.docs).toEqual([featureDocRow()])
    }
    const featuresCall = calls.find((c) => c.channel === FEATURES_CHANNELS.list)
    expect(featuresCall?.payload).toEqual({ projectId: 'p-1', search: 'pipeline', sort: 'active' })
    const proposalsCall = calls.find((c) => c.channel === PROPOSALS_CHANNELS.list)
    expect(proposalsCall?.payload).toEqual({ projectId: 'p-1' })
    const docsCall = calls.find((c) => c.channel === FEATURES_CHANNELS.listDocs)
    expect(docsCall?.payload).toEqual({ projectId: 'p-1' }) // 无 search 面（行归属过滤归 UI）
  })

  it('tasks 子 tab = null（3.5 无列装载——三视图归 3.6，chips 消费头路 stats）', async () => {
    const { client, calls } = headOkClient()
    const out = await fetchOverviewList(client, { projectId: 'p-1', subtab: 'tasks', search: 'x', sort: 'active' })
    expect(out).toBeNull()
    expect(calls.filter((c) => c.channel === TASKS_CHANNELS.list)).toHaveLength(0)
  })

  it('列路失败 = typed error 归一（库不可用 → 域级横幅 uiState）', async () => {
    const { client } = clientResponding((channel, payload) => {
      if (channel === PROPOSALS_CHANNELS.list && (payload as { search?: string }).search !== undefined) {
        throw new RpcClientError({ code: 'ERR_WORKSPACE_DB_UNAVAILABLE' as const, message: '工作区库不可用' })
      }
      if (channel === PROPOSALS_CHANNELS.list) return []
      throw new Error(`unexpected channel: ${channel}`)
    })
    const out = await fetchOverviewList(client, { projectId: 'p-1', subtab: 'proposals', search: 'q', sort: 'active' })
    expect(out?.ok).toBe(false)
    if (out && !out.ok) expect(out.error.uiState).toBe('banner')
  })
})

describe('落点纯函数', () => {
  it('applyOverviewHead：ok 落 bundle（ready）；error 置相位但保留旧列内容', () => {
    const base = initialOverviewLoadState()
    const withList = { ...base, list: { kind: 'proposals' as const, proposals: [] } }
    const errored = applyOverviewHead(withList, { ok: false, error: { message: 'x', uiState: 'error-bar' as const } })
    expect(errored.phase).toBe('error')
    expect(errored.list).toBeDefined()
  })

  it('pendingOverviewList：清场 = 掏空列 + busy；非清场 = 旧行保持 + busy（缓存先行）', () => {
    const base = initialOverviewLoadState()
    const withList = { ...base, list: { kind: 'proposals' as const, proposals: [proposalCard('pr-1', 'prop-1')] } }
    expect(pendingOverviewList(withList, true).list).toBeUndefined()
    expect(pendingOverviewList(withList, true).busy).toBe(true)
    expect(pendingOverviewList(withList, false).list).toBeDefined()
    expect(pendingOverviewList(withList, false).busy).toBe(true)
  })

  it('applyOverviewList：null（tasks）= 解除 busy；ok 换列清错；error 保留旧行', () => {
    const withList = { ...initialOverviewLoadState(), list: { kind: 'proposals' as const, proposals: [] } }
    expect(applyOverviewList(withList, null).busy).toBe(false)
    const ok = applyOverviewList(withList, {
      ok: true,
      data: { kind: 'proposals', proposals: [proposalCard('pr-9', 'p9')] },
    })
    expect(ok.error).toBeUndefined()
    const err = applyOverviewList(withList, { ok: false, error: { message: 'y', uiState: 'error-bar' as const } })
    expect(err.error).toBeDefined()
    expect(err.list).toBeDefined()
  })

  it('overviewListPlan：键变 = 重拉；子 tab/项目切换 = 清场（同键 = 零装载）', () => {
    // 同键 = 不重拉（重渲染零装载）
    expect(
      overviewListPlan({ listKey: 'k', lastListKey: 'k', subtab: 'proposals', lastSubtab: 'proposals', projectId: 'p', lastProjectId: 'p' }),
    ).toEqual({ isFetch: false, mustClear: false })
    // 搜索键入 = 重拉不清场（旧行保持——IME 安全配套：内容区在途更新非重建）
    expect(
      overviewListPlan({ listKey: 'k2', lastListKey: 'k', subtab: 'proposals', lastSubtab: 'proposals', projectId: 'p', lastProjectId: 'p' }),
    ).toEqual({ isFetch: true, mustClear: false })
    // 子 tab 切换 = 重拉 + 清场（旧子 tab 内容不残留）
    expect(
      overviewListPlan({ listKey: 'k2', lastListKey: 'k', subtab: 'tasks', lastSubtab: 'proposals', projectId: 'p', lastProjectId: 'p' }),
    ).toEqual({ isFetch: true, mustClear: true })
    // 项目切换 = 重拉 + 清场（跨项目旧内容不残留）
    expect(
      overviewListPlan({ listKey: 'k2', lastListKey: 'k', subtab: 'proposals', lastSubtab: 'proposals', projectId: 'p2', lastProjectId: 'p' }),
    ).toEqual({ isFetch: true, mustClear: true })
  })
})

describe('mapOverviewError', () => {
  it('RpcClientError → code 三态映射；其余 → 通用错误条', () => {
    expect(
      mapOverviewError(new RpcClientError({ code: 'ERR_WORKSPACE_DB_UNAVAILABLE' as const, message: '库不可用' })).uiState,
    ).toBe('banner')
    expect(mapOverviewError(new Error('传输失败')).uiState).toBe('error-bar')
    expect(mapOverviewError('裸串').message).toBe('裸串')
  })
})
