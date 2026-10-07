// addTask——任务域写动词（任务 2.3；tech-design §Interface 1「动词内聚不变量」+ db-schema
// §4 动词矩阵 addTask 行 + §6-14 增量环校验 + §6-35⑦ localId 混合分配 + C2/C6 fix 链裁决）。
// 定位：业务（forge/tasks 子域）。import 边：→ forge/workspace/（共享句柄/事件）与同域
// errors/phase-deriver；四域互禁 import 彼此（Hard Rule），不触 project-service（本动词零中央路由）。
//
// 单事务全成全败（Hard Rule）：tasks 行（id uuid + localId 分配 + slug ≡ feature slug 归属校验）
// → edges 行（dependsOn manual / block-source fix-chain）→ records 行（add + 源 auto-block），
// 任一步拒绝（typed error）整体回滚零残留；闭包尾部（提交后）emitTasksChanged。一律 prepared
// statements（Hard Rule）。actor 由通道推断不收输入面（Interface 1 路由约定）：addTask =
// tool 专属动词（Interface 7——add 不上 RPC），add 记录 actor 恒 'plugin-tool'；auto-block =
// 写路径内聚的系统效果（不经转移校验面——state-machine 注记），actor 'core'。
//
// 顺序（事务内）：feature 解析 → sourceTask 解析（同 feature 归属）→ 任务级去重（纯读命中即
// 返回 reused=true——老 forge「Dedup is a pure read」平移）→ dependsOn 解析（同 feature 前置）
// → localId 分配（常规数值顺延 / fix-N·disc-N 语义前缀）→ 链深 ≤6 → 增量环校验（无 dependsOn
// → O(1) 结构性无环；dependsOn × block-source 组合 → 自 D 沿既有出边可达性 DFS 找 S，§6-14）
// → 相位漂移增量断言（先于写）→ 写入 → 相位重算（单调只进推导机单源）。
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  AddTaskInput,
  AddTaskResult,
  DocKind,
  FeatureStatus,
  TaskStatus,
  TaskType,
} from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import type { ForgeTaskEvents } from '../workspace/events.js'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import {
  ChainDepthExceededError,
  CycleDetectedError,
  TaskExistsError,
  TaskNotFoundError,
  TasksFeatureNotFoundError,
} from './errors.js'
import { assertPhaseInvariant, deriveFeaturePhase } from './phase-deriver.js'

/** 动词装配依赖（service.ts 装配面同形结构传入） */
export interface TasksVerbDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
  /** 写后事件发射器（事务提交后 emitTasksChanged） */
  readonly events: ForgeTaskEvents
}

/** fix 链深上限（C6 用户裁决：≤6，较老 forge Max nesting 3 放宽） */
export const FIX_CHAIN_DEPTH_LIMIT = 6

/** 任务行最小定位形状（解析/去重/链计数消费；全列读面归 query/读动词） */
interface TaskKeyRow {
  id: string
  slug: string
  local_id: string
  task_status: TaskStatus
  task_type: TaskType
  source_task_id: string | null
  feature_id: string
}

/** 自然键复合呈现（'slug/localId'——dispatchPrompt TASK_ID / 环路径节点同口径） */
function naturalKey(slug: string, localId: string): string {
  return `${slug}/${localId}`
}

