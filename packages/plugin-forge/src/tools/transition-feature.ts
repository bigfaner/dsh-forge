// transitionFeature tool 定义（定位：业务——提案 implicit-stage-approval §2.3：窄口径
// feature 相位转移动词。裁决②局部修订：transitionFeature 由「UI 专属收窄不进 tool 面」
// 改为「进 tool 面，reason 必带承担溯源」——UI/RPC 面不动，core 服务零语义改动）。
// 入参面 = slug + to_status + reason 三参必带；parse 层机械强制 reason 双前缀
// ^(隐式赞同|显式指令)：（全角冒号精确锚定——半角冒号/前缀缺失即拒；前缀为单向可分
// 信号：无前缀 = UI 人工纠偏行，复检 V-2 知情接受的标记失真残余风险）。
// tool 层相位守卫两支全约束（形式化验证 P2 修法——零 core 改动）：
// - 有任务：toStatus ≡ deriveTaskPhase(taskStatuses)（同一 taskDerived 快照）否则拒——
//   悬空态从 tool 面不可构造（复检 V-1a）；
// - 无任务：仅放行 archived 或线性序 order(to) ≥ max(order(cur), docPhaseMax)——单调前推
//   不落后于已登记文档相位，防「先回拨后补文档」等价复活反例（复检 V-1c）。
// TOCTOU 关闭条件（复检 V-1b）：execute 内快照读取（listFeatures/listFeatureDocs 服务体
// 同步读库）→ 守卫判定 → core transitionFeature 调用全程不插 await——.then 微任务链
// 不让位宏任务，better-sqlite3 单连接同步写事务不可穿插，微任务链闭合、宏任务不可穿插。
// slug→featureId 服务内解析（upsertFeatureDoc 先例同法——uuid 锚不进 agent 面）；
// 转移落 feature_records（verb=transition，reason 载前缀标记）经 core 服务闭包伴随。
// 返回面 = contracts FeatureRow 透传 + formatOk 双友好渲染；typed 错误 → 失败 DTO。
import {
  FEATURE_STATUSES,
  TASK_STATUSES,
  type DocKind,
  type FeatureCard,
  type FeatureRow,
  type FeatureStatus,
  type TaskStatus,
  type TransitionFeatureInput,
} from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { requireArgsObject, requiredEnum, requiredString } from './args.js'
import {
  callToolFace,
  formatFailure,
  formatOk,
  isForgeToolFailure,
  withFailureVariant,
  type ForgeToolFailure,
} from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const TOOL = 'transitionFeature'

/** reason 双前缀锚（全角冒号——半角/前后空白不匹配） */
const REASON_PREFIX = /^(隐式赞同|显式指令)：/

/**
 * doc_kind → phase 映射（core forge/tasks/phase-deriver.ts DOC_KIND_PHASE 同值镜像——
 * 插件禁 import core，四域互禁 import 彼此的既定装配边界；值漂移由本文件 pin 注释 +
 * transition-feature.test.ts 守卫用例锚定。加 DocKind 即此处需同步裁决）。
 */
export const DOC_KIND_PHASE: Readonly<Record<DocKind, 'prd' | 'design'>> = {
  'prd-spec': 'prd',
  'user-stories': 'prd',
  'ui-functions': 'prd',
  'tech-design': 'design',
  'er-diagram': 'design',
  'sql-schema': 'design',
  'page-map': 'design',
}

/** 任务终态集（core phase-deriver TERMINAL_TASK_STATUSES 同值镜像——见上注） */
const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'skipped', 'rejected']
/** 活跃判定集（core phase-deriver ACTIVE_TASK_STATUSES 同值镜像——见上注） */
const ACTIVE_TASK_STATUSES: readonly TaskStatus[] = ['in_progress', 'blocked', 'suspended', 'interrupted']

/** feature 六态线性序值（FEATURE_STATUSES 行序即序——contracts labels 单源，序 pin 同源） */
function statusOrder(s: FeatureStatus): number {
  return FEATURE_STATUSES.indexOf(s)
}

/** taskDerived 两段式镜像（core phase-deriver deriveTaskPhase 同判据：活跃→in-progress /
 *  存在非终态→tasks / 全终态→completed / 无任务→null） */
function deriveTaskPhase(taskStatuses: readonly TaskStatus[]): 'tasks' | 'in-progress' | 'completed' | null {
  if (taskStatuses.length === 0) return null
  if (taskStatuses.some((s) => ACTIVE_TASK_STATUSES.includes(s))) return 'in-progress'
  if (taskStatuses.some((s) => !TERMINAL_TASK_STATUSES.includes(s))) return 'tasks'
  return 'completed'
}

