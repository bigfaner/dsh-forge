// RecallTab 组件单测 —— UF-4 召回 tab 数据接线（3.8）。断言面 = 任务 AC：
// AC-3（命中行可点跳转 + 索引未命中行级失效标注不阻塞列表）/ AC-5（无召回空态）/
// 统计头锚点（AC-2 e2e 消费面）/ 错误条 fail-soft / mapRecallError 归一。
// 渲染面用 react-dom/server（沿 SessionPanel/KnowledgeBrowse 模式）；hook 装载效应面
// （visible 翻转重拉）归 e2e（条件留痕，SMOKE-LEDGER §5）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RecallGroup } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/errors.js'
import {
  applyRecallOutcome,
  fetchSessionRecall,
  initialRecallState,
  mapRecallError,
  RecallTab,
  RecallTabBody,
  recallLoadPlan,
  runRecallLoad,
  type RecallLoadState,
} from './RecallTab.js'
import type { ForgeRpcClient } from '../../rpc/index.js'

const NOW = Date.parse('2026-10-02T08:20:30.000Z')

const groups: readonly RecallGroup[] = [
  {
    callId: 'c1',
    verb: 'search',
    query: { keywords: ['部署'] },
    hitCount: 1,
    durationMs: 4,
    createdAt: '2026-10-02T08:05:00.000Z',
    hits: [{ entryId: 7, frontmatterId: 'k1', title: '部署规范', domainPath: '前端', heat: 2 }],
  },
  {
    callId: 'c2',
    verb: 'search',
    query: { domainPrefix: '后端' },
    hitCount: 1,
    durationMs: 5,
    createdAt: '2026-10-02T08:20:00.000Z',
    hits: [{ entryId: null, frontmatterId: 'fm-gone', title: '已删文档', domainPath: '后端', heat: 3 }],
  },
]

const stateOf = (over: Partial<RecallLoadState>): RecallLoadState => ({ ...initialRecallState(), ...over })

const renderBody = (state: RecallLoadState, onOpenEntry?: (id: number) => void): string =>
  renderToStaticMarkup(<RecallTabBody state={state} retry={() => {}} onOpenEntry={onOpenEntry} now={NOW} />)

describe('RecallTabBody 纯渲染（全相位）', () => {
  it('AC-5 无召回：idle（无会话/项目锚）与 ready 零事件均 =「本会话暂无召回」空态', () => {
    const idle = renderBody(stateOf({ phase: 'idle' }))
    expect(idle).toContain('data-dswf-recall-face="empty"')
    expect(idle).toContain('本会话暂无召回')
    const readyEmpty = renderBody(stateOf({ phase: 'ready', groups: [] }))
    expect(readyEmpty).toContain('data-dswf-recall-face="empty"')
    expect(readyEmpty).toContain('本会话暂无召回')
  })
  it('装载中 = 行级骨架（不炸壳）', () => {
    const markup = renderBody(stateOf({ phase: 'loading' }))
    expect(markup).toContain('data-dswf-recall-skeleton')
  })
  it('错误相位 = 错误条 + 重试（fail-soft）', () => {
    const markup = renderBody(stateOf({ phase: 'error', error: { message: '通道未注册', uiState: 'error-bar' } }))
    expect(markup).toContain('data-dswf-recall-error')
    expect(markup).toContain('召回记录加载失败：通道未注册')
    expect(markup).toContain('data-dswf-recall-retry')
  })
  it('ready 有事件：统计头锚点（次数/覆盖 data 属性）+ 分组行（标题/域/动词/时间/热度徽章）', () => {
    const markup = renderBody(stateOf({ phase: 'ready', groups }), () => {})
    expect(markup).toContain('data-dswf-recall-stats')
    expect(markup).toContain('data-calls="2"')
    expect(markup).toContain('data-covered="2"')
    expect(markup).toContain('data-dswf-recall-row')
    expect(markup).toContain('部署规范')
    expect(markup).toContain('data-dswf-recall-verb="search"')
    expect(markup).toContain('search ×1')
    expect(markup).toContain('热度 2')
    expect(markup).toContain('15 分钟前')
  })
  it('AC-3 命中行 = 按钮（可点跳转，data-entry-id）；索引未命中行 = 行级标注不可点且不阻塞列表', () => {
    const markup = renderBody(stateOf({ phase: 'ready', groups }), () => {})
    // 命中行（entryId 7）：按钮载体 + entryId 锚
    expect(markup).toContain('data-entry-id="7"')
    expect(markup).toMatch(/<button[^>]*class="dswf-recall-rowbtn"/)
    // 失效行：标注在场、非按钮载体、data-stale、aria-disabled；列表内行数保持 2（不阻塞）
    expect(markup).toContain('data-dswf-recall-stale')
    expect(markup).toContain('索引未命中')
    expect(markup).toContain('data-stale="true"')
    expect(markup).toContain('aria-disabled="true"')
    expect(markup.match(/data-dswf-recall-row=""/g)).toHaveLength(2)
    // 失效行仍呈现快照标题（行保留语义）
    expect(markup).toContain('已删文档')
  })
  it('快照标题全空 = 「（已删除的知识）」兜底呈现（行不缺席）', () => {
    const titleless: readonly RecallGroup[] = [
      {
        callId: 'c9',
        verb: 'read-abstract',
        query: { entryId: 1 },
        hitCount: 1,
        durationMs: 1,
        createdAt: '2026-10-02T08:19:00.000Z',
        hits: [{ entryId: null, frontmatterId: null, title: null, domainPath: null, heat: 1 }],
      },
    ]
    const markup = renderBody(stateOf({ phase: 'ready', groups: titleless }), () => {})
    expect(markup).toContain('（已删除的知识）')
    expect(markup).toContain('data-dswf-recall-stale')
  })
  it('onOpenEntry 缺席 = 命中行不可点（无按钮——降级不误交互）', () => {
    const markup = renderBody(stateOf({ phase: 'ready', groups }))
    expect(markup).not.toMatch(/<button[^>]*dswf-recall-rowbtn/)
  })
  it('RecallTab 装载壳（SSR 首帧 = idle 静态空态——效应面归 e2e）', () => {
    const markup = renderToStaticMarkup(
      <RecallTab projectId={null} sessionId={null} visible={false} />,
    )
    expect(markup).toContain('data-dswf-recall-face="empty"')
  })
})

