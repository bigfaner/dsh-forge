// M3.1 D36 结构 pin —— 概览内容面微调六项的 CSS/源面形态语义
// （任务 dsh-forge-m3.1-ui-alignment/1.23 机械面锚——读文件法 = 本目录
//  overview-chips-subtab/d30 先例；apps/web 测试面无 DOM 环境，结构 pin 归此；
//  实机亮/暗双主题走查归证据面 SC-4 扩展。）
// 断言面：
//   ① 提案/feature 子 tab：chips 行底距 + 页容器 gap = 整行高令牌之半（间距 × 0.5——
//      dsw-raw 新裁决刻度，原值整行高令牌对照记于 CSS 头注/行注）；
//   ② 任务列表行距收紧：副行底距 = 整行高之半（行/行间隔 = 副行底 + 次行顶 + 1px）；
//   ③ 泳道列头等高：折叠窄头变体（.is-empty 列头堆叠）退役——空/非空列头同形同高
//      26px 横向头（.is-empty 类位保留 = 列宽 auto 收窄策略，等高为准）；
//   ④ 任务子 tab：chips 行底距 + 列表/泳道视图顶距减半（taskbar 根容器域 scoped 规则
//      + 行顶距/泳道顶距——DAG 顶距随 chips 行底距同 × 0.5）；
//   ⑤ ViewDropdown 零 Tooltip：断言更替非删除——退役锚位 = tests/structure/d30
//      TOOLTIP_RETIRED_FILES（本文件不重复承接，避双做）；
//   ⑥ 任务悬停有意义化：list 行 key/title/sub 与泳道卡 label = taskHoverLabel 接线锚
//      （face 全名兜底 + 非可见位增量注）；DAG 同形位保留原样 = 超长全名兜底记账豁免。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const OV = 'apps/web/src/views/overview'
const overviewCss = readFileSync(join(ROOT, `${OV}/overview.css`), 'utf8')
const proposalCss = readFileSync(join(ROOT, `${OV}/proposal-tab/proposal-tab.css`), 'utf8')
const featureCss = readFileSync(join(ROOT, `${OV}/feature-tab/feature-tab.css`), 'utf8')
const taskCss = readFileSync(join(ROOT, `${OV}/task-tab/task-tab.css`), 'utf8')

/** 整行高令牌之半（D36 ×0.5 裁决刻度——CSS 值断言锚） */
const HALF = 'calc(var(--dsw-font-xs-13-line-height) / 2)'

/** 选择器规则块声明集（平铺 CSS——四文件零 @media/@keyframes 嵌套；多命中取并集；
 * 注释先剥离——规则间头注不入选择器面） */
function declsOf(css: string, selector: string): string {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').split(',').some((s) => s.trim() === selector))
    .map((m) => (m[2] ?? '').replace(/\s+/g, ' ').trim())
    .join('\n')
}

describe('D36 ① 提案/feature 子 tab：chips 行 → 首卡间距减半', () => {
  it.each([
    { face: '五态 chips（提案面）', css: proposalCss, cls: 'dswf-ov-pschips' },
    { face: '阶段 chips（feature 面）', css: featureCss, cls: 'dswf-ov-phchips' },
  ])('$face：行底距 = 整行高之半（shorthand 第三位 = 半令牌——原值整行高行注对照）', ({ css, cls }) => {
    expect(declsOf(css, `.${cls}`), `${cls} 底距减半锚`).toContain(
      `padding: var(--dsw-font-xs-13-line-height) var(--dsw-font-s-14-line-height) ${HALF}`,
    )
  })

  it('页容器 gap = 整行高之半（chips 行 → 首卡间距 = 底距 + gap 同 × 0.5——40px → 20px）', () => {
    const block = declsOf(overviewCss, '.dswf-ov-proposalpage')
    expect(block).toContain(`gap: ${HALF}`)
    // 双页容器共用规则（featurepage 同选择器组——declsOf 多命中并集）
    expect(declsOf(overviewCss, '.dswf-ov-featurepage')).toContain(`gap: ${HALF}`)
  })
})

