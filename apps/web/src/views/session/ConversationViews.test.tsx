// ConversationViews 单测 —— 官方 conversation.view roster 占用者族（fix-25）。
// transcriptOfChatSnapshot wire 判别映射 + TranscriptAnchor 订阅面（fix-11 接线自
// WorkbenchPanel 测试族原样迁入）；两视图占用者 SSR 首帧结构（效应面零执行归 e2e）。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ForgeRecallView,
  ForgeTrajectoryView,
  TranscriptAnchor,
  transcriptOfChatSnapshot,
  type ChatSnapshotMirror,
} from './ConversationViews.js'
import { buildTrajectoryLedger } from './transcript.js'

describe('transcriptOfChatSnapshot wire 判别映射（fix-11：装配层锚——views/session README 表）', () => {
  type Legacy = NonNullable<ChatSnapshotMirror['legacy']>
  const chat = (over: Partial<Pick<Legacy, 'nodes' | 'runningCalls' | 'partial'>>): ChatSnapshotMirror => ({
    legacy: { nodes: over.nodes ?? [], runningCalls: over.runningCalls, partial: over.partial },
  })

  it('消息族：user/steering → user-message（content 文本块）；assistant → assistant-message（blocks 文本块）', () => {
    const entries = transcriptOfChatSnapshot(
      chat({
        nodes: [
          { kind: 'user', seq: 1, content: [{ type: 'text', text: '列出文件' }] },
          { kind: 'steering', seq: 2, content: [{ type: 'text', text: '补充：仅根目录' }] },
          { kind: 'assistant', seq: 4, turn: 1, blocks: [{ kind: 'text', text: '共 1 个文件' }] },
        ],
      }),
    )
    expect(entries.map((e) => [e.kind, e.text])).toEqual([
      ['user-message', '列出文件'],
      ['user-message', '补充：仅根目录'],
      ['assistant-message', '共 1 个文件'],
    ])
  })

  it('工具族：tool-result → tool-result（toolName = call.name；截断回落 callId）；runningCalls → tool-running（在途单行）', () => {
    const entries = transcriptOfChatSnapshot(
      chat({
        nodes: [
          { kind: 'tool-result', seq: 2, callId: 'c-1', call: { name: 'knowledge_search' } },
          { kind: 'tool-result', seq: 3, callId: 'c-2', call: null },
        ],
        runningCalls: [{ phase: 'start', name: 'knowledge_read_abstract', callId: 'c-3' }],
      }),
    )
    expect(entries).toEqual([
      { key: 'tool-result:2:c-1', seq: 2, turn: undefined, kind: 'tool-result', toolName: 'knowledge_search' },
      { key: 'tool-result:3:c-2', seq: 3, turn: undefined, kind: 'tool-result', toolName: 'c-2' },
      { key: 'tool-running:c-3', seq: Number.MAX_SAFE_INTEGER - 1, kind: 'tool-running', toolName: 'knowledge_read_abstract' },
    ])
  })

  it('错误/系统族：turn-error（message）/turn-max-tokens → turn-error；context/compaction/unknown/model-retry → system', () => {
    const entries = transcriptOfChatSnapshot(
      chat({
        nodes: [
          { kind: 'turn-error', seq: 5, turn: 1, message: 'provider 5xx' },
          { kind: 'turn-max-tokens', seq: 6, turn: 2 },
          { kind: 'context', seq: 7, content: [{ type: 'text', text: '环境注入' }] },
          { kind: 'compaction', seq: 8, summary: '已压缩 12 条' },
          { kind: 'unknown', seq: 9, type: 'future/event' },
          { kind: 'model-retry', seq: 10 },
        ],
      }),
    )
    expect(entries.map((e) => [e.kind, e.text])).toEqual([
      ['turn-error', 'provider 5xx'],
      ['turn-error', ''],
      ['system', '环境注入'],
      ['system', '已压缩 12 条'],
      ['system', 'future/event'],
      ['system', ''],
    ])
  })

  it('command → command（text = name+args）；partial → assistant-message 尾行（无 seq——MAX_SAFE_INTEGER 让位真实节点）', () => {
    const entries = transcriptOfChatSnapshot(
      chat({
        nodes: [
          { kind: 'command', seq: 2, name: 'compact', args: ' --keep 10' },
          { kind: 'assistant', seq: 3, turn: 1, blocks: [{ kind: 'text', text: '已答' }] },
        ],
        partial: { turn: 2, blocks: [{ kind: 'text', text: '流式中' }] },
      }),
    )
    expect(entries.map((e) => [e.kind, e.text, e.seq])).toEqual([
      ['command', 'compact --keep 10', 2],
      ['assistant-message', '已答', 3],
      ['assistant-message', '流式中', Number.MAX_SAFE_INTEGER],
    ])
  })

  it('未知 wire 判别跳过（fail-soft——上游扩展/形状漂移不炸壳）；空快照 = 空台账', () => {
    expect(transcriptOfChatSnapshot(chat({ nodes: [{ kind: 'future-node', seq: 1 }] }))).toEqual([])
    expect(transcriptOfChatSnapshot({})).toEqual([])
    expect(transcriptOfChatSnapshot({ legacy: {} })).toEqual([])
  })

  it('AC-3 一致性：映射输出经 buildTrajectoryLedger 按 seq 升序成行（user → tool → assistant 交错保序）', () => {
    const entries = transcriptOfChatSnapshot(
      chat({
        nodes: [
          { kind: 'assistant', seq: 4, turn: 1, blocks: [] },
          { kind: 'tool-result', seq: 3, callId: 'c-1', call: { name: 'knowledge_search' } },
          { kind: 'user', seq: 1, content: [] },
        ],
      }),
    )
    const rows = buildTrajectoryLedger(entries)
    expect(rows.map((r) => r.seq)).toEqual([1, 3, 4])
    expect(rows.map((r) => r.kind)).toEqual(['message', 'tool', 'message'])
  })
})

