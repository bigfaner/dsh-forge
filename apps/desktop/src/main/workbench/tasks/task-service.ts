// workbench/tasks/task-service — 任务 CRUD 写集动词 + 读路由动词(任务 1.3)。
//
// tech-design §Interface 1「任务权威写集」的服务实现:五个写动词
// (taskAdd/taskClaim/taskTransition/taskSubmit/taskReopen)全部经 1.2
// 状态机(statemachine.ts,移植基准 = forge-cli pkg/task/statemachine.go)
// 校验后落库 —— task-repo 是 task 表唯一写入口,本模块是它的业务调用方
// (内核事务路径,Hard Rule:禁任何旁路写)。
//
// 动词语义与 Go 源逐命令对齐(移植基准 Z:\project\ai\forge\forge-cli):
//   - claim   ← internal/cmd/task/claim.go checkDependenciesMet:claim 语境
//     悬空精确依赖 vacuously satisfied(过滤不上报)——AC-2「悬空 blocker
//     显式标记不阻断」的 Go 权威依据;悬空原词仍原样落库不改写(er-diagram
//     不变式)。已解析依赖必须终态(deps.go satisfiedStatuses =
//     completed/skipped,rejected 不满足);
//   - transition ← internal/cmd/task/transition.go:role=manual;blocked →
//     pending/in_progress 的非 manual 边(phase 2)走 1.2
//     checkTransitionDeps(Go 语义:悬空 = unmet,与 claim 的容忍口径不同
//     —— 两命令在 Go 里本就是两套检查,移植保持分立);
//   - submit  ← submit.go:role=submit,目标 completed(in_progress →
//     blocked 的自动降级边由记录数据驱动,该入参面归 3.4 记录链);
//   - reopen  ← reopen.go:role=reopen,rejected/skipped → pending;
//   - add     ← pkg/task/add.go AddTask:默认 pending、自动 ID =
//     generateAutoId(disc 前缀)、精确依赖必须存在/通配依赖必须匹配 ≥1
//     (依赖引用闭合的 add 期前置;迁移摄入(1.4)的既有悬空引用不受此限,
//     直插不校验)。
//
// 权限界(tech-design §Interface 2 + 设计内定):写集仅对
// data_authority='sqlite' 项目开放;files 项目 → ERR_TASK_NOT_AUTHORITATIVE
// (明确提示走 CLI,双形态纪律 —— 判定在内核,不信任 tool 输入语义,T1)。
// 读路由(AC-3):taskGet/taskQuery 按 projects.data_authority 分流 ——
// files → task_snapshot 派生投影(M2 行为不变,经注入的既有实现);
// sqlite → task 权威表;置位仅随迁移事务(1.4),本模块只读该列。
//
// actor 审计(AC-4):每笔写动词记 updated_by(session:<id>|external|
// kernel|派发者)+ updated_at;updated_by → TaskSummary.source 的投影见
// ipc/task-summary.ts actorSourceOf。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  TaskAddInput,
  TaskClaimInput,
  TaskDetail,
  TaskGetInput,
  TaskQueryInput,
  TaskReopenInput,
  TaskSubmitInput,
  TaskSummary,
  TaskTransitionInput,
  TaskDepChainEntry,
} from '../ipc/types.ts'
import type { RepoDb, TaskStatus } from '../repos/types.ts'
import { WorkbenchRepoError } from '../repos/types.ts'
import { listSessionLinksByTask } from '../repos/session-links.ts'
import { listTaskSnapshots } from '../repos/task-snapshots.ts'
import { toTaskSummary, toTaskSummaryFromAuthoritative } from '../ipc/task-summary.ts'
import { parseRecordMarkdown } from '../indexer/parse-task.ts'
import { getUnmetDeps, resolveWildcardDep } from './deps.ts'
import { TaskIndex } from './model.ts'
import { validateTransition, checkTransitionDeps, type TransitionRole } from './statemachine.ts'
import {
  assertBoardTaskKey,
  assertFeatureSlugSegment,
  assertLocalKeySegment,
  generateAutoTaskId,
  getProjectTaskAuthority,
  getTask,
  insertTask,
  listTasks,
  listTasksByFeature,
  localIdOfTaskKey,
  TaskDomainError,
  updateTaskStatus,
  withTaskTx,
  type AuthoritativeTask,
} from './task-repo.ts'