describe('recallLoadPlan 装载判定（AC-4 即时累积机制面）', () => {
  it('查询键齐备且可见 = fetch；键缺席 = idle；键在而不可见 = hold（keep-alive 保持）', () => {
    expect(recallLoadPlan({ projectId: 'p-1', sessionId: 's-1', visible: true })).toBe('fetch')
    expect(recallLoadPlan({ projectId: null, sessionId: 's-1', visible: true })).toBe('idle')
    expect(recallLoadPlan({ projectId: 'p-1', sessionId: null, visible: true })).toBe('idle')
    expect(recallLoadPlan({ projectId: 'p-1', sessionId: 's-1', visible: false })).toBe('hold')
  })
})

describe('runRecallLoad / applyRecallOutcome 装载步进（effect 逻辑纯函数面）', () => {
  const clientOf = (groups: readonly RecallGroup[] | Error): ForgeRpcClient =>
    ({
      knowledge: {
        sessionRecall: async () => {
          if (groups instanceof Error) throw groups
          return groups
        },
      },
    }) as unknown as ForgeRpcClient

  it('plan=fetch：loading 起步 → ready 落点（步进序列折叠 = 终态 ready）', async () => {
    const steps = await runRecallLoad({ projectId: 'p-1', sessionId: 's-1', visible: true }, () => clientOf(groups))
    expect(steps).toEqual([{ kind: 'loading' }, { kind: 'ready', groups }])
    let state = initialRecallState()
    for (const step of steps) state = applyRecallOutcome(state, step)
    expect(state.phase).toBe('ready')
    expect(state.groups).toBe(groups)
  })
  it('plan=fetch 拉取失败：error 落点（fail-soft，groups 清空）', async () => {
    const steps = await runRecallLoad(
      { projectId: 'p-1', sessionId: 's-1', visible: true },
      () => clientOf(new RpcClientError({ code: 'ERR_INDEX_STALE', message: 'x' })),
    )
    let state = initialRecallState()
    for (const step of steps) state = applyRecallOutcome(state, step)
    expect(state.phase).toBe('error')
    expect(state.error?.message).toBe('x')
  })
  it('plan=idle → 复位空态；plan=hold → prev 原样保持（隐藏期不清场）', async () => {
    const idle = await runRecallLoad({ projectId: null, sessionId: 's-1', visible: true }, () => clientOf(groups))
    expect(applyRecallOutcome({ phase: 'ready', groups, error: undefined }, idle[0]!)).toEqual(initialRecallState())
    const hold = await runRecallLoad({ projectId: 'p-1', sessionId: 's-1', visible: false }, () => clientOf(groups))
    expect(hold).toEqual([{ kind: 'hold' }])
    const prev: RecallLoadState = { phase: 'ready', groups, error: undefined }
    expect(applyRecallOutcome(prev, hold[0]!)).toBe(prev)
  })
})

describe('mapRecallError / fetchSessionRecall 错误归一（永不 reject）', () => {
  it('RpcClientError → code 三态映射；其余 → 错误条', () => {
    expect(mapRecallError(new RpcClientError({ code: 'ERR_INDEX_STALE', message: '索引重建中' }))).toEqual({
      message: '索引重建中',
      uiState: 'empty-state',
    })
    expect(mapRecallError(new Error('boom'))).toEqual({ message: 'boom', uiState: 'error-bar' })
  })
  it('fetchSessionRecall：ok 透传 groups / error 归一', async () => {
    const okClient = {
      knowledge: { sessionRecall: async () => groups },
    } as unknown as ForgeRpcClient
    const ok = await fetchSessionRecall(okClient, { projectId: 'p-1', sessionId: 's-1' })
    expect(ok).toEqual({ ok: true, groups })
    const badClient = {
      knowledge: {
        sessionRecall: async () => {
          throw new RpcClientError({ code: 'ERR_INDEX_STALE', message: 'x' })
        },
      },
    } as unknown as ForgeRpcClient
    const bad = await fetchSessionRecall(badClient, { projectId: 'p-1', sessionId: 's-1' })
    expect(bad.ok).toBe(false)
  })
})