/** docPhaseMax（core phase-deriver 同判据：已登记文档映射相位的线性序最大值；无文档 → null） */
function docPhaseMax(docKinds: readonly DocKind[]): FeatureStatus | null {
  let max: FeatureStatus | null = null
  for (const kind of docKinds) {
    const phase = DOC_KIND_PHASE[kind]
    if (max === null || statusOrder(phase) > statusOrder(max)) max = phase
  }
  return max
}

/** 守卫输入快照（tool 面聚合自 core 读面——listFeatures 七态分布展开 + listFeatureDocs 行集） */
export interface FeaturePhaseSnapshot {
  readonly featureId: string
  readonly slug: string
  readonly featureStatus: FeatureStatus
  readonly docKinds: readonly DocKind[]
  readonly taskStatuses: readonly TaskStatus[]
}

/** 守卫裁决（allowed=false 时 cause 承载两支归因——失败 DTO message 投影） */
export interface GuardVerdict {
  readonly allowed: boolean
  readonly cause?: string
}

/**
 * tool 层相位守卫（纯函数——两支全约束；core transitionFeature 自身无单调机械约束，
 * 本守卫是 tool 面唯一防线）：
 * - 有任务（taskDerived ≠ null）：仅 toStatus ≡ taskDerived 放行；
 * - 无任务：仅 archived 或 order(to) ≥ max(order(cur), docPhaseMax) 放行。
 */
export function deriveGuardVerdict(snapshot: FeaturePhaseSnapshot, toStatus: FeatureStatus): GuardVerdict {
  const taskPhase = deriveTaskPhase(snapshot.taskStatuses)
  if (taskPhase !== null) {
    return taskPhase === toStatus
      ? { allowed: true }
      : {
          allowed: false,
          cause:
            `有任务 feature：目标相位须 ≡ deriveTaskPhase = ${taskPhase}` +
            `（taskStatuses [${snapshot.taskStatuses.join(', ')}]），收到 ${toStatus}`,
        }
  }
  if (toStatus === 'archived') return { allowed: true }
  const doc = docPhaseMax(snapshot.docKinds)
  const floor = Math.max(statusOrder(snapshot.featureStatus), doc !== null ? statusOrder(doc) : -1)
  return statusOrder(toStatus) >= floor
    ? { allowed: true }
    : {
        allowed: false,
        cause:
          `无任务 feature：单调前推须 order(${toStatus}) ≥ max(order(${snapshot.featureStatus})` +
          `${doc !== null ? `, docPhaseMax=${doc}` : ''})，回拨/落后落点拒`,
      }
}

/** 守卫拒绝（typed 失败 DTO 载体——ERR_INVALID_TRANSITION 同源码面） */
class PhaseGuardError extends Error {
  readonly code = 'ERR_INVALID_TRANSITION'
  constructor(snapshot: FeaturePhaseSnapshot, toStatus: FeatureStatus, cause: string) {
    super(`transitionFeature 相位守卫拒：feature ${snapshot.slug} → ${toStatus}——${cause}`)
    this.name = 'PhaseGuardError'
  }
}

/** slug 解析未命中（typed 404——与 core FeatureNotFoundError 同码面） */
class FeatureSlugNotFoundError extends Error {
  readonly code = 'ERR_FEATURE_NOT_FOUND'
  constructor(slug: string) {
    super(`feature slug ${slug} 未命中（ERR_FEATURE_NOT_FOUND）`)
    this.name = 'FeatureSlugNotFoundError'
  }
}

/** agent 面参数 */
export interface TransitionFeatureToolArgs {
  /** feature 容器自然键（slug ≡ 容器目录名） */
  readonly slug: string
  readonly to_status: FeatureStatus
  /** 双前缀必带（parse 层机械强制——溯源标记） */
  readonly reason: string
}

/** 参数防御性收窄（reason 双前缀在此机械强制——parse 拒即 tool 调用前置失败） */
export function parseTransitionFeatureArgs(args: unknown): TransitionFeatureToolArgs {
  const a = requireArgsObject(args, TOOL)
  const reason = requiredString(a, 'reason', TOOL)
  if (!REASON_PREFIX.test(reason)) {
    throw new Error(`${TOOL}: reason 必带「隐式赞同：」或「显式指令：」前缀（全角冒号）——溯源标记机械强制`)
  }
  return {
    slug: requiredString(a, 'slug', TOOL),
    to_status: requiredEnum(a, 'to_status', FEATURE_STATUSES, TOOL),
    reason,
  }
}