/** blocked → pending/in_progress 非 manual 边的 phase-2 信号(statemachine 表 guardMsg 原词)。 */
const DEPS_CHECK_GUARD_MSG = 'dependencies must be checked first'

/** taskAdd 自动 ID 前缀(Go AddTask 默认 `disc`;discretionary add 惯例)。 */
const AUTO_ID_PREFIX = 'disc'

/** 服务依赖缝:files 分支详情读取(M2 行为不变)与文档根解析由 services.ts 注入。 */
export interface TaskVerbDeps {
  readonly db: RepoDb
  /**
   * files 项目的详情装配(= M2 getTaskDetail 既有实现,含 task_snapshot
   * 读 + 文档树描述/记录解析;行为钉定不随本任务改变)。
   */
  readonly readFilesTaskDetail: (projectId: string, taskKey: string) => TaskDetail
  /** 文档根(features/)绝对路径解析;项目不存在 → null。desc_path 相对此根。 */
  readonly resolveFeaturesRoot: (projectId: string) => string | null
}

/** 本模块装配产物:七个 task 动词(并入 WorkbenchVerbServices 面)。 */
export interface TaskVerbService {
  taskAdd(input: TaskAddInput, actor: string): TaskSummary
  taskClaim(input: TaskClaimInput, actor: string): TaskSummary
  taskTransition(input: TaskTransitionInput, actor: string): TaskSummary
  taskSubmit(input: TaskSubmitInput, actor: string): TaskSummary
  taskReopen(input: TaskReopenInput, actor: string): TaskSummary
  taskGet(input: TaskGetInput): TaskDetail
  taskQuery(input: TaskQueryInput): TaskSummary[]
}

/** 状态机拒绝 → ERR_TASK_STATE_INVALID(Go 消息原码透传)。 */
function stateInvalid(taskKey: string, rejection: { readonly message: string }): TaskDomainError {
  return new TaskDomainError('ERR_TASK_STATE_INVALID', `task ${taskKey}: ${rejection.message}`)
}

/** 依赖前置拒绝 → ERR_TASK_DEPS_UNSATISFIED(unmet 原词清单)。 */
function depsUnsatisfied(taskKey: string, unmet: readonly string[]): TaskDomainError {
  return new TaskDomainError(
    'ERR_TASK_DEPS_UNSATISFIED',
    `task ${taskKey} has unmet dependencies (terminal-state precondition): ${unmet.join(', ')}`,
  )
}

/**
 * 上游传递链(权威行集,blockers 本地 key 按 feature 前缀限定为看板地址;
 * 环经 visited 截断;悬空引用跳过不虚构 —— M2 services.ts buildDepChain
 * 同算法的权威行版)。
 */
function buildAuthoritativeDepChain(all: readonly AuthoritativeTask[], taskKey: string): TaskDepChainEntry[] {
  const byKey = new Map(all.map(row => [row.taskKey, row]))
  const chain: TaskDepChainEntry[] = []
  const visited = new Set([taskKey])
  const walkUpstream = (key: string): void => {
    const row = byKey.get(key)
    if (row === undefined) return
    for (const blocker of row.blockers) {
      const qualified = blocker.includes('/') ? blocker : `${row.featureSlug}/${blocker}`
      if (visited.has(qualified)) continue
      visited.add(qualified)
      walkUpstream(qualified)
      const upstream = byKey.get(qualified)
      if (upstream !== undefined) {
        chain.push({ key: upstream.taskKey, title: upstream.title, status: upstream.status })
      }
    }
  }
  walkUpstream(taskKey)
  return chain
}

/**
 * sqlite 项目的 TaskDetail 装配:summary/depChain 来自权威表;描述与执行
 * 记录仍留文档树(SoT 分治:结构化状态入 SQLite,md 不入库)——
 * descriptionMarkdown ← desc_path;records ← 记录路径方言
 * `records/<taskMdStem>.md`(forge add/submit 同款约定,real corpus 钉
 * 定:record = records/<file-stem>.md);文件缺失 = 空态非错误(对齐
 * M2 详情读取口径)。
 */
