// views/session/SessionPanel 组件单测 —— UF-4 会话面板三 tab 机制。
// 断言锚点 = 任务 2.11 AC-1（对话面注入位——官方会话面经装配注入）/ AC-2+AC-3（轨迹台账
// 数据面：转录条目按序成行）/ AC-4（三 pane 常挂载 keep-alive：切换仅 hidden 不卸载）/
// AC-5（召回占位空态 + 注入接线位）。渲染面用 react-dom/server（SSR 直渲，沿 zones/ 模式）；
// 点击切换与状态保持（草稿/滚动）实机面归 e2e（2.12 装配 + 2.14 冒烟 + dogfood）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionPanel, type SessionPanelProps } from './SessionPanel.js'
import type { TranscriptEntry } from './transcript.js'

/** 恢复链路样本（AC-2：打开既有会话——转录全量成行） */
const transcript: readonly TranscriptEntry[] = [
  { key: 'u1', seq: 1, kind: 'user-message', text: '查一下部署脚本', turn: 1 },
  { key: 't1', seq: 2, kind: 'tool-started', toolName: 'knowledge.search', turn: 1 },
  { key: 't2', seq: 3, kind: 'tool-result', toolName: 'knowledge.search', turn: 1 },
  { key: 'a1', seq: 4, kind: 'assistant-message', text: '部署脚本在 scripts/deploy.mjs', turn: 1 },
  { key: 'e1', seq: 5, kind: 'system', text: '上下文已压缩', turn: 2 },
  { key: 'x1', seq: 6, kind: 'turn-error', text: '回合中止', turn: 2 },
]

const render = (over: Partial<SessionPanelProps> = {}): string =>
  renderToStaticMarkup(<SessionPanel chatSurface={<b data-t="chat" />} transcript={transcript} {...over} />)

/** 取指定 tab pane 的起始标签（含属性，供 hidden 断言；沿 zones 测试 sectionTag 模式） */
const paneTag = (markup: string, pane: 'chat' | 'trajectory' | 'recall'): string => {
  const matched = markup.match(new RegExp(`<div[^>]*data-dswf-pane="${pane}"[^>]*>`))
  expect(matched, `pane ${pane} 缺席（keep-alive 破坏）`).not.toBeNull()
  return matched?.[0] ?? ''
}

describe('SessionPanel 三 tab 容器（UF-4）', () => {
  it('tab 条 = 官方 SegmentedTabs 三签（对话/轨迹/知识召回），aria 接线 tab→tabpanel', () => {
    const markup = render()
    expect(markup).toContain('对话')
    expect(markup).toContain('轨迹')
    expect(markup).toContain('知识召回')
    expect(markup).toContain('id="dswf-session-tab-chat"')
    const chatPane = paneTag(markup, 'chat')
    expect(chatPane).toContain('id="dswf-session-pane-chat"')
    expect(chatPane).toContain('aria-labelledby="dswf-session-tab-chat"')
    expect(chatPane).toContain('role="tabpanel"')
  })

  it('AC-4 keep-alive：默认对话激活——三 pane 同时在场，非激活仅 hidden（不卸载即不重置）', () => {
    const markup = render()
    expect(paneTag(markup, 'chat')).not.toContain('hidden')
    expect(paneTag(markup, 'trajectory')).toContain('hidden')
    expect(paneTag(markup, 'recall')).toContain('hidden')
  })

  it('defaultTab 覆盖：初始激活轨迹——chat/recall hidden，轨迹可见', () => {
    const markup = render({ defaultTab: 'trajectory' })
    expect(paneTag(markup, 'chat')).toContain('hidden')
    expect(paneTag(markup, 'trajectory')).not.toContain('hidden')
    expect(paneTag(markup, 'recall')).toContain('hidden')
  })

  it('AC-1 对话面注入位：chatSurface 内容落在对话 pane（官方会话面经装配注入，面板零自绘）', () => {
    const markup = render()
    expect(markup).toContain('<b data-t="chat"></b>')
  })

  it('fix-9 toolbar 注入位：toolbar 内容渲染于页签行之上（缺省 = 无 toolbar 行，非壳载体最简面）', () => {
    const withToolbar = render({ toolbar: <i data-t="toolbar" /> })
    expect(withToolbar).toContain('<i data-t="toolbar"></i>')
    expect(withToolbar.indexOf('data-t="toolbar"')).toBeLessThan(withToolbar.indexOf('dswf-session-tabs'))
    // 缺省面：无 toolbar 行——三页签形态与既有断言面零变化（Hard Rule 未点名元素保持不变）
    expect(render()).not.toContain('data-t="toolbar"')
  })

  it('AC-2/AC-3 轨迹台账：转录条目按 seq 时序全量成行（消息/工具/事件/错误四类行齐备）', () => {
    const markup = render()
    expect(markup).toContain('role="list"')
    expect(markup).toContain('aria-label="执行台账"')
    expect(markup).toContain('data-dswf-traj-row="message"')
    expect(markup).toContain('data-dswf-side="user"')
    expect(markup).toContain('data-dswf-side="assistant"')
    expect(markup).toContain('data-dswf-traj-row="tool"')
    expect(markup).toContain('data-dswf-traj-row="event"')
    expect(markup).toContain('data-dswf-traj-row="error"')
    expect(markup).toContain('回合中止')
    expect(markup).toContain('knowledge.search')
    expect(markup).toContain('查一下部署脚本')
    expect(markup).toContain('部署脚本在 scripts/deploy.mjs')
  })

  it('AC-5 召回占位：缺省 = EmptyState「本会话暂无召回」（3.8 接线前 P1 文案）', () => {
    const markup = render()
    expect(markup).toContain('本会话暂无召回')
  })

  it('AC-5 召回接线位：recall 注入内容替代占位（3.8 forge:knowledge/sessionRecall 接入面）', () => {
    const markup = render({ recall: <ul data-t="recall" /> })
    expect(markup).toContain('data-t="recall"')
    expect(markup).not.toContain('本会话暂无召回')
  })

  it('转录缺席（新会话）：轨迹 pane 空态呈现（台账空态，不炸）', () => {
    const markup = render({ transcript: undefined })
    expect(markup).toContain('暂无轨迹')
  })
})
