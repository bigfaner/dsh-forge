// use-knowledge-browse 单测 —— 装载纯异步面（AC3 热度同源透传 / AC4 空库与目录位置 /
// typed error 三态映射 / AC1·AC2 过滤查询透传）。
// 口径沿 use-forge-projects 先例：hook 的 effect 胶水不在 Node 测面（renderToStaticMarkup
// 不跑 effect）；纯异步面（loadBrowseBundle / fetchFilteredCards / mapBrowseError /
// runFullLoad）全量单测，effect 组装归 3.8 装配 + e2e。
import { describe, expect, it } from 'vitest'
import type { DomainNode, KnowledgeCard, Project } from '@dsh-forge/contracts'
import { KNOWLEDGE_CHANNELS, PROJECTS_CHANNELS } from '@dsh-forge/contracts'
import { createForgeRpcClient, type ForgeRpcClient } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import {
  browseFaceState,
  browseFilterReducer,
  domainRows,
  EMPTY_FILTER,
  hasActiveFilter,
  type BrowseFilterEvent,
} from './browse-model.js'
import {
  applyBrowseLoad,
  browseActions,
  browseLoadPlan,
  consumedBrowseState,
  fetchFilteredCards,
  initialBrowseState,
  loadBrowseBundle,
  mapBrowseError,
  pendingBrowseState,
  runFullLoad,
  type BrowseBundle,
  type KnowledgeBrowseState,
} from './use-knowledge-browse.js'

const CARDS: readonly KnowledgeCard[] = [
  {
    entryId: 1,
    title: '安全编码规范',
    summary: '输入校验与输出编码基线',
    keywords: ['安全', 'xss'],
    status: 'draft',
    domainPath: '前端',
    updated: '2026-10-01T08:00:00.000Z',
    heat: 3,
  },
  {
    entryId: 2,
    title: '网关限流手册',
    summary: '令牌桶参数与降级顺序',
    keywords: ['限流'],
    status: 'published',
    domainPath: '后端',
    updated: '2026-09-30T08:00:00.000Z',
    heat: 0,
  },
]

const NODES: readonly DomainNode[] = [
  { domainPath: '前端', label: '前端', depth: 1, entryCount: 1 },
  { domainPath: '后端', label: '后端', depth: 1, entryCount: 1 },
]

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

/** 通道 responder 替身（按通道分发——捕获请求负载以断言查询形状） */
function clientResponding(
  respond: (channel: string, payload: unknown) => unknown | Promise<unknown>,
): ForgeRpcClient {
  return createForgeRpcClient(async (channel, payload) => {
    const data = await respond(channel, payload)
    return { ok: true, data }
  })
}

function bundleClient(overrides: { listEntries?: (q: unknown) => unknown } = {}): ForgeRpcClient {
  return clientResponding((channel, payload) => {
    if (channel === KNOWLEDGE_CHANNELS.listEntries) return overrides.listEntries?.(payload) ?? CARDS
    if (channel === KNOWLEDGE_CHANNELS.browse) return NODES
    if (channel === PROJECTS_CHANNELS.get) return PROJECT
    throw new Error(`unexpected channel: ${channel}`)
  })
}

