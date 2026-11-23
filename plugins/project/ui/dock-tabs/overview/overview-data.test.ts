// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// overview-data 单测 —— AC6 搜索传参（Hard Rule「搜索过滤服务端承载」的通道面锚：
// search 关键词经 rpc mock 断言服务端过滤调用——前端零本地过滤逻辑可断言）+ 头路并发
// 归一 + typed error 三态映射 + 落点纯函数。
// 口径沿 use-knowledge-browse 先例：effect 胶水不在 Node 测面；纯异步面全量单测。
import { describe, expect, it } from 'vitest'
import type { BugCard, BugStatus, FeatureCard, FeatureDocumentRow, Project, TaskStatus } from '@dsh-forge/contracts'
import {
  BUGS_CHANNELS,
  FEATURES_CHANNELS,
  PROJECTS_CHANNELS,
  TASKS_CHANNELS,
} from '@dsh-forge/contracts'
import { createForgeRpcClient, type ForgeRpcClient } from '../rpc-channels.js'
import { RpcClientError } from '../rpc-channels.js'
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

const STATS = {
  total: 9,
  byStatus: {
    pending: 2,
    in_progress: 1,
    completed: 3,
    blocked: 1,
    suspended: 0,
    interrupted: 0,
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
function headOkClient() {
  return clientResponding((channel) => {
    if (channel === PROJECTS_CHANNELS.get) return PROJECT
    if (channel === FEATURES_CHANNELS.list) return [featureCard('m2-pipeline')]
    if (channel === FEATURES_CHANNELS.listDocs) return [featureDocRow()]
    if (channel === TASKS_CHANNELS.stats) return STATS
    if (channel === BUGS_CHANNELS.list) return []
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

describe('loadOverviewHead（头路并发——projects 单点 + features/stats 增强）', () => {
  it('头路 features 通道在调（task-tab feature pill 数据源）：无参全量落 head.features', async () => {
    const { client, calls } = headOkClient()
    const out = await loadOverviewHead(client, 'p-1')
    expect(out).toEqual({
      ok: true,
      data: {
        projectName: 'demo',
        workspaceDir: 'Z:/ws/demo',
        forgeDir: 'Z:/ws/demo/.forge',
        features: [featureCard('m2-pipeline')],
        stats: STATS,
      },
    })
    expect(calls.find((c) => c.channel === FEATURES_CHANNELS.list)).toBeDefined()
  })

  it('基本信息区五行：dirRows 键投影；workspaceRoot/forgeDir 项目行回退；其余缺席 = 「—」', async () => {
    const { client } = headOkClient()
    const out = await loadOverviewHead(client, 'p-1')
    expect(out.ok).toBe(true)
    if (out.ok) {
      const rows = overviewHeadRows(out.data)
      expect(rows.map((r) => r.label)).toEqual(['工作区根', '.forge 目录', '文档位置', '项目运行产物', 'Worktree根目录'])
      expect(rows.find((r) => r.label === '工作区根')?.value).toBe('Z:/ws/demo')
      expect(rows.find((r) => r.label === '.forge 目录')?.value).toBe('Z:/ws/demo/.forge')
      expect(rows.filter((r) => r.value === '—')).toHaveLength(3)
    }
  })

  it('fix-15 官方宿主降级：features/stats 通道 typed 失败 = 头路空增强值照常落 head（projects.get 单点权威）', async () => {
    const client = createForgeRpcClient(async (channel) => {
      if (channel === PROJECTS_CHANNELS.get) return { ok: true, data: PROJECT }
      // 官方宿主 degraded 族（forgeFeatures/forgeTasks namespace 未挂载）→
      // typert 适配 typed 拒绝信封
      return { ok: false, error: { code: 'internal', message: '通道在官方宿主不可达（Typert 未提供该 namespace 方法）——typed 降级' } }
    })
    const out = await loadOverviewHead(client, 'p-1')
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.data.projectName).toBe('demo')
      expect(out.data.workspaceDir).toBe('Z:/ws/demo')
      expect(out.data.features).toEqual([])
      expect(out.data.stats.total).toBe(0)
    }
  })

  it('fix-15 get 路由缺席（官方宿主网关 404）→ list 现查回退归一项目行', async () => {
    const client = createForgeRpcClient(async (channel) => {
      if (channel === PROJECTS_CHANNELS.list) return { ok: true, data: [PROJECT] }
      return { ok: false, error: { code: 'internal', message: '通道在官方宿主不可达（Typert 未提供该 namespace 方法）——typed 降级' } }
    })
    const out = await loadOverviewHead(client, 'p-1')
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.data.projectName).toBe('demo')
  })

  it('dirRows 在场 = host 下发原样值逐行投影（UI 零拼接）', async () => {
    const { client } = headOkClient()
    const out = await loadOverviewHead(client, 'p-1')
    expect(out.ok).toBe(true)
    if (out.ok) {
      const rows = overviewHeadRows(out.data, [
        { dirKey: 'workspaceRoot', dir: 'HOST/ws', description: '' },
        { dirKey: 'forgeDir', dir: 'HOST/ws/.forge', description: '' },
        { dirKey: 'forge.docs_root', dir: 'HOST/ws/.forge/docs', description: '' },
        { dirKey: 'forge.task_home', dir: 'HOST/tasks@a1b2c3d4', description: '' },
        { dirKey: 'forge.worktrees', dir: 'HOST/ws/.forge/worktrees', description: '' },
      ])
      expect(rows.map((r) => r.value)).toEqual([
        'HOST/ws',
        'HOST/ws/.forge',
        'HOST/ws/.forge/docs',
        'HOST/tasks@a1b2c3d4',
        'HOST/ws/.forge/worktrees',
      ])
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
  it('spec 子 tab 短路 null（列装载归 G3）——features/bugs 通道零调用', async () => {
    const { client, calls } = headOkClient()
    const out = await fetchOverviewList(client, { projectId: 'p-1', subtab: 'spec', search: 'pipeline', sort: 'active' })
    expect(out).toBeNull()
    expect(calls.find((c) => c.channel === FEATURES_CHANNELS.list)).toBeUndefined()
    expect(calls.find((c) => c.channel === FEATURES_CHANNELS.listDocs)).toBeUndefined()
    expect(calls.find((c) => c.channel === BUGS_CHANNELS.list)).toBeUndefined()
  })

  it('tasks 子 tab = null（3.5 无列装载——三视图归 3.6，chips 消费头路 stats）', async () => {
    const { client, calls } = headOkClient()
    const out = await fetchOverviewList(client, { projectId: 'p-1', subtab: 'tasks', search: 'x', sort: 'active' })
    expect(out).toBeNull()
    expect(calls.filter((c) => c.channel === TASKS_CHANNELS.list)).toHaveLength(0)
  })

  it('列路失败 = typed error 归一（库不可用 → 域级横幅 uiState）', async () => {
    const { client } = clientResponding((channel) => {
      if (channel === BUGS_CHANNELS.list) {
        throw new RpcClientError({ code: 'ERR_WORKSPACE_DB_UNAVAILABLE' as const, message: '工作区库不可用' })
      }
      throw new Error(`unexpected channel: ${channel}`)
    })
    const out = await fetchOverviewList(client, { projectId: 'p-1', subtab: 'bugs', search: 'q', sort: 'active' })
    expect(out?.ok).toBe(false)
    if (out && !out.ok) expect(out.error.uiState).toBe('banner')
  })
})

describe('fetchOverviewList · bugs 子 tab（fix-bug——bugs.list 通道与入参钉住）', () => {
  function bugCard(bugId: string, bugStatus: BugStatus): BugCard {
    return {
      bugId,
      summary: `摘要 ${bugId}`,
      bugDesc: 'd',
      triggerDesc: 't',
      expected: 'e',
      actual: 'a',
      bugStatus,
      reporter: 'faner',
      createdAt: '2026-10-13T00:00:00.000Z',
      updatedAt: '2026-10-13T00:00:00.000Z',
    }
  }

  it('search/sort 服务端参透传 bugs.list（BUGS_CHANNELS.list 通道本尊；前端零本地过滤）', async () => {
    const { client, calls } = headOkClient()
    const out = await fetchOverviewList(client, { projectId: 'p-1', subtab: 'bugs', search: ' 游标 ', sort: 'created' })
    expect(out?.ok).toBe(true)
    const list = calls.filter((c) => c.channel === BUGS_CHANNELS.list)
    expect(list).toHaveLength(2) // 过滤行调用 + 无参计数调用
    expect(list[0]?.payload).toEqual({ projectId: 'p-1', search: '游标', sort: 'created' })
  })

  it('chips 白名单 status 参透传；无参调用归一三态计数（counts 不随过滤漂移）', async () => {
    const { client, calls } = clientResponding((channel, payload) => {
      if (channel !== BUGS_CHANNELS.list) throw new Error(`unexpected channel: ${channel}`)
      const q = payload as { status?: BugStatus[] }
      if (q.status !== undefined) return [bugCard('b1', 'open')]
      return [bugCard('b1', 'open'), bugCard('b2', 'fixed'), bugCard('b3', 'fixed'), bugCard('b4', 'unresolved')]
    })
    const out = await fetchOverviewList(client, {
      projectId: 'p-1',
      subtab: 'bugs',
      search: '',
      sort: 'active',
      status: ['open', 'unresolved'],
    })
    expect(out?.ok).toBe(true)
    const list = calls.filter((c) => c.channel === BUGS_CHANNELS.list)
    expect(list[0]?.payload).toEqual({ projectId: 'p-1', search: undefined, sort: 'active', status: ['open', 'unresolved'] })
    expect(list[1]?.payload).toEqual({ projectId: 'p-1' }) // 无参计数调用
    if (out?.ok && out.data.kind === 'bugs') {
      expect(out.data.bugs.map((b) => b.bugId)).toEqual(['b1'])
      expect(out.data.counts).toEqual({ open: 1, fixed: 2, unresolved: 1 })
    }
  })

  it('空搜索 = 不带 search 参；空 chips = 不带 status 参（空参即全量）', async () => {
    const { client, calls } = headOkClient()
    await fetchOverviewList(client, { projectId: 'p-1', subtab: 'bugs', search: '  ', sort: 'active' })
    const call = calls.find((c) => c.channel === BUGS_CHANNELS.list)
    expect(call?.payload).toEqual({ projectId: 'p-1', search: undefined, sort: 'active' })
  })
})

describe('落点纯函数', () => {
  it('applyOverviewHead：ok 落 bundle（ready）；error 置相位但保留旧列内容', () => {
    const base = initialOverviewLoadState()
    const withList = { ...base, list: { kind: 'bugs' as const, bugs: [], counts: { open: 0, fixed: 0, unresolved: 0 } } }
    const errored = applyOverviewHead(withList, { ok: false, error: { message: 'x', uiState: 'error-bar' as const } })
    expect(errored.phase).toBe('error')
    expect(errored.list).toBeDefined()
  })

  it('pendingOverviewList：清场 = 掏空列 + busy；非清场 = 旧行保持 + busy（缓存先行）', () => {
    const base = initialOverviewLoadState()
    const withList = { ...base, list: { kind: 'bugs' as const, bugs: [], counts: { open: 0, fixed: 0, unresolved: 0 } } }
    expect(pendingOverviewList(withList, true).list).toBeUndefined()
    expect(pendingOverviewList(withList, true).busy).toBe(true)
    expect(pendingOverviewList(withList, false).list).toBeDefined()
    expect(pendingOverviewList(withList, false).busy).toBe(true)
  })

  it('applyOverviewList：null（tasks）= 解除 busy；ok 换列清错；error 保留旧行', () => {
    const withList = { ...initialOverviewLoadState(), list: { kind: 'bugs' as const, bugs: [], counts: { open: 0, fixed: 0, unresolved: 0 } } }
    expect(applyOverviewList(withList, null).busy).toBe(false)
    const ok = applyOverviewList(withList, {
      ok: true,
      data: { kind: 'bugs', bugs: [], counts: { open: 0, fixed: 0, unresolved: 0 } },
    })
    expect(ok.error).toBeUndefined()
    const err = applyOverviewList(withList, { ok: false, error: { message: 'y', uiState: 'error-bar' as const } })
    expect(err.error).toBeDefined()
    expect(err.list).toBeDefined()
  })

  it('overviewListPlan：键变 = 重拉；子 tab/项目切换 = 清场（同键 = 零装载）', () => {
    // 同键 = 不重拉（重渲染零装载）
    expect(
      overviewListPlan({ listKey: 'k', lastListKey: 'k', subtab: 'bugs', lastSubtab: 'bugs', projectId: 'p', lastProjectId: 'p' }),
    ).toEqual({ isFetch: false, mustClear: false })
    // 搜索键入 = 重拉不清场（旧行保持——IME 安全配套：内容区在途更新非重建）
    expect(
      overviewListPlan({ listKey: 'k2', lastListKey: 'k', subtab: 'bugs', lastSubtab: 'bugs', projectId: 'p', lastProjectId: 'p' }),
    ).toEqual({ isFetch: true, mustClear: false })
    // 子 tab 切换 = 重拉 + 清场（旧子 tab 内容不残留）
    expect(
      overviewListPlan({ listKey: 'k2', lastListKey: 'k', subtab: 'tasks', lastSubtab: 'bugs', projectId: 'p', lastProjectId: 'p' }),
    ).toEqual({ isFetch: true, mustClear: true })
    // 项目切换 = 重拉 + 清场（跨项目旧内容不残留）
    expect(
      overviewListPlan({ listKey: 'k2', lastListKey: 'k', subtab: 'bugs', lastSubtab: 'bugs', projectId: 'p2', lastProjectId: 'p' }),
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
