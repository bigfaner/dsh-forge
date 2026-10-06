// 5.1 JSONL 夹具格式（AC3——录制-回放夹具唯一源格式）。tech-design §录制-回放：
// 动词调用序列 + claim 返回 dispatchPrompt 全文 + submit 载荷 + fix 链事件流，一行一记录。
//
// 记录四类（kind 判别）：
//   · header  —— 首行且仅首行：格式标识 + 录制时刻 + 来源（dogfood 首录 / hand 手工构造）；
//   · verb    —— 可回放执行面：写动词单参对象原样（回放 = 依序经测试钩子直调）；
//   · observed—— 录制期观测（不执行）：动词结算面（claim 的 dispatchPrompt 全文/digest/
//                submit 载荷结算/恢复清单）——golden 断言与录制溯源锚；
//   · event   —— 录制期事件流（不执行）：tasks-changed 推送记账（fix 链事件流面）。
//
// 版本字段预留（AC3）：每行 v 在场且为行首键；v ≠ REPLAY_VERSION 一律 fail-loud 拒绝
// （版本策略 = tech-design Open Question「首录后定」——本模块只锁「不兼容即拒」的机械面，
// 兼容口径（迁移/跳过）留待首录后裁决，届时只改本文件）。
// 纯逻辑零依赖零 electron——单测直载；e2e/support 全体 tsconfig 面 = e2e/tsconfig.json。
import { FORGE_EVENT_CHANNELS } from '../../../packages/contracts/src/channels.js'

/** 夹具格式标识（header.format 判别值） */
export const REPLAY_FORMAT = 'dsh-forge-replay'

/** 夹具格式版本（版本字段预留——不兼容版本解析即拒） */
export const REPLAY_VERSION = 1

/** 回放主径写动词所在服务（与主侧测试钩子可达面同集——host test-bridge TEST_BRIDGE_VERBS） */
export type ReplayServiceName = 'forgeTasks' | 'forgeProposals'

/** 回放主径五写动词（写动词不上 RPC——SC7；tech-design Interface 7/8） */
export type ReplayWriteVerb = 'addTask' | 'claimTask' | 'submitTask' | 'createProposal' | 'transitionProposal'

const SERVICES: readonly ReplayServiceName[] = ['forgeTasks', 'forgeProposals']
const VERBS: readonly ReplayWriteVerb[] = ['addTask', 'claimTask', 'submitTask', 'createProposal', 'transitionProposal']

/** 首行记录：格式标识 + 录制时刻 + 来源 */
export interface ReplayHeader {
  readonly v: number
  readonly kind: 'header'
  readonly format: typeof REPLAY_FORMAT
  readonly recordedAt: string
  /** 夹具来源：dogfood 首录（5.4）/ hand 手工构造（同格式可用） */
  readonly source?: 'dogfood' | 'hand'
  readonly note?: string
}

/** 动词调用行（回放执行面——args = 写动词单参对象原样） */
export interface ReplayVerbStep {
  readonly v: number
  readonly kind: 'verb'
  readonly seq: number
  readonly service: ReplayServiceName
  readonly verb: ReplayWriteVerb
  readonly args: Record<string, unknown>
}

/** 观测行（录制期动词结算——不执行；claim 的 dispatchPrompt 全文/digest 在此承载） */
export interface ReplayObservedStep {
  readonly v: number
  readonly kind: 'observed'
  readonly seq: number
  readonly service: ReplayServiceName
  readonly verb: ReplayWriteVerb
  readonly result: unknown
  readonly at?: string
}

/** 事件行（录制期 tasks-changed 推送记账——fix 链事件流；不执行） */
export interface ReplayEventStep {
  readonly v: number
  readonly kind: 'event'
  readonly seq: number
  readonly channel: typeof FORGE_EVENT_CHANNELS.tasksChanged
  readonly payload: { readonly projectId: string }
  readonly at?: string
}

export type ReplayStep = ReplayVerbStep | ReplayObservedStep | ReplayEventStep
export type ReplayRecord = ReplayHeader | ReplayStep

/** 解析后夹具（header + 有序步骤） */
export interface ReplayFixture {
  readonly header: ReplayHeader
  readonly steps: readonly ReplayStep[]
}