function assembleAuthoritativeDetail(
  db: RepoDb,
  resolveFeaturesRoot: (projectId: string) => string | null,
  task: AuthoritativeTask,
): TaskDetail {
  const featuresRoot = resolveFeaturesRoot(task.projectId)
  let descriptionMarkdown = ''
  let records: TaskDetail['records'] = []
  if (featuresRoot !== null && task.descPath !== null) {
    try {
      descriptionMarkdown = readFileSync(join(featuresRoot, task.descPath), 'utf8')
    } catch {
      descriptionMarkdown = '' // 描述文件缺失:详情页空态,非错误
    }
    const lastSlash = task.descPath.lastIndexOf('/')
    const dir = task.descPath.slice(0, lastSlash + 1)
    const stem = task.descPath.slice(lastSlash + 1).replace(/\.md$/, '')
    try {
      const markdown = readFileSync(join(featuresRoot, `${dir}records/${stem}.md`), 'utf8')
      const parsed = parseRecordMarkdown(markdown, task.taskType ?? '')
      if (parsed !== null) records = [parsed.record]
    } catch {
      records = [] // 从未 submit 或记录被移除:非错误
    }
  }
  return {
    summary: toTaskSummaryFromAuthoritative(task),
    descriptionMarkdown,
    depChain: buildAuthoritativeDepChain(listTasks(db, task.projectId), task.taskKey),
    records,
    links: listSessionLinksByTask(db, task.projectId, task.taskKey),
  }
}

