// 机械⑥（forge-verification-hardening）：实现检查点 agent 工具面三员——
// recordImplCheckpoint（落标记行）/ queryImplCheckpoint（时序查 + 标记过滤 + 四项硬指标）/
// listImplCheckpoints（跨容器清单）。① 检查点域（core createCheckpointsService——
// ctx.forgeCheckpoints）的薄封装：唯一约束 / wave_seq 规则 / append-only 全在域内承载，
// 本壳只做参数防御收窄 + 路由 + 双友好渲染，零业务规则。跨容器清单 = 提案域 listProposals
// 枚举容器后逐容器取流水（域查询按 proposal_id 单容器——工具层组合，不复制域逻辑）。
// 命名 = 动词+名词；面分治：三员均仅主 agent（worker deny——assemble.ts FORGE_DENY_IN_WORKER）。
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import {
  optionalNonNegativeInteger,
  optionalPositiveInteger,
  optionalStringArray,
  requireArgsObject,
  requiredEnum,
  requiredString,
} from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

// ─────────────────────────── 检查点域结构化消费面（core 结构兼容） ───────────────────────────

/** 标记词库（五类里程碑 + 关系标记 derived-to-child——域 MARKS/DL CHECK 同源镜像） */
export const CHECKPOINT_MARKS = [
  'first-pass-complete',
  'retro-done',
  'review-wave-N',
  'stabilized',
  'merged',
  'derived-to-child',
] as const

export type CheckpointMark = (typeof CHECKPOINT_MARKS)[number]

/** 计数快照（标记时刻累计——统计口径归任务域，调用方传入） */
export interface CheckpointSnapshots {
  readonly tasksTotal: number
  readonly commitsTotal: number
  readonly fixesTotal: number
  readonly evidenceDebtsTotal: number
}

/** 检查点行 DTO（域 CheckpointRow 结构镜像——wave_seq NULL = 键缺席） */
export interface CheckpointRow {
  readonly id: number
  readonly proposalId: string
  readonly mark: CheckpointMark
  readonly waveSeq?: number
  readonly createdAt: string
  readonly baseCommitHash: string
  readonly tasksTotal: number
  readonly commitsTotal: number
  readonly fixesTotal: number
  readonly evidenceDebtsTotal: number
}

/** core checkpoints 域服务的插件侧结构化消费面（结构兼容判别——插件禁 import core） */
export interface ForgeCheckpointsToolFace {
  appendCheckpoint(input: {
    readonly projectId: string
    readonly proposalId: string
    readonly mark: CheckpointMark
    readonly waveSeq?: number
    readonly baseCommitHash: string
    readonly snapshots: CheckpointSnapshots
  }): Promise<CheckpointRow>
  listCheckpoints(q: {
    readonly projectId: string
    readonly proposalId: string
    readonly marks?: readonly CheckpointMark[]
  }): Promise<readonly CheckpointRow[]>
}

/** 四项硬指标（相邻/首末标记帧差值派生——缺帧项键缺席） */
export interface CheckpointMetrics {
  /** 一次通过率 = first-pass-complete 任务数 / 终帧任务数 */
  readonly firstPassRate?: number
  /** 返工增量比 = (终帧 commit 数 − first-pass commit 数) / 终帧 commit 数 */
  readonly reworkCommitRatio?: number
  /** 修正波次 = review-wave-N 标记行数 */
  readonly reviewWaveCount: number
  /** fix 密度 = 终帧 fix 任务数 / 终帧任务数 */
  readonly fixDensity?: number
}

