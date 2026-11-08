// RecallTab 组件单测 —— UF-4 召回 tab（stage④ 1.8 轮卡改型）。断言面：
// 折叠两行（L1 轮次锚+触发输入摘要+命中总数+scope 徽 / L2 verb 统计+top）；展开按 call
// 分节四 verb 分型（工具 chip 函数式文本 / hint note / 命中行 score / 零命中哨兵 / read
// 快照拆行）；未锚兜底卡；机械字段不上卡片（无热度/slug/rank 呈现）；反馈钮锚点与撤销
// aria 语义；快照头行拆分；反馈提交归一 + 失败码文案。
// 渲染面用 react-dom/server（折叠态/展开卡全相位静态可测；hook 装载与反馈交互效应面归 e2e）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RecallGroup, RecallGroupHit } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/errors.js'
import {
  applyRecallOutcome,
  fetchSessionRecall,
  initialRecallFeedback,
  initialRecallState,
  mapRecallError,
  recallFeedbackFailureText,
  RecallCardView,
  recallSnapshotParts,
  RecallTab,
  RecallTabBody,
  recallLoadPlan,
  runRecallLoad,
  submitRecallFeedback,
  type RecallLoadState,
} from './RecallTab.js'
import { recallTurnsOf } from './recall-model.js'
import type { ForgeRpcClient } from '../../rpc/index.js'

const hit = (over: Partial<RecallGroupHit>): RecallGroupHit => ({
  rowId: 1,
  entryId: 1,
  frontmatterId: 'k1',
  title: '部署规范',
  domainPath: '前端',
  heat: 0,
  score: null,
  scope: 'project',
  ...over,
})

const groups: readonly RecallGroup[] = [
  {
    callId: 'c1',
    verb: 'search',
    query: { text: 'worktree 分支命名规范', domainPrefix: '工程规范/', limit: 3, hint: 'domain "热度治理" was dropped after zero hits' },
    hitCount: 2,
    durationMs: 4,
    createdAt: '2026-11-20T14:32:05.000Z',
    turnSeq: 3,
    triggerSnap: '帮我把 worktree 合回 main 的约定整理成知识条目',
    contentSnap: null,
    hits: [
      hit({ rowId: 41, entryId: 1, frontmatterId: 'kb-fe-001', score: 0.91 }),
      hit({ rowId: 42, entryId: 6, frontmatterId: 'kb-guide-001', title: '新手指引', domainPath: '', score: 0.72, scope: 'global' }),
    ],
  },
  {
    callId: 'c2',
    verb: 'read',
    query: { frontmatterId: 'kb-be-001' },
    hitCount: 1,
    durationMs: 1,
    createdAt: '2026-11-20T14:32:07.000Z',
    turnSeq: 3,
    triggerSnap: '帮我把 worktree 合回 main 的约定整理成知识条目',
    contentSnap: '# API 规范 (kb-be-001, draft, 2026-02-01T00:00:00.000Z)\n正文-接口细则',
    hits: [hit({ rowId: 43, entryId: 3, frontmatterId: 'kb-be-001', title: 'API 规范', domainPath: '后端' })],
  },
  {
    callId: 'c3',
    verb: 'browse',
    query: { domain: '工程规范', offset: 0, limit: 20, order: 'status' },
    hitCount: 1,
    durationMs: 3,
    createdAt: '2026-11-20T14:32:09.000Z',
    turnSeq: 3,
    triggerSnap: '帮我把 worktree 合回 main 的约定整理成知识条目',
    contentSnap: null,
    hits: [hit({ rowId: 45, entryId: 4, frontmatterId: 'kb-be-002', title: '网关', domainPath: '后端' })],
  },
  {
    callId: 'c9',
    verb: 'search',
    query: { keywords: ['不存在'] },
    hitCount: 0,
    durationMs: 0,
    createdAt: '2026-11-19T09:00:00.000Z',
    turnSeq: null,
    triggerSnap: null,
    contentSnap: null,
    hits: [],
  },
]

