// bug-list 单测（fix-bug Bug 子 tab 列表视图）—— chips 三态计数/0 计数 disabled/清过滤 +
// 行形态（提案行同构：状态点色 + summary 标题左 + error_type chip 右；无状态文字/无时间）+
// 行点击上抛 + 空态双标题 + 链折叠（bug-recurrence-chain 1.6：链根行 + 复发徽标 + 链聚合态
// 状态点 + 展开区时间正序子行 + 零链行语言不变）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BugCard, BugStatus } from '@dsh-forge/contracts'
import { bugChainGroups, BugList, BugStatusChips } from './bug-list.js'

const CREATED = '2026-10-13T09:30:00.000Z'

function bug(bugId: string, bugStatus: BugStatus, errorType?: string, extra: Partial<BugCard> = {}): BugCard {
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
    ...extra,
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

// ── bug-recurrence-chain 1.6：链折叠 + 复发徽标（mockup ①区逐位对照契约） ──

/** 链 fixture：b1 链根（fixed）→ b2 复发①（fixed）→ b3 复发②（open）；时间正序 */
function chainBugs(): BugCard[] {
  return [
    bug('b1', 'fixed', 'concurrency', {
      summary: 'dispatch 派发循环偶发死锁',
      recurrenceOf: undefined,
      commitHash: 'c0a1e93abcdef',
      createdAt: '2026-10-08T09:00:00.000Z',
    }),
    bug('b2', 'fixed', undefined, {
      summary: 'job_output 抽干竞态',
      recurrenceOf: 'b1',
      commitHash: 'c0b2f1a1234567',
      createdAt: '2026-10-12T10:00:00.000Z',
    }),
    bug('b3', 'open', 'concurrency', {
      summary: '结算抽取后再挂起',
      recurrenceOf: 'b2',
      createdAt: '2026-10-15T14:02:00.000Z',
    }),
    bug('b4', 'fixed', 'core', { summary: 'resolveBug 双缺席 git 身份回退缺失' }),
  ]
}

describe('bugChainGroups（链分组投影——listBugs 响应 recurrenceOf 前驱指针展开）', () => {
  it('链根聚合 entries 时间正序（链根在前）；孤条不入组；N = 链上条数', () => {
    const groups = bugChainGroups(chainBugs())
    const chain = groups.chains.get('b1')
    expect(chain).toBeDefined()
    expect(chain?.map((b) => b.bugId)).toEqual(['b1', 'b2', 'b3'])
    expect(groups.chains.has('b4')).toBe(false)
    // 非链根成员映射到链根（渲染期跳过顶层重复行）
    expect(groups.memberRootOf.get('b3')).toBe('b1')
    expect(groups.memberRootOf.has('b4')).toBe(false)
  })

  it('链根被过滤缺席时悬空前驱成员按链根回落（剩余子链成组）', () => {
    const groups = bugChainGroups(chainBugs().filter((b) => b.bugId !== 'b1'))
    const sub = groups.chains.get('b2')
    expect(sub?.map((b) => b.bugId)).toEqual(['b2', 'b3'])
    expect(groups.memberRootOf.get('b3')).toBe('b2')
  })
})

describe('BugList 链折叠行（链根 summary + 复发徽标 + 链聚合态状态点）', () => {
  const handlers = { onToggleStatus: () => {}, onOpenBug: () => {} }

  it('链根行 = chevron + 链根 summary + 「复发 2 次」红徽标（N = 条数−1）+ errorType chip；徽标在 chip 左', () => {
    const markup = renderToStaticMarkup(
      <BugList bugs={chainBugs()} counts={COUNTS} activeStatuses={new Set()} {...handlers} />,
    )
    const row = sliceRow(markup, 'data-dswf-ov-chainrow="b1"')
    expect(row).toContain('dswf-ov-bugrow-chev')
    expect(row).toContain('▸') // 缺省收起
    expect(row).toContain('dispatch 派发循环偶发死锁')
    expect(row).toContain('复发 2 次')
    expect(row).toContain('dswf-ov-bugrow-rbadge')
    expect(row).toContain('data-dswf-ov-bugrow-type="concurrency"')
    // 徽标位于 errorType chip 左侧（mockup 位次）
    expect(row.indexOf('dswf-ov-bugrow-rbadge')).toBeLessThan(row.indexOf('data-dswf-ov-bugrow-type'))
  })

  it('链聚合态状态点：链上任一 open 即 error；全终态取最新条终态色', () => {
    const withOpen = renderToStaticMarkup(
      <BugList bugs={chainBugs()} counts={COUNTS} activeStatuses={new Set()} {...handlers} />,
    )
    expect(sliceRow(withOpen, 'data-dswf-ov-chainrow="b1"')).toContain('data-dswf-ov-chain-state="error"')
    // 全终态链（b1/b2 fixed，b3 改 fixed）→ 最新条（b3）终态色 done
    const allDone = chainBugs().map((b) => (b.bugId === 'b3' ? { ...b, bugStatus: 'fixed' as BugStatus } : b))
    const markup = renderToStaticMarkup(
      <BugList bugs={allDone} counts={COUNTS} activeStatuses={new Set()} {...handlers} />,
    )
    expect(sliceRow(markup, 'data-dswf-ov-chainrow="b1"')).toContain('data-dswf-ov-chain-state="done"')
  })

  it('非链根成员不重复出现在顶层行集；零链行保留隐藏 chevron 对齐位且语言不变', () => {
    const markup = renderToStaticMarkup(
      <BugList bugs={chainBugs()} counts={COUNTS} activeStatuses={new Set()} {...handlers} />,
    )
    // b2/b3 不以顶层行形态出现（仅在展开区）
    expect(markup).not.toContain('data-dswf-ov-bugrow="b2"')
    expect(markup).not.toContain('data-dswf-ov-bugrow="b3"')
    expect(markup).toContain('data-dswf-ov-bugrow="b4"')
    const zero = sliceRow(markup, 'data-dswf-ov-bugrow="b4"')
    expect(zero).toContain('dswf-ov-bugrow-chev is-hidden')
    expect(zero).not.toContain('dswf-ov-bugrow-rbadge')
  })

  it('缺省收起：展开区不呈现；initialOpenChainIds 注入 = 展开区呈现（时间正序链根在上）', () => {
    const collapsed = renderToStaticMarkup(
      <BugList bugs={chainBugs()} counts={COUNTS} activeStatuses={new Set()} {...handlers} />,
    )
    expect(collapsed).not.toContain('data-dswf-ov-bugrow-children')
    const expanded = renderToStaticMarkup(
      <BugList
        bugs={chainBugs()}
        counts={COUNTS}
        activeStatuses={new Set()}
        {...handlers}
        initialOpenChainIds={['b1']}
      />,
    )
    expect(expanded).toContain('data-dswf-ov-bugrow-children')
    expect(expanded).toContain('▾')
    const children = expanded.slice(expanded.indexOf('data-dswf-ov-bugrow-children'))
    const atRoot = children.indexOf('data-dswf-ov-bugrow-child="b1"')
    const atR1 = children.indexOf('data-dswf-ov-bugrow-child="b2"')
    const atR2 = children.indexOf('data-dswf-ov-bugrow-child="b3"')
    expect(atRoot).toBeGreaterThan(-1)
    expect(atRoot).toBeLessThan(atR1)
    expect(atR1).toBeLessThan(atR2)
  })

  it('子行 = 定位词 + summary 摘录 + 日期 + 已修 commit 短哈希；子行点击开该条详情', () => {
    const markup = renderToStaticMarkup(
      <BugList
        bugs={chainBugs()}
        counts={COUNTS}
        activeStatuses={new Set()}
        {...handlers}
        initialOpenChainIds={['b1']}
      />,
    )
    const rootChild = sliceRow(markup, 'data-dswf-ov-bugrow-child="b1"')
    expect(rootChild).toContain('链根')
    expect(rootChild).toContain('10-08')
    expect(rootChild).toContain('已修 c0a1e93') // 短哈希 7 位
    const r1 = sliceRow(markup, 'data-dswf-ov-bugrow-child="b2"')
    expect(r1).toContain('复发①')
    expect(r1).toContain('10-12')
    const r2 = sliceRow(markup, 'data-dswf-ov-bugrow-child="b3"')
    expect(r2).toContain('复发②')
    expect(r2).toContain('10-15')
    expect(r2).not.toContain('已修') // open 态无已修段
  })
})

/** 按 data 锚切单行片段（行间以锚为界——既有测试同款切片法） */
function sliceRow(markup: string, anchor: string): string {
  const at = markup.indexOf(anchor)
  expect(at).toBeGreaterThan(-1)
  const next = markup.indexOf('dswf-ov-item', at + 1)
  return markup.slice(at, next === -1 ? undefined : next)
}