describe('loadBrowseBundle（全量装载）', () => {
  it('三路并发归一：cards/nodes/total（= 全量计数）/ 项目名 + 知识目录位置（AC4 空库引导数据）', async () => {
    const out = await loadBrowseBundle(bundleClient(), 'p-1')
    expect(out).toEqual({
      ok: true,
      data: { cards: CARDS, nodes: NODES, total: 2, projectName: 'demo', knowledgeDir: 'Z:/ws/demo/.knowledge' },
    })
  })

  it('projects.get null / 失败 → fail-soft（名称空 + 目录 null，浏览主数据不受累）', async () => {
    const nullProject = clientResponding((channel) => {
      if (channel === KNOWLEDGE_CHANNELS.listEntries) return CARDS
      if (channel === KNOWLEDGE_CHANNELS.browse) return NODES
      if (channel === PROJECTS_CHANNELS.get) return null
      throw new Error('unexpected')
    })
    await expect(loadBrowseBundle(nullProject, 'p-1')).resolves.toEqual({
      ok: true,
      data: { cards: CARDS, nodes: NODES, total: 2, projectName: '', knowledgeDir: null },
    })

    const failingProject = clientResponding((channel) => {
      if (channel === KNOWLEDGE_CHANNELS.listEntries) return CARDS
      if (channel === KNOWLEDGE_CHANNELS.browse) return NODES
      if (channel === PROJECTS_CHANNELS.get) throw new Error('projects 通道缺席')
      throw new Error('unexpected')
    })
    const soft = await loadBrowseBundle(failingProject, 'p-1')
    expect(soft.ok && soft.data.knowledgeDir).toBeNull()
  })

  it('主数据 typed error（ERR_INDEX_STALE——索引缺失静默重建失败）→ empty-state 面', async () => {
    const stale = clientResponding((channel) => {
      if (channel === KNOWLEDGE_CHANNELS.listEntries) {
        throw new RpcClientError({ code: 'ERR_INDEX_STALE', message: '索引缺失且静默重建失败', data: { projectId: 'p-1' } })
      }
      if (channel === KNOWLEDGE_CHANNELS.browse) return NODES
      if (channel === PROJECTS_CHANNELS.get) return PROJECT
      throw new Error('unexpected')
    })
    const out = await loadBrowseBundle(stale, 'p-1')
    expect(out).toEqual({
      ok: false,
      error: { message: '索引缺失且静默重建失败', uiState: 'empty-state' },
    })
  })

  it('传输层失败 → 错误条面（fail-soft 不抛）', async () => {
    const broken = createForgeRpcClient(async () => {
      throw new Error('通道未注册')
    })
    const out = await loadBrowseBundle(broken, 'p-1')
    expect(out).toEqual({ ok: false, error: { message: '通道未注册', uiState: 'error-bar' } })
  })
})

describe('fetchFilteredCards（过滤重拉）', () => {
  it('AC1 域前缀查询透传：listEntries 收 domainPrefix（前缀语义归 core——客户端零过滤）', async () => {
    const seen: unknown[] = []
    const client = bundleClient({
      listEntries: (q) => {
        seen.push(q)
        return CARDS
      },
    })
    const out = await fetchFilteredCards(client, 'p-1', { domain: '前端', keyword: '' })
    expect(seen).toEqual([{ projectId: 'p-1', domainPrefix: '前端' }])
    expect(out.ok && out.data).toBe(CARDS)
  })

  it('AC2 组合过滤查询（域 + 关键词）；未过滤 = 仅 projectId', async () => {
    const seen: unknown[] = []
    const client = bundleClient({
      listEntries: (q) => {
        seen.push(q)
        return CARDS
      },
    })
    await fetchFilteredCards(client, 'p-1', { domain: '前端', keyword: '安全' })
    await fetchFilteredCards(client, 'p-1', EMPTY_FILTER)
    expect(seen).toEqual([
      { projectId: 'p-1', domainPrefix: '前端', keyword: '安全' },
      { projectId: 'p-1' },
    ])
  })

  it('ERR_INVALID_KNOWLEDGE_DIR（知识目录不可达）→ empty-state 面', async () => {
    const client = bundleClient({
      listEntries: () => {
        throw new RpcClientError({ code: 'ERR_INVALID_KNOWLEDGE_DIR', message: '知识目录不可达' })
      },
    })
    await expect(fetchFilteredCards(client, 'p-1', { keyword: 'x' })).resolves.toEqual({
      ok: false,
      error: { message: '知识目录不可达', uiState: 'empty-state' },
    })
  })
})

