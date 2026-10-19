// 时间线单测 —— AC5：现状条六型条件 + 事件流（record verb 六值穷尽路由 + 关联信息织入）。
// 渲染面 = renderToStaticMarkup；verb 词汇 = contracts TASK_RECORD_VERBS（六值封闭）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TASK_RECORD_VERBS, type TaskRecordEntry } from '@dsh-forge/contracts'
import { detailFixture } from './detail-model.test.js'
import {
  AcItem,
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
    expect(recordVerbLabel('spawn', 'coding-feature')).toBe('派发执行')
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

  it('得分+严重度条件仅 eval 族（vars.score 承载）；test 族现状条无 surface 投影', () => {
    const testDetail = detailFixture({
      taskType: 'test-run',
      prerequisites: [],
    })
    expect(nowBarItems(testDetail).map((i) => i.kind)).toEqual([])
    const evalDetail = detailFixture({
      taskType: 'eval-contract',
      vars: { score: '45', severity: 'high' },
      prerequisites: [],
    })
    expect(nowBarItems(evalDetail).map((i) => i.kind)).toEqual(['score'])
    expect(evalScoreOf(evalDetail)).toEqual({ score: '45', severity: 'high' })
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
    expect(html).toContain('前置声明 ←')
    expect(html).toContain('data-dswf-td-prereq="2.4"')
    expect(html).toContain('fix 链')
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
    expect(html).toContain('score 45/100 · 严重度 high')
  })

  it('零记录 → 占位行（防御面——append-only 下 add 恒在场）', () => {
    const html = renderToStaticMarkup(TimelineEvents({ detail: detailFixture({ records: [] }), now: NOW }))
    expect(html).toContain('暂无记录')
  })
})

describe('submit 结构化消费（task-ui-visual-copy-blitz S2——结构化列在场渲染 / 缺席 fail-soft）', () => {
  it('带结构化列：AC 折叠块收起态「AC N/M ✓」计数 + keyDecisions 分列 + 分类字段行', () => {
    const detail = detailFixture({
      records: [
        rec('submit', {
          summary: 'feat(core): 七表 schema',
          commitHash: 'a1b2c3d4',
          gate: { compile: true, fmt: true, lint: true, test: true },
          acceptanceCriteria: [
            { criterion: 'AC-1 七表建表', met: true, evidence: 'query.test.ts 全绿' },
            { criterion: 'AC-2 解码归一', met: true },
            { criterion: 'AC-3 迁移幂等', met: false, evidence: 'migrate.test.ts 红' },
          ],
          keyDecisions: ['单事务落列', '双形制读面归一'],
          testsPassed: 9,
          testsFailed: 1,
          coverage: 0.88,
          notes: 'n',
        }),
      ],
    })
    const html = renderToStaticMarkup(TimelineEvents({ detail, now: NOW }))
    expect(html).toContain('data-dswf-td-ac=""')
    expect(html).toContain('AC 2/3') // 收起态计数（非全过无 ✓）
    expect(html).not.toContain('AC-1 七表建表') // 折叠态徽标不渲染
    expect(html).toContain('data-dswf-td-kd-item=""')
    expect(html).toContain('决策 · 单事务落列')
    expect(html).toContain('决策 · 双形制读面归一')
    expect(html).toContain('测试 通过 9 · 失败 1 · 覆盖率 88%')
    expect(html).toContain('n')
  })

  it('全过 AC 计数带 ✓；AC 徽标行 ✓/✗ + 判据 + 证据行（AcItem 展开形直测）', () => {
    const detail = detailFixture({
      records: [
        rec('submit', {
          acceptanceCriteria: [
            { criterion: 'AC-1 a', met: true, evidence: 't1 绿' },
            { criterion: 'AC-2 b', met: true },
          ],
        }),
      ],
    })
    const html = renderToStaticMarkup(TimelineEvents({ detail, now: NOW }))
    expect(html).toContain('AC 2/2 ✓')
    const met = renderToStaticMarkup(<AcItem met={true} criterion="AC-1 a" evidence="t1 绿" />)
    expect(met).toContain('data-dswf-td-ac-item=""')
    expect(met).toContain('is-met')
    expect(met).toContain('✓')
    expect(met).toContain('AC-1 a')
    expect(met).toContain('t1 绿')
    const miss = renderToStaticMarkup(<AcItem met={false} criterion="AC-3 c" evidence="t1 红" />)
    expect(miss).toContain('is-miss')
    expect(miss).toContain('✗')
    expect(miss).toContain('AC-3 c')
  })

  it('fail-soft：结构化列缺席（历史旧格式）= 纯文本行渲染，零结构化锚、不报错', () => {
    const detail = detailFixture({
      records: [
        rec('submit', {
          summary: '历史旧格式纯文本摘要\n第二行细节',
          files: ['a.ts'],
          commitHash: 'deadbeef',
          gate: { compile: true, fmt: true, lint: true, test: true },
        }),
      ],
    })
    const html = renderToStaticMarkup(TimelineEvents({ detail, now: NOW }))
    expect(html).not.toContain('data-dswf-td-ac=""')
    expect(html).not.toContain('data-dswf-td-kd=""')
    expect(html).not.toContain('data-dswf-td-fields=""')
    // 多行 summary 走收起/展开单源组件：收起显首行
    expect(html).toContain('data-dswf-td-fold="collapsed"')
    expect(html).toContain('历史旧格式纯文本摘要')
    expect(html).not.toContain('第二行细节')
  })

  it('部分结构化（仅 keyDecisions）= 逐项省略渲染，缺 AC 不折叠不报错', () => {
    const detail = detailFixture({
      records: [rec('submit', { summary: 's', keyDecisions: ['只此一策'] })],
    })
    const html = renderToStaticMarkup(TimelineEvents({ detail, now: NOW }))
    expect(html).not.toContain('data-dswf-td-ac=""')
    expect(html).toContain('决策 · 只此一策')
    expect(html).not.toContain('测试 通过')
  })
})