/** 四项硬指标计算（纯投影——输入域时序流水，输出比率面；无帧/分母零的项键缺席） */
export function computeCheckpointMetrics(rows: readonly CheckpointRow[]): CheckpointMetrics {
  const firstPass = rows.find((r) => r.mark === 'first-pass-complete')
  const terminal = rows.length > 0 ? rows[rows.length - 1]! : undefined
  const ratio = (num: number, den: number): number | undefined => (den > 0 ? num / den : undefined)
  const firstPassRate = firstPass !== undefined && terminal !== undefined ? ratio(firstPass.tasksTotal, terminal.tasksTotal) : undefined
  const reworkCommitRatio =
    firstPass !== undefined && terminal !== undefined ? ratio(terminal.commitsTotal - firstPass.commitsTotal, terminal.commitsTotal) : undefined
  const fixDensity = terminal !== undefined ? ratio(terminal.fixesTotal, terminal.tasksTotal) : undefined
  return {
    ...(firstPassRate !== undefined ? { firstPassRate } : {}),
    ...(reworkCommitRatio !== undefined ? { reworkCommitRatio } : {}),
    reviewWaveCount: rows.filter((r) => r.mark === 'review-wave-N').length,
    ...(fixDensity !== undefined ? { fixDensity } : {}),
  }
}

/**
 * 检查点域 typed 错误 → 失败 DTO（机械⑥局部映射——ERR_CHECKPOINT_* 前缀判别，不经
 * contracts ERROR_CODES 全表：码表扩面归 ① 域任务口径，本面只认前缀（typed 判别同构
 * errorCodeOf，不静默吞非检查点错误——其余原样重抛 fail-loud））。
 */
function checkpointFailureOf(e: unknown): ForgeToolFailure | undefined {
  const code = (e as { code?: unknown }).code
  if (typeof code !== 'string' || !code.startsWith('ERR_CHECKPOINT_')) return undefined
  return { ok: false, code: code as ForgeToolFailure['code'], message: e instanceof Error ? e.message : String(e), violations: [] }
}

// ─────────────────────────── record_impl_checkpoint ───────────────────────────

const RECORD_TOOL = 'recordImplCheckpoint'

/** record agent 面参数（四参 AC 形状 + 快照可选——缺省零计数；唯一约束/wave_seq 规则归域校验） */
export interface RecordImplCheckpointToolArgs {
  readonly proposal_id: string
  readonly mark: CheckpointMark
  readonly wave_seq?: number
  readonly base_commit_hash: string
  readonly snapshots?: Partial<CheckpointSnapshots>
}

/** 快照字段防御收窄（在场即须非负整数；缺省 = 0） */
function snapshotsOf(a: Record<string, unknown>, tool: string): CheckpointSnapshots {
  return {
    tasksTotal: optionalNonNegativeInteger(a, 'tasksTotal', tool) ?? 0,
    commitsTotal: optionalNonNegativeInteger(a, 'commitsTotal', tool) ?? 0,
    fixesTotal: optionalNonNegativeInteger(a, 'fixesTotal', tool) ?? 0,
    evidenceDebtsTotal: optionalNonNegativeInteger(a, 'evidenceDebtsTotal', tool) ?? 0,
  }
}

/** 参数防御性收窄 */
export function parseRecordImplCheckpointArgs(args: unknown): RecordImplCheckpointToolArgs {
  const a = requireArgsObject(args, RECORD_TOOL)
  const snapshotsRaw = a['snapshots']
  const waveSeq = optionalPositiveInteger(a, 'wave_seq', RECORD_TOOL)
  return {
    proposal_id: requiredString(a, 'proposal_id', RECORD_TOOL),
    mark: requiredEnum(a, 'mark', CHECKPOINT_MARKS, RECORD_TOOL),
    ...(waveSeq !== undefined ? { wave_seq: waveSeq } : {}),
    base_commit_hash: requiredString(a, 'base_commit_hash', RECORD_TOOL),
    ...(typeof snapshotsRaw === 'object' && snapshotsRaw !== null
      ? { snapshots: snapshotsOf(snapshotsRaw as Record<string, unknown>, RECORD_TOOL) }
      : {}),
  }
}