describe('runFullLoad（全量装载 + 过滤补拉）', () => {
  it('过滤在场 → bundle 后追过滤视图（cards 与过滤条件一致，total 仍取全量）', async () => {
    const seen: unknown[] = []
    const client = bundleClient({
      listEntries: (q) => {
        seen.push(q)
        // 未过滤（bundle 底表）= 全量；过滤视图 = 只回「前端」条目
        return 'domainPrefix' in (q as object) ? CARDS.slice(0, 1) : CARDS
      },
    })
    const out = await runFullLoad(client, 'p-1', { domain: '前端', keyword: '' })
    expect(seen).toEqual([{ projectId: 'p-1' }, { projectId: 'p-1', domainPrefix: '前端' }])
    expect(out).toEqual({
      kind: 'bundle',
      bundle: { cards: CARDS, nodes: NODES, total: 2, projectName: 'demo', knowledgeDir: 'Z:/ws/demo/.knowledge' },
      cards: CARDS.slice(0, 1),
    })
  })

  it('未过滤 → 单次全量（cards = 全量底表）', async () => {
    const seen: unknown[] = []
    const client = bundleClient({
      listEntries: (q) => {
        seen.push(q)
        return CARDS
      },
    })
    const out = await runFullLoad(client, 'p-1', EMPTY_FILTER)
    expect(seen).toEqual([{ projectId: 'p-1' }])
    expect(out.kind === 'bundle' && out.cards).toBe(CARDS)
  })

  it('补拉失败 → error 落点（不打散错误面）', async () => {
    let calls = 0
    const client = bundleClient({
      listEntries: () => {
        calls += 1
        if (calls > 1) throw new RpcClientError({ code: 'ERR_INDEX_STALE', message: '重拉失败' })
        return CARDS
      },
    })
    const out = await runFullLoad(client, 'p-1', { keyword: '安全' })
    expect(out).toEqual({ kind: 'error', error: { message: '重拉失败', uiState: 'empty-state' } })
  })
})

describe('mapBrowseError（错误归一）', () => {
  it('RpcClientError → rpcUiState(code) 三态映射（AC 消费约定）', () => {
    expect(mapBrowseError(new RpcClientError({ code: 'ERR_ENTRY_NOT_FOUND', message: 'm' }))).toEqual({
      message: 'm',
      uiState: 'empty-state',
    })
    expect(mapBrowseError(new RpcClientError({ code: 'ERR_PROJECT_WRITE', message: 'm' }))).toEqual({
      message: 'm',
      uiState: 'error-bar',
    })
  })

  it('非 typed error（传输/构造期）→ 错误条 + message 归一', () => {
    expect(mapBrowseError(new Error('boom'))).toEqual({ message: 'boom', uiState: 'error-bar' })
    expect(mapBrowseError('raw')).toEqual({ message: 'raw', uiState: 'error-bar' })
  })
})

describe('browseLoadPlan（装载判定——AC5 缓存先行 ⇄ 清场骨架）', () => {
  it('首装（无全量键且无数据）→ 全量 + 清场（骨架相位）', () => {
    expect(
      browseLoadPlan({ fullKey: 'p-1#0', lastFullKey: '', projectId: 'p-1', lastProjectId: 'p-1', hasBundle: false }),
    ).toEqual({ isFull: true, mustClear: true })
  })

  it('过滤重拉（全量键不变）→ 非全量不清场（旧卡片保持可见）', () => {
    expect(
      browseLoadPlan({ fullKey: 'p-1#0', lastFullKey: 'p-1#0', projectId: 'p-1', lastProjectId: 'p-1', hasBundle: true }),
    ).toEqual({ isFull: false, mustClear: false })
  })

  it('同项目重试（全量键变化但已持有数据）→ 全量重验不清场（缓存先行）', () => {
    expect(
      browseLoadPlan({ fullKey: 'p-1#1', lastFullKey: 'p-1#0', projectId: 'p-1', lastProjectId: 'p-1', hasBundle: true }),
    ).toEqual({ isFull: true, mustClear: false })
  })

  it('跨项目切换 → 全量 + 清场（旧项目卡片不得残留）', () => {
    expect(
      browseLoadPlan({ fullKey: 'p-2#0', lastFullKey: 'p-1#0', projectId: 'p-2', lastProjectId: 'p-1', hasBundle: true }),
    ).toEqual({ isFull: true, mustClear: true })
  })
})