describe('D36 ④ 任务子 tab：taskbar 七态 chips 行 → 视图顶距减半', () => {
  it('chips 行底距减半（taskbar 根容器域 scoped——提案/feature 页零联动）', () => {
    expect(declsOf(taskCss, '.dswf-tt .dswf-ov-stchips')).toContain(`padding-block-end: ${HALF}`)
  })

  it.each([
    { face: '列表分组标签顶距', selector: '.dswf-tt-group-label' },
    { face: '列表行顶距（首行顶距半程）', selector: '.dswf-tt-row' },
    { face: '泳道视图顶距', selector: '.dswf-tt-swim' },
  ])('$face = 整行高之半（chips 底距 + 视图顶距：40px → 20px）', ({ selector }) => {
    expect(declsOf(taskCss, selector)).toContain(HALF)
  })
})

describe('D36 ② 任务列表行距收紧（副行底距减半——无重叠可辨）', () => {
  it('副行底距 = 整行高之半（shorthand 第三位；行/行间隔 = 副行底 + 次行顶 + 1px 行距刻度：41px → 21px）', () => {
    expect(declsOf(taskCss, '.dswf-tt-sub')).toContain(
      `padding: 0 var(--dsw-font-s-14-line-height) ${HALF}`,
    )
  })
})

describe('D36 ③ 泳道列头等高（折叠窄头变体退役——空/非空列头同形同高）', () => {
  it('折叠窄头堆叠变体零在场（.is-empty 列头/计数覆写退役——原 task-tab.css:379-385/394-396）', () => {
    expect(taskCss).not.toContain('.dswf-tt-col.is-empty .dswf-tt-col-head')
    expect(taskCss).not.toContain('.dswf-tt-col.is-empty .dswf-tt-col-count')
  })

  it('列头 = 恒 26px 横向头（height 26px + 零 column 堆叠——空列同款）', () => {
    const head = declsOf(taskCss, '.dswf-tt-col-head')
    expect(head).toContain('height: 26px')
    expect(head).not.toContain('flex-direction: column')
    expect(head).not.toContain('height: auto')
  })

  it('空列宽策略保留（.is-empty = flex auto 收窄——等高为准，列头形态归共享规则）', () => {
    expect(declsOf(taskCss, '.dswf-tt-col.is-empty')).toContain('flex: 0 0 auto')
  })
})

describe('D36 ⑥ 任务悬停有意义化（label = taskHoverLabel 接线锚——零可见字面复读）', () => {
  const listViewSrc = readFileSync(join(ROOT, `${OV}/task-tab/list-view.tsx`), 'utf8')
  const swimSrc = readFileSync(join(ROOT, `${OV}/task-tab/swimlane-view.tsx`), 'utf8')
  const dagSrc = readFileSync(join(ROOT, `${OV}/task-tab/dag-view.tsx`), 'utf8')

  it('list-view 三位接线：key / title / sub label = taskHoverLabel（face 全名兜底 + 增量注）', () => {
    expect(listViewSrc).toContain('taskHoverLabel(card, key)')
    expect(listViewSrc).toContain('taskHoverLabel(card, card.title)')
    expect(listViewSrc).toContain('taskHoverLabel(card, sub)')
  })

  it('泳道卡接线：键·标题全名兜底 + taskHoverLabel 增量注', () => {
    expect(swimSrc).toMatch(/taskHoverLabel\(card, `\$\{taskKeyLabel\(card\.slug, card\.localId\)\} · \$\{card\.title\}`\)/)
  })

  it('DAG 全名兜底豁免保留（超长标题截断出口——不随本裁决联动）', () => {
    expect(dagSrc).toContain('`${taskKeyLabel(task.slug, task.localId)} · ${task.title}`')
  })
})