const RECORD_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  properties: {
    checkpoint: {
      type: 'object',
      description: 'Appended checkpoint row (domain CheckpointRow shape).',
      properties: {
        id: { type: 'number' },
        proposalId: { type: 'string' },
        mark: { type: 'string' },
        waveSeq: { type: 'number', description: 'review-wave-N wave number (absent on other marks).' },
        createdAt: { type: 'string' },
        baseCommitHash: { type: 'string' },
        tasksTotal: { type: 'number' },
        commitsTotal: { type: 'number' },
        fixesTotal: { type: 'number' },
        evidenceDebtsTotal: { type: 'number' },
      },
      required: ['id', 'proposalId', 'mark', 'createdAt', 'baseCommitHash', 'tasksTotal', 'commitsTotal', 'fixesTotal', 'evidenceDebtsTotal'],
    },
  },
  required: ['checkpoint'],
})

function renderRecordResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const { checkpoint } = value as { checkpoint: CheckpointRow }
  const bits = [`- ${checkpoint.mark}${checkpoint.waveSeq !== undefined ? `#${String(checkpoint.waveSeq)}` : ''}`]
  bits.push(`  proposal: ${checkpoint.proposalId}`)
  bits.push(`  base commit: ${checkpoint.baseCommitHash}`)
  bits.push(`  snapshots: tasks=${String(checkpoint.tasksTotal)} commits=${String(checkpoint.commitsTotal)} fixes=${String(checkpoint.fixesTotal)} evidenceDebts=${String(checkpoint.evidenceDebtsTotal)}`)
  return formatOk('checkpoint recorded', bits)
}

export function createRecordImplCheckpointTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: RECORD_TOOL,
    description:
      'Append an implementation checkpoint mark row for a proposal (main agent only; append-only ledger). Args: proposal_id, mark (first-pass-complete / retro-done / review-wave-N / stabilized / merged / derived-to-child), base_commit_hash (container branch HEAD at mark time), optional wave_seq (review-wave-N only — omit to auto-increment), optional snapshots counters (default zero). Milestone marks are unique per (proposal, mark, wave_seq); duplicates are rejected. Zero business rules here — validation and persistence live in the checkpoints domain.',
    parameters: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string', description: 'Proposal id the checkpoint attaches to (must exist).' },
        mark: { type: 'string', description: 'Checkpoint mark — one of the five milestone marks plus derived-to-child.' },
        wave_seq: { type: 'number', description: 'Wave number, review-wave-N only (positive integer; omit = auto-increment max+1).' },
        base_commit_hash: { type: 'string', description: 'Container branch HEAD commit hash at mark time.' },
      },
      required: ['proposal_id', 'mark', 'base_commit_hash'],
    },
    output: { schema: RECORD_OUTPUT_SCHEMA, render: renderRecordResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<unknown | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseRecordImplCheckpointArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        try {
          const checkpoint = await deps.checkpoints.appendCheckpoint({
            projectId,
            proposalId: parsed.proposal_id,
            mark: parsed.mark,
            ...(parsed.wave_seq !== undefined ? { waveSeq: parsed.wave_seq } : {}),
            baseCommitHash: parsed.base_commit_hash,
            snapshots: {
              tasksTotal: parsed.snapshots?.tasksTotal ?? 0,
              commitsTotal: parsed.snapshots?.commitsTotal ?? 0,
              fixesTotal: parsed.snapshots?.fixesTotal ?? 0,
              evidenceDebtsTotal: parsed.snapshots?.evidenceDebtsTotal ?? 0,
            },
          })
          return { checkpoint }
        } catch (e) {
          const failure = checkpointFailureOf(e)
          if (failure === undefined) throw e
          return failure
        }
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), RECORD_TOOL, failure))
    },
  }
}

// ─────────────────────────── query_impl_checkpoint ───────────────────────────

const QUERY_TOOL = 'queryImplCheckpoint'

/** query agent 面参数（proposal_id 必带；marks 词表过滤可选） */
export interface QueryImplCheckpointToolArgs {
  readonly proposal_id: string
  readonly marks?: readonly CheckpointMark[]
}

/** mark 元素词表收窄 */
function optionalMarkArray(a: Record<string, unknown>, key: string, tool: string): CheckpointMark[] | undefined {
  const raw = optionalStringArray(a, key, tool)
  if (raw === undefined) return undefined
  return raw.map((e) => {
    if (!(CHECKPOINT_MARKS as readonly string[]).includes(e)) {
      throw new Error(`${tool}: ${key} must only contain [${CHECKPOINT_MARKS.join(', ')}]`)
    }
    return e as CheckpointMark
  })
}

