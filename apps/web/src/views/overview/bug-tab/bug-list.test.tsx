// bug-list 单测（fix-bug Bug 子 tab 列表视图）—— chips 三态计数/0 计数 disabled/清过滤 +
// 行形态（提案行同构：状态点色 + summary 标题左 + error_type chip 右；无状态文字/无时间）+
// 行点击上抛 + 空态双标题。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BugCard, BugStatus } from '@dsh-forge/contracts'
import { BugList, BugStatusChips } from './bug-list.js'

const CREATED = '2026-10-13T09:30:00.000Z'

function bug(bugId: string, bugStatus: BugStatus, errorType?: string): BugCard {
  return {
    bugId,
    summary: `登录接口 500（${bugId}）`,
    bugDesc: 'd',
    triggerDesc: 't',
    expected: 'e',
    actual: 'a',
    bugStatus,
    ...(errorType !== undefined ? { errorType } : {}),
    reporter: 'faner',
    createdAt: CREATED,
    updatedAt: CREATED,
  }
}

const COUNTS: Record<BugStatus, number> = { open: 3, fixed: 12, unresolved: 0 }

describe('BugStatusChips（三态计数 + 0 计数 disabled——同任务 chips 语义）', () => {
  it('三态 chips 行序 = contracts BUG_STATUSES；计数呈现', () => {
    const markup = renderToStaticMarkup(<BugStatusChips counts={COUNTS} active={new Set()} onToggle={() => {}} />)
    expect(markup).toContain('data-dswf-ov-bschip="open"')
    expect(markup).toContain('data-dswf-ov-bschip="fixed"')
    expect(markup).toContain('data-dswf-ov-bschip="unresolved"')
    expect(markup).toContain('>3</span>')
    expect(markup).toContain('>12</span>')
  })

  it('0 计数 disabled（unresolved 0 → chip 不可点）；非 0 可点', () => {
    const markup = renderToStaticMarkup(<BugStatusChips counts={COUNTS} active={new Set()} onToggle={() => {}} />)
    const at = markup.indexOf('data-dswf-ov-bschip="unresolved"')
    const chip = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    expect(chip).toContain('disabled')
    const openAt = markup.indexOf('data-dswf-ov-bschip="open"')
    const openChip = markup.slice(markup.lastIndexOf('<button', openAt), markup.indexOf('</button>', openAt))
    expect(openChip).not.toContain('disabled')
  })

  it('过滤在场 = 清过滤入口；激活 chip aria-pressed', () => {
    const markup = renderToStaticMarkup(
      <BugStatusChips counts={COUNTS} active={new Set<BugStatus>(['open'])} onToggle={() => {}} onClear={() => {}} />,
    )
    expect(markup).toContain('data-dswf-ov-bschip-clear')
    const at = markup.indexOf('data-dswf-ov-bschip="open"')
    const openChip = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    expect(openChip).toContain('aria-pressed="true"')
  })
})

describe('BugList（行形态 + 空态 + 行点击上抛）', () => {
  const handlers = { onToggleStatus: () => {} }

  it('行 = 提案行同构：状态点[色区分] + summary 标题左 + error_type chip 右；无状态文字/无时间', () => {
    const markup = renderToStaticMarkup(
      <BugList bugs={[bug('b1', 'open', 'api'), bug('b2', 'fixed')]} counts={COUNTS} activeStatuses={new Set()} {...handlers} />,
    )
    expect(markup).toContain('data-dswf-ov-bugrow="b1"')
    expect(markup).toContain('dswf-ov-parent-title')
    expect(markup).toContain('登录接口 500（b1）')
    expect(markup).toContain('data-dswf-ov-bugrow-type="api"')
    expect(markup).toContain('dswf-ov-parent-chip') // error_type chip 右靠（提案行 chip 位）
    // 状态文字退场（色归圆点）；时间退场
    expect(markup).not.toContain('data-dswf-ov-bugrow-status')
    expect(markup).not.toContain('09:30')
    // errorType 缺席行零 chip
    const b2At = markup.indexOf('data-dswf-ov-bugrow="b2"')
    const b2End = markup.indexOf('data-dswf-ov-bugrow', b2At + 1)
    expect(markup.slice(b2At, b2End === -1 ? undefined : b2End)).not.toContain('data-dswf-ov-bugrow-type')
  })

  it('onOpenBug 在场 = 整行可点（role=button）；缺席 = 静态呈现', () => {
    const interactive = renderToStaticMarkup(
      <BugList bugs={[bug('b1', 'open')]} counts={COUNTS} activeStatuses={new Set()} onOpenBug={() => {}} {...handlers} />,
    )
    expect(interactive).toContain('role="button"')
    const staticMarkup = renderToStaticMarkup(
      <BugList bugs={[bug('b1', 'open')]} counts={COUNTS} activeStatuses={new Set()} {...handlers} />,
    )
    expect(staticMarkup).not.toContain('role="button"')
  })

  it('空态双标题：过滤在场 = 「无匹配当前状态过滤的 Bug」；缺省 = 「暂无 Bug」（搜索空态标题由帧侧注入）', () => {
    const filtered = renderToStaticMarkup(
      <BugList bugs={[]} counts={COUNTS} activeStatuses={new Set<BugStatus>(['open'])} {...handlers} />,
    )
    expect(filtered).toContain('无匹配当前状态过滤的 Bug')
    const empty = renderToStaticMarkup(
      <BugList bugs={[]} counts={{ open: 0, fixed: 0, unresolved: 0 }} activeStatuses={new Set()} {...handlers} />,
    )
    expect(empty).toContain('暂无 Bug')
    const searchEmpty = renderToStaticMarkup(
      <BugList bugs={[]} counts={COUNTS} activeStatuses={new Set()} emptyTitle="无匹配「zzz」的 Bug" {...handlers} />,
    )
    expect(searchEmpty).toContain('无匹配「zzz」的 Bug')
  })
})

describe('BugList 行「添加到会话中」（composer-bug-reference 1.4——纯增行内控件）', () => {
  const handlers = { onToggleStatus: () => {} }

  it('onAddBugToSession 在场 = 行内纯增按钮（1.4）；缺席 = 行语言零变化', () => {
    const withAdd = renderToStaticMarkup(
      <BugList
        bugs={[bug('b1', 'open', 'api')]}
        counts={COUNTS}
        activeStatuses={new Set()}
        {...handlers}
        onOpenBug={() => {}}
        onAddBugToSession={() => {}}
      />,
    )
    expect(withAdd).toContain('data-dswf-ov-bugrow-add')
    expect(withAdd).toContain('添加到会话中')
    expect(withAdd).toContain('dswf-ov-bugrow-add')
    const withoutAdd = renderToStaticMarkup(
      <BugList bugs={[bug('b1', 'open')]} counts={COUNTS} activeStatuses={new Set()} {...handlers} />,
    )
    expect(withoutAdd).not.toContain('data-dswf-ov-bugrow-add')
    expect(withoutAdd).not.toContain('添加到会话中')
    // 既有行语言零变化：整行 role=button 语义与 error_type chip 位不受扰
    expect(withAdd).toContain('role="button"')
    expect(withAdd).toContain('data-dswf-ov-bugrow-type="api"')
  })
})
