/**
 * T1 钉样本 fixtures：37 类持久事件（wire-samples.md 同源——真实会话 v4 JSONL
 * 提取样本，长字符串截断）+ 录制瞬态判别集（官方类型构造）。
 * 仅保留投影判读所需字段；判别面（type/seq/time/data/surfaceOp/sourceEventSeqs）
 * 与真实 wire 逐位一致。
 */
import type { AssistantLiveChunkEvent, SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WireEvent } from './wire.ts'

/** 从真实样本构造 WireEvent（截断文本不改判别面）。 */
export function ev(type: string, seq: number, data: unknown, extra: Record<string, unknown> = {}): WireEvent {
  return { type, seq, time: 1791687255277 + seq, data, ...extra } as unknown as WireEvent
}

export function liveChunk(
  seq: number,
  attemptId: string,
  chunk: AssistantLiveChunkEvent['data']['chunk'],
): AssistantLiveChunkEvent {
  return {
    type: 'assistant/live-chunk',
    seq,
    time: 1791687369994 + seq,
    data: { attemptId: attemptId as AssistantLiveChunkEvent['data']['attemptId'], turn: 1, step: 1, chunk },
  }
}

export function durableEntry(event: WireEvent): SessionEventLikeEntry {
  return { type: 'event', event } as SessionEventLikeEntry
}

/** 37 类持久事件样本（wire-samples.md 逐类型，37/37 全覆盖）。 */
export const DURABLE_SAMPLES: readonly WireEvent[] = [
  // E 档：状态与机械
  ev('permission/preset', 0, { preset: 'danger-full-access' }),
  ev('sandbox/mode', 1, { mode: 'danger-full-access' }),
  ev('approval/policy', 2, { policy: 'never' }),
  ev('agent-preset/selected', 3, { agentPreset: 'blitz' }),
  ev('agent/inbox/spliced', 4, {
    target: 'next-turn',
    start: 0,
    inserted: [{ content: [{ type: 'text', text: 'queued' }], source: { kind: 'user' }, role: 'user', id: 'c84b4013' }],
  }),
  ev('turn/start', 5, { turn: 1 }),
  ev('step/start', 7, { turn: 1, step: 1 }),
  ev('system/message', 8, {
    turn: 1,
    step: 1,
    message: { role: 'system', content: [{ type: 'text', text: 'You are an AI agent…[截断]' }], source: { kind: 'system-prompt' }, id: '50bff3f6' },
  }, { surfaceOp: 'append' }),
  ev('request/header', 14, {
    header: { config: { provider: 'zai-coding-cn', model: 'glm-5.3', reasoningEffort: 'max' }, tools: [] },
    reason: 'initial',
  }),
  ev('request/context', 15, { provider: 'zai-coding-cn', model: 'glm-5.3', contextWindow: 1000000 }),
  ev('session/title-llm-request', 17, {
    titleProvider: 'session-title-first-prompt-llm',
    messageSeqs: [9],
    route: { provider: 'zai-coding-cn', model: 'glm-5.3' },
    system: 'Create a concise title…[截断]',
    messages: [],
    maxTokens: 64,
  }),
  ev('step/end', 24, { turn: 1, step: 1 }),
  ev('turn/end', 243, { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }),
  ev('workspace/changes', 330, { turn: 2 }),
  ev('web/deepseek-search-llm-request', 535, {
    endpoint: 'https://api.deepseek.com/anthropic/v1/messages',
    apiVersion: '2023-06-01',
    body: { model: 'deepseek-v4-flash', max_tokens: 4096, messages: [], tools: [] },
  }),
  ev('session/end-seed', 784, {}),
  ev('llm/retry', 824, {
    retryId: '0f1e898b',
    turn: 13,
    step: 7,
    provider: 'zai-coding-cn',
    mode: 'normal',
    policyKey: '["normal",5,…]',
    retry: 1,
    maxRetries: 5,
    delayMs: 456.3,
    failure: { message: '500: …', code: 'SERVER' },
  }),
  ev('llm/retry-started', 825, { retryId: '0f1e898b', turn: 13, step: 7, retry: 1 }),
  ev('compaction/start', 2634, { compactionId: '6b32b0dc', sourceCommandId: 'cmd-33fa9a4a-2', turn: null }),
  ev('compaction/end', 2637, { compactionId: '6b32b0dc', sourceCommandId: 'cmd-33fa9a4a-2', turn: null }),
  ev('compaction/prune', 3979, {
    shadowedRange: { start: 2659, end: 2659 },
    shadowedSeqs: [2659],
    shadowedTokenCount: 2789,
  }),
  ev('subagent/catalog', 1393, {
    version: 0,
    childId: 'a80e4eda',
    childCreatedAt: 1791725779050,
    mode: 'continuable',
    label: '评审提案工程可行性',
  }),
  ev('model/selection', 3961, { provider: 'zai-coding-cn', model: 'glm-4.6v' }),
  ev('command/done', 2638, {
    commandId: 'cmd-33fa9a4a-2',
    kind: 'success',
    text: 'Compacted 960 history items (~244792 tokens).',
    sourceEventSeq: 2635,
  }),
  // A 档：消息流渲染
  ev('user/message', 9, {
    content: [{ type: 'text', text: '/brainstorm 深度探索：把/run-tasks skill 重构dsh的指令。…[截断]' }],
    source: { kind: 'user', rpcId: '375df8f8', clientTimeZone: 'Asia/Shanghai' },
    role: 'user',
    id: 'c84b4013',
  }, { surfaceOp: 'append' }),
  ev('assistant/message', 19, {
    turn: 1,
    step: 1,
    message: {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: '用户想要深度探索一个想法…[截断]' },
        { type: 'tool-call', id: 'call_a4e818eb', name: 'read', arguments: '{"file_path":"Z:\\\\…"}' },
      ],
      source: { kind: 'model', provider: 'zai-coding-cn', model: 'glm-5.3' },
      id: 'c38c10b0',
    },
    usage: { inputTokens: 2195, outputTokens: 455, totalTokens: 12826, cacheReadTokens: 10176 },
    stream: [],
  }, { surfaceOp: 'append' }),
  ev('tool/call', 20, {
    turn: 1,
    step: 1,
    callId: 'call_a4e818eb',
    name: 'read',
    arguments: '{"file_path":"Z:\\\\…SKILL.md"}',
  }),
  ev('tool/result', 21, {
    turn: 1,
    step: 1,
    message: {
      role: 'tool',
      source: { kind: 'tool', callId: 'call_a4e818eb' },
      toolCallId: 'call_a4e818eb',
      content: [{ type: 'text', text: '<path>Z:\\…SKILL.md</path>…[截断]' }],
      isError: false,
      id: 'fddcffd5',
    },
    meta: { path: 'Z:\\…SKILL.md' },
  }, { sourceEventSeqs: [20], surfaceOp: 'append' }),
  // B 档：系统层轻投影
  ev('forge/progress', 11, {
    sourceSlug: 'mobile-remote-approval',
    verb: 'claim',
    status: 'running',
    taskKey: 'mobile-remote-approval/1.1',
    counts: { pending: 4, running: 1, done: 0 },
    at: 1791947189280,
  }),
  ev('session/title', 16, { title: '/brainstorm 深度探索：把/run-tasks', messageSeqs: [9], source: { kind: 'fallback' } }),
  ev('compaction/summary', 2635, {
    compactionId: '6b32b0dc',
    sourceCommandId: 'cmd-33fa9a4a-2',
    summary: [{ type: 'text', text: '## Primary Request and Intent…[截断]' }],
    rawOutput: [{ type: 'text', text: '## Primary Request and Intent…[截断]' }],
    llmStreamCall: true,
    shadowedRange: { start: 9, end: 2626 },
    shadowedSeqs: [9, 10, 11],
    shadowedTokenCount: 244792,
    provider: 'zai-coding-cn',
    model: 'glm-5.3',
    maxTokens: 65536,
  }),
  ev('command/run', 2633, { commandId: 'cmd-33fa9a4a-2', name: 'compact', args: '', source: { kind: 'user' } }),
  ev('deliverables/presented', 3521, {
    turn: 87,
    callId: 'call_73ace585',
    files: [{ description: '存量 forge.db 补列补丁脚本（你审核后执行）', path: 'Z:\\…patch-forge-db-loop-sourced.cjs' }],
  }),
  ev('plan/mode', 4676, { active: true }),
  // C 档：只读审批提示
  ev('approval/asked', 644, {
    id: '8f9ecf5f',
    toolName: 'pwsh',
    callId: 'call_308eeb0d',
    reason: 'escalate sandbox to danger-full-access: 需要修复 .forge 下原型目录…[截断]',
  }),
  ev('approval/decided', 645, { id: '8f9ecf5f', outcome: 'allowed-once' }),
  // D 档：失败尝试
  ev('assistant/attempt', 241, { turn: 1, step: 38, stream: [] }),
]