/** FeatureRow 的注册面输出 schema（+ 失败支） */
const TRANSITION_FEATURE_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    featureId: { type: 'string' },
    slug: { type: 'string' },
    title: { type: 'string' },
    featureStatus: { type: 'string', description: 'Status after the transition.' },
    summary: { type: 'string' },
    proposalId: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['featureId', 'slug', 'title', 'featureStatus', 'createdAt', 'updatedAt'],
})

/** FeatureRow → 模型可见文本（formatOk 双友好：首行 ✓ 转移行 + 身份键值行） */
function renderTransitionResult(v: FeatureRow): readonly { type: 'text'; text: string }[] {
  return formatOk(`Feature ${v.slug} → ${v.featureStatus}`, [
    `- featureId: ${v.featureId}`,
    `- title: ${v.title}`,
    `- updatedAt: ${v.updatedAt}`,
  ])
}

/** tool 定义工厂 */
export function createTransitionFeatureTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Transition a feature to a new phase by slug. The reason must start with "隐式赞同：" or "显式指令：" (full-width colon) recording the user action that authorizes the move. Phase guard: a feature with tasks only accepts the phase derived from its task statuses; a task-free feature only accepts archived or a monotonic forward move not behind its registered docs. Rejected moves return the guard cause.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Feature slug (the feature container natural key).' },
        to_status: { type: 'string', description: `One of: ${FEATURE_STATUSES.join(', ')}.` },
        reason: {
          type: 'string',
          description:
            'Required traceability mark starting with "隐式赞同：" (implicit approval by user action) or "显式指令：" (explicit user instruction), full-width colon.',
        },
      },
      required: ['slug', 'to_status', 'reason'],
    },
    output: {
      schema: TRANSITION_FEATURE_OUTPUT_SCHEMA,
      render: (_a, value) => (isForgeToolFailure(value) ? formatFailure(value) : renderTransitionResult(value as FeatureRow)),
    },
    async execute(args: unknown, exec: ToolExecFace): Promise<FeatureRow | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseTransitionFeatureArgs(args)
        const features = deps.features
        if (features === undefined) {
          throw new Error(`${TOOL}: forgeFeatures service unavailable（装配缺席——降级不静默代转）`)
        }
        const projectId = requireProjectId(deps.resolveProjectId, session)
        // TOCTOU 关闭条件（proposal §2.3 / verification report-round2 V-1b）：以下快照读取
        // （两 list* 服务体同步读库）→ 守卫判定 → core transitionFeature 调用全程无 await
        // ——.then 微任务链不让位宏任务，better-sqlite3 单连接同步写事务不可穿插，微任务
        // 链闭合、宏任务不可穿插（测试锚定：transition-feature.test.ts 宏任务哨兵用例）。
        return features.listFeatures({ projectId }).then((cards) =>
          features.listFeatureDocs({ projectId }).then((docs) => {
            // slug→featureId 服务内解析（upsertFeatureDoc 先例同法——调用方不持 id）
            const target: FeatureCard | undefined = cards.find((c) => c.slug === parsed.slug)
            if (target === undefined) throw new FeatureSlugNotFoundError(parsed.slug)
            const snapshot: FeaturePhaseSnapshot = {
              featureId: target.featureId,
              slug: target.slug,
              featureStatus: target.featureStatus,
              docKinds: docs.filter((d) => d.featureId === target.featureId).map((d) => d.docKind),
              // 七态分布展开为行集快照（byStatus 计数 → taskStatuses 列）
              taskStatuses: TASK_STATUSES.flatMap((s) => Array.from({ length: target.byStatus[s] ?? 0 }, () => s)),
            }
            const verdict = deriveGuardVerdict(snapshot, parsed.to_status)
            if (!verdict.allowed) {
              throw new PhaseGuardError(snapshot, parsed.to_status, verdict.cause ?? '守卫拒')
            }
            const input: TransitionFeatureInput = {
              projectId,
              featureId: snapshot.featureId,
              toStatus: parsed.to_status,
              reason: parsed.reason,
            }
            // 同步 span 尾：core 服务体自调用起同步执行至写事务提交（feature_records
            // transition 行伴随——verb=transition、reason 载前缀标记）
            return features.transitionFeature(input)
          }),
        )
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), TOOL, failure))
    },
  }
}
