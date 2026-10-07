// 5.4 dogfood 录制器（tech-design §录制-回放——dogfood = 录制源；AC4 载体）。
// 三面：
//   · 重建（buildDogfoodFixture）——dogfood 跑后三源合并 → 5.1 JSONL 夹具：
//     ① forge.db 审计（task_records 追加序 = 动词序列真相——args 自记录行水化；
//        core 效果行 auto-block/auto-restore 不入 verb 面，恢复清单入 submit observed）；
//     ② dispatchPrompt 全文（digest → text：模型派发会话文件 tool/result render 文本抽取
//        + harness 桥调用直录——全文不入库 §6-11，会话文件 = 模型侧唯一可查面）；
//     ③ 主侧测试钩子事件记账（tasks-changed 推送 = 事件行）。
//     完整性 fail-loud：每条 claim 记录的 digest 必须命中全文 Map 且 sha256 前 12 逐字一致
//     （录制源完整性——回放 golden 断言的原料不可带伤落盘）。
//   · 抽取（extractBriefTexts）——session tool/result 文本块中 claimTask render 标记行
//     （"Dispatch brief — hand to the executor verbatim:"）之后即简报全文（render 原文投影，
//     claim-task.ts renderClaimResult 单源）。
//   · 种行（seedDogfoodTaskRow）——受控初态直写（db-insert 形制）：相位号 localId（2.1/3.1
//     ——addTask 数值顺延不可达面）与 desc/priority 全字段（core harness seedTask 未载面）。
import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { TaskPriority } from '../../../packages/contracts/src/dto/forge.js'
import type { TaskType } from '../../../packages/contracts/src/labels.js'
import type { SessionEvent } from '../session-files.js'
import { createFixtureBuilder, type FixtureMeta } from './fixtures.js'
import type { ReplayFixture, ReplayServiceName, ReplayWriteVerb } from './format.js'

/** claimTask render 标记行（claim-task.ts renderClaimResult——标记行后 = 简报全文） */
export const BRIEF_RENDER_MARKER = 'Dispatch brief — hand to the executor verbatim:\n'

// ─── 审计读面（task_records / tasks / task_edges 水化——追加序真相） ───

/** dogfood 审计记录行（task_records 水化任务自然键） */
export interface DogfoodAuditRecord {
  readonly id: number
  readonly taskId: string
  readonly slug: string
  readonly localId: string
  readonly verb: string
  readonly fromStatus: string | null
  readonly toStatus: string | null
  readonly reason: string | null
  readonly summary: string | null
  readonly filesJson: string | null
  readonly gateJson: string | null
  readonly commitHash: string | null
  readonly dispatchDigest: string | null
  readonly actor: string
  readonly sessionId: string | null
  readonly createdAt: string
}

/** tasks 行（重建 addTask/claim args 的字段源） */
export interface DogfoodTaskRow {
  readonly id: string
  readonly slug: string
  readonly localId: string
  readonly title: string
  readonly taskType: TaskType
  readonly priority: TaskPriority | null
  readonly taskDesc: string | null
  readonly varsJson: string | null
  readonly sourceTaskId: string | null
  readonly createdAt: string
}

/** task_edges 行（task_id=等待方 ← prerequisite_id=前置方） */
export interface DogfoodEdgeRow {
  readonly taskId: string
  readonly prerequisiteId: string
  readonly origin: string
}