const stateOf = (over: Partial<RecallLoadState>): RecallLoadState => ({ ...initialRecallState(), ...over })

const renderBody = (state: RecallLoadState, projectId: string | null = 'p-1'): string =>
  renderToStaticMarkup(<RecallTabBody state={state} retry={() => {}} projectId={projectId} />)

describe('RecallTabBody 折叠态（全相位）', () => {
  it('idle 与 ready 零事件 =「本会话暂无召回记录」空态', () => {
    const idle = renderBody(stateOf({ phase: 'idle' }))
    expect(idle).toContain('data-dswf-recall-face="empty"')
    expect(idle).toContain('本会话暂无召回记录')
    const readyEmpty = renderBody(stateOf({ phase: 'ready', groups: [] }))
    expect(readyEmpty).toContain('data-dswf-recall-face="empty"')
  })
  it('装载中 = 行级骨架（不炸壳）；错误相位 = 错误条 + 重试（fail-soft）', () => {
    expect(renderBody(stateOf({ phase: 'loading' }))).toContain('data-dswf-recall-skeleton')
    const markup = renderBody(stateOf({ phase: 'error', error: { message: '通道未注册', uiState: 'error-bar' } }))
    expect(markup).toContain('data-dswf-recall-error')
    expect(markup).toContain('召回记录加载失败：通道未注册')
    expect(markup).toContain('data-dswf-recall-retry')
  })
  it('ready：统计头锚点（口径零改动）+ 卡数 = 去重 turn 数（未锚兜底卡殿后）', () => {
    const markup = renderBody(stateOf({ phase: 'ready', groups }))
    expect(markup).toContain('data-dswf-recall-stats')
    expect(markup).toContain('data-calls="4"')
    expect(markup).toContain('data-covered="4"')
    expect(markup.match(/data-dswf-recall-card=""/g)).toHaveLength(2)
    expect(markup).toContain('data-turn-seq="3"')
    expect(markup).toContain('轮次未锚')
  })
  it('L1：轮次锚领衔 + 触发输入摘要 + 命中总数 + scope 单双徽', () => {
    const markup = renderBody(stateOf({ phase: 'ready', groups }))
    expect(markup).toContain('第 3 轮')
    expect(markup).toContain('帮我把 worktree 合回 main 的约定整理成知识条目')
    expect(markup).toContain('命中 4')
    expect(markup).toContain('零命中')
    expect(markup.match(/data-dswf-recall-cardscope="project"/g)).toHaveLength(1)
    expect(markup).toContain('data-dswf-recall-cardscope="global"')
  })
  it('L2：verb 统计 chips（动词 ×N）+ top = 首个被 read 条目名（无 read 轮右组缺席）', () => {
    const markup = renderBody(stateOf({ phase: 'ready', groups }))
    expect(markup).toContain('data-dswf-recall-verb="search"')
    expect(markup).toContain('read ×1')
    expect(markup).toContain('browse ×1')
    expect(markup).toContain('top：API 规范')
    // 未锚卡（零命中 search）无 read 调用 → 无 top
    const cards = markup.split('data-dswf-recall-card=""')
    expect(cards[cards.length - 1]!).not.toContain('top：')
  })
  it('折叠态默认收起（展开区缺席）+ 机械字段不上卡片（无热度呈现）', () => {
    const markup = renderBody(stateOf({ phase: 'ready', groups }))
    expect(markup).not.toContain('data-dswf-recall-detail')
    expect(markup).not.toContain('data-dswf-recall-heat')
    expect(markup).not.toContain('热度')
  })
})

