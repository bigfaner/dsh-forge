// M3.1 D44 结构 pin —— 三族状态筛选 chips 固定统一宽 + 内容居中 + 横向 padding 收窄
// （任务 dsh-forge-m3.1-ui-alignment/1.31 机械面锚——读文件法 = 本目录 d36/d38 先例；
//  apps/web 测试面无 DOM 环境（jsdom 零布局引擎），AC「DOM 实测同类宽一致 / 总宽较原
//  最长 auto 宽收紧走查对照」归实机亮/暗双主题走查证据面 SC-4 扩展——本 pin 以 CSS
//  width 同值断言承载机械面。）
// 断言面：
//   ① 三族状态 chip（.dswf-ov-stchip 七态 / .dswf-ov-pschip 五态 / .dswf-ov-phchip 阶段）
//      固定统一宽 78px（执行期定值：3 字 label 39 + 点 8 + 两位计数 ~15 + 内距 12 = ~74
//      紧凑容纳 + 余量；渲染总宽 84px = 78 内容 + 2×2 padding + 2×1 边框，较原最长 auto
//      宽 ~116px 收紧——72–84px 档顶）；三族 width 声明同值零漂移（平行类互指注记——
//      共享类收敛退役：TSX 类名面零改动，平行结构沿 D14/D38 先例）；
//   ② 内容居中：justify-content: center（固定宽下 3 字 + 点 + 两位计数不截断——零
//      overflow:hidden / 零 text-overflow 引入；inline-flex 默认 nowrap 零换行）；
//   ③ 横向 padding 收窄档 0 2px（dsw-raw 新裁决刻度原始行记账——原值整行高令牌 0 13px
//      对照：固定宽居中下仅溢出护栏，auto 宽形制横向 padding 随之退役）；
//   ④ chip 内点/字/计距收窄 6px（dsw-raw 新裁决刻度原始行记账——与行 gap 6px 同刻度；
//      原值整行高令牌对照——档位紧凑容纳的机械前提）；
//   ⑤ 「✕ 重置」钮（D38）非状态标签不参与等长：-clear 规则 width: auto 显式退役等宽 +
//      原 auto 宽形制 padding（0 整行高令牌）保持——D38 钮形制零回归；
//   ⑥ 既有裁决零联动面（行 gap 6px / 清钮 margin 8px / 胶囊 999 / 激活分色）= d38、
//      d36、overview-chips-subtab 既有 pin 承接——本文件不重复（避双做）。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const OV = 'apps/web/src/views/overview'
const overviewCss = readFileSync(join(ROOT, `${OV}/overview.css`), 'utf8')
const proposalCss = readFileSync(join(ROOT, `${OV}/proposal-tab/proposal-tab.css`), 'utf8')
const featureCss = readFileSync(join(ROOT, `${OV}/feature-tab/feature-tab.css`), 'utf8')

/** D44 执行期定值：三族状态 chip 固定统一宽（渲染总宽 84px——72–84px 档顶） */
const CHIP_WIDTH_PX = 78
/** D44 横向 padding 收窄档（dsw-raw 新裁决刻度——固定宽居中下仅溢出护栏） */
const GUARD_PADDING = 'padding: 0 2px'
/** D44 chip 内点/字/计距收窄（dsw-raw 新裁决刻度——与行 gap 6px 同刻度） */
const INNER_GAP = 'gap: 6px'

/** 选择器首条规则块原文（含行注——dsw-raw 豁免记账取原始行，lint-tokens 同口径） */
function blockOf(css: string, selector: string): string {
  const pat = `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`
  return css.match(new RegExp(pat))?.[1] ?? ''
}

/** 规则块声明面（注释剥离 + 空白折叠——形态断言取声明本体） */
const declsOfBlock = (block: string): string =>
  block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()

/** 三族状态 chip（base 规则 + 清过滤钮——D44 等长族与豁免族同载；peers = 互指注记对象） */
const families = [
  {
    face: '七态（任务/概览面）',
    css: overviewCss,
    chip: 'dswf-ov-stchip',
    clear: 'dswf-ov-stchip-clear',
    peers: ['dswf-ov-pschip', 'dswf-ov-phchip'],
  },
  {
    face: '五态（提案面）',
    css: proposalCss,
    chip: 'dswf-ov-pschip',
    clear: 'dswf-ov-pschip-clear',
    peers: ['dswf-ov-stchip', 'dswf-ov-phchip'],
  },
  {
    face: '阶段（feature 面）',
    css: featureCss,
    chip: 'dswf-ov-phchip',
    clear: 'dswf-ov-phchip-clear',
    peers: ['dswf-ov-stchip', 'dswf-ov-pschip'],
  },
] as const

