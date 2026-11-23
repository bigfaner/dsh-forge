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
const OV = 'plugins/project/ui/dock-tabs/overview'
const overviewCss = readFileSync(join(ROOT, `${OV}/overview.css`), 'utf8')

/** 选择器规则块声明集（平铺 CSS——三文件零 @media/@keyframes 嵌套；多命中取并集；
 * 注释先剥离——规则间头注不入选择器面） */
function declsOf(css: string, selector: string): string {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').split(',').some((s) => s.trim() === selector))
    .map((m) => m[2] ?? '')
    .join('\n')
}

describe('D14 状态 chips = 彩色胶囊（矩形 radius-xs 退役）', () => {
  it('七态（任务面）：胶囊 999px + bg-base 承载（radius-xs 退役）', () => {
    const block = declsOf(overviewCss, '.dswf-ov-stchip')
    expect(block, 'dswf-ov-stchip 胶囊半径').toContain('border-radius: 999px')
    expect(block, 'dswf-ov-stchip 灰底承载面').toContain('background: var(--dsw-alias-bg-base)')
    expect(block, 'dswf-ov-stchip 矩形半径退役').not.toContain('var(--dsw-radius-xs)')
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