describe('会话 pill 名称展示（task-ui-info-density-blitz S1/SC1——task-ui-info-density-blitz/1.2）', () => {  const SESSIONS = [
    { taskId: 't-1', slug: 'm2-pipeline', localId: '2.4', title: 'T', taskStatus: 'completed' as const, sessionId: 's1', source: 'link' as const },
    { taskId: 't-1', slug: 'm2-pipeline', localId: '2.4', title: 'T', taskStatus: 'completed' as const, sessionId: 's1-1', source: 'record' as const },
  ]
  const RESOLVER = (sessionId: string): string | undefined => (sessionId === 's1' ? '登录修复' : undefined)

  it('解析器命中 = 现状条 pill 显示会话名称；未命中 = 回退 id', () => {
    const html = renderToStaticMarkup(TimelineNow({ detail: detailFixture({ sessions: SESSIONS }), onOpenSession: OPEN_SESSION, sessionTitleOf: RESOLVER }))
    expect(html).toContain('派发⟞ 登录修复')
    expect(html).not.toContain('派发⟞ s1<')
    expect(html).toContain('执行⟞ s1-1') // 未命中回退 id
  })

  it('事件织入 pill 同名称契约（claim/submit 记录源——命中名称/缺席回退 id）+ 解析器缺席 = 纯 id（现役形制）', () => {
    const detail = detailFixture({
      records: [rec('claim', { sessionId: 's1' }), rec('submit', { sessionId: 's1-1' })],
    })
    const hit = renderToStaticMarkup(TimelineEvents({ detail, now: NOW, sessionTitleOf: RESOLVER }))
    expect(hit).toContain('派发⟞ 登录修复')
    expect(hit).toContain('执行⟞ s1-1')
    const noResolver = renderToStaticMarkup(TimelineEvents({ detail, now: NOW }))
    expect(noResolver).toContain('派发⟞ s1')
    expect(noResolver).toContain('执行⟞ s1-1')
  })
})
