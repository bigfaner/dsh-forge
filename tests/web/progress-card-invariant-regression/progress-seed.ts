// progress-card-invariant-regression e2e 播种器（durable 会话日志确定性代位——零真实模型）。
// 形状来源（实锚，非杜撰）：
//  - e2e/support/replay/transcript-seed.ts —— v4 会话日志帧纪律（zstd 新帧追加、seq 连续
//    续编、首帧 header 唯一消费）与 assistant settlement 形状（replayState/usage/stream——
//    真实 v4 转录逐同构采样，跨 specs 实跑验证）。
//  - apps/web/src/client-plugin/forge-event-node.fixture.ts —— 'forge/progress' 事件载荷
//    形状（案发样本 session-637fab65 实录）。
// 播种面只代位「事件生产者」（真实链路 = host forge 插件 emit）；事件消费链（官方
// dsh-client-store 依 seq 重灌 → 官方 chat 视图 fold → forge 组节点物化 → DOM 渲染）
// 全程真实照跑——这正是 J2 reload 重放 / J3 裁剪自愈的案发装配链。
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { decodeSessionFile } from '../../../e2e/support/session-files.js'

/** v4 种子事件（宽松形状——播种器只构造已知面） */
type SeedEvent = { type: string; seq?: number; time: number; data?: Record<string, unknown>; surfaceOp?: string; sourceEventSeqs?: number[] }

/** forge/progress 事件载荷规格（fixture 实录字段窄面） */
export interface ProgressSpec {
  readonly sourceSlug: string
  readonly verb: string
  readonly status?: string
  readonly taskKey?: string
  readonly taskTitle?: string
  readonly scenario?: string
  readonly workerSessionId?: string
}

/** 一轮种子 turn 规格 */
export interface TurnSpec {
  readonly userText: string
  /** 人类消息 id（行锚断言面——缺省随机；插话行/后续行定位用） */
  readonly userId?: string
  /** 助手文本作答（null = 工具收尾无 answer；缺省给一段确定性文本） */
  readonly assistantText?: string | null
  /** 工具收尾形态（assistantText:null 时必给——settlement 结构合法面） */
  readonly tool?: { readonly name: string; readonly arguments: string; readonly resultText: string }
  /** turn 内 forge/progress 事件（user 消息之后、answer 之前依序流入） */
  readonly progress?: readonly ProgressSpec[]
}

/** 一轮播种产物（断言锚：消息 id 行键 + progress seq → 组卡行键推导面） */
export interface TurnSeed {
  readonly userMsgId: string
  readonly assistantMsgId: string | undefined
  readonly progressSeqs: readonly number[]
}

/** 帧界扫描（与 transcript-seed/session-files 同源口径——zstd magic 28 B5 2F FD） */
function zstdFrames(buf: Buffer): number[] {
  const frames: number[] = []
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) frames.push(i)
  }
  frames.push(buf.length)
  return frames
}

/** 既有日志可解行 + session v4 header 校验（fail-loud——transcript-seed 同纪律） */
function assertSeedableHeader(logPath: string): void {
  const buf = readFileSync(logPath)
  const frames = zstdFrames(buf)
  const lines: string[] = []
  for (let i = 0; i < frames.length - 1; i++) {
    try {
      lines.push(...zstdDecompressSync(buf.subarray(frames[i]!, frames[i + 1]!)).toString('utf8').split('\n'))
    } catch {
      // magic 误报帧跳过（解码器同口径）
    }
  }
  const out = lines.filter((l) => l !== '')
  if (out.length === 0) throw new Error(`播种拒绝：日志无可解行——${logPath}`)
  const header = JSON.parse(out[0]!) as { type?: string; version?: number }
  if (header.type !== 'session' || header.version !== 4) {
    throw new Error(`播种拒绝：会话日志头非 session v4（版本锚漂移——随改随录）——${logPath}`)
  }
}

/** 既有日志最大事件 seq（种子起点 = max+1——解码器按前驱+1 校验，断档即会话被弃） */
export function maxEventSeq(logPath: string): number {
  return decodeSessionFile(logPath).reduce((max, e) => Math.max(max, typeof e.seq === 'number' ? e.seq : -1), -1)
}

