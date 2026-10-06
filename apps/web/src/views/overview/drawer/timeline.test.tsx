// 时间线单测 —— AC5：现状条六型条件 + 事件流（record verb 六值穷尽路由 + 关联信息织入）。
// 渲染面 = renderToStaticMarkup；verb 词汇 = contracts TASK_RECORD_VERBS（六值封闭）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TASK_RECORD_VERBS, type TaskRecordEntry } from '@dsh-forge/contracts'
import { detailFixture } from './detail-model.test.js'
import {
  TASK_VERB_KIND,
  TimelineEvents,
  TimelineNow,
  evalScoreOf,
  nowBarItems,
  recordVerbLabel,
} from './timeline.js'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const OPEN_SESSION = (): void => {}

function rec(verb: TaskRecordEntry['verb'], extra: Partial<TaskRecordEntry> = {}): TaskRecordEntry {
  return { verb, actor: 'plugin-tool', createdAt: '2026-10-04T16:05:00.000Z', ...extra }
}

describe('verb 六值穷尽路由（AC5 + Implementation Notes）', () => {
  it('标签与节点色映射穷尽六值（创建/领取/提交/人工转移/自动恢复/自动阻塞）', () => {
    expect(new Set(Object.keys(TASK_VERB_KIND))).toEqual(new Set(TASK_RECORD_VERBS))
    expect(recordVerbLabel('add', 'coding-feature')).toBe('创建')
    expect(recordVerbLabel('claim', 'coding-feature')).toBe('领取')
    expect(recordVerbLabel('submit', 'coding-feature')).toBe('提交')
    expect(recordVerbLabel('transition', 'coding-feature')).toBe('人工转移')
    expect(recordVerbLabel('auto-restore', 'coding-feature')).toBe('自动恢复')
    expect(recordVerbLabel('auto-block', 'coding-feature')).toBe('自动阻塞')
  })

  it('评估型任务的 submit 记录 → 评估（M2 评估结果落 submit 记录——verb 六值之外的呈现路由）', () => {
    expect(recordVerbLabel('submit', 'eval-contract')).toBe('评估')
    expect(recordVerbLabel('submit', 'validation-ux')).toBe('评估')
    expect(recordVerbLabel('claim', 'eval-contract')).toBe('领取') // 非 submit 不改标签
  })
})

describe('现状条（AC5 六型条件）', () => {
  it('条件投影：阻塞原因/前置（键+状态）/挂接（双源分型）/Surface/质量门/得分+严重度', () => {
    const detail = detailFixture({
      taskStatus: 'blocked',
      blockedReason: '依赖 fix-1 未完成',
      taskType: 'gate',
      prerequisites: [{ slug: 'm2-pipeline', localId: '2.4', taskStatus: 'in_progress' }],
      sessions: [
        { taskId: 't-1', slug: 'm2-pipeline', localId: '2.4', title: 'T', taskStatus: 'blocked', sessionId: 's1', source: 'link' },
        { taskId: 't-1', slug: 'm2-pipeline', localId: '2.4', title: 'T', taskStatus: 'blocked', sessionId: 's1-1', source: 'record' },
      ],
      records: [
        rec('submit', { gate: { compile: true, fmt: true, lint: false, test: true } }),
      ],
    })
    const items = nowBarItems(detail)
    expect(items.map((i) => i.kind)).toEqual(['blocked', 'prereqs', 'sessions', 'gate'])
  })

  it('Surface 条件仅 test 族；得分+严重度条件仅 eval 族（vars.score 承载 + 主会话标记）', () => {
    const testDetail = detailFixture({
      taskType: 'test-run',
      surfaceKey: 'web',
      surfaceType: 'web',
      prerequisites: [],
    })
    expect(nowBarItems(testDetail).map((i) => i.kind)).toEqual(['surface'])
    const evalDetail = detailFixture({
      taskType: 'eval-contract',
      mainSession: true,
      vars: { score: '45', severity: 'high' },
      prerequisites: [],
    })
    expect(nowBarItems(evalDetail).map((i) => i.kind)).toEqual(['score'])
    expect(evalScoreOf(evalDetail)).toEqual({ score: '45', severity: 'high', mainSession: true })
  })

  it('无条件 → 现状条不渲染', () => {
    expect(nowBarItems(detailFixture({ taskStatus: 'pending', prerequisites: [], sessions: [], records: [] }))).toEqual([])
    expect(renderToStaticMarkup(TimelineNow({ detail: detailFixture({ prerequisites: [] }), onOpenSession: OPEN_SESSION }))).toBe('')
  })

  it('渲染面：前置 = 自然键+中文状态；挂接 pill 分型（派发⟞/执行⟞）+ 点击锚；跳会话回调缺席 = 非交互呈现', () => {
    const detail = detailFixture({
      prerequisites: [{ slug: 'm2-pipeline', localId: 'fix-1', taskStatus: 'pending' }],
      sessions: [
        { taskId: 't-1', slug: 'm2-pipeline', localId: '2.4', title: 'T', taskStatus: 'completed', sessionId: 's1', source: 'link' },
        { taskId: 't-1', slug: 'm2-pipeline', localId: '2.4', title: 'T', taskStatus: 'completed', sessionId: 's1-1', source: 'record' },
      ],
    })
    const html = renderToStaticMarkup(TimelineNow({ detail, onOpenSession: OPEN_SESSION }))
    expect(html).toContain('data-dswf-td-now=""')
    expect(html).toContain('fix-1')
    expect(html).toContain('待处理')
    expect(html).toContain('派发⟞ s1')
    expect(html).toContain('执行⟞ s1-1')
    expect(html).toContain('data-dswf-td-sess="s1"')
    const passive = renderToStaticMarkup(TimelineNow({ detail }))
    expect(passive).toContain('派发⟞ s1')
    expect(passive).not.toContain('<button')
  })
})