describe('pendingBrowseState / applyBrowseLoad（状态转移）', () => {
  const ready: KnowledgeBrowseState = {
    ...initialBrowseState(),
    phase: 'ready',
    busy: false,
    cards: CARDS,
    nodes: NODES,
    total: 2,
    projectName: 'demo',
    knowledgeDir: 'Z:/ws/demo/.knowledge',
    filter: { domain: '前端', keyword: '' },
  }

  it('在途：清场 = 初始骨架（过滤态保留）；不清场 = 旧内容 + busy', () => {
    const cleared = pendingBrowseState(ready, true)
    expect(cleared).toEqual({ ...initialBrowseState(), filter: { domain: '前端', keyword: '' } })
    const kept = pendingBrowseState(ready, false)
    expect(kept.cards).toBe(CARDS)
    expect(kept.busy).toBe(true)
  })

  it('bundle 落点：全量元数据 + 卡片（过滤补拉后的视图）；cards 落点：仅换卡片；error 落点：旧域树保持', () => {
    const bundle: BrowseBundle = { cards: CARDS, nodes: NODES, total: 2, projectName: 'demo', knowledgeDir: 'Z:/k' }
    const fromBundle = applyBrowseLoad(initialBrowseState(), { kind: 'bundle', bundle, cards: CARDS.slice(0, 1) })
    expect(fromBundle).toMatchObject({ phase: 'ready', busy: false, cards: CARDS.slice(0, 1), total: 2, knowledgeDir: 'Z:/k' })

    const refetched = applyBrowseLoad(ready, { kind: 'cards', cards: CARDS.slice(0, 1) })
    expect(refetched.cards).toEqual(CARDS.slice(0, 1))
    expect(refetched.nodes).toBe(NODES) // 过滤重拉不动域树

    const errored = applyBrowseLoad(ready, { kind: 'error', error: { message: 'm', uiState: 'error-bar' } })
    expect(errored.phase).toBe('error')
    expect(errored.nodes).toBe(NODES) // 错误不抹既有域树/项目元数据
  })
})

describe('consumedBrowseState（消费态合成——fix-5：过滤态单一来源 = reducer 实时值）', () => {
  const loaded: KnowledgeBrowseState = {
    ...initialBrowseState(),
    phase: 'ready',
    cards: CARDS,
    nodes: NODES,
    total: 2,
    projectName: 'demo',
    knowledgeDir: 'Z:/ws/demo/.knowledge',
  }

  it('装载态 filter 快照滞后（过滤派发不经装载转移）→ 消费面取实时过滤态：受控值即时在场', () => {
    // 键入零命中关键词：装载态内部 filter 仍是空快照，消费态必须呈现实时 'zzz'
    const consumed = consumedBrowseState(loaded, { keyword: 'zzz' })
    expect(consumed.filter, '受控输入值/清除钮判据取实时关键词').toEqual({ keyword: 'zzz' })
    expect(consumed.cards, '装载字段原样透传（缓存先行不丢卡）').toBe(CARDS)
    expect(consumed.nodes).toBe(NODES)
  })

  it('零命中落点后实时过滤态仍驱动「无结果」面（防误落空库引导——实机症状回归）', () => {
    const zeroHit = applyBrowseLoad(loaded, { kind: 'cards', cards: [] })
    expect(zeroHit.cards).toHaveLength(0)
    expect(zeroHit.filter, '落点应用的内部快照仍滞后（装载转移保留旧过滤）').toEqual(EMPTY_FILTER)
    const consumed = consumedBrowseState(zeroHit, { keyword: 'zzz' })
    const face = browseFaceState({
      phase: consumed.phase,
      cardCount: consumed.cards.length,
      filterActive: hasActiveFilter(consumed.filter),
    })
    expect(face, '过滤在场 + 零卡 = 无结果（清除入口）而非空库引导').toBe('no-results')
  })

  it('域过滤组合同样取实时态（select-domain 与关键词互不复位）', () => {
    const consumed = consumedBrowseState(loaded, { domain: '前端', keyword: '安全' })
    expect(consumed.filter).toEqual({ domain: '前端', keyword: '安全' })
  })

  it('清除过滤复位实时透传：消费面回空过滤（域树高亮/受控值同步复位）', () => {
    const consumed = consumedBrowseState(loaded, EMPTY_FILTER)
    expect(consumed.filter).toEqual(EMPTY_FILTER)
  })

  it('过滤态同引用 → 原装载态原样返回（未过滤常态零对象合成）', () => {
    expect(consumedBrowseState(loaded, EMPTY_FILTER)).toBe(loaded)
  })
})

