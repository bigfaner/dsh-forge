// D 层转录播种器（worker-exec-evidence-replay 1.5——提案附录 D：会话 UI 走转录播种）。
// 「模型」变量以确定性手写转录代位：官方 dsh 会话日志物理形态（版本锚 = session format
// v4——`@deepseek-ai/dsh-session-persistence-jsonl` SESSION_FORMAT_VERSION，漂移即随改随录）
// 的 JSONL 事件流 + zstd 帧封装，写入既有（官方开户的）会话日志文件；应用链零改动、
// 零真实模型调用。事件形状对照真实 v4 会话文件采样（header + permission/sandbox/approval
// 前缀事件 + turn/step 结构 + system/user/assistant message + tool/call + tool/result +
// session/title），并经产品还原链离线验证通过（sessionFormatCatalog.createRestore →
// decodeRow → finish；形状漂移在还原时 fail-loud——与 dogfood-record 完整性门同哲学）。
//
// 播种策略 = 「官方开户 + 确定性转录代位」：会话目录/账本绑定由官方机制建立（spec 先经
// 官方 startSession 开户），本模块只读既有日志头（session v4 版本锚核验），在其后以
// **新 zstd 帧追加**种子回合（seq 连续续编——帧纪律见 seedTranscript 内注记）。标题
// source=fallback 引用本轮 user 行（官方约束：
// messageSeqs 必须引用更早的 human user/message 事件——kind=user 源）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'

/** 种子回合（一轮「用户提问 → 助手作答 + 一次工具调用」——fixture 确定性代位） */
export interface TranscriptSeedTurn {
  /** 用户输入文本（对话 tab / 轨迹 user 行断言锚） */
  readonly userText: string
  /** 助手回答文本（转录渲染断言锚） */
  readonly assistantText: string
  /** 工具调用（轨迹 tool 行断言锚） */
  readonly tool: {
    readonly name: string
    readonly arguments: string
    readonly resultText: string
  }
  /** 会话标题（侧栏行语言断言锚——缺省取 userText 截断） */
  readonly title?: string
}

/** v4 事件（宽松形状——播种器只构造已知面，读回面透传） */
type SeedEvent = { type: string; seq: number; time: number; data: Record<string, unknown>; surfaceOp?: string; sourceEventSeqs?: number[] }

/** 帧界扫描（与 session-files decodeSessionFile 同源口径——zstd magic 28 B5 2F FD） */
function zstdFrameBoundaries(buf: Buffer): number[] {
  const frames: number[] = []
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) frames.push(i)
  }
  frames.push(buf.length)
  return frames
}

/** 解出既有日志的原始 JSONL 行（保序——播种在行域追加，不重排既有事件） */
function readSeedableLines(logPath: string): string[] {
  const buf = readFileSync(logPath)
  const frames = zstdFrameBoundaries(buf)
  const lines: string[] = []
  for (let i = 0; i < frames.length - 1; i++) {
    try {
      lines.push(...zstdDecompressSync(buf.subarray(frames[i]!, frames[i + 1]!)).toString('utf8').split('\n'))
    } catch {
      // magic 误报帧跳过（解码器同口径）
    }
  }
  const out = lines.filter((l) => l !== '')
  if (out.length === 0) throw new Error(`转录播种拒绝：日志无可解行（fail-loud）——${logPath}`)
  const header = JSON.parse(out[0]!) as { type?: string; version?: number }
  if (header.type !== 'session' || header.version !== 4) {
    throw new Error(`转录播种拒绝：会话日志头非 session v4（版本锚漂移——随改随录）——${logPath}`)
  }
  return out
}

/**
 * 在既有（官方开户）会话日志上追加种子回合并整文件重写（zstd 单帧）。
 * @returns 种子 user 行的 seq（断言面可据此对账；既有事件 seq 0..N-1 逐字保留）
 */