describe('事件流（AC5 织入矩阵）', () => {
  it('创建（add）：前置声明织入 + fix 链（来源自然键/根因/源文件/测试脚本）', () => {
    const detail = detailFixture({
      taskType: 'coding-fix',
      prerequisites: [{ slug: 'm2-pipeline', localId: '2.4', taskStatus: 'in_progress' }],
      sourceTask: { slug: 'm2-pipeline', localId: '2.4' },
      vars: { rootCause: '点号名形', sourceFiles: 'packages/knowledge/src/tools/faces.ts', testScript: 'pnpm vitest run packages/knowledge' },
      records: [rec('add')],
    })
    const html = renderToStaticMarkup(TimelineEvents({ detail, now: NOW }))
    expect(html).toContain('data-dswf-td-ev-verb="add"')
    expect(html).toContain('前置声明 ← m2-pipeline/2.4')
    expect(html).toContain('fix 链')
    expect(html).toContain('m2-pipeline/2.4')
    expect(html).toContain('根因')
    expect(html).toContain('点号名形')
    expect(html).toContain('packages/knowledge/src/tools/faces.ts')
    expect(html).toContain('pnpm vitest run packages/knowledge')
  })

  it('领取（claim）：digest 简报 + 派发⟞ 会话 pill（记录自带 sessionId）', () => {
    const detail = detailFixture({
      records: [rec('add'), rec('claim', { digest: '9a2b11c0', sessionId: 's1' })],
    })
    const html = renderToStaticMarkup(TimelineEvents({ detail, now: NOW, onOpenSession: OPEN_SESSION }))
    expect(html).toContain('data-dswf-td-ev-verb="claim"')
    expect(html).toContain('9a2b11c0')
    expect(html).toContain('派发⟞ s1')
    expect(html).toContain('data-dswf-td-sess="s1"')
  })

  it('提交（submit）：gate 结果 + commit 徽标/摘要/文件数 + 执行⟞ 会话 pill', () => {
    const detail = detailFixture({
      records: [
        rec('add'),
        rec('submit', {
          summary: 'feat(core): 七表 schema',
          files: ['a.ts', 'b.ts', 'c.ts'],
          commitHash: 'a1b2c3d4',
          gate: { compile: true, fmt: true, lint: true, test: true, coverage: 0.92 },
          sessionId: 's1-1',
        }),
      ],
    })
    const html = renderToStaticMarkup(TimelineEvents({ detail, now: NOW, onOpenSession: OPEN_SESSION }))
    expect(html).toContain('data-dswf-td-ev-verb="submit"')
    expect(html).toContain('gate 4/4')
    expect(html).toContain('92%')
    expect(html).toContain('data-dswf-td-commit="a1b2c3d4"')
    expect(html).toContain('feat(core): 七表 schema')
    expect(html).toContain('3 文件')
    expect(html).toContain('执行⟞ s1-1')
  })

  it('人工转移（transition）：from → to + reason；auto-block/auto-restore 语义行', () => {
    const detail = detailFixture({
      records: [
        rec('transition', { fromStatus: 'pending', toStatus: 'suspended', reason: '等定案' }),
        rec('auto-block', { reason: 'block-source 单事务置源 blocked' }),
        rec('auto-restore', { fromStatus: 'blocked', toStatus: 'pending' }),
      ],
    })
    const html = renderToStaticMarkup(TimelineEvents({ detail, now: NOW }))
    expect(html).toContain('data-dswf-td-ev-verb="transition"')
    expect(html).toContain('待处理 → 已挂起')
    expect(html).toContain('reason: 等定案')
    expect(html).toContain('data-dswf-td-ev-verb="auto-block"')
    expect(html).toContain('block-source 单事务置源 blocked')
    expect(html).toContain('data-dswf-td-ev-verb="auto-restore"')
    expect(html).toContain('已阻塞 → 待处理')
  })

  it('记录序保持（append-only 自增序——旧 → 新）；评估型 submit 标签换评估', () => {
    const detail = detailFixture({
      taskType: 'eval-contract',
      mainSession: true,
      records: [
        rec('add'),
        rec('submit', { summary: 'score 45/100 · 严重度 high' }),
      ],
    })
    const html = renderToStaticMarkup(TimelineEvents({ detail, now: NOW }))
    const addAt = html.indexOf('data-dswf-td-ev-verb="add"')
    const submitAt = html.indexOf('data-dswf-td-ev-verb="submit"')
    expect(addAt).toBeGreaterThanOrEqual(0)
    expect(submitAt).toBeGreaterThan(addAt)
    expect(html).toContain('>评估</span>')
    expect(html).toContain('🔑 主会话')
    expect(html).toContain('score 45/100 · 严重度 high')
  })

  it('零记录 → 占位行（防御面——append-only 下 add 恒在场）', () => {
    const html = renderToStaticMarkup(TimelineEvents({ detail: detailFixture({ records: [] }), now: NOW }))
    expect(html).toContain('暂无记录')
  })
})