/** 审计三表全读（追加序 = records.id 升序；e2e post-hoc 消费——app 关停后直读） */
export function readDogfoodAudit(db: Database.Database): {
  readonly tasks: readonly DogfoodTaskRow[]
  readonly edges: readonly DogfoodEdgeRow[]
  readonly records: readonly DogfoodAuditRecord[]
} {
  const tasks = db
    .prepare<unknown[], DogfoodTaskRow>(
      `SELECT id, slug, local_id AS localId, title, task_type AS taskType, priority, task_desc AS taskDesc,
         vars_json AS varsJson, source_task_id AS sourceTaskId, created_at AS createdAt
       FROM tasks ORDER BY created_at, id`,
    )
    .all()
  const edges = db
    .prepare<unknown[], DogfoodEdgeRow>(
      `SELECT task_id AS taskId, prerequisite_id AS prerequisiteId, origin FROM task_edges ORDER BY task_id, prerequisite_id`,
    )
    .all()
  const records = db
    .prepare<unknown[], DogfoodAuditRecord>(
      `SELECT r.id, r.task_id AS taskId, t.slug AS slug, t.local_id AS localId, r.verb,
         r.from_status AS fromStatus, r.to_status AS toStatus, r.reason, r.summary,
         r.files_json AS filesJson, r.gate_json AS gateJson, r.commit_hash AS commitHash,
         r.dispatch_digest AS dispatchDigest, r.actor, r.session_id AS sessionId, r.created_at AS createdAt
       FROM task_records r JOIN tasks t ON t.id = r.task_id ORDER BY r.id`,
    )
    .all()
  return { tasks, edges, records }
}

// ─── 全文抽取（会话文件 tool/result——digest 键 Map） ───

/**
 * 会话事件流 → 简报全文 Map（digest → text）。扫全部 tool/result 文本块：含 render 标记行
 * 的块取标记行后全文，sha-256 前 12 hex 为键（与 claim record digest 同式——重建时按 digest
 * 命中）。Z1 空领取与他工具结果自然忽略（无标记行）。
 */
export function extractBriefTexts(events: readonly SessionEvent[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const event of events) {
    if (event.type !== 'tool/result') continue
    const blocks = event.data?.message?.content ?? []
    for (const block of blocks) {
      const text = block.text
      if (text === undefined) continue
      const at = text.indexOf(BRIEF_RENDER_MARKER)
      if (at === -1) continue
      const brief = text.slice(at + BRIEF_RENDER_MARKER.length)
      if (brief === '') continue
      out.set(digestOfText(brief), brief)
    }
  }
  return out
}

/** sha-256(全文) 前 12 hex（digest.ts 同式——录制侧独立实现，防 core 内部位漂移静默通过） */
function digestOfText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)
}

// ─── 夹具重建（审计 + 全文 + 事件 → 5.1 JSONL） ───

/** harness 桥调用直录行（不经会话文件——claim 全文经 result 直载）。桥调用走 core 恒有
 * 审计行（verb/observed 由审计重建，不重复入列）；本面仅贡献 claim 简报全文（digest 键）。 */
export interface DogfoodHarnessCall {
  readonly service: ReplayServiceName
  readonly verb: ReplayWriteVerb
  /** 调用时刻（epoch ms——与审计 created_at 交织定序） */
  readonly at: number
  readonly args: Record<string, unknown>
  readonly result: unknown
}

/** 重建入参（三源） */
export interface DogfoodFixtureInput {
  readonly projectId: string
  readonly tasks: readonly DogfoodTaskRow[]
  readonly edges: readonly DogfoodEdgeRow[]
  readonly records: readonly DogfoodAuditRecord[]
  /** 模型派发会话抽取的简报全文（digest → text） */
  readonly briefTexts: ReadonlyMap<string, string>
  readonly harnessCalls: readonly DogfoodHarnessCall[]
  /** 主侧测试钩子事件记账（at = 主进程收讫时刻） */
  readonly events: readonly { readonly at: number; readonly payload: { readonly projectId: string } }[]
  readonly meta?: FixtureMeta
}

/** verb/observed 行原料（审计行与 harness 调用归一——按时刻交织） */
interface Contribution {
  readonly at: number
  readonly make: (b: ReturnType<typeof createFixtureBuilder>) => void
}

/**
 * 三源合并 → ReplayFixture（AC4）。verb 行 = 依时序的写动词单参对象（回放执行面）；
 * observed 行 = 动词结算（claim 全文/submit 结算+恢复清单）；event 行 = tasks-changed 记账。
 * fail-loud：claim digest 缺全文 / 全文指纹失配 / files·gate JSON 畸形 → 抛错（录制源不可带伤）。
 */
