// 1.19 循环卡与文档阅读 e2e 探针入口（走查取证构建用）：
// 真组件 createChatView（fake api 历史馈送循环卡/叙述卡/文档卡全家桶）+
// createReader 阅读页（fake rpc = forge:proxy/file manifest+单块）。
// window.__probe 钩子供 spec 驱动（openDoc/closeReader）。
import type { OfficialApi } from '../../apps/mobile/src/core/api.ts'
import type { RemoteRpc, RpcResult } from '../../apps/mobile/src/core/rpc.ts'
import { createChatView } from '../../apps/mobile/src/views/chat.ts'
import { createReader, type ReaderHandle } from '../../apps/mobile/src/views/reader.ts'
import type { WireEvent } from '../../apps/mobile/src/core/wire.ts'

const DOC_MD = [
  '# 走查报告',
  '',
  '循环卡家族与文档阅读批次交付说明，含表格与图。',
  '',
  '| 阶段 | 状态 |',
  '| --- | --- |',
  '| 循环卡 | 完成 |',
  '| 阅读页 | 完成 |',
  '',
  '```mermaid',
  'flowchart TD',
  'A[循环卡] --> B[阅读页]',
  '```',
  '',
  '结尾段落。',
].join('\n')
const DOC_CSV = '阶段,状态\n循环卡,完成\n阅读页,完成'
const DOC_TXT = '纯文本样例行一\n纯文本样例行二'

const FILES: { description?: string; path: string; size: number; body: string }[] = [
  { description: '走查报告（md）', path: 'Z:/ws/walkthrough-report.md', size: 6349, body: DOC_MD },
  { path: 'Z:/ws/task-ledger.csv', size: 18432, body: DOC_CSV },
  { path: 'Z:/ws/harness-excerpt.txt', size: 2150, body: DOC_TXT },
]

const entries: WireEvent[] = [
  {
    type: 'user/message',
    seq: 1,
    time: 1,
    data: {
      content: [{ type: 'text', text: '接续未完成任务：1.12 抽屉双级未读（同 runId 旧叙述 → 退化 chip）' }],
      source: { kind: 'forge-loop', runId: 'run-r1', state: 'followup' },
    },
  },
  {
    type: 'forge/progress',
    seq: 2,
    time: 2,
    data: { sourceSlug: 'mobile-ui', verb: 'claim', status: 'running', taskKey: '1.19', counts: { pending: 2, running: 1, done: 3 } },
  },
  {
    type: 'user/message',
    seq: 3,
    time: 3,
    data: {
      content: [{ type: 'text', text: '派发任务：1.19 循环卡与文档阅读（同 runId 最新叙述 → 完整卡）' }],
      source: { kind: 'forge-loop', runId: 'run-r1', state: 'dispatch' },
    },
  },
  {
    type: 'forge/progress',
    seq: 4,
    time: 4,
    data: { sourceSlug: 'mobile-ui', verb: 'settle', status: 'completed', taskKey: '1.19', counts: { pending: 2, running: 0, done: 4 } },
  },
  {
    type: 'forge/progress',
    seq: 5,
    time: 5,
    data: { sourceSlug: 'mobile-ui', verb: 'stop', status: 'interrupted', taskKey: '1.18', counts: { pending: 2, running: 0, done: 4 } },
  },
  {
    type: 'forge/progress',
    seq: 7,
    time: 7,
    data: { sourceSlug: 'mobile-ui', verb: 'claim-resume', status: 'running', taskKey: '1.20', counts: { pending: 1, running: 1, done: 4 } },
  },
  {
    type: 'deliverables/presented',
    seq: 6,
    time: 6,
    data: { files: FILES.map(({ description, path, size }) => ({ description, path, size })).concat([{ path: 'https://docs.example.com/remote' }]) },
  },
] as WireEvent[]

const fileRpc: RemoteRpc = {
  async call<T>(channel: string, payload: unknown): Promise<RpcResult<T>> {
    if (channel !== 'forge:proxy/file') return { ok: false, error: { code: 'unknown', reason: channel } }
    const record = payload as { manifest?: boolean; path?: string }
    const file = FILES.find((candidate) => candidate.path === record.path)
    if (file === undefined) return { ok: false, error: { code: 'not-found', reason: '文件不在场' } as never }
    if (record.manifest === true) return { ok: true, data: { manifest: true, size: file.size } as T }
    return { ok: true, data: { eof: true, data: btoa(unescape(encodeURIComponent(file.body))) } as T }
  },
}

const api: OfficialApi = {
  listSessions: async () => ({ items: [] }),
  createSession: async () => ({ sessionId: 's-1' }),
  history: async () => ({ entries, hasMore: false }),
  prompt: async () => ({}),
  cancel: async () => ({}),
  models: async () => ({}),
  selectModel: async () => ({}),
  pendingInteractions: async () => ({ items: [] }),
  answerInteraction: async () => ({}),
  cancelInteraction: async () => ({}),
  listWorkspaces: async () => ({ items: [] }),
  listAgentPresets: async () => ({ presets: [] }),
  selectAgentPreset: async () => ({}),
  executeCommand: async () => ({}),
  status: async () => true,
}

const engineStub = {
  start: () => {},
  teardown: () => {},
  retry: () => {},
  setPollActive: () => {},
}

let reader: ReaderHandle | null = null

;(window as unknown as { __probe: Record<string, unknown> }).__probe = {
  openDoc(path: string): void {
    reader?.destroy()
    reader = createReader({
      path,
      rpc: fileRpc,
      onExit: () => {
        reader?.destroy()
        reader = null
      },
    })
    document.querySelector('.phone-root')?.appendChild(reader.root)
  },
  closeReader(): void {
    reader?.destroy()
    reader = null
  },
  get readerOpen(): boolean {
    return reader !== null
  },
}

const root = createChatView('s-1', {
  api,
  createEngine: () => engineStub,
  onOpenDoc: (path) => {
    ;(window as unknown as { __probe: { openDoc(path: string): void } }).__probe.openDoc(path)
  },
})
document.querySelector('#app')!.appendChild(root)
