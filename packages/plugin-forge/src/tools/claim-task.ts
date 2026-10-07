// claimTask tool 定义（定位：业务——Interface 8 六动词之一）。
// 任务定位 = slug + local_id 两显式参（Interface 8 / 身份解析约定）：成对在场 =
// 显式重入/定向领取（TaskRef）；成对缺席 = 盲选（feature_slug 可限定作用域；
// 无 taskRef 的盲选不领 in_progress——双 dispatcher 不双派发，core 语义）。
// sessionId 由 exec ctx 提取（requireSessionId——空会话拒：links/records 写源键）。
// 返回 = contracts ClaimTaskResult 透传；task:null = Z1 出口信号（循环等待/收工判据）。
// dispatchPrompt 全文必须交还 agent（render 原文投影——派发链的载荷本体）。
import type { ClaimTaskInput, ClaimTaskResult, TaskSnapshot } from '@dsh-forge/contracts'
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgeToolDeps } from './index.js'
import { optionalPair, optionalString, requireArgsObject } from './args.js'
import { requireProjectId, requireSessionId, sessionContextOf } from './session.js'

const TOOL = 'claimTask'

/** agent 面参数（显式对或盲选二择一） */
export interface ClaimTaskToolArgs {
  /** 盲选作用域（缺省 = 全库就绪池） */
  readonly feature_slug?: string
  /** 显式 TaskRef 两显式参（与 local_id 成对；slug ≡ feature slug） */
  readonly slug?: string
  readonly local_id?: string
}

/** 参数防御性收窄（成对完整性 + 显式对与 feature_slug 一致性） */
export function parseClaimTaskArgs(args: unknown): ClaimTaskToolArgs {
  const a = requireArgsObject(args, TOOL)
  const featureSlug = optionalString(a, 'feature_slug', TOOL)
  const ref = optionalPair(a, 'slug', 'local_id', TOOL)
  if (ref !== undefined && featureSlug !== undefined && featureSlug !== ref.first) {
    // slug 列 ≡ feature slug（服务不变量）——两处声明冲突即拒，不留静默优先级
    throw new Error(`${TOOL}: feature_slug (${featureSlug}) conflicts with the explicit slug (${ref.first})`)
  }
  return {
    ...(featureSlug !== undefined ? { feature_slug: featureSlug } : {}),
    ...(ref !== undefined ? { slug: ref.first, local_id: ref.second } : {}),
  }
}

/** TaskSnapshot 概要行（render 共用——身份双轨呈现 = 自然键） */
function snapshotLine(t: TaskSnapshot): string {
  return `${t.slug}/${t.localId} [${t.taskStatus}] ${t.title} (type ${t.taskType})`
}

/** ClaimTaskResult 的注册面输出 schema（嵌套快照按承重字段宽松镜像） */
const CLAIM_TASK_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    task: {
      oneOf: [
        {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            slug: { type: 'string' },
            localId: { type: 'string' },
            title: { type: 'string' },
            taskType: { type: 'string' },
            taskStatus: { type: 'string' },
          },
          required: ['taskId', 'slug', 'localId', 'title', 'taskType', 'taskStatus'],
        },
        { type: 'null' },
      ],
      description: 'Claimed task snapshot, or null when nothing is ready (exit signal: wait or finish).',
    },
    dispatchPrompt: { type: 'string', description: 'Full dispatch brief for the executor (empty when task is null).' },
    digest: { type: 'string', description: 'sha-256 of the dispatch brief, first 12 hex chars.' },
    reclaimed: { type: 'boolean', description: 'true = idempotent re-entry of an in-progress task (brief re-synthesized).' },
  },
  required: ['task', 'dispatchPrompt', 'digest', 'reclaimed'],
} as const

/** ClaimTaskResult → 模型可见文本（Z1 出口显式声明；简报全文原文投影） */
function renderClaimResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  const v = value as ClaimTaskResult
  if (v.task === null) {
    return [
      {
        type: 'text',
        text: 'No ready task in this workspace (nothing to claim) — wait for prerequisites to finish or finish the session.',
      },
    ]
  }
  const head = [
    `Task claimed: ${snapshotLine(v.task)}`,
    v.reclaimed ? '(re-entry of an in-progress task — previous run did not submit; brief re-synthesized)' : '',
  ]
    .filter((line) => line !== '')
    .join('\n')
  return [{ type: 'text', text: `${head}\nDispatch brief — hand to the executor verbatim:\n${v.dispatchPrompt}` }]
}

/** tool 定义工厂 */
export function createClaimTaskTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: TOOL,
    description:
      'Claim the next ready task from the forge pipeline (or re-enter an in-progress one by slug + local_id). Returns the task with its full dispatch brief for the executor, or task:null when nothing is ready (wait or finish — do not invent work). Dependencies must be completed or skipped before a task becomes ready.',
    parameters: {
      type: 'object',
      properties: {
        feature_slug: {
          type: 'string',
          description: 'Optional feature slug scoping the blind claim (omit to consider every feature).',
        },
        slug: {
          type: 'string',
          description: 'Explicit claim/re-entry target (pair with local_id; same value as the feature slug).',
        },
        local_id: { type: 'string', description: 'Local id of the explicit target (pair with slug).' },
      },
    },
    output: { schema: CLAIM_TASK_OUTPUT_SCHEMA, render: renderClaimResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<ClaimTaskResult> {
      const parsed = parseClaimTaskArgs(args)
      const session = sessionContextOf(exec)
      const projectId = requireProjectId(deps.resolveProjectId, session)
      const sessionId = requireSessionId(session)
      const input: ClaimTaskInput = {
        projectId,
        sessionId,
        ...(parsed.slug !== undefined && parsed.local_id !== undefined
          ? { taskRef: { slug: parsed.slug, localId: parsed.local_id } }
          : {}),
        // M3 容器化垫片（3.5 工具面适配前）：feature_slug 参数 → feature 容器引用（M2 语义等价）
        ...(parsed.feature_slug !== undefined
          ? { source: { kind: 'feature' as const, slug: parsed.feature_slug } }
          : {}),
      }
      return deps.tasks.claimTask(input)
    },
  }
}