/** 参数防御性收窄 */
export function parseQueryImplCheckpointArgs(args: unknown): QueryImplCheckpointToolArgs {
  const a = requireArgsObject(args, QUERY_TOOL)
  const marks = optionalMarkArray(a, 'marks', QUERY_TOOL)
  return {
    proposal_id: requiredString(a, 'proposal_id', QUERY_TOOL),
    ...(marks !== undefined ? { marks } : {}),
  }
}

const QUERY_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  properties: {
    checkpoints: {
      type: 'array',
      description: 'Checkpoint rows in chronological order (created_at asc).',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          mark: { type: 'string' },
          waveSeq: { type: 'number' },
          createdAt: { type: 'string' },
          baseCommitHash: { type: 'string' },
          tasksTotal: { type: 'number' },
          commitsTotal: { type: 'number' },
          fixesTotal: { type: 'number' },
          evidenceDebtsTotal: { type: 'number' },
        },
        required: ['id', 'mark', 'createdAt', 'baseCommitHash', 'tasksTotal', 'commitsTotal', 'fixesTotal', 'evidenceDebtsTotal'],
      },
    },
    metrics: {
      type: 'object',
      description: 'Four hard metrics derived from the timeline (frame-absent items omitted).',
      properties: {
        firstPassRate: { type: 'number', description: 'first-pass-complete tasks / terminal-frame tasks.' },
        reworkCommitRatio: { type: 'number', description: '(terminal commits − first-pass commits) / terminal commits.' },
        reviewWaveCount: { type: 'number', description: 'review-wave-N mark count.' },
        fixDensity: { type: 'number', description: 'terminal-frame fix tasks / terminal-frame tasks.' },
      },
      required: ['reviewWaveCount'],
    },
  },
  required: ['checkpoints', 'metrics'],
})

function renderQueryResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const { checkpoints, metrics } = value as { checkpoints: readonly CheckpointRow[]; metrics: CheckpointMetrics }
  const lines = checkpoints.map((c) => {
    const seq = c.waveSeq !== undefined ? `#${String(c.waveSeq)}` : ''
    return `- ${c.createdAt} ${c.mark}${seq} @${c.baseCommitHash.slice(0, 12)} (tasks=${String(c.tasksTotal)} commits=${String(c.commitsTotal)} fixes=${String(c.fixesTotal)} debts=${String(c.evidenceDebtsTotal)})`
  })
  if (lines.length === 0) lines.push('(no checkpoints)')
  const m: string[] = []
  if (metrics.firstPassRate !== undefined) m.push(`firstPassRate=${metrics.firstPassRate.toFixed(3)}`)
  if (metrics.reworkCommitRatio !== undefined) m.push(`reworkCommitRatio=${metrics.reworkCommitRatio.toFixed(3)}`)
  m.push(`reviewWaveCount=${String(metrics.reviewWaveCount)}`)
  if (metrics.fixDensity !== undefined) m.push(`fixDensity=${metrics.fixDensity.toFixed(3)}`)
  lines.push(`metrics: ${m.join(' / ')}`)
  return formatOk(`${checkpoints.length} checkpoint(s)`, lines)
}

export function createQueryImplCheckpointTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: QUERY_TOOL,
    description:
      'Query one proposal\'s implementation checkpoint timeline in chronological order (main agent only), with optional mark filtering (subset of the six marks) and the four hard metrics computed from the frames: firstPassRate (first-pass tasks / terminal tasks), reworkCommitRatio (post-first-pass commit share), reviewWaveCount (review-wave-N rows), fixDensity (fix tasks / tasks). Metrics items without their required frames are omitted.',
    parameters: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string', description: 'Proposal id whose checkpoint timeline to read.' },
        marks: { type: 'array', items: { type: 'string' }, description: 'Mark filter (subset of the six marks); empty or omitted = all.' },
      },
      required: ['proposal_id'],
    },
    output: { schema: QUERY_OUTPUT_SCHEMA, render: renderQueryResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<unknown | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseQueryImplCheckpointArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const checkpoints = await deps.checkpoints.listCheckpoints({
          projectId,
          proposalId: parsed.proposal_id,
          ...(parsed.marks !== undefined ? { marks: parsed.marks } : {}),
        })
        return { checkpoints, metrics: computeCheckpointMetrics(checkpoints) }
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), QUERY_TOOL, failure))
    },
  }
}

