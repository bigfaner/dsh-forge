// M3.1 D43 结构 pin —— 任务详情弹窗顶/底高度收紧（标题栏 + 上下内距收一档）
// （任务 dsh-forge-m3.1-ui-alignment/1.30——2026-10-10 用户追加裁决「任务详情的弹框的
//  顶部和底部的高度都小一些」；读文件法 = d36/d38/d44 先例——apps/web 测试面无 DOM 环境，
//  结构 pin 归此；实机亮/暗双主题走查归 walkthrough/D43-drawer-density.md 证据面。）
// 断言面：
//   ① AC-1 拖移标题栏高收紧：.dswf-td-head（:44 规则位——拖移手柄规则）min-height
//      38px → 30px（dsw-raw 新裁决刻度记账）+ 拖移手柄形态零回归（cursor move /
//      touch-action none / 底缘线仍在场——全窗拖移命中面）；
//   ② AC-2 顶部内距收紧：标题栏首块 padding-top 收一档 = 整行高令牌之半（D36 同款
//      收档刻度；DOM 归属核对：.dswf-td-head 单元素双规则在场——:44 拖移规则 + :104
//      通用头部规则同落一元素，本断言落 :104 规则位 padding 首值，头部区行距 gap 零误伤）；
//   ③ AC-3 底部内距收紧：末块（kvstrip）+ 事件行（.dswf-td-ev）+ 脚行（.dswf-td-foot）
//      padding-bottom 各收一档 = 整行高之半（shorthand 末位）；
//   ④ 回归 pin：左右缘拖宽 9px 命中区 / diag toast 锚（脚行顶距耦合位）/ 标题行与简要体
//      内距（D43 scope 外零联动）/ 头部区行距 gap。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const drawerCss = readFileSync(join(ROOT, 'apps/web/src/views/overview/drawer/drawer.css'), 'utf8')

/** 整行高令牌之半（D36 ×0.5 → D43 收档同款刻度——CSS 值断言锚） */
const HALF = 'calc(var(--dsw-font-xs-13-line-height) / 2)'

/** 选择器规则块声明集（平铺 CSS——零 @media/@keyframes 嵌套；多命中取并集——.dswf-td-head
 *  双规则位同断言面；注释先剥离——规则间/行内头注不入选择器面） */
function declsOf(css: string, selector: string): string {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => (m[1] ?? '').split(',').some((s) => s.trim() === selector))
    .map((m) => (m[2] ?? '').replace(/\s+/g, ' ').trim())
    .join('\n')
}

describe('D43 ① 拖移标题栏高收紧（AC-1：min-height < 38px）', () => {
  it('标题栏 min-height = 30px（dsw-raw 新裁决刻度记账——原值 38px 零残留）', () => {
    const head = declsOf(drawerCss, '.dswf-td-head')
    expect(head, '拖移标题栏规则位 min-height 30px').toContain('min-height: 30px')
    expect(head, '原值 38px 对照清零（双规则位并集）').not.toContain('min-height: 38px')
  })

  it('拖移手柄形态零回归：cursor move + touch-action none + 底缘线在场（全窗拖移命中面）', () => {
    const head = declsOf(drawerCss, '.dswf-td-head')
    expect(head, 'cursor move（全窗拖移）').toContain('cursor: move')
    expect(head, 'touch-action none（指针拖移独占）').toContain('touch-action: none')
    expect(head, '标题栏底缘线（顶/底分界可辨）').toContain('border-bottom')
    expect(head, '头部区行距 gap 零误伤（行距仍整行高令牌）').toContain('gap: var(--dsw-font-xs-13-line-height)')
  })
})

describe('D43 ② 顶部内距收紧（AC-2：标题栏首块 padding-top < 原值）', () => {
  it('标题栏 padding-top 收一档 = 整行高之半（:104 规则位 shorthand 首值——水平距与零底距原样）', () => {
    const head = declsOf(drawerCss, '.dswf-td-head')
    expect(head).toContain(`padding: ${HALF} var(--dsw-font-s-14-line-height) 0`)
  })
})

describe('D43 ③ 底部内距收紧（AC-3：末块/事件行/脚行 padding-bottom < 原值）', () => {
  it('kv 标签行（末块）底距收一档（shorthand 第三位 = 半令牌）', () => {
    expect(declsOf(drawerCss, '.dswf-td-kvstrip')).toContain(
      `padding: var(--dsw-font-xs-13-line-height) var(--dsw-font-s-14-line-height) ${HALF}`,
    )
  })

  it('时间线事件行底距收一档（:635 锚位——左缩进原样）', () => {
    expect(declsOf(drawerCss, '.dswf-td-ev')).toContain(`padding: 0 0 ${HALF} var(--dsw-font-l-20-line-height)`)
  })

  it('脚行（弹窗底缘）底距收一档（顶距原样 = diag toast 锚耦合位不动）', () => {
    expect(declsOf(drawerCss, '.dswf-td-foot')).toContain(
      `padding: var(--dsw-font-xs-13-line-height) var(--dsw-font-s-14-line-height) ${HALF}`,
    )
  })
})

describe('D43 ④ 回归 pin（拖宽命中区 / toast 锚 / scope 外零联动）', () => {
  it('左右缘拖宽手柄 9px 命中区零波及（dsw-raw 原型手柄宽刻度原样）', () => {
    expect(declsOf(drawerCss, '.dswf-td-resize')).toContain('width: 9px')
  })

  it('diag toast 底缘锚零漂移（脚行顶距 = 整行高耦合——bottom: calc(100% - 整行高) 原样）', () => {
    expect(declsOf(drawerCss, '.dswf-td-foot .dswf-tt-diagtoast')).toContain(
      'bottom: calc(100% - var(--dsw-font-xs-13-line-height))',
    )
  })

  it('标题行内距零联动（D43 scope 外——标题栏下首内容块行语言原样）', () => {
    expect(declsOf(drawerCss, '.dswf-td-title')).toContain(
      'padding: var(--dsw-font-xs-13-line-height) var(--dsw-font-s-14-line-height) 0',
    )
  })

  it('简要体内距零联动（D43 scope 外——四行概要行语言原样）', () => {
    expect(declsOf(drawerCss, '.dswf-td-brief')).toContain(
      'padding: var(--dsw-font-xs-13-line-height) var(--dsw-font-s-14-line-height)',
    )
  })
})