export function seedTranscript(
  logPath: string,
  turn: TranscriptSeedTurn,
  clockBase = 1_792_000_000_000,
): number {
  const lines = readSeedableLines(logPath)
  const existing = lines.map((l) => JSON.parse(l) as SeedEvent)
  // seq 连续续编：解码器按前驱+1 校验 seq（断档 = 会话被宿主列表静默丢弃——首轮实测教训），
  // 故种子起点 = 既有最大 seq + 1（header 行无 seq 不计）。
  const seq0 = existing.slice(1).reduce((max, e) => Math.max(max, typeof e.seq === 'number' ? e.seq : -1), -1) + 1
  const uuid = (): string => randomUUID()
  const callId = `call_replay_seed_${seq0}`
  const t = (n: number): number => clockBase + n
  const PROVIDER = 'replay-transcript-seed'
  // 助手 settlement 形状（v4——真实转录逐同构采样，形状漂移在还原/打开时 fail-loud）：
  // source.replayState + usage + stream（chunk 域 block-start/text|tool-call-chunks/
  // block-end/usage/finish；assembleAssistantStream 重组必须与 message.content 逐字一致）。
  const replayState = (stopReason: string, blocks: readonly string[]) => ({
    response: { kind: 'pi-ai', version: 2, api: 'openai-completions', provider: PROVIDER, model: PROVIDER, responseId: `replay-seed-${seq0}`, stopReason },
    blocks: blocks.map((b) => ({ type: b })),
  })
  const usage = { inputTokens: 10, outputTokens: 10, totalTokens: 20 }
  /** 单块助手回合（step 内唯一内容块 → stream 逐同构；结果即 content 的机械代位） */
  const assistantStep = (turnNo: number, stepNo: number, block: { type: 'text'; text: string } | { type: 'tool-call'; id: string; name: string; arguments: string }): Record<string, unknown> => {
    const stream: Record<string, unknown>[] = [
      { type: 'chunk', time: t(0), chunk: { type: 'block-start', index: 0, blockType: block.type } },
    ]
    if (block.type === 'text') {
      stream.push({ type: 'text-chunks', time0: t(0), index: 0, dt: [1], texts: [block.text] })
    } else {
      stream.push({ type: 'tool-call-chunks', time0: t(0), index: 0, dt: [1], id: block.id, name: block.name, args: [block.arguments] })
    }
    stream.push(
      { type: 'chunk', time: t(1), chunk: { type: 'block-end', index: 0, block: block.type === 'text' ? { type: 'text', text: block.text } : { type: 'tool-call', id: block.id, name: block.name, arguments: block.arguments } } },
      { type: 'chunk', time: t(1), chunk: { type: 'usage', usage } },
      { type: 'chunk', time: t(1), chunk: { type: 'finish', reason: block.type === 'tool-call' ? { kind: 'tool-calls' } : { kind: 'stop' }, replayState: replayState(block.type === 'tool-call' ? 'toolUse' : 'stop', [block.type]) } },
    )
    const content = block.type === 'text'
      ? [{ type: 'text', text: block.text }]
      : [{ type: 'tool-call', id: block.id, name: block.name, arguments: block.arguments }]
    return {
      type: 'assistant/message', time: t(0), surfaceOp: 'append',
      data: { turn: turnNo, step: stepNo, message: { role: 'assistant', content, source: { kind: 'model', provider: PROVIDER, model: PROVIDER, replayState: replayState(block.type === 'tool-call' ? 'toolUse' : 'stop', [block.type]) }, id: uuid() }, usage, stream },
    }
  }
  // 事件序 = 真实 v4 转录逐同构（inbox 进列 → turn 开 → inbox 消费 → step 开 → 消息链 →
  // step 收 → 标题；投影器按此序 hydrate——缺 inbox 面 = 投影在 turn 边界停摆，实测教训）。
  // 助手回合两步：step1 = 工具调用（tool/call 须先由 assistant 的 tool-call 块广告——
  // 「has no advertised tool lifecycle」实测），step2 = 文本作答（对话 tab 断言锚）。
  const userMsgId = uuid()
  const userSeq = seq0 + 5
  const seeded: string[] = [
    JSON.stringify({
      type: 'agent/inbox/spliced', seq: seq0, time: t(0),
      data: { target: 'next-turn', start: 0, inserted: [{ content: [{ type: 'text', text: turn.userText }], source: { kind: 'user', rpcId: uuid(), clientTimeZone: 'Asia/Shanghai' }, role: 'user', id: userMsgId }] },
    }),
    JSON.stringify({ type: 'turn/start', seq: seq0 + 1, time: t(1), data: { turn: 1 } }),
    JSON.stringify({
      type: 'agent/inbox/spliced', seq: seq0 + 2, time: t(2),
      data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] },
    }),
    JSON.stringify({ type: 'step/start', seq: seq0 + 3, time: t(3), data: { turn: 1, step: 1 } }),
    JSON.stringify({
      type: 'system/message', seq: seq0 + 4, time: t(4), surfaceOp: 'append',
      data: {
        turn: 1, step: 1,
        message: { role: 'system', content: [{ type: 'text', text: 'You are a coding agent (replay transcript seed).' }], source: { kind: 'system-prompt' }, id: uuid() },
      },
    }),
    JSON.stringify({
      type: 'user/message', seq: userSeq, time: t(5), surfaceOp: 'append',
      data: { content: [{ type: 'text', text: turn.userText }], source: { kind: 'user', rpcId: uuid(), clientTimeZone: 'Asia/Shanghai' }, role: 'user', id: userMsgId },
    }),
    JSON.stringify({ type: 'request/header', seq: userSeq + 1, time: t(6), data: { reason: 'initial', header: { config: { provider: PROVIDER, model: PROVIDER }, tools: [{ name: turn.tool.name, description: 'replay transcript seed tool', parameters: { type: 'object', properties: {} } }] } } }),
    { ...assistantStep(1, 1, { type: 'tool-call', id: callId, name: turn.tool.name, arguments: turn.tool.arguments }), seq: userSeq + 2, time: t(7) },
    JSON.stringify({
      type: 'tool/call', seq: userSeq + 3, time: t(8),
      data: { turn: 1, step: 1, callId, name: turn.tool.name, arguments: turn.tool.arguments },
    }),
    JSON.stringify({
      type: 'tool/result', seq: userSeq + 4, time: t(9), surfaceOp: 'append', sourceEventSeqs: [userSeq + 3],
      data: { turn: 1, step: 1, message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text: turn.tool.resultText }], isError: false, id: uuid() } },
    }),
    JSON.stringify({ type: 'step/end', seq: userSeq + 5, time: t(10), data: { turn: 1, step: 1 } }),
    JSON.stringify({ type: 'step/start', seq: userSeq + 6, time: t(11), data: { turn: 1, step: 2 } }),
    { ...assistantStep(1, 2, { type: 'text', text: turn.assistantText }), seq: userSeq + 7, time: t(12) },
    JSON.stringify({ type: 'step/end', seq: userSeq + 8, time: t(13), data: { turn: 1, step: 2 } }),
    JSON.stringify({ type: 'session/title', seq: userSeq + 9, time: t(14), data: { title: turn.title ?? turn.userText.slice(0, 24), messageSeqs: [userSeq], source: { kind: 'fallback' } } }),
  ].map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
  // 帧追加（持久层帧纪律——1.9 实测根因修复）：jsonl 后端的 listing/头读面只把**首个 zstd
  // 帧**当 header 行消费（scanZstdFrames(content,1) + 单行断言，多行首帧 =
  // SessionPersistenceCorruptionError → listArtifacts 静默 continue → 会话被逐出账本）。
  // 故播种不整文件重写，而是把种子行作为**新 zstd 帧追加**到既有字节之后（宿主自身
  // append 同型——帧界 = 既有帧末尾；裸 .jsonl → 明文尾接）。既有帧逐字不动。
  const payload = Buffer.from(seeded.join('\n') + '\n', 'utf8')
  const current = readFileSync(logPath)
  const next = logPath.endsWith('.zstd')
    ? Buffer.concat([current, zstdCompressSync(payload)])
    : Buffer.concat([current, payload])
  writeFileSync(logPath, next)
  return userSeq
}

