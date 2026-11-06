// KnowledgeCardGrid 单测 —— UF-6 卡片网格 + 主体四态（AC2/AC3/AC4）。
// AC3：卡片字段 frontmatter 驱动 + 热度徽章 = card.heat 原样（使用事件计数——UI 零再推导）。
import { describe, expect, it } from 'vitest'
// @ts-expect-error —— web tsconfig types 仅 vite/client；node:fs 仅测试内读取样式表源文
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { KnowledgeCard } from '@dsh-forge/contracts'
import { KnowledgeCardGrid, isEntryConfirmable } from './KnowledgeCardGrid.js'

const NOW = Date.parse('2026-10-02T12:00:00.000Z')

const CARDS: readonly KnowledgeCard[] = [
  {
    entryId: 1,
    title: '安全编码规范',
    summary: '输入校验与输出编码基线',
    keywords: ['安全', 'xss', '注入', '编码', '第五个超限'],
    status: 'draft',
    domainPath: '前端',
    updated: '2026-10-02T09:00:00.000Z',
    heat: 7,
  },
  {
    entryId: 2,
    title: '网关限流手册',
    summary: '令牌桶参数与降级顺序',
    keywords: ['限流'],
    status: 'published',
    domainPath: '',
    updated: '2026-10-01T12:00:00.000Z',
    heat: 0,
  },
]

describe('KnowledgeCardGrid 卡片态', () => {
  it('AC3 frontmatter 字段驱动：标题/摘要/关键词 chip/状态/时间 + 热度徽章 = heat 原样计数', () => {
    const markup = renderToStaticMarkup(<KnowledgeCardGrid state="cards" cards={CARDS} now={NOW} />)
    expect(markup).toContain('data-dswf-kn-cards')
    expect(markup).toContain('安全编码规范')
    expect(markup).toContain('输入校验与输出编码基线')
    expect(markup).toContain('#xss')
    expect(markup).toContain('draft')
    expect(markup).toContain('published')
    // J1 热度徽章：火焰图标 + 数字（= 使用事件计数——AC 断言口径：渲染值即 card.heat，零 emoji）
    expect(markup).toContain('data-dswf-kn-card-heat')
    expect(markup.match(/data-dswf-kn-card-heat/g)?.length).toBe(2)
    expect(markup).not.toContain('🔥')
    // J2 域足迹（根域显示「根」）+ 创建时间短标签（{时长}创建）
    expect(markup).toContain('前端')
    expect(markup).toContain('根')
    expect(markup).toContain('3 小时前创建')
    // e2e/详情锚
    expect(markup).toContain('data-dswf-entry="1"')
    expect(markup).toContain('data-dswf-entry="2"')
  })

  it('SC-J J2 底行重排：域(左) · spacer · 中文状态 chip · 创建时间（右端锚定序）', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeCardGrid state="cards" cards={UNCONFIRMED} now={NOW} onEntryConfirm={() => {}} />,
    )
    // 中文状态 chip（零英文）：已确认 / 待审核
    expect(markup).toContain('已确认')
    expect(markup).toContain('待审核')
    // 结构序：域 → spacer → chip → 创建时间
    const footAt = markup.indexOf('dswf-kn-card-foot')
    const domAt = markup.indexOf('dswf-kn-card-dom', footAt)
    const spacerAt = markup.indexOf('dswf-kn-card-spacer', footAt)
    const chipAt = markup.indexOf('dswf-kn-card-status', footAt)
    const timeAt = markup.indexOf('data-dswf-kn-card-created', footAt)
    expect(domAt).toBeGreaterThan(-1)
    expect(spacerAt).toBeGreaterThan(domAt)
    expect(chipAt).toBeGreaterThan(spacerAt)
    expect(timeAt).toBeGreaterThan(chipAt)
    // 热度徽章不再在底行（标题行右端——SC-J 终稿）
    const heatAt = markup.indexOf('data-dswf-kn-card-heat')
    expect(heatAt).toBeGreaterThan(-1)
    expect(heatAt).toBeLessThan(footAt)
  })

  it('SC-J J1/J2 悬浮口径：热度与创建时间用官方 Tooltip（零原生 title）', () => {
    const css = readFileSync(new URL('./knowledge.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.dswf-kn-card-heat\s*\{[^}]*height:\s*24px/)
    expect(css).toMatch(/\.dswf-kn-card-heat\s*\{[^}]*translateY\(-5px\)/)
  })

  it('SC-J J3/J4 回执 toast：receipt 缺席零出场；在场 = 官方 Toast 挂载位（portal 面——renderToStaticMarkup 不展开，运行时归 e2e）', () => {
    const without = renderToStaticMarkup(<KnowledgeCardGrid state="cards" cards={UNCONFIRMED} now={NOW} />)
    // 官方 Toast = body portal（document 依赖）——node 静态渲染面仅断言缺席零出场
    expect(without).not.toContain('dswf-kn-card-heat-check')
    expect(without).not.toContain('role="status" data-dswf-kn-toast')
  })

  it('关键词 chip 上限 4（原型刻度——第五个不渲染）', () => {
    const markup = renderToStaticMarkup(<KnowledgeCardGrid state="cards" cards={CARDS} now={NOW} />)
    expect(markup).toContain('#注入')
    expect(markup).not.toContain('第五个超限')
  })
})