export function buildDogfoodFixture(input: DogfoodFixtureInput): ReplayFixture {
  const taskById = new Map(input.tasks.map((t) => [t.id, t]))
  const localIdOf = (taskId: string): string => {
    const row = taskById.get(taskId)
    if (row === undefined) throw new Error(`[dogfood-record] 审计行任务缺席（tasks 表漂移）：${taskId}`)
    return row.localId
  }
  // 全文面：模型会话抽取 + harness claim result 直载（digest 键归一）
  const briefTexts = new Map(input.briefTexts)
  for (const call of input.harnessCalls) {
    if (call.verb !== 'claimTask') continue
    const r = call.result as { digest?: string; dispatchPrompt?: string }
    if (typeof r?.digest === 'string' && typeof r?.dispatchPrompt === 'string') {
      briefTexts.set(r.digest, r.dispatchPrompt)
    }
  }

  /** claim 全文领取（完整性 fail-loud 两道：命中 + 指纹） */
  const briefFor = (record: DogfoodAuditRecord): string => {
    const digest = record.dispatchDigest ?? ''
    const text = briefTexts.get(digest)
    if (text === undefined) {
      throw new Error(
        `[dogfood-record] claim 全文缺席：${record.slug}/${record.localId}（record #${record.id}）digest=${digest} 不在会话抽取/harness 直录面——录制源不完整，拒绝落盘`,
      )
    }
    if (digestOfText(text) !== digest) {
      throw new Error(
        `[dogfood-record] claim 全文指纹失配：${record.slug}/${record.localId}（record #${record.id}）digest=${digest} ≠ sha256(全文) 前 12——抽取面漂移`,
      )
    }
    return text
  }

  const parseJson = <T>(raw: string | null, what: string, taskId: string): T | undefined => {
    if (raw === null) return undefined
    try {
      return JSON.parse(raw) as T
    } catch {
      throw new Error(`[dogfood-record] ${what} JSON 畸形：task=${taskId} raw=${raw.slice(0, 60)}`)
    }
  }

  /** 审计行 → verb+observed 行对（core 效果行 auto-block/auto-restore/transition 不入 verb 面） */
  const contributions: Contribution[] = []
  for (const record of input.records) {
    const task = taskById.get(record.taskId)
    if (task === undefined) throw new Error(`[dogfood-record] 审计行任务缺席：${record.taskId}`)
    const at = Date.parse(record.createdAt)
    if (record.verb === 'claim' && record.actor === 'plugin-tool') {
      const brief = briefFor(record)
      const reclaimed = record.fromStatus === null && record.toStatus === null
      contributions.push({
        at,
        make: (b) => {
          b.verb('forgeTasks', 'claimTask', {
            projectId: input.projectId,
            taskRef: { slug: record.slug, localId: record.localId },
            sessionId: record.sessionId ?? '',
          }).observed('forgeTasks', 'claimTask', {
            task: {
              taskId: task.id, slug: task.slug, localId: task.localId, featureId: '', title: task.title,
              taskType: task.taskType, taskStatus: 'in_progress', ...(task.taskDesc !== null ? { taskDesc: task.taskDesc } : {}),
              ...(task.priority !== null ? { priority: task.priority } : {}),
            },
            dispatchPrompt: brief,
            digest: record.dispatchDigest,
            reclaimed,
          }, record.createdAt)
        },
      })
    } else if (record.verb === 'submit' && record.actor === 'plugin-tool') {
      if (record.toStatus !== 'completed' && record.toStatus !== 'blocked') {
        throw new Error(`[dogfood-record] submit 记录 toStatus 异常：${record.slug}/${record.localId} → ${String(record.toStatus)}`)
      }
      const result = record.toStatus === 'completed' ? 'success' : 'blocked'
      const files = parseJson<readonly string[]>(record.filesJson, 'files_json', record.taskId)
      const gate = parseJson<Record<string, unknown>>(record.gateJson, 'gate_json', record.taskId)
      // 恢复清单：同事务紧随的 auto-restore 行（core 效果——恢复钩子在 submit 事务内落账）
      const restored = input.records
        .filter(
          (r) =>
            r.verb === 'auto-restore' &&
            r.actor === 'core' &&
            r.id > record.id &&
            r.createdAt === record.createdAt,
        )
        .map((r) => ({ slug: r.slug, localId: localIdOf(r.taskId) }))
      contributions.push({
        at,
        make: (b) => {
          b.verb('forgeTasks', 'submitTask', {
            projectId: input.projectId,
            taskRef: { slug: record.slug, localId: record.localId },
            result,
            ...(result === 'blocked' ? { reason: record.reason ?? '' } : { summary: record.summary ?? '' }),
            ...(files !== undefined ? { files: [...files] } : {}),
            ...(gate !== undefined ? { gate } : {}),
            ...(record.commitHash !== null ? { commitHash: record.commitHash } : {}),
            sessionId: record.sessionId ?? '',
          }).observed(
            'forgeTasks',
            'submitTask',
            { taskId: record.taskId, status: record.toStatus, restored },
            record.createdAt,
          )
        },
      })
    } else if (record.verb === 'add' && record.actor === 'plugin-tool') {
      // fix 链源（edge task_id=源 ← prerequisite=fix，origin fix-chain）与 manual 依赖边
      const fixEdge = input.edges.find((e) => e.origin === 'fix-chain' && e.prerequisiteId === task.id)
      const sourceRow = fixEdge !== undefined ? taskById.get(fixEdge.taskId) : undefined
      const dependsOn = input.edges
        .filter((e) => e.taskId === task.id && e.origin === 'manual')
        .map((e) => localIdOf(e.prerequisiteId))
      const vars = parseJson<Record<string, string>>(task.varsJson, 'vars_json', task.id)
      contributions.push({
        at,
        make: (b) => {
          b.verb('forgeTasks', 'addTask', {
            projectId: input.projectId,
            featureSlug: task.slug,
            title: task.title,
            type: task.taskType,
            ...(task.taskDesc !== null ? { taskDesc: task.taskDesc } : {}),
            ...(task.priority !== null ? { priority: task.priority } : {}),
            ...(vars !== undefined ? { vars } : {}),
            ...(dependsOn.length > 0 ? { dependsOn } : {}),
            ...(sourceRow !== undefined ? { sourceTask: { slug: sourceRow.slug, localId: sourceRow.localId }, blockSource: true } : {}),
          }).observed(
            'forgeTasks',
            'addTask',
            { taskId: task.id, slug: task.slug, localId: task.localId, reused: false },
            record.createdAt,
          )
        },
      })
    }
  }
  // harness 桥调用：审计行已承载 verb/observed（桥调用走 core 单写门恒留审计），此处不
  // 重复入列——其 claim 结果的简报全文已并入 briefTexts（上文归一面）。

  // 交织定序（时刻 → 审计 id 稳定序——同刻保审计序：contributions 数组序即审计序）
  const ordered = contributions.map((c, i) => ({ c, i })).sort((a, b) => a.c.at - b.c.at || a.i - b.i)
  const builder = createFixtureBuilder({ source: 'dogfood', ...input.meta })
  for (const { c } of ordered) c.make(builder)
  for (const e of input.events) builder.event(e.payload.projectId, new Date(e.at).toISOString())
  return builder.build()
}

// ─── 受控初态种行（db-insert 形制——相位号 localId + desc/priority 全字段） ───

/** dogfood 任务种行入参（addTask 数值顺延不可达面：相位号 localId 由调用参直写） */
export interface DogfoodSeedTask {
  readonly title: string
  readonly taskType: TaskType
  readonly priority?: TaskPriority
  readonly taskDesc?: string
}

/** tasks 行直写（core harness seedTask 全字段扩展——slug ≡ feature slug 不变量沿袭；
 *  M3 1.2：source 双列 + mode 快照直写——与 addTask 写路径同形） */
export function seedDogfoodTaskRow(
  db: Database.Database,
  featureSlug: string,
  localId: string,
  o: DogfoodSeedTask,
): string {
  const id = `t-${featureSlug}-${localId}`
  const ts = new Date().toISOString()
  db.prepare(
    `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, task_desc, priority,
       source_kind, source_id, mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 'feature', (SELECT id FROM features WHERE slug = ?), 'expedition', ?, ?)`,
  ).run(
    id,
    featureSlug,
    localId,
    o.title,
    o.taskType,
    o.taskDesc ?? null,
    o.priority ?? null,
    featureSlug,
    ts,
    ts,
  )
  return id
}