describe('RecallCardView 展开态（按 call 分节 · 四 verb 分型）', () => {
  const card = recallTurnsOf(groups).find((c) => c.turnSeq === 3)!
  const renderExpanded = (feedback = initialRecallFeedback()): string =>
    renderToStaticMarkup(
      <RecallCardView
        card={card}
        expanded
        onToggle={() => {}}
        feedback={feedback}
        onRowFeedback={() => {}}
        onCallReject={() => {}}
        onCallUndo={() => {}}
        onOpenSnapshot={() => {}}
        onOpenEntry={() => {}}
      />,
    )

  it('归因区 LocaleDatetime + 节数 = 调用数（节序 = 时序）+ 节头工具 chip 函数式全参文本', () => {
    const markup = renderExpanded()
    expect(markup).toContain('data-dswf-recall-attrib')
    expect(markup.match(/data-dswf-recall-call=""/g)).toHaveLength(3)
    expect(markup).toContain('search(&quot;worktree|分支命名规范&quot;, domain_prefix=&quot;工程规范/&quot;, limit=3)')
    expect(markup).toContain('read(&quot;kb-be-001&quot;)')
    expect(markup).toContain('browse(&quot;工程规范&quot;, offset=0, limit=20, order=&quot;status&quot;)')
  })
  it('search 节：hint note 行先于命中清单 + 命中行 [scope][域]标题(score) + 行级反馈钮对', () => {
    const markup = renderExpanded()
    expect(markup).toContain('data-dswf-recall-hint')
    expect(markup).toContain('domain &quot;热度治理&quot; was dropped after zero hits')
    expect(markup.indexOf('data-dswf-recall-hint')).toBeLessThan(markup.indexOf('data-dswf-recall-hit=""'))
    expect(markup).toContain('(score 0.91)')
    expect(markup.match(/data-dswf-recall-ibtn="up"/g)?.length).toBeGreaterThanOrEqual(2)
    expect(markup).toMatch(/aria-pressed="false"/)
  })
  it('read 节：文档名称文字链接（无正文块——快照归 dialog）；browse 条目行 = scope+slug+域标题', () => {
    const markup = renderExpanded()
    expect(markup).toContain('API 规范')
    expect(markup).not.toContain('正文-接口细则') // 快照全文不在卡片
    expect(markup).toContain('data-dswf-recall-read')
    expect(markup).toContain('data-dswf-recall-browse-row')
    expect(markup).toContain('(kb-be-002)')
    expect(markup).toContain('data-dswf-recall-scope="project"')
  })
  it('节头行尾节级 toggle（四型同构）', () => {
    const markup = renderExpanded()
    expect(markup.match(/data-dswf-recall-ibtn/g)?.length).toBeGreaterThanOrEqual(3)
  })
  it('回显态：行级 👍 aria-pressed=true；批👎节头汇总徽', () => {
    const feedback = { rows: { 41: 1 as const, 42: -1 as const }, batches: {} }
    const markup = renderExpanded(feedback)
    expect(markup).toContain('已剔除 1/2 条')
    expect(markup).toContain('已标记')
  })
})

describe('零命中/未锚兜底展开（哨兵 + 裸动词 chip）', () => {
  const nullCard = recallTurnsOf(groups).find((c) => c.turnSeq === null)!
  it('未锚卡：L1 轮次未锚 + search 节零命中哨兵条 + legacy keywords ｜ 拼接', () => {
    const markup = renderToStaticMarkup(
      <RecallCardView
        card={nullCard}
        expanded
        onToggle={() => {}}
        feedback={initialRecallFeedback()}
        onRowFeedback={() => {}}
        onCallReject={() => {}}
        onCallUndo={() => {}}
        onOpenSnapshot={() => {}}
        onOpenEntry={() => {}}
      />,
    )
    expect(markup).toContain('轮次未锚')
    expect(markup).toContain('data-dswf-recall-sentinel')
    expect(markup).toContain('命中 0 条')
    expect(markup).toContain('search(keywords=&quot;不存在&quot;)')
    expect(markup).toContain('—') // 触发输入双缺降级
  })
})

describe('recallSnapshotParts（read 快照头行拆分——Modal 承载归装配，纯拆分静态可测）', () => {
  it('render 头行拆分：首行 # 头 → head；其余为正文', () => {
    expect(recallSnapshotParts('# 标题 (id, draft, ts)\n正文')).toEqual({ head: '标题 (id, draft, ts)', body: '正文' })
    expect(recallSnapshotParts('无头行')).toEqual({ head: '', body: '无头行' })
  })
})