describe('KnowledgeCardGrid 四态', () => {
  it('AC4 骨架态：占位网格（data-dswf-kn-skeleton），无卡片内容', () => {
    const markup = renderToStaticMarkup(<KnowledgeCardGrid state="skeleton" cards={[]} now={NOW} />)
    expect(markup).toContain('data-dswf-kn-skeleton')
    expect(markup).toContain('dswf-kn-skeleton-card')
    expect(markup).not.toContain('dswf-kn-card"')
  })

  it('AC2 过滤无结果：空结果提示 + 清除过滤入口（data-dswf-clear-filters）', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeCardGrid state="no-results" cards={[]} now={NOW} onClearFilters={() => {}} />,
    )
    expect(markup).toContain('无匹配知识')
    expect(markup).toContain('data-dswf-clear-filters')
    expect(markup).toContain('清除过滤')
  })

  it('AC4 空库引导：说明知识目录位置（knowledgeDir 路径入文案）；目录未就绪回退通用文案', () => {
    const withDir = renderToStaticMarkup(
      <KnowledgeCardGrid state="empty-library" cards={[]} now={NOW} knowledgeDir="Z:/ws/demo/.knowledge" />,
    )
    expect(withDir).toContain('尚无知识')
    expect(withDir).toContain('Z:/ws/demo/.knowledge')

    const withoutDir = renderToStaticMarkup(
      <KnowledgeCardGrid state="empty-library" cards={[]} now={NOW} knowledgeDir={null} />,
    )
    expect(withoutDir).toContain('知识目录放入带 frontmatter')
    expect(withoutDir).not.toContain('Z:/ws')
  })

  it('错误态三态映射：error-bar → 错误条 + 重试；empty-state → 不可用空态（typed 文案透传）', () => {
    const bar = renderToStaticMarkup(
      <KnowledgeCardGrid
        state="error"
        cards={[]}
        now={NOW}
        errorMessage="通道未注册"
        errorUiState="error-bar"
        onRetry={() => {}}
      />,
    )
    expect(bar).toContain('data-dswf-kn-error')
    expect(bar).toContain('知识加载失败：通道未注册')
    expect(bar).toContain('重试')

    const unavailable = renderToStaticMarkup(
      <KnowledgeCardGrid
        state="error"
        cards={[]}
        now={NOW}
        errorMessage="知识目录不可达"
        errorUiState="empty-state"
        onRetry={() => {}}
      />,
    )
    expect(unavailable).toContain('知识暂不可用')
    expect(unavailable).toContain('知识目录不可达')
    expect(unavailable).toContain('data-dswf-kn-retry')
  })

  it('错误态回调缺席分支：无重试钮（错误条/不可用空态均然）；不可用态无文案回退通用句', () => {
    const bar = renderToStaticMarkup(
      <KnowledgeCardGrid state="error" cards={[]} now={NOW} errorUiState="error-bar" />,
    )
    expect(bar).toContain('知识加载失败')
    expect(bar).not.toContain('重试')
    const fallback = renderToStaticMarkup(
      <KnowledgeCardGrid state="error" cards={[]} now={NOW} errorUiState="empty-state" />,
    )
    expect(fallback).toContain('知识暂不可用')
    expect(fallback).toContain('索引不可用，稍后自动恢复')
  })
})

