// M3.1 D14/D15 结构 pin —— 概览彩色胶囊 chips + 下划线子 tab 的 CSS 形态语义
// （任务 dsh-forge-m3.1-ui-alignment/1.8 机械面锚——P1.1 教训「机械面断言看不见视觉
// 偏差」的补位；读文件法 = 本目录 scaffold/web-shell 先例；apps/web 测试面无 node
// 类型位，结构 pin 归此）。
// 断言面 = 源样式规则块（选择器 → 声明块抽取），非运行时计算样式（实机走查归证据面）。
// DOM 锚不变（TSX 零改动）——e2e/单测既有锚免迁移；令牌映射与 SPEC CONTRADICTION
// 裁决（紫无官方令牌→中性最近语义 / 原型 error-tertiary 死名→danger 软底）见三份 CSS 头注。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const OV = 'apps/web/src/views/overview'
const overviewCss = readFileSync(join(ROOT, `${OV}/overview.css`), 'utf8')
const proposalCss = readFileSync(join(ROOT, `${OV}/proposal-tab/proposal-tab.css`), 'utf8')
const featureCss = readFileSync(join(ROOT, `${OV}/feature-tab/feature-tab.css`), 'utf8')

/** 选择器规则块声明集（平铺 CSS——三文件零 @media/@keyframes 嵌套；多命中取并集；
 * 注释先剥离——规则间头注不入选择器面） */
function declsOf(css: string, selector: string): string {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').split(',').some((s) => s.trim() === selector))
    .map((m) => m[2] ?? '')
    .join('\n')
}

/** 芯片各族激活分色选择器（按钮 data 属性 = 状态钩子——TSX 既有锚） */
const onBlock = (css: string, cls: string, state: string): string =>
  declsOf(css, `.${cls}.is-on[data-${cls}='${state}']`)

describe('D14 状态 chips = 彩色胶囊（矩形 radius-xs 退役）', () => {
  const families = [
    { face: '五态（提案面）', css: proposalCss, cls: 'dswf-ov-pschip' },
    { face: '阶段（feature 面）', css: featureCss, cls: 'dswf-ov-phchip' },
    { face: '七态（任务面）', css: overviewCss, cls: 'dswf-ov-stchip' },
  ] as const

  it.each(families)('$face：胶囊 999px + bg-base 承载（radius-xs 退役）', ({ css, cls }) => {
    const block = declsOf(css, `.${cls}`)
    expect(block, `${cls} 胶囊半径`).toContain('border-radius: 999px')
    expect(block, `${cls} 灰底承载面`).toContain('background: var(--dsw-alias-bg-base)')
    expect(block, `${cls} 矩形半径退役`).not.toContain('var(--dsw-radius-xs)')
  })

  it('五态激活分色：draft=中性三级 / under-review=蓝link / accepted=绿 / rejected=红 / superseded=紫→中性（无官方紫令牌——M3 记账裁决）', () => {
    const cases: ReadonlyArray<[status: string, border: string]> = [
      ['draft', 'var(--dsw-alias-label-tertiary)'],
      ['under-review', 'var(--dsw-alias-link)'],
      ['accepted', 'var(--dsw-alias-state-success-primary)'],
      ['rejected', 'var(--dsw-alias-state-error-primary)'],
      ['superseded', 'var(--dsw-alias-label-secondary)'],
    ]
    for (const [status, border] of cases) {
      expect(onBlock(proposalCss, 'dswf-ov-pschip', status), status).toContain(`border-color: ${border}`)
    }
    // 底色分色抽点：绿=success 软底 / 红=danger 软底（原型 error-tertiary 死名→最近语义）
    expect(onBlock(proposalCss, 'dswf-ov-pschip', 'accepted')).toContain(
      'background: var(--dsw-alias-state-success-tertiary)',
    )
    expect(onBlock(proposalCss, 'dswf-ov-pschip', 'rejected')).toContain(
      'background: var(--dsw-alias-interactive-bg-hover-danger)',
    )
    expect(onBlock(proposalCss, 'dswf-ov-pschip', 'under-review')).toContain(
      'background: var(--dsw-alias-interactive-bg-active)',
    )
  })

  it('阶段激活分色（同胶囊语言）：进行中/设计=蓝 / 需求/已归档=中性 / 任务=紫→中性 / 已完成=绿', () => {
    const cases: ReadonlyArray<[phase: string, border: string]> = [
      ['in-progress', 'var(--dsw-alias-link)'],
      ['design', 'var(--dsw-alias-link)'],
      ['prd', 'var(--dsw-alias-label-tertiary)'],
      ['tasks', 'var(--dsw-alias-label-secondary)'],
      ['completed', 'var(--dsw-alias-state-success-primary)'],
      ['archived', 'var(--dsw-alias-label-tertiary)'],
    ]
    for (const [phase, border] of cases) {
      expect(onBlock(featureCss, 'dswf-ov-phchip', phase), phase).toContain(`border-color: ${border}`)
    }
  })

  it('七态激活 = 单强调色蓝（原型 m31-tchip.on——状态差异由 StateDot 点承载）', () => {
    const block = declsOf(overviewCss, '.dswf-ov-stchip.is-on')
    expect(block).toContain('border-color: var(--dsw-alias-link)')
    expect(block).toContain('color: var(--dsw-alias-link)')
    expect(block).toContain('background: var(--dsw-alias-interactive-bg-active)')
  })
})

describe('D15 三子 tab = 下划线高亮（药丸按钮退役）', () => {
  it('行基线：容器底边框承载下划线锚（原型 ov-subtabs 底 hairline）', () => {
    expect(declsOf(overviewCss, '.dswf-ov-subtabs')).toContain(
      'border-bottom: 1px solid var(--dsw-alias-border-l2)',
    )
  })

  it('active = 主色 link + 字重令牌；药丸 interactive-bg-active 退役', () => {
    const active = declsOf(overviewCss, '.dswf-ov-subtab.is-active')
    expect(active).toContain('color: var(--dsw-alias-link)')
    expect(active).toContain('font: var(--dsw-font-xs-strong-13)')
    expect(active).not.toContain('interactive-bg-active')
  })

  it('下划线 = ::after 底边 2px 主色条（按钮 relative 锚定；hover 零底色——纯文字钮）', () => {
    expect(declsOf(overviewCss, '.dswf-ov-subtab')).toContain('position: relative')
    const after = declsOf(overviewCss, '.dswf-ov-subtab.is-active::after')
    expect(after).toContain('height: 2px')
    expect(after).toContain('background: var(--dsw-alias-link)')
    expect(declsOf(overviewCss, '.dswf-ov-subtab:hover')).not.toContain('background')
  })
})