describe('D44 ① 三族状态 chip 固定统一宽（同值零漂移——原 auto 宽内容自适应退役）', () => {
  it.each(families)(
    '$face：width = 78px（dsw-raw 新裁决刻度原始行记账 + 原值对照 + 三族互指注记）',
    ({ css, chip, peers }) => {
      const block = blockOf(css, `.${chip}`)
      expect(declsOfBlock(block), `${chip} 固定统一宽`).toContain(`width: ${CHIP_WIDTH_PX}px`)
      const widthLine = block.split('\n').find((l) => l.includes(`width: ${CHIP_WIDTH_PX}px`)) ?? ''
      expect(widthLine, `${chip} width 行 dsw-raw 豁免记账`).toMatch(/dsw-raw/)
      expect(widthLine, `${chip} width 行原值对照注记`).toMatch(/原/)
      for (const peer of peers) {
        expect(widthLine, `${chip} width 行互指注记 → ${peer}`).toContain(peer)
      }
    },
  )

  it('三族 width 声明并集 = {78px}（同值零漂移机械锚——三处规则一值）', () => {
    const widths = families.map(
      ({ css, chip }) =>
        declsOfBlock(blockOf(css, `.${chip}`)).match(new RegExp('width: (\\d+)px'))?.[1],
    )
    expect(new Set(widths)).toEqual(new Set([String(CHIP_WIDTH_PX)]))
  })
})

describe('D44 ② 内容居中不截断（3 字 + 点 + 两位计数——零截断机械面）', () => {
  it.each(families)('$face：justify-content: center + 零 ellipsis/零 overflow:hidden 引入', ({ css, chip }) => {
    const decls = declsOfBlock(blockOf(css, `.${chip}`))
    expect(decls, `${chip} 内容居中`).toContain('justify-content: center')
    expect(decls, `${chip} 零 overflow 截断`).not.toMatch(/overflow\s*:\s*hidden/)
    expect(decls, `${chip} 零 ellipsis`).not.toMatch(/text-overflow/)
  })
})

describe('D44 ③④ 横向 padding 收窄档 + chip 内距收窄（dsw-raw 新裁决刻度记账）', () => {
  it.each(families)('$face：padding 0 2px 收窄档（原始行 dsw-raw + 原值整行高令牌对照）', ({ css, chip }) => {
    const block = blockOf(css, `.${chip}`)
    expect(declsOfBlock(block), `${chip} 横向收窄档`).toContain(GUARD_PADDING)
    const paddingLine = block.split('\n').find((l) => l.includes(GUARD_PADDING)) ?? ''
    expect(paddingLine, `${chip} padding 行 dsw-raw 豁免记账`).toMatch(/dsw-raw/)
    expect(paddingLine, `${chip} padding 行原值对照注记`).toMatch(/原值/)
  })

  it.each(families)('$face：chip 内点/字/计距 6px（原始行 dsw-raw——与行 gap 同刻度）', ({ css, chip }) => {
    const block = blockOf(css, `.${chip}`)
    expect(declsOfBlock(block), `${chip} 内距收窄`).toContain(INNER_GAP)
    const gapLine = block.split('\n').find((l) => l.includes(INNER_GAP)) ?? ''
    expect(gapLine, `${chip} gap 行 dsw-raw 豁免记账`).toMatch(/dsw-raw/)
  })
})

describe('D44 ⑤ 「✕ 重置」钮非状态标签——不参与等长（D38 钮形制零回归）', () => {
  it.each(families)('$face：-clear width auto + 原 auto 宽形制 padding 保持', ({ css, clear }) => {
    const decls = declsOfBlock(blockOf(css, `.${clear}`))
    expect(decls, `${clear} 等长豁免显式锚`).toContain('width: auto')
    expect(decls, `${clear} 钮形制 padding 保持`).toContain(
      'padding: 0 var(--dsw-font-xs-13-line-height)',
    )
  })
})