const UNCONFIRMED: readonly KnowledgeCard[] = [
  { ...CARDS[0]!, status: 'unconfirmed' },
  { ...CARDS[1]!, status: 'confirmed' },
]

describe('SC-F3 多选 checkbox（卡片右端与标题同行）', () => {
  it('F3 多选模式：官方 Checkbox 在卡片右端（data-dswf-kn-card-check + input[type=checkbox]）', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeCardGrid state="cards" cards={UNCONFIRMED} now={NOW} multiSelect selectedEntryIds={[1]} onToggleSelect={() => {}} />,
    )
    expect(markup.match(/data-dswf-kn-card-check/g)?.length).toBe(2)
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('checked')
  })

  it('F3 视觉面契约：sr-only 只收口 label 文本 span——官方 Checkbox 勾选框本体（input 16×16）可见（bug cfad7c63 反证：整件视觉隐藏 rect 0×0）', () => {
    const css = readFileSync(new URL('./knowledge.css', import.meta.url), 'utf8')
    const rules: readonly string[] = css.match(/\.dswf-kn-card-check [^{]+\{[^}]*\}/g) ?? []
    // sr-only 规则必须落在 span（label 文本）上，不得落在 .dswf-kn-check 根（label=勾选框载体）
    const srOnly = rules.find((rule) => rule.includes('clip-path: inset(50%)'))
    expect(srOnly, 'sr-only 规则应在场（可访问名保留手段）').toBeTruthy()
    expect(srOnly).toContain('.dswf-kn-check span')
    // 勾选框本体与 input 不得被压缩/隐藏
    for (const rule of rules) {
      if (rule.includes('span')) continue
      expect(rule).not.toMatch(/width|height|clip-path|position:\s*absolute/)
    }
  })

  it('F3 非多选模式反向断言：checkbox DOM 不在场', () => {
    const markup = renderToStaticMarkup(<KnowledgeCardGrid state="cards" cards={UNCONFIRMED} now={NOW} />)
    expect(markup).not.toContain('data-dswf-kn-card-check')
    expect(markup).not.toContain('type="checkbox"')
  })

  it('isEntryConfirmable：仅 unconfirmed 可通过（confirmed/superseded 只读——可点性与状态同源）', () => {
    expect(isEntryConfirmable('unconfirmed')).toBe(true)
    expect(isEntryConfirmable('confirmed')).toBe(false)
    expect(isEntryConfirmable('superseded')).toBe(false)
  })
})

describe('SC 卡片 chip 可点态（快速通过入口）', () => {
  it('unconfirmed 卡片 chip 可点（data-dswf-kn-chip-confirm 锚 + aria-label 点击通过）；confirmed 只读无锚', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeCardGrid state="cards" cards={UNCONFIRMED} now={NOW} onEntryConfirm={() => {}} />,
    )
    expect(markup.match(/data-dswf-kn-chip-confirm/g)?.length).toBe(1)
    expect(markup).toContain('aria-label="点击通过"')
  })

  it('onEntryConfirm 缺席 = chip 全体只读（无可点锚）', () => {
    const markup = renderToStaticMarkup(<KnowledgeCardGrid state="cards" cards={UNCONFIRMED} now={NOW} />)
    expect(markup).not.toContain('data-dswf-kn-chip-confirm')
  })
})