export const USER_MESSAGE_SAMPLE = DURABLE_SAMPLES.find((e) => e.type === 'user/message')!
export const ASSISTANT_MESSAGE_SAMPLE = DURABLE_SAMPLES.find((e) => e.type === 'assistant/message')!

// ── 官方会话事件词表（bug db09ac00 覆盖守卫锚）────────────────────────
// 源码核销 = @deepseek-ai/dsh-session lib/index.js KNOWN_SESSION_EVENT_TYPES（生产 runtime
// 0.2.0-rc.2 实测 52 型）。手机投影∪忽略集合必须覆盖全集——新官方类型出现时此清单随源码
// 核销扩充，projectEvent 对全集永不落 error-card。
export const OFFICIAL_SESSION_EVENT_TYPES: readonly string[] = [
  'agent-preset/selected',
  'agent/inbox/spliced',
  'approval/asked',
  'approval/decided',
  'approval/policy',
  'assistant/attempt',
  'assistant/message',
  'command/done',
  'command/run',
  'compaction/end',
  'compaction/prune',
  'compaction/start',
  'compaction/summary',
  'deliverables/presented',
  'developer/message',
  'feedback/message-delete',
  'feedback/message-put',
  'feedback/record',
  'goal/change',
  'hook/invoked',
  'hook/result',
  'image/offload',
  'llm/retry',
  'llm/retry-started',
  'model/selection',
  'permission/preset',
  'plan/mode',
  'request/context',
  'request/header',
  'sandbox/mode',
  'schedule/change',
  'session-log-deepseek/delivery-accepted',
  'session/end-seed',
  'session/title',
  'session/title-llm-request',
  'step/end',
  'step/start',
  'subagent/catalog',
  'subagent/descriptor',
  'subagent/model-selection-policy',
  'system/message',
  'team/member',
  'team/message/delivered',
  'team/message/queued',
  'team/task',
  'todo/write',
  'tool-workflow/agent-end',
  'tool-workflow/agent-start',
  'tool-workflow/run-end',
  'tool-workflow/run-start',
  'tool/call',
  'tool/ptc-dispatch',
  'tool/ptc-dispatch-start',
  'tool/result',
  'turn/end',
  'turn/start',
]