/** better-sqlite3 UNIQUE/PK 违例判据（code + 消息定位表——两级去重的存储级拒绝面） */
export function isUniqueViolation(cause: unknown, tableHint: string): boolean {
  if (!(cause instanceof Error)) return false
  const code = (cause as { code?: unknown }).code
  return (
    (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') &&
    cause.message.includes(tableHint)
  )
}

/**
 * localId 混合分配（§6-35⑦）：常规任务数值顺延（max(major, minor) 的 minor + 1，如 2.7 → 2.8；
 * 空库起点 1.1）+ 动态追加语义前缀 fix-N / disc-N（max(existing prefix-N) + 1——老 forge
 * generateAutoID 平移；自动任务一眼可辨）。计数作用域 = feature（UNIQUE(slug, local_id)）。
 */
export function allocateLocalId(
  db: Database.Database,
  featureSlug: string,
  prefix: 'numeric' | 'fix' | 'disc',
): string {
  const rows = db.prepare<unknown[], { local_id: string }>(`SELECT local_id FROM tasks WHERE slug = ?`).all(featureSlug)
  if (prefix === 'numeric') {
    let maxMajor = 0
    let maxMinor = 0
    let seen = false
    for (const { local_id } of rows) {
      const m = /^(\d+)(?:\.(\d+))?$/.exec(local_id)
      if (m === null) continue
      const major = Number(m[1])
      const minor = m[2] === undefined ? 0 : Number(m[2])
      if (!seen || major > maxMajor || (major === maxMajor && minor > maxMinor)) {
        seen = true
        maxMajor = major
        maxMinor = minor
      }
    }
    return seen ? `${maxMajor}.${maxMinor + 1}` : '1.1'
  }
  const head = `${prefix}-`
  let maxN = 0
  for (const { local_id } of rows) {
    if (!local_id.startsWith(head)) continue
    const rest = local_id.slice(head.length)
    if (/^\d+$/.test(rest)) maxN = Math.max(maxN, Number(rest))
  }
  return `${head}${maxN + 1}`
}

/**
 * 可达性 DFS（§6-14：新边 (S←T)+(T←D) 成环 ⟺ D 经既有出边可达 S——非全图扫描）。
 * 出边方向 = (task_id=等待方 → prerequisite_id=前置方)。命中返回路径 [from, …, target]，未命中 null。
 */
function findPathThroughOutEdges(
  db: Database.Database,
  fromId: string,
  targetId: string,
): string[] | null {
  const next = db.prepare<unknown[], { prerequisite_id: string }>(
    `SELECT prerequisite_id FROM task_edges WHERE task_id = ?`,
  )
  const parent = new Map<string, string>()
  const visited = new Set<string>([fromId])
  const stack: string[] = [fromId]
  while (stack.length > 0) {
    const cur = stack.pop() as string
    if (cur === targetId) {
      const path: string[] = []
      let node: string | undefined = cur
      while (node !== undefined) {
        path.unshift(node)
        if (node === fromId) break
        node = parent.get(node)
      }
      return path
    }
    for (const row of next.all(cur)) {
      const n = row.prerequisite_id
      if (visited.has(n)) continue
      visited.add(n)
      parent.set(n, cur)
      stack.push(n)
    }
  }
  return null
}

/** 批量自然键水化（环路径/链诊断的节点呈现——'slug/localId' 复合） */
function naturalKeysByIds(db: Database.Database, ids: readonly string[]): Map<string, string> {
  const keys = new Map<string, string>()
  if (ids.length === 0) return keys
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare<unknown[], { id: string; slug: string; local_id: string }>(
      `SELECT id, slug, local_id FROM tasks WHERE id IN (${placeholders})`,
    )
    .all(...ids)
  for (const r of rows) keys.set(r.id, naturalKey(r.slug, r.local_id))
  return keys
}

/** feature 相位聚合读取（推导机输入快照——事务内单源读；与 features 域同构，域内就近重述；
 *  2.5 transitionTask 写前断言/写后重算同域复用） */
export function readPhaseInput(db: Database.Database, featureId: string): {
  docKinds: DocKind[]
  taskStatuses: TaskStatus[]
} {
  const docKinds = db
    .prepare<unknown[], { doc_kind: DocKind }>(`SELECT doc_kind FROM feature_documents WHERE feature_id = ?`)
    .all(featureId)
    .map((r) => r.doc_kind)
  const taskStatuses = db
    .prepare<unknown[], { task_status: TaskStatus }>(`SELECT task_status FROM tasks WHERE feature_id = ?`)
    .all(featureId)
    .map((r) => r.task_status)
  return { docKinds, taskStatuses }
}

/** 源链计数（沿 source_task_id 上溯——链深 = source 边数；根先序返回；漂移环防御 fail-loud） */
function sourceAncestry(db: Database.Database, sourceId: string): TaskKeyRow[] {
  const byId = db.prepare<unknown[], TaskKeyRow>(
    `SELECT id, slug, local_id, task_status, task_type, source_task_id, feature_id FROM tasks WHERE id = ?`,
  )
  const collected: TaskKeyRow[] = []
  const visited = new Set<string>([sourceId])
  let cursor: TaskKeyRow | undefined = byId.get(sourceId)
  while (cursor !== undefined && cursor.source_task_id !== null) {
    if (visited.has(cursor.source_task_id)) {
      throw new Error(`source_task_id 链成环（数据漂移）：${cursor.id} → ${cursor.source_task_id}`)
    }
    visited.add(cursor.source_task_id)
    cursor = byId.get(cursor.source_task_id)
    if (cursor !== undefined) collected.push(cursor)
  }
  return collected.reverse() // 根先序（诊断链呈现 root → … → 源）
}

/** Interface 1 addTask：tasks 行 → edges 行 → records 行单事务全成全败（详见文件头） */
export async function addTask(deps: TasksVerbDeps, input: AddTaskInput): Promise<AddTaskResult> {
  const db = deps.store.ensureOpen(input.projectId)
  const now = new Date().toISOString()

  const result = withTransaction(db, (): AddTaskResult => {
    // ① 容器解析（M3 契约垫片：feature 容器 = M2 语义等价特例——source.kind 判别后按 slug 归属
    //    校验；proposal 容器 = M3 双轨，schema source 双列随 1.2 到场前 fail-loud 拒绝）
    if (input.source.kind !== 'feature') {
      throw new Error(
        `addTask: proposal 容器任务落地于 M3 1.2/2.4（当前 schema = M2 feature 单轨）：${input.source.slug}`,
      )
    }
    const feature = db
      .prepare<unknown[], { id: string; slug: string; feature_status: FeatureStatus }>(
        `SELECT id, slug, feature_status FROM features WHERE slug = ?`,
      )
      .get(input.source.slug)
    if (feature === undefined) {
      throw new TasksFeatureNotFoundError({ projectId: input.projectId, featureSlug: input.source.slug })
    }

    // ② sourceTask 解析（UNIQUE(slug, local_id) 查捞 → taskId；命中他 feature 同键 = 同 feature
    //    边服务不变量（er-diagram 差异清单 #9）不满足 → 按未命中拒）
    let source: TaskKeyRow | undefined
    if (input.sourceTask !== undefined) {
      source = db
        .prepare<unknown[], TaskKeyRow>(
          `SELECT id, slug, local_id, task_status, task_type, source_task_id, feature_id FROM tasks
           WHERE slug = ? AND local_id = ?`,
        )
        .get(input.sourceTask.slug, input.sourceTask.localId)
      if (source === undefined || source.feature_id !== feature.id) {
        throw new TaskNotFoundError({
          projectId: input.projectId,
          taskRef: input.sourceTask,
          featureSlug: input.source.slug,
        })
      }
    }

    // ③ 任务级去重（两级去重之一——纯读零变更，老 forge built-in dedup 平移）：同源同型且未终态
    //    → 复用既有行（reused=true；不重复建链/不重复置 blocked——持久边已承载等待事实）
    if (source !== undefined) {
      const active = db
        .prepare<unknown[], { id: string; slug: string; local_id: string }>(
          `SELECT id, slug, local_id FROM tasks
           WHERE source_task_id = ? AND task_type = ?
             AND task_status NOT IN ('completed', 'skipped', 'rejected')
           ORDER BY created_at, id LIMIT 1`,
        )
        .get(source.id, input.type)
      if (active !== undefined) {
        return { taskId: active.id, slug: active.slug, localId: active.local_id, reused: true }
      }
    }

    // ④ dependsOn 解析（同 feature 前置声明——slug 作用域查捞天然排除跨 feature 边）
    const depends: TaskKeyRow[] = []
    for (const localId of input.dependsOn ?? []) {
      const dep = db
        .prepare<unknown[], TaskKeyRow>(
          `SELECT id, slug, local_id, task_status, task_type, source_task_id, feature_id FROM tasks
           WHERE slug = ? AND local_id = ?`,
        )
        .get(input.source.slug, localId)
      if (dep === undefined) {
        throw new TaskNotFoundError({
          projectId: input.projectId,
          taskRef: { slug: input.source.slug, localId },
          featureSlug: input.source.slug,
        })
      }
      depends.push(dep)
    }

    // ⑤ localId 分配（§6-35⑦：blockSource → fix-N / 携源未阻 → disc-N / 常规 → 数值顺延）
    const localId = allocateLocalId(
      db,
      feature.slug,
      input.sourceTask !== undefined ? (input.blockSource === true ? 'fix' : 'disc') : 'numeric',
    )

    // ⑥ fix 链深 ≤6（C6：沿 source_task_id 链计数——新任务链深 = 源链长 + 1）
    if (source !== undefined) {
      const ancestry = sourceAncestry(db, source.id)
      const depth = ancestry.length + 1
      if (depth > FIX_CHAIN_DEPTH_LIMIT) {
        const keys = naturalKeysByIds(db, ancestry.map((t) => t.id))
        const chain = [...ancestry.map((t) => keys.get(t.id) ?? t.id), naturalKey(source.slug, source.local_id)]
        throw new ChainDepthExceededError({
          projectId: input.projectId,
          featureSlug: feature.slug,
          chain,
          depth,
          limit: FIX_CHAIN_DEPTH_LIMIT,
        })
      }
    }

    // ⑦ 增量环校验（§6-14）：新节点无 dependsOn → 结构性无环 O(1)（fix/disc 链常态，零图遍历）；
    //    dependsOn × block-source 组合（M2 动词面唯一环构造入口，B.5-1）→ 自各 D 沿既有出边
    //    可达性 DFS 找 S（D===S 两步环直报），命中即 ERR_CYCLE_DETECTED 回报完整环路径。
    if (input.blockSource === true) {
      if (source === undefined) {
        throw new Error('blockSource 需要 sourceTask（fix 链协议数据面——输入契约违例）')
      }
      for (const d of depends) {
        const hopPath = d.id === source.id ? [d.id] : findPathThroughOutEdges(db, d.id, source.id)
        if (hopPath !== null) {
          const keys = naturalKeysByIds(db, [source.id, ...hopPath])
          const tKey = naturalKey(feature.slug, localId)
          const cycle = [
            keys.get(source.id) ?? source.id,
            tKey,
            ...hopPath.map((id) => keys.get(id) ?? id),
          ]
          throw new CycleDetectedError({ cycle })
        }
      }
    }

    // ⑧ 相位漂移增量断言（写事务内先于写——受影响 feature 承重漂移防护）
    const before = readPhaseInput(db, feature.id)
    assertPhaseInvariant({
      featureStatus: feature.feature_status,
      docKinds: before.docKinds,
      taskStatuses: before.taskStatuses,
      featureSlug: feature.slug,
    })

    // ⑨ tasks 行（id uuid 生成 + slug ≡ feature.slug + 缺省 pending/medium/false 族）；
    //    UNIQUE(slug, local_id) 冲突 → ERR_TASK_EXISTS（分配器顺延构造下为防御面——并发面缺席
    //    单写者，映射承诺 AC 契约）
    const taskId = randomUUID()
    try {
      db.prepare(
        `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, task_desc, priority,
           estimated_time, vars_json, source_task_id, blocked_reason, main_session, breaking,
           coverage, complexity, surface_key, surface_type, feature_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        taskId,
        feature.slug,
        localId,
        input.title,
        input.type,
        input.taskDesc ?? null,
        input.priority ?? null,
        input.estimatedTime ?? null,
        input.vars === undefined ? null : JSON.stringify(input.vars),
        source?.id ?? null,
        0, // main_session：M3 裁决⑦砍除——输入面已移除，列随 1.2 schema v1 直改退役（恒 0 垫片）
        input.breaking === true ? 1 : 0,
        input.coverage ?? null,
        input.complexity ?? 'medium',
        input.surfaceKey ?? null,
        input.surfaceType ?? null,
        feature.id,
        now,
        now,
      )
    } catch (cause) {
      if (isUniqueViolation(cause, 'tasks.slug')) {
        throw new TaskExistsError({ projectId: input.projectId, slug: feature.slug, localId })
      }
      throw cause
    }

    // ⑩ edges 行：dependsOn = manual（重复报错——PK 冲突映射 ERR_TASK_EXISTS）；block-source =
    //    fix-chain（INSERT OR IGNORE——边级 PK 幂等「fix-chain 重复视为成功」）
    const insertEdge = db.prepare(
      `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    const insertEdgeIgnore = db.prepare(
      `INSERT OR IGNORE INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    for (const dep of depends) {
      try {
        insertEdge.run(taskId, dep.id, 'manual', now, now)
      } catch (cause) {
        if (isUniqueViolation(cause, 'task_edges')) {
          throw new TaskExistsError({ projectId: input.projectId, edge: { taskId, prerequisiteId: dep.id } })
        }
        throw cause
      }
    }

    // ⑪ records 行：add（新任务，actor='plugin-tool'——add 为 tool 专属动词，通道即 actor）
    db.prepare(
      `INSERT INTO task_records (task_id, verb, actor, created_at, updated_at)
       VALUES (?, 'add', 'plugin-tool', ?, ?)`,
    ).run(taskId, now, now)

    // ⑫ block-source 写路径内聚效果（C2：源同事务置 blocked + auto-block 记录，不经转移校验面）
    if (input.blockSource === true && source !== undefined) {
      insertEdgeIgnore.run(source.id, taskId, 'fix-chain', now, now)
      db.prepare(`UPDATE tasks SET task_status = 'blocked', updated_at = ? WHERE id = ?`).run(now, source.id)
      db.prepare(
        `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, created_at, updated_at)
         VALUES (?, 'auto-block', ?, 'blocked', 'core', ?, ?)`,
      ).run(source.id, source.task_status, now, now)
    }

    // ⑬ 相位重算（单调只进——推导机单源；回退边合法：completed feature 追加任务 → tasks 快照诚实）
    const after = readPhaseInput(db, feature.id)
    const derived = deriveFeaturePhase({
      current: feature.feature_status,
      docKinds: after.docKinds,
      taskStatuses: after.taskStatuses,
    })
    if (derived !== feature.feature_status) {
      db.prepare(`UPDATE features SET feature_status = ?, updated_at = ? WHERE id = ?`).run(
        derived,
        now,
        feature.id,
      )
    }

    return { taskId, slug: feature.slug, localId, reused: false }
  })

  // 复用命中（纯读零变更）不发射；写路径事务提交后 emitTasksChanged（四域写后事件裁决）
  if (!result.reused) deps.events.emitTasksChanged(input.projectId)
  return result
}