describe('TranscriptAnchor 官方会话装配订阅（fix-11：ChatSnapshot → TranscriptEntry 上抛）', () => {
  it('SSR 渲染期执行钩子读取（selector 经 views.get("chat") 通道）且渲染为 null（效应回调归 e2e）', () => {
    const seen: unknown[] = []
    const chat: ChatSnapshotMirror = {
      legacy: { nodes: [{ kind: 'user', seq: 1, content: [{ type: 'text', text: 'q' }] }] },
    }
    const markup = renderToStaticMarkup(
      <TranscriptAnchor
        hook={(sel) => {
          const value = sel({ views: { get: (target: string) => (target === 'chat' ? chat : undefined) } } as never)
          seen.push(value)
          return value
        }}
        onChange={() => {}}
      />,
    )
    expect(markup).toBe('')
    expect(seen).toEqual([chat])
  })
  it('选择器零派生对象（快照缺席/形状漂移 = undefined——不炸壳）', () => {
    let selected: unknown = 'unset'
    renderToStaticMarkup(
      <TranscriptAnchor
        hook={(sel) => {
          selected = sel(undefined as never)
          return selected
        }}
        onChange={() => {}}
      />,
    )
    expect(selected).toBeUndefined()
  })
})

describe('视图占用者 SSR 首帧（效应面零执行——结构锚在场）', () => {
  it('轨迹视图：pane 锚 + 空台账占位（useConversation 缺席 = 降级空台账）', () => {
    const markup = renderToStaticMarkup(<ForgeTrajectoryView sessionId="s-1" />)
    expect(markup).toContain('data-dswf-pane="trajectory"')
    expect(markup).toContain('暂无轨迹')
  })

  it('召回视图：pane 锚 + 无项目锚静态空态（useWorkspaces/RPC 缺席 = 降级；visible 恒 true 由挂载机制承载）', () => {
    const markup = renderToStaticMarkup(<ForgeRecallView sessionId="s-1" />)
    expect(markup).toContain('data-dswf-pane="recall"')
    expect(markup).toContain('本会话暂无召回')
  })
})
