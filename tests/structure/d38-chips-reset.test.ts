// M3.1 D38 结构 pin —— 清过滤钮改词「✕ 重置」+ 钮前间距与 chips 行内拉开
// （任务 dsh-forge-m3.1-ui-alignment/1.25 机械面锚——读文件法 = 本目录 d36 先例；
//  文案 DOM 断言归三组件测试面 + proposal-tab/feature-tab tab 锚（✕ 重置 + 渲染面
//  「清过滤」清零）；实机亮/暗双主题走查归证据面——本裁决间距为物理定值，主题令牌
//  零涉及，双主题同形。）
// 断言面：
//   ① 三族 chips 行内 gap 保持 6px（原型刻度原值——不随 D38 联动）；
//   ② 清过滤钮 margin-inline-start = 8px（dsw-raw 新裁决刻度，原始行豁免注记记账——
//      行 gap 6px + 钮前 8px = 视距 14px 执行期定值）；
//   ③ D38 裁决口径机械编码：钮前视距 > 行内 chip 间距。
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
    .map((m) => (m[2] ?? '').replace(/\s+/g, ' ').trim())
    .join('\n')
}

const ROW_GAP_PX = 6 // 原型 chips 行距刻度（dsw-raw 既有——本裁决不动）
const CLEAR_MARGIN_PX = 8 // D38 新裁决刻度（行 gap 6 + 钮前 8 = 视距 14px）

/** 三族 chips（行容器 + 清过滤钮选择器——三面同形，文案/间距裁决三族同步） */
const families = [
  { face: '七态（任务/概览面）', css: overviewCss, row: 'dswf-ov-stchips', clear: 'dswf-ov-stchip-clear' },
  { face: '五态（提案面）', css: proposalCss, row: 'dswf-ov-pschips', clear: 'dswf-ov-pschip-clear' },
  { face: '阶段（feature 面）', css: featureCss, row: 'dswf-ov-phchips', clear: 'dswf-ov-phchip-clear' },
] as const

describe('D38 清过滤钮：钮前间距与 chips 行内拉开（行 gap 6px 不动 + 钮前 margin）', () => {
  it.each(families)('$face：行内 gap 保持 6px（原型刻度原值——不随本裁决联动）', ({ css, row }) => {
    expect(declsOf(css, `.${row}`)).toContain(`gap: ${ROW_GAP_PX}px`)
  })

  it.each(families)('$face：清过滤钮 margin-inline-start = 8px（dsw-raw 新裁决刻度原始行记账）', ({ css, clear }) => {
    expect(declsOf(css, `.${clear}`)).toContain(`margin-inline-start: ${CLEAR_MARGIN_PX}px`)
    // 豁免判据取原始行（注释剥离面不判豁免——lint-tokens 同口径）
    expect(
      css
        .split('\n')
        .some((l) => l.includes(`margin-inline-start: ${CLEAR_MARGIN_PX}px`) && /dsw-raw/.test(l)),
      `${clear} dsw-raw 豁免注记`,
    ).toBe(true)
  })

  it.each(families)('$face：钮前视距 14px > 行内 chip 间距 6px（D38 裁决口径——执行期定值）', ({ css, row, clear }) => {
    const gap = Number(declsOf(css, `.${row}`).match(new RegExp(`gap: (\\d+(?:\\.\\d+)?)px`))?.[1])
    const margin = Number(
      declsOf(css, `.${clear}`).match(new RegExp(`margin-inline-start: (\\d+(?:\\.\\d+)?)px`))?.[1],
    )
    expect(gap + margin).toBeGreaterThan(gap)
    expect(gap + margin).toBe(ROW_GAP_PX + CLEAR_MARGIN_PX)
  })
})