/** 夹具格式错误（行号定位——file 面第 N 行即文档第 N 行） */
export class ReplayFormatError extends Error {
  constructor(line: number, reason: string) {
    super(`[replay] 夹具格式错误（第 ${line} 行）：${reason}`)
    this.name = 'ReplayFormatError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 单行解析（JSON → 判别记录；形状违例/版本不兼容 fail-loud——ReplayFormatError 带行号） */
export function parseReplayLine(line: string, lineNo: number): ReplayRecord {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    throw new ReplayFormatError(lineNo, `非 JSON 行——${line.slice(0, 60)}`)
  }
  if (!isPlainObject(parsed)) throw new ReplayFormatError(lineNo, '记录须为 JSON 对象')
  if (parsed.v !== REPLAY_VERSION) {
    throw new ReplayFormatError(lineNo, `版本不兼容：v=${String(parsed.v)}（本解析器支持 v${REPLAY_VERSION}——旧/新夹具兼容口径 = Open Question，首录后定）`)
  }
  const kind = parsed.kind
  switch (kind) {
    case 'header': {
      if (parsed.format !== REPLAY_FORMAT) throw new ReplayFormatError(lineNo, `header.format 须为 ${REPLAY_FORMAT}`)
      if (typeof parsed.recordedAt !== 'string' || parsed.recordedAt === '') throw new ReplayFormatError(lineNo, 'header.recordedAt 须为非空 string')
      if (parsed.source !== undefined && parsed.source !== 'dogfood' && parsed.source !== 'hand') {
        throw new ReplayFormatError(lineNo, 'header.source 须为 dogfood | hand')
      }
      const note = typeof parsed.note === 'string' ? parsed.note : undefined
      return {
        v: REPLAY_VERSION,
        kind: 'header',
        format: REPLAY_FORMAT,
        recordedAt: parsed.recordedAt,
        ...(parsed.source !== undefined ? { source: parsed.source } : {}),
        ...(note !== undefined ? { note } : {}),
      }
    }
    case 'verb':
    case 'observed': {
      if (typeof parsed.seq !== 'number' || !Number.isInteger(parsed.seq) || parsed.seq <= 0) {
        throw new ReplayFormatError(lineNo, 'seq 须为正整数')
      }
      if (!SERVICES.includes(parsed.service as ReplayServiceName)) {
        throw new ReplayFormatError(lineNo, `service 须为 ${SERVICES.join(' | ')}（回放主径两域）`)
      }
      if (!VERBS.includes(parsed.verb as ReplayWriteVerb)) {
        throw new ReplayFormatError(lineNo, `verb 须为回放五写动词之一：${VERBS.join(' / ')}——得 ${String(parsed.verb)}`)
      }
      if (kind === 'verb') {
        if (!isPlainObject(parsed.args)) throw new ReplayFormatError(lineNo, 'verb.args 须为对象（写动词单参对象契约）')
        return { v: REPLAY_VERSION, kind: 'verb', seq: parsed.seq, service: parsed.service as ReplayServiceName, verb: parsed.verb as ReplayWriteVerb, args: parsed.args }
      }
      return {
        v: REPLAY_VERSION,
        kind: 'observed',
        seq: parsed.seq,
        service: parsed.service as ReplayServiceName,
        verb: parsed.verb as ReplayWriteVerb,
        result: parsed.result,
        ...(typeof parsed.at === 'string' ? { at: parsed.at } : {}),
      }
    }
    case 'event': {
      if (typeof parsed.seq !== 'number' || !Number.isInteger(parsed.seq) || parsed.seq <= 0) {
        throw new ReplayFormatError(lineNo, 'seq 须为正整数')
      }
      if (parsed.channel !== FORGE_EVENT_CHANNELS.tasksChanged) {
        throw new ReplayFormatError(lineNo, `event.channel 须为 ${FORGE_EVENT_CHANNELS.tasksChanged}（事件面唯一通道）`)
      }
      if (!isPlainObject(parsed.payload) || typeof parsed.payload.projectId !== 'string') {
        throw new ReplayFormatError(lineNo, 'event.payload 须为 { projectId: string }')
      }
      return {
        v: REPLAY_VERSION,
        kind: 'event',
        seq: parsed.seq,
        channel: FORGE_EVENT_CHANNELS.tasksChanged,
        payload: { projectId: parsed.payload.projectId as string },
        ...(typeof parsed.at === 'string' ? { at: parsed.at } : {}),
      }
    }
    default:
      throw new ReplayFormatError(lineNo, `未知 kind：${String(kind)}（须为 header | verb | observed | event）`)
  }
}

/** 文档级解析（JSONL 全文 → ReplayFixture；首行 header 强制、尾随空行容忍、违例行号定位） */
export function parseReplayDocument(text: string): ReplayFixture {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new ReplayFormatError(1, '空文档——首行须为 header')
  const first = parseReplayLine(lines[0]!, 1)
  if (first.kind !== 'header') throw new ReplayFormatError(1, `首行须为 header（得 ${first.kind}）`)
  const steps: ReplayStep[] = []
  for (const [i, line] of lines.slice(1).entries()) {
    const record = parseReplayLine(line, i + 2)
    if (record.kind === 'header') throw new ReplayFormatError(i + 2, 'header 只允许首行')
    steps.push(record)
  }
  return { header: first, steps }
}

/** 单行序列化（键序机械：v → kind → 判别载荷——v 恒行首，版本扫描锚） */
export function toReplayLine(record: ReplayRecord): string {
  switch (record.kind) {
    case 'header':
      return JSON.stringify({
        v: record.v,
        kind: record.kind,
        format: record.format,
        recordedAt: record.recordedAt,
        ...(record.source !== undefined ? { source: record.source } : {}),
        ...(record.note !== undefined ? { note: record.note } : {}),
      })
    case 'verb':
      return JSON.stringify({ v: record.v, kind: record.kind, seq: record.seq, service: record.service, verb: record.verb, args: record.args })
    case 'observed':
      return JSON.stringify({
        v: record.v,
        kind: record.kind,
        seq: record.seq,
        service: record.service,
        verb: record.verb,
        result: record.result,
        ...(record.at !== undefined ? { at: record.at } : {}),
      })
    case 'event':
      return JSON.stringify({
        v: record.v,
        kind: record.kind,
        seq: record.seq,
        channel: record.channel,
        payload: record.payload,
        ...(record.at !== undefined ? { at: record.at } : {}),
      })
  }
}