/** 种子事件以新 zstd 帧追加（既有帧逐字不动——首帧 header 唯一消费纪律） */
export function appendSeedEvents(logPath: string, events: readonly SeedEvent[]): void {
  if (events.length === 0) throw new Error('播种拒绝：空事件序列')
  assertSeedableHeader(logPath)
  const base = maxEventSeq(logPath)
  const first = events[0]?.seq
  if (typeof first !== 'number' || first !== base + 1) {
    throw new Error(`播种拒绝：seq 不连续（首个种子 seq=${String(first)} 应为 ${String(base + 1)}）`)
  }
  for (let i = 1; i < events.length; i++) {
    const prevSeq = events[i - 1]?.seq
    const curSeq = events[i]?.seq
    if (typeof prevSeq !== 'number' || curSeq !== prevSeq + 1) {
      throw new Error(`播种拒绝：seq 断档于 #${String(i)}（${String(prevSeq)} → ${String(curSeq)}）`)
    }
  }
  const payload = Buffer.from(events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8')
  const current = readFileSync(logPath)
  writeFileSync(logPath, logPath.endsWith('.zstd') ? Buffer.concat([current, zstdCompressSync(payload)]) : Buffer.concat([current, payload]))
}

const PROVIDER = 'progress-card-seed'

/** 确定性种子日志构建器（seq 连续分配；turn 结构镜像 transcript-seed 事件序） */
export class SeedLogBuilder {
  private seq: number
  private clock: number
  private readonly events: SeedEvent[] = []
  private turnNo = 0

  constructor(startSeq: number, clockBase = 1_794_000_000_000) {
    this.seq = startSeq
    this.clock = clockBase
  }

  private nextSeq(): number {
    return this.seq++
  }

  private t(): number {
    this.clock += 900
    return this.clock
  }

  /** replayState/usage（assistant settlement——transcript-seed 逐同构） */
  private replayState(stopReason: string, blocks: readonly string[]): Record<string, unknown> {
    return {
      response: { kind: 'pi-ai', version: 2, api: 'openai-completions', provider: PROVIDER, model: PROVIDER, responseId: `seed-${this.turnNo}-${this.seq}`, stopReason },
      blocks: blocks.map((b) => ({ type: b })),
    }
  }

  private assistantMessage(block: { type: 'text'; text: string } | { type: 'tool-call'; id: string; name: string; arguments: string }): { event: SeedEvent; msgId: string } {
    const usage = { inputTokens: 10, outputTokens: 10, totalTokens: 20 }
    const stream: Record<string, unknown>[] = [
      { type: 'chunk', time: this.t(), chunk: { type: 'block-start', index: 0, blockType: block.type } },
    ]
    if (block.type === 'text') {
      stream.push({ type: 'text-chunks', time0: this.t(), index: 0, dt: [1], texts: [block.text] })
    } else {
      stream.push({ type: 'tool-call-chunks', time0: this.t(), index: 0, dt: [1], id: block.id, name: block.name, args: [block.arguments] })
    }
    stream.push(
      { type: 'chunk', time: this.t(), chunk: { type: 'block-end', index: 0, block: block.type === 'text' ? { type: 'text', text: block.text } : { type: 'tool-call', id: block.id, name: block.name, arguments: block.arguments } } },
      { type: 'chunk', time: this.t(), chunk: { type: 'usage', usage } },
      { type: 'chunk', time: this.t(), chunk: { type: 'finish', reason: block.type === 'tool-call' ? { kind: 'tool-calls' } : { kind: 'stop' }, replayState: this.replayState(block.type === 'tool-call' ? 'toolUse' : 'stop', [block.type]) } },
    )
    const content = block.type === 'text'
      ? [{ type: 'text', text: block.text }]
      : [{ type: 'tool-call', id: block.id, name: block.name, arguments: block.arguments }]
    const msgId = randomUUID()
    this.events.push({
      type: 'assistant/message', seq: this.nextSeq(), time: this.t(), surfaceOp: 'append',
      data: {
        turn: this.turnNo, step: 1,
        message: { role: 'assistant', content, source: { kind: 'model', provider: PROVIDER, model: PROVIDER, replayState: this.replayState(block.type === 'tool-call' ? 'toolUse' : 'stop', [block.type]) }, id: msgId }, usage, stream,
      },
    })
    return { event: this.events[this.events.length - 1]!, msgId }
  }

  /** 一轮完整 turn（事件序镜像 transcript-seed；forge/progress 插在 user 消息之后、收尾之前） */
  turn(spec: TurnSpec): TurnSeed {
    this.turnNo += 1
    const userMsgId = spec.userId ?? randomUUID()
    const callId = `call_seed_${this.turnNo}_${this.seq}`
    const progressSeqs: number[] = []

    this.events.push({
      type: 'agent/inbox/spliced', seq: this.nextSeq(), time: this.t(),
      data: { target: 'next-turn', start: 0, inserted: [{ content: [{ type: 'text', text: spec.userText }], source: { kind: 'user', rpcId: randomUUID(), clientTimeZone: 'Asia/Shanghai' }, role: 'user', id: userMsgId }] },
    })
    this.events.push({ type: 'turn/start', seq: this.nextSeq(), time: this.t(), data: { turn: this.turnNo } })
    this.events.push({ type: 'agent/inbox/spliced', seq: this.nextSeq(), time: this.t(), data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } })
    this.events.push({ type: 'step/start', seq: this.nextSeq(), time: this.t(), data: { turn: this.turnNo, step: 1 } })
    this.events.push({
      type: 'system/message', seq: this.nextSeq(), time: this.t(), surfaceOp: 'append',
      data: { turn: this.turnNo, step: 1, message: { role: 'system', content: [{ type: 'text', text: 'You are a coding agent (progress-card seed).' }], source: { kind: 'system-prompt' }, id: randomUUID() } },
    })
    const userSeq = this.nextSeq()
    this.events.push({
      type: 'user/message', seq: userSeq, time: this.t(), surfaceOp: 'append',
      data: { content: [{ type: 'text', text: spec.userText }], source: { kind: 'user', rpcId: randomUUID(), clientTimeZone: 'Asia/Shanghai' }, role: 'user', id: userMsgId },
    })
    this.events.push({
      type: 'request/header', seq: this.nextSeq(), time: this.t(),
      data: { reason: 'initial', header: { config: { provider: PROVIDER, model: PROVIDER }, tools: [{ name: spec.tool?.name ?? 'seed_noop', description: 'progress-card seed tool', parameters: { type: 'object', properties: {} } }] } },
    })
    // forge/progress 依序流入（载荷形状 = forge-event-node.fixture.ts 案发样本实录窄面）
    for (const p of spec.progress ?? []) {
      progressSeqs.push(this.nextSeq())
      this.events.push({
        type: 'forge/progress', seq: progressSeqs[progressSeqs.length - 1], time: this.t(),
        data: {
          sourceSlug: p.sourceSlug,
          verb: p.verb,
          status: p.status ?? 'running',
          ...(p.taskKey !== undefined ? { taskKey: p.taskKey } : {}),
          ...(p.taskTitle !== undefined ? { taskTitle: p.taskTitle } : {}),
          ...(p.scenario !== undefined ? { scenario: p.scenario } : {}),
          ...(p.workerSessionId !== undefined ? { workerSessionId: p.workerSessionId } : {}),
          counts: { pending: 4, running: 1, done: 0 },
          at: this.clock,
        },
      })
    }
    let assistantMsgId: string | undefined
    if (spec.assistantText === null) {
      // 工具收尾（无 answer）：tool-call 广告 → tool/call → tool/result
      this.assistantMessage({ type: 'tool-call', id: callId, name: spec.tool?.name ?? 'seed_noop', arguments: spec.tool?.arguments ?? '{}' })
      this.events.push({ type: 'tool/call', seq: this.nextSeq(), time: this.t(), data: { turn: this.turnNo, step: 1, callId, name: spec.tool?.name ?? 'seed_noop', arguments: spec.tool?.arguments ?? '{}' } })
      this.events.push({
        type: 'tool/result', seq: this.nextSeq(), time: this.t(), surfaceOp: 'append', sourceEventSeqs: [this.seq - 1],
        data: { turn: this.turnNo, step: 1, message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text: spec.tool?.resultText ?? 'ok' }], isError: false, id: randomUUID() } },
      })
    } else {
      const text = spec.assistantText ?? `seed 回答 turn ${String(this.turnNo)}`
      assistantMsgId = this.assistantMessage({ type: 'text', text }).msgId
    }
    this.events.push({ type: 'step/end', seq: this.nextSeq(), time: this.t(), data: { turn: this.turnNo, step: 1 } })
    this.events.push({ type: 'turn/end', seq: this.nextSeq(), time: this.t(), data: { turn: this.turnNo, reason: { kind: 'completed' } } })
    this.events.push({
      type: 'session/title', seq: this.nextSeq(), time: this.t(),
      data: { title: spec.userText.slice(0, 24), messageSeqs: [userSeq], source: { kind: 'fallback' } },
    })
    return { userMsgId, assistantMsgId, progressSeqs }
  }

  /** 构建事件序列（appendSeedEvents 消费） */
  build(): readonly SeedEvent[] {
    return [...this.events]
  }
}