export function createTaskVerbService(deps: TaskVerbDeps): TaskVerbService {
  const { db } = deps

  /** 项目存在 + 权威通道断言(写集权限界;files → 走 CLI 提示,业务提示非错误噪音)。 */
  const requireSqliteAuthority = (projectId: string): void => {
    const authority = getProjectTaskAuthority(db, projectId)
    if (authority === null) {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
    }
    if (authority !== 'sqlite') {
      throw new TaskDomainError(
        'ERR_TASK_NOT_AUTHORITATIVE',
        `project ${projectId} is not sqlite-authoritative yet (data_authority='${authority}'); use the forge CLI for task writes on this project (dual-form discipline)`,
      )
    }
  }

  /** 键形态断言 + 行读取;缺失 → ERR_TASK_NOT_FOUND。 */
  const requireTask = (projectId: string, taskKey: string): AuthoritativeTask => {
    assertBoardTaskKey(taskKey)
    const task = getTask(db, projectId, taskKey)
    if (task === null) {
      throw new TaskDomainError('ERR_TASK_NOT_FOUND', `task ${taskKey} not found in project ${projectId}`)
    }
    return task
  }

  /**
   * 同 feature 命名空间的依赖解析索引(1.2 TaskIndex;key = localId,
   * blockers 本地 key 原词直入)。schema 无 source_task_id/priority 列
   * (v2 权威 DDL)→ fix-task 自动解锁拦截的输入面在此权威通道上恒缺省
   * (canAutoUnblock 恒放行),为 schema 裁决下的既定降级(注释钉定,非偏差)。
   */
  const buildFeatureIndex = (projectId: string, featureSlug: string): TaskIndex =>
    new TaskIndex(
      listTasksByFeature(db, projectId, featureSlug).map((task) => {
        const localId = localIdOfTaskKey(task.taskKey)
        return [
          localId,
          {
            id: localId,
            title: task.title,
            status: task.status,
            dependencies: task.blockers,
            type: task.taskType ?? undefined,
          },
        ] as const
      }),
    )

  /**
   * 迁移执行核(transition/submit/reopen 共用):状态机校验 →(phase-2
   * 边)依赖检查 → 单语句落库,全程 withTaskTx(零部分写入)。
   */
  const applyTransition = (
    input: { readonly projectId: string; readonly taskKey: string },
    to: TaskStatus,
    role: TransitionRole,
    actor: string,
  ): TaskSummary =>
    withTaskTx(db, () => {
      const task = requireTask(input.projectId, input.taskKey)
      const rejection = validateTransition(task.status, to, role)
      if (rejection !== null) {
        if (rejection.guardMsg === DEPS_CHECK_GUARD_MSG) {
          // phase 2(blocked → pending/in_progress 非 manual):1.2 移植的
          // CheckTransitionDeps(Go 语义:悬空 = unmet,与 claim 分立)。
          const result = checkTransitionDeps(
            buildFeatureIndex(input.projectId, task.featureSlug),
            localIdOfTaskKey(task.taskKey),
          )
          if (result.error !== null) {
            // 索引由含本行的同表行构建,byId 必中;防御路径不虚构语义。
            throw new TaskDomainError('ERR_TASK_NOT_FOUND', `task ${task.taskKey} not found in project ${input.projectId}`)
          }
          if (result.unmet !== null && result.unmet.length > 0) {
            throw depsUnsatisfied(task.taskKey, result.unmet)
          }
        } else {
          throw stateInvalid(task.taskKey, rejection)
        }
      }
      const updated = updateTaskStatus(db, input.projectId, task.taskKey, to, actor, new Date().toISOString())
      return toTaskSummaryFromAuthoritative(updated)
    })

  return {
    // —— taskAdd:插入权威行(默认 pending;缺省 taskKey → Go 自动 ID)——
    taskAdd(input: TaskAddInput, actor: string): TaskSummary {
      if (actor === '') {
        throw new Error('taskAdd: actor must be a non-empty string (audit discipline)')
      }
      return withTaskTx(db, () => {
        requireSqliteAuthority(input.projectId)
        assertFeatureSlugSegment(input.featureSlug)
        if (input.title === '') {
          throw new Error('taskAdd: title must be a non-empty string')
        }
        for (const blocker of input.blockers ?? []) {
          assertLocalKeySegment(blocker)
        }
        const index = buildFeatureIndex(input.projectId, input.featureSlug)
        // taskKey:显式 → 形态 + 前缀一致(er-diagram 冗余列不变式)+
        // 唯一;缺省 → Go generateAutoId(disc-N,同 feature 命名空间自增)。
        let taskKey: string
        if (input.taskKey === undefined || input.taskKey === '') {
          const localIds = [...index.tasksMap().keys()]
          taskKey = `${input.featureSlug}/${generateAutoTaskId(AUTO_ID_PREFIX, localIds)}`
        } else {
          assertBoardTaskKey(input.taskKey)
          const prefix = input.taskKey.slice(0, input.taskKey.indexOf('/'))
          if (prefix !== input.featureSlug) {
            throw new TaskDomainError(
              'ERR_TASK_KEY_INVALID',
              `task key ${input.taskKey} prefix must match featureSlug ${input.featureSlug} (redundant-column invariant)`,
            )
          }
          if (index.byId(localIdOfTaskKey(input.taskKey)) !== undefined) {
            throw new TaskDomainError('ERR_TASK_EXISTS', `task ${input.taskKey} already exists in project ${input.projectId}`)
          }
          taskKey = input.taskKey
        }
        // 依赖引用闭合的 add 期前置(Go AddTask 同款):精确依赖必须存在
        // (悬空引用只经迁移摄入入表,新增任务不得制造);通配必须匹配 ≥1。
        for (const blocker of input.blockers ?? []) {
          const { matches, isWildcard } = resolveWildcardDep(index, blocker)
          if (isWildcard) {
            if (matches.length === 0) {
              throw new TaskDomainError(
                'ERR_TASK_NOT_FOUND',
                `wildcard dependency ${JSON.stringify(blocker)} matches no business tasks in feature ${input.featureSlug}`,
              )
            }
          } else if (index.byId(blocker) === undefined) {
            throw new TaskDomainError('ERR_TASK_NOT_FOUND', `dependency not found: ${blocker}`)
          }
        }
        const inserted = insertTask(db, {
          projectId: input.projectId,
          taskKey,
          featureSlug: input.featureSlug,
          title: input.title,
          status: 'pending',
          blockers: [...(input.blockers ?? [])],
          taskType: input.taskType ?? null,
          descPath: input.descPath ?? null,
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        })
        return toTaskSummaryFromAuthoritative(inserted)
      })
    },

    // —— taskClaim:→ in_progress(role=claim;依赖终态前置,claim 语境)——
    taskClaim(input: TaskClaimInput, actor: string): TaskSummary {
      requireSqliteAuthority(input.projectId)
      return withTaskTx(db, () => {
        const task = requireTask(input.projectId, input.taskKey)
        const rejection = validateTransition(task.status, 'in_progress', 'claim')
        if (rejection !== null && rejection.guardMsg !== DEPS_CHECK_GUARD_MSG) {
          throw stateInvalid(task.taskKey, rejection)
        }
        // 依赖终态前置(Go claim.go checkDependenciesMet 语义):已解析
        // 依赖必须终态;悬空精确依赖 claim 语境 vacuously satisfied(过滤
        // 不上报)—— 原词仍原样存于 blockers(显式标记不改写)。
        const index = buildFeatureIndex(input.projectId, task.featureSlug)
        const localId = localIdOfTaskKey(task.taskKey)
        const rawUnmet = getUnmetDeps(index, localId, task.blockers) ?? []
        const unmet = rawUnmet.filter(id => index.byId(id) !== undefined)
        if (unmet.length > 0) {
          throw depsUnsatisfied(task.taskKey, unmet)
        }
        const updated = updateTaskStatus(db, input.projectId, task.taskKey, 'in_progress', actor, new Date().toISOString())
        return toTaskSummaryFromAuthoritative(updated)
      })
    },

    // —— taskTransition:显式迁移(role=manual;reason 为调用方语境串,
    //    v2 schema 无 reason 列 → 接受不落库,审计面 = updated_by/updated_at)——
    taskTransition(input: TaskTransitionInput, actor: string): TaskSummary {
      requireSqliteAuthority(input.projectId)
      return applyTransition(input, input.to, 'manual', actor)
    },

    // —— taskSubmit:→ completed(role=submit;recordPath 同 reason 口径
    //    接受不落库 —— 记录 .md 由 agent 会话经文档根写入,结构化状态入表)——
    taskSubmit(input: TaskSubmitInput, actor: string): TaskSummary {
      requireSqliteAuthority(input.projectId)
      return applyTransition(input, 'completed', 'submit', actor)
    },

    // —— taskReopen:rejected/skipped → pending(role=reopen)——
    taskReopen(input: TaskReopenInput, actor: string): TaskSummary {
      requireSqliteAuthority(input.projectId)
      return applyTransition(input, 'pending', 'reopen', actor)
    },

    // —— taskGet:读路由(AC-3)——
    taskGet(input: TaskGetInput): TaskDetail {
      const authority = getProjectTaskAuthority(db, input.projectId)
      if (authority === null) {
        throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${input.projectId} does not exist`)
      }
      if (authority === 'files') {
        // files → task_snapshot 派生投影(M2 行为不变,含 M2 的缺失口径)。
        return deps.readFilesTaskDetail(input.projectId, input.taskKey)
      }
      const task = requireTask(input.projectId, input.taskKey)
      return assembleAuthoritativeDetail(db, deps.resolveFeaturesRoot, task)
    },

    // —— taskQuery:读路由列表(AC-3;过滤 featureSlug/status)——
    taskQuery(input: TaskQueryInput): TaskSummary[] {
      const authority = getProjectTaskAuthority(db, input.projectId)
      if (authority === null) {
        throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${input.projectId} does not exist`)
      }
      const matches = (row: { readonly featureSlug: string; readonly status: TaskStatus }): boolean =>
        (input.featureSlug === undefined || row.featureSlug === input.featureSlug) &&
        (input.status === undefined || row.status === input.status)
      if (authority === 'files') {
        return listTaskSnapshots(db, input.projectId).filter(matches).map(toTaskSummary)
      }
      return listTasks(db, input.projectId).filter(matches).map(toTaskSummaryFromAuthoritative)
    },
  }
}
