// ConversationViews 单测 —— 官方 conversation.view roster 占用者族（fix-25/fix-29）。
// fix-29：轨迹 tab = 官方 'trajectory' 直用——ForgeTrajectoryView/TranscriptAnchor/
// transcriptOfChatSnapshot 随产品复刻退役（wire 判别映射测试随之退役；官方轨迹表数据
// 管线归官方 ui-trajectory 自证）。保留面 = 召回视图占用者 SSR 首帧结构（效应面零执行归 e2e）。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ForgeRecallView } from './ConversationViews.js'

describe('视图占用者 SSR 首帧（效应面零执行——结构锚在场）', () => {
  it('召回视图：pane 锚 + 无项目锚静态空态（useWorkspaces/RPC 缺席 = 降级；visible 恒 true 由挂载机制承载）', () => {
    const markup = renderToStaticMarkup(<ForgeRecallView sessionId="s-1" />)
    expect(markup).toContain('data-dswf-pane="recall"')
    expect(markup).toContain('本会话暂无召回')
  })
})