// ─────────────────────────── list_impl_checkpoints ───────────────────────────

const LIST_TOOL = 'listImplCheckpoints'

/** list agent 面参数（mark 过滤可选——缺省全量跨容器） */
export interface ListImplCheckpointsToolArgs {
  readonly marks?: readonly CheckpointMark[]
}

/** 参数防御性收窄（mark 词表过滤可选） */
export function parseListImplCheckpointsArgs(args: unknown): ListImplCheckpointsToolArgs {
  const a = requireArgsObject(args, LIST_TOOL)
  const marks = optionalMarkArray(a, 'marks', LIST_TOOL)
  return marks === undefined ? {} : { marks }
}

/** 跨容器清单行（容器侧注记 slug/title——组合自提案域枚举） */
export interface CheckpointListEntry extends CheckpointRow {
  readonly slug: string
  readonly title: string
}

const LIST_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  properties: {
    checkpoints: {
      type: 'array',
      description: 'Checkpoint rows across all proposals (per-proposal chronological), annotated with container slug/title.',
      items: {
        type: 'object',
        properties: {
          proposalId: { type: 'string' },
          slug: { type: 'string' },
          title: { type: 'string' },
          mark: { type: 'string' },
          waveSeq: { type: 'number' },
          createdAt: { type: 'string' },
          baseCommitHash: { type: 'string' },
          tasksTotal: { type: 'number' },
          commitsTotal: { type: 'number' },
          fixesTotal: { type: 'number' },
          evidenceDebtsTotal: { type: 'number' },
        },
        required: ['proposalId', 'slug', 'title', 'mark', 'createdAt', 'baseCommitHash'],
      },
    },
  },
  required: ['checkpoints'],
})

function renderListResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const { checkpoints } = value as { checkpoints: readonly CheckpointListEntry[] }
  const lines =
    checkpoints.length === 0
      ? ['(no checkpoints)']
      : checkpoints.map((c) => {
          const seq = c.waveSeq !== undefined ? `#${String(c.waveSeq)}` : ''
          return `- ${c.slug} ${c.createdAt} ${c.mark}${seq} @${c.baseCommitHash.slice(0, 12)}`
        })
  return formatOk(`${checkpoints.length} checkpoint(s) across containers`, lines)
}

export function createListImplCheckpointsTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: LIST_TOOL,
    description:
      'List implementation checkpoints across all proposal containers in the project (main agent only): per-proposal chronological rows annotated with container slug/title. Cross-container survey face — use for trend comparison across features; single-container timeline + metrics go through queryImplCheckpoint.',
    parameters: {
      type: 'object',
      properties: {
        marks: { type: 'array', items: { type: 'string' }, description: 'Mark filter (subset of the six marks); empty or omitted = all.' },
      },
    },
    output: { schema: LIST_OUTPUT_SCHEMA, render: renderListResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<unknown | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseListImplCheckpointsArgs(args)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const proposals = await deps.proposals.listProposals({ projectId })
        const grouped = await Promise.all(
          proposals.map(async (p) => {
            const rows = await deps.checkpoints.listCheckpoints({
              projectId,
              proposalId: p.proposalId,
              ...(parsed.marks !== undefined ? { marks: parsed.marks } : {}),
            })
            return rows.map((r): CheckpointListEntry => ({ ...r, slug: p.slug, title: p.title }))
          }),
        )
        return { checkpoints: grouped.flat() }
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), LIST_TOOL, failure))
    },
  }
}