describe('激活翻转全量重拉 × selectedDomain 投影（fix-8①：walk4-J 视图往返回归）', () => {
  const META = { projectName: 'demo', knowledgeDir: 'Z:/ws/demo/.knowledge' }

  it('往返（hold → 激活重拉 bundle 重建 nodes）后消费态 filter.domain 保持 → 域树激活行投影不丢', () => {
    // 首装全量 → 选域「前端」（reducer 实时态）→ 过滤重拉落点（kind:'cards'）
    const filter = browseFilterReducer(EMPTY_FILTER, { type: 'select-domain', domain: '前端' })
    const initial = applyBrowseLoad(initialBrowseState(), {
      kind: 'bundle',
      bundle: { cards: CARDS, nodes: NODES, total: 2, ...META },
      cards: CARDS,
    })
    const filtered = applyBrowseLoad(initial, { kind: 'cards', cards: CARDS.slice(0, 1) })
    expect(filtered.filter).toEqual(EMPTY_FILTER) // 装载态快照滞后（过滤派发不经装载转移）——walk4-J 症状载体

    // 视图往返：隐藏期 hold（零转移）→ 激活翻转全量重拉（缓存先行不清场；bundle 重建 nodes 新引用 + 过滤补拉视图）
    const pending = pendingBrowseState(filtered, false)
    expect(pending.busy).toBe(true)
    const REBUILT: readonly DomainNode[] = NODES.map((node) => ({ ...node }))
    const reactivated = applyBrowseLoad(pending, {
      kind: 'bundle',
      bundle: { cards: CARDS, nodes: REBUILT, total: 2, ...META },
      cards: CARDS.slice(0, 1),
    })
    // 装载态自身不带域（fix-5 前消费面直读它 = active=0 即 walk4-J 实测症状）
    expect(reactivated.filter.domain).toBeUndefined()

    // hook 输出态合成（fix-5）：实时过滤态盖写——DomainTree active 投影源
    const consumed = consumedBrowseState(reactivated, filter)
    expect(consumed.filter.domain, '往返后 filter.domain 保持（域树 active 消费点）').toBe('前端')
    expect(consumed.nodes).toBe(REBUILT) // nodes 重建不稀释实时过滤态
    expect(consumed.cards).toEqual(CARDS.slice(0, 1)) // 卡片 = 过滤补拉视图（与过滤条件一致）

    // DomainTree 行激活判定（isActive 谓词同式）：重建行集内选中域行命中
    const rows = domainRows(consumed.nodes, consumed.total)
    const activeRow = rows.find((row) => (row.domainPath === '' ? undefined : row.domainPath) === consumed.filter.domain)
    expect(activeRow?.domainPath, '重拉后 nodes 行集内选中域行可标激活（data-active 可在场）').toBe('前端')
  })
})

describe('browseActions（动作绑定——过滤态机事件形状 + 重试）', () => {
  it('四动作：selectDomain/setKeyword/clearFilters 派发对应事件；retry 递增 nonce', () => {
    const events: BrowseFilterEvent[] = []
    let retries = 0
    const actions = browseActions(
      (event) => {
        events.push(event)
      },
      () => {
        retries += 1
      },
    )
    actions.selectDomain('前端')
    actions.selectDomain(undefined)
    actions.setKeyword('css')
    actions.clearFilters()
    actions.retry()
    expect(events).toEqual([
      { type: 'select-domain', domain: '前端' },
      { type: 'select-domain', domain: undefined },
      { type: 'set-keyword', keyword: 'css' },
      { type: 'clear-filters' },
    ])
    expect(retries).toBe(1)
  })
})