/**
 * 投影缓存同步（dsh 会话面 listing 的元数据源）：冷会话（非活体）的侧栏可见性/标题取
 * `storages/session_projcache/sessions/session-<id>.json` 的缓存投影——该缓存仅在会话
 * 活体期重算，外部转录追加不会触发（实测教训：stale blank=true = 行被藏）。本函数把缓存
 * 行推进到种子转录末序（blank=false + 标题 + 各行 seq 锚到种子末 seq），会话被打开时
 * 官方投影按 seq 守卫正常重算——缓存编辑只承载「listing 可见性」，语义权威仍在日志本体。
 * 版本锚 = 缓存 unit version 7 / record version 7（漂移即随改随录）。
 */
export function refreshSessionProjcache(
  dshHome: string,
  sessionId: string,
  opts: { readonly title: string; readonly asOfSeq: number; readonly lastPromptAt: number },
): void {
  const file = join(dshHome, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`)
  if (!existsSync(file)) return // 缓存缺席（会话未活体过）= listing 冷读日志本体——零补丁
  const cache = JSON.parse(readFileSync(file, 'utf8')) as {
    version?: number
    record?: { rows?: Record<string, { ver?: number; seq?: number; val?: unknown }> }
  }
  const rows = cache.record?.rows
  if (rows === undefined || cache.version !== 7) {
    throw new Error(`转录播种拒绝：projcache 形状漂移（版本锚 cache.version=${String(cache.version)}）——${file}`)
  }
  for (const row of Object.values(rows)) row.seq = opts.asOfSeq
  rows.sessionListMetadata = { ...rows.sessionListMetadata, seq: opts.asOfSeq, val: { blank: false, lastPromptAt: opts.lastPromptAt } }
  rows.title = { ...rows.title, seq: opts.asOfSeq, val: opts.title }
  writeFileSync(file, JSON.stringify(cache))
}
