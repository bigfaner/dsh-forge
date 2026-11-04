// forge-progress-card-invariant-hardening 1.5 · 真实日志回放 fixture：
// bug fafc1fb7 案发样本（纯 progress 组「同数据先在场后消失不自愈」）的会话事件序列。
//
// 样本来源：durable 会话事件库（官方 session store）——
//   session id: 637fab65-83e5-4aac-be24-991970f37e43（worktree forge-dirs-query-tool）
//   原始日志: <dsh-home>/sessions/--Z-...-forge-dirs-query-tool--/session-637fab65-*/session.v4.jsonl.zstd
//   事件骨架（提案记载）: turn/start(seq 5) → forge/progress(seq 27–36) → answer(seq 37) → turn/end(seq 39)
//   forge/progress 实际落点: seq 27, 29, 30, 36（骨架区间内穿插非 fold 事件）。
//
// 裁剪纪律：fold 纯函数只消费 type/seq/time/data（data 内 id/content 首个 text block/source），
//   其余载荷字段（system 提示全文、request header、skill catalog 等）一律裁去——被 fold
//   消费的字段逐字保留真实值，零改写。
//
// 后续偶发样本入库扩充路径：再现回归（组卡消失/锚漂移类）时从 durable session store 按
//   session id 检索 events，裁剪后在本文件追加导出（命名 incident-<bug 短 id>），并在矩阵
//   测试（forge-event-node.replay.test.ts）引用。
import type { ForgeMessageEventLike } from './forge-event-node.js'

/**
 * 案发样本事件序列（seq 5–39 骨架，按日志原序）。
 * user/message seq 9 = 人类首条指令（source.kind 'user'）；10–12 为注入消息
 * （agent-instructions / runtime-context / skill-catalog——非 forge 源不分不染）。
 */
export const INCIDENT_SESSION_637FAB65: readonly ForgeMessageEventLike[] = [
  { type: 'turn/start', seq: 5, time: 1793685407289, data: { turn: 1 } },
  {
    type: 'user/message',
    seq: 9,
    time: 1793685407311,
    data: {
      id: '951319fd-6e04-48ec-ae4e-bd0be9d02e12',
      role: 'user',
      content: [{ type: 'text', text: '执行 forge-dirs-query-tool 提案的任务' }],
      source: { kind: 'user', rpcId: 'c3af12df-2a64-4705-97db-7c49de650b9a', clientTimeZone: 'Asia/Shanghai' },
    },
  },
  {
    type: 'user/message',
    seq: 10,
    time: 1793685407312,
    data: {
      id: '6949a933-af45-40bd-9a76-007efc99e5fd',
      role: 'user',
      content: [{ type: 'text', text: '<system-reminder>（AGENTS.md 注入——正文裁剪，非 fold 消费字段）' }],
      source: { kind: 'agent-instructions', form: 'instructions', baseline: true },
    },
  },
  {
    type: 'user/message',
    seq: 11,
    time: 1793685407312,
    data: {
      id: 'd0925f94-a78f-4682-9505-6d4cfb3632b7',
      role: 'user',
      content: [{ type: 'text', text: 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.（正文裁剪，非 fold 消费字段）' }],
      source: { kind: 'runtime-context', form: 'snapshot' },
    },
  },
  {
    type: 'user/message',
    seq: 12,
    time: 1793685407312,
    data: {
      id: '162f917c-9fce-4742-88c4-fc4929f6688f',
      role: 'user',
      content: [{ type: 'text', text: '<system-reminder>（skill catalog 注入——正文裁剪，非 fold 消费字段）' }],
      source: { kind: 'skill-catalog', form: 'catalog' },
    },
  },
  {
    type: 'forge/progress',
    seq: 27,
    time: 1793685413059,
    data: { sourceSlug: 'forge-dirs-query-tool', verb: 'startup', status: 'running', scenario: 'startup/from-scratch', at: 1793685413059 },
  },
  {
    type: 'forge/progress',
    seq: 29,
    time: 1793685413137,
    data: {
      sourceSlug: 'forge-dirs-query-tool',
      verb: 'claim',
      status: 'running',
      taskKey: 'forge-dirs-query-tool/1.1',
      expertKey: 'feature-builder',
      taskTitle: 'T1 dirKey 数据源 + forgeDirs/forgeResolvePath 双工具 + declare merge 注册面',
      scenario: 'claim/new',
      counts: { pending: 5, running: 1, done: 0 },
      at: 1793685413137,
    },
  },
  {
    type: 'forge/progress',
    seq: 30,
    time: 1793685413137,
    data: { sourceSlug: 'forge-dirs-query-tool', verb: 'loop', status: 'running', scenario: 'pool/pending', counts: { pending: 5, running: 1, done: 0 }, at: 1793685413137 },
  },
  {
    type: 'forge/progress',
    seq: 36,
    time: 1793685413287,
    data: {
      sourceSlug: 'forge-dirs-query-tool',
      verb: 'claim',
      status: 'running',
      taskKey: 'forge-dirs-query-tool/1.1',
      expertKey: 'feature-builder',
      taskTitle: 'T1 dirKey 数据源 + forgeDirs/forgeResolvePath 双工具 + declare merge 注册面',
      workerSessionId: 'a19be28e-675e-4d03-ad32-27330e038e6c',
      scenario: 'claim/spawned',
      at: 1793685413287,
    },
  },
  {
    type: 'assistant/message',
    seq: 37,
    time: 1793685416957,
    data: { message: { role: 'assistant', content: [{ type: 'text', text: '派发循环已启动（loop 0b920f46）……（正文裁剪）' }] } },
  },
  { type: 'turn/end', seq: 39, time: 1793685417580, data: { turn: 1, reason: { kind: 'completed' } } },
]