describe('submitRecallFeedback / recallFeedbackFailureText（第七通道消费面）', () => {
  const clientOf = (impl: () => Promise<unknown>): ForgeRpcClient =>
    ({ knowledge: { recallFeedback: impl } }) as unknown as ForgeRpcClient

  it('成功回执 ok；逐行 failure 归一失败文案；请求级拒收/异常归一 message', async () => {
    const ok = await submitRecallFeedback(
      clientOf(() => Promise.resolve({ results: [{ rowId: 41, outcome: 'success' }] })),
      { projectId: 'p-1', action: 'row', rowId: 41, feedback: 1 },
    )
    expect(ok).toEqual({ ok: true })
    const failed = await submitRecallFeedback(
      clientOf(() => Promise.resolve({ results: [{ rowId: 41, outcome: 'failure', code: 'unconfirmed', message: 'x' }] })),
      { projectId: 'p-1', action: 'row', rowId: 41, feedback: -1, note: 'n' },
    )
    expect(failed.ok).toBe(false)
    expect(failed.ok === false && failed.message).toContain('条目未确认')
    const rejected = await submitRecallFeedback(
      clientOf(() => Promise.resolve({ outcome: 'rejected-request', code: 'invalid-request', message: 'bad' })),
      { projectId: 'p-1', action: 'batch', callId: 'c1', feedback: -1, note: 'n' },
    )
    expect(rejected.ok).toBe(false)
    const thrown = await submitRecallFeedback(
      clientOf(() => Promise.reject(new RpcClientError({ code: 'ERR_INDEX_STALE', message: '索引过期' }))),
      { projectId: 'p-1', action: 'batch', callId: 'c1', feedback: 0 },
    )
    expect(thrown).toEqual({ ok: false, message: '索引过期' })
  })
  it('失败码分派键：封闭码集三值', () => {
    expect(recallFeedbackFailureText('not-found')).toContain('反馈行未命中')
    expect(recallFeedbackFailureText('note-required')).toContain('缺少')
    expect(recallFeedbackFailureText('unconfirmed')).toContain('未确认')
  })
})

describe('recallLoadPlan / runRecallLoad / applyRecallOutcome 装载机械（改型零回归）', () => {
  it('查询键齐备 = fetch；键缺席 = idle', () => {
    expect(recallLoadPlan({ projectId: 'p-1', sessionId: 's-1' })).toBe('fetch')
    expect(recallLoadPlan({ projectId: null, sessionId: 's-1' })).toBe('idle')
  })
  it('plan=fetch：loading 起步 → ready 落点；失败 → error（fail-soft）', async () => {
    const clientOf = (out: readonly RecallGroup[] | Error): ForgeRpcClient =>
      ({
        knowledge: {
          sessionRecall: async () => {
            if (out instanceof Error) throw out
            return out
          },
        },
      }) as unknown as ForgeRpcClient
    const steps = await runRecallLoad({ projectId: 'p-1', sessionId: 's-1' }, () => clientOf(groups))
    expect(steps).toEqual([{ kind: 'loading' }, { kind: 'ready', groups }])
    const bad = await runRecallLoad(
      { projectId: 'p-1', sessionId: 's-1' },
      () => clientOf(new RpcClientError({ code: 'ERR_INDEX_STALE', message: 'x' })),
    )
    expect(bad[1]!.kind).toBe('error')
  })
  it('plan=idle → 复位空态', async () => {
    const idle = await runRecallLoad({ projectId: null, sessionId: 's-1' }, () => ({}) as ForgeRpcClient)
    expect(applyRecallOutcome({ phase: 'ready', groups, error: undefined }, idle[0]!)).toEqual(initialRecallState())
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
  })
})

describe('RecallTab 装载壳（SSR 首帧 = idle 静态空态——效应面归 e2e）', () => {
  it('无锚首帧空态', () => {
    const markup = renderToStaticMarkup(<RecallTab projectId={null} sessionId={null} />)
    expect(markup).toContain('data-dswf-recall-face="empty"')
  })
})
