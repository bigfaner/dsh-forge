// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// OverviewHead 单测 —— M3.1 D20（原型十一轮）：展开/收起 = 同一枚按钮同位翻转
// （官方 ChevronDown 旋转标记 + 展开↔收起文案 + aria-expanded）；行内 ghost ▾/▴
// 字符形态退役（否定断言）。默认折叠（项目名）；展开 = forgeDirs 五行目录事实
// （T1-head 裁决 2026-11-23：头无会话统计，状态摘要行已退役——否定断言钉住）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OverviewHead } from './ov-head.js'

const ROWS = [
  { label: '工作区根', value: 'Z:/ws/demo' },
  { label: '.forge 目录', value: 'Z:/ws/demo/.forge' },
  { label: '文档位置', value: 'Z:/ws/demo/.forge/docs' },
  { label: '项目运行产物', value: 'C:/forge-home/demo@a1b2c3d4' },
  { label: 'Worktree根目录', value: 'Z:/ws/demo/.forge/worktrees' },
]

const base = {
  projectName: 'demo',
  rows: ROWS,
  onToggle: () => {},
}

describe('OverviewHead（M3.1 D20 同位翻转钮）', () => {
  it('默认折叠：项目名在场；5 行路径详情缺席；单钮 = chevron + 「展开」文案', () => {
    const markup = renderToStaticMarkup(<OverviewHead {...base} open={false} />)
    expect(markup).toContain('data-dswf-ov-head')
    expect(markup).toContain('demo')
    expect(markup).not.toContain('dswf-ov-info') // 信息块整体缺席（折叠态零信息行）
    expect(markup).toContain('aria-expanded="false"')
    // 单一开关钮（名称行内）：官方 ChevronDown（svg 载体）+ 展开文案
    expect((markup.match(/data-dswf-ov-head-toggle=""/g) ?? []).length).toBe(1)
    expect(markup).toContain('dswf-ov-head-caret')
    expect(markup).toContain('<svg')
    expect(markup).toContain('展开')
    expect(markup).not.toContain('收起')
  })

  it('展开：forgeDirs 5 行目录事实在场 + 同一钮翻转（chevron 旋转标记 + 「收起」文案 + aria-expanded）', () => {
    const markup = renderToStaticMarkup(<OverviewHead {...base} open={true} />)
    expect(markup).toContain('aria-expanded="true"')
    expect((markup.match(/data-dswf-ov-head-toggle=""/g) ?? []).length).toBe(1)
    expect(markup).toContain('dswf-ov-head-caret is-open') // 展开态旋转标记（几何翻转锚）
    expect(markup).toContain('收起')
    expect(markup).not.toContain('展开') // 文案互斥（aria-label/title 的「展开位置详情」亦翻转）
    for (const row of ROWS) {
      expect(markup).toContain(row.label)
      expect(markup).toContain(row.value)
    }
  })

  it('头无会话统计（T1-head 裁决 2026-11-23）：状态摘要行退役——dswf-ov-summary 零残留', () => {
    for (const open of [false, true]) {
      const markup = renderToStaticMarkup(<OverviewHead {...base} open={open} />)
      expect(markup).not.toContain('dswf-ov-summary')
      expect(markup).not.toContain('会话')
      expect(markup).not.toContain('完成')
    }
  })

  it('折叠/展开共享行集（受控组件——open 只翻转 chevron 旋转标记与钮文案，行子树恒在场）', () => {
    const collapsed = renderToStaticMarkup(<OverviewHead {...base} open={false} />)
    const expanded = renderToStaticMarkup(<OverviewHead {...base} open={true} />)
    expect(collapsed).toContain('展开位置详情')
    expect(expanded).toContain('收起位置详情')
    // 项目名恒在场（折叠行 = 常驻子树——同位钮所在行不重建）；名称行内序列恒定：name → toggle
    for (const markup of [collapsed, expanded]) {
      expect(markup).toContain('dswf-ov-head-line')
      expect(markup).toContain('demo')
      expect(markup.indexOf('dswf-ov-name')).toBeLessThan(markup.indexOf('data-dswf-ov-head-toggle'))
    }
  })

  it('钮右对齐（apps/web ov-head 同形——名称行内项目名左、钮右）：toggle 携 is-tail 右对齐锚类', () => {
    for (const open of [false, true]) {
      const markup = renderToStaticMarkup(<OverviewHead {...base} open={open} />)
      expect(markup).toContain('dswf-ov-head-toggle is-tail')
    }
  })

  it('目录行块 = 名称行正下方左对齐（用户红注 2026-11-24——DOM 序：名称行在前、信息块随后；信息块零右贴锚 is-tail）', () => {
    const markup = renderToStaticMarkup(<OverviewHead {...base} open={true} />)
    expect(markup.indexOf('dswf-ov-head-line')).toBeLessThan(markup.indexOf('dswf-ov-info'))
    expect(markup.indexOf('dswf-ov-name')).toBeLessThan(markup.indexOf('dswf-ov-info'))
    const infoChunk = markup.slice(markup.indexOf('dswf-ov-info'))
    expect(infoChunk).not.toContain('is-tail') // is-tail 右贴锚只归名称行 toggle（1.3 不回归）
  })

  it('行内 ghost ▾/▴ 字符形态退役（否定断言——M3.1 D20 裁决）', () => {
    const collapsed = renderToStaticMarkup(<OverviewHead {...base} open={false} />)
    const expanded = renderToStaticMarkup(<OverviewHead {...base} open={true} />)
    for (const markup of [collapsed, expanded]) {
      expect(markup).not.toContain('▾')
      expect(markup).not.toContain('▴')
    }
  })
})
