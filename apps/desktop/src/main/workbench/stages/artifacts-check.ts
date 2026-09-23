// workbench/stages/artifacts-check — checkStageArtifacts 确定性清单(任务 3.2)。
//
// tech-design §Interface 5 门校验的执行面:PRD §各阶段期望产物清单(必答②,
// 机器可校验)逐规则判定 —— 检查对象 = feature 当前阶段;期望矩阵为累计式
// (design 行 = prd 行期望 + design 增量,依此类推,管线序 = stage-asset-index
// STAGE_PIPELINE)。执行者 = 确定性代码(G4 硬约束):文件存在 +
// frontmatter/结构解析 + SQLite 状态查询,零模型调用(依赖面仅 db + 路径
// 入参;tests/workbench-stages.spec.ts 以 import 面白名单断言钉定)。
// 机械判定先例 = forge-cli pkg/task/stage_gates.go(纯程序化生成/判定,
// 无模板引擎、无 AI 面);缺失 = 警告清单(MissingItem,warn 不阻断 ——
// 阻断逻辑在 dispatch 层以 acknowledgeMissing 表达,Hard Rule)。
//
// Hard Rule:阶段产物期望清单定义随 forge 仓演进,应用仅消费 PRD 的机器
// 可校验定义,不在应用侧新增语义 —— 规则词表(StageCheckRule)= PRD 表
// 右列的直译,零扩展。
//
// 阶段解析序(manifest 为 SoT):manifest frontmatter status(词表内)→
// feature_snapshot.status(派生缓存,manifest 损坏时的最后已知阶段)→
// 管线头 'prd'(全缺时一切上游期望都会列入清单,头值仅为报告锚点)。

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { FeatureStatus, RepoDb, TaskStatus } from '../repos/types.ts'
import { WorkbenchRepoError } from '../repos/types.ts'
import { listTaskSnapshots } from '../repos/task-snapshots.ts'
import { getFeatureSnapshot } from '../repos/feature-snapshots.ts'
import { readTaskIndex, type TaskIndexEntries } from '../indexer/parse-task.ts'
import { parseFrontmatterObject, readStringField, splitFrontmatter } from '../knowledge/frontmatter.ts'
import { getProjectTaskAuthority, listTasksByFeature, localIdOfTaskKey } from '../tasks/task-repo.ts'
import { resolveWildcardDep } from '../tasks/deps.ts'
import { TaskIndex, isTerminalStatus } from '../tasks/model.ts'
import { STAGE_PIPELINE, isStageValue } from './stage-asset-index.ts'
import type { MissingItem, StageArtifactsReport } from '../ipc/types.ts'

/** in-progress 行的被派发集(状态查询:已认领或已完成)。 */
const DISPATCHED_STATUSES: ReadonlySet<string> = new Set(['in_progress', 'completed'])

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** 目录直下 .md 文件计数(design/ ≥1、tasks/ ≥1 的存在性判定;子目录不计)。 */
function countDirectMarkdown(dir: string): number {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return 0
  }
  let count = 0
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    try {
      if (statSync(join(dir, name)).isFile()) count += 1
    } catch {
      // 竞态消失的条目不计
    }
  }
  return count
}

// ---------------------------------------------------------------------------
// 阶段解析(manifest SoT → 快照降级 → 管线头)
// ---------------------------------------------------------------------------

/** manifest.md 的解析产物:status 在词表内 → 该值;否则 null。 */
function readManifestStatus(featureDir: string): FeatureStatus | null {
  try {
    const fields = parseFrontmatterObject(readFileSync(join(featureDir, 'manifest.md'), 'utf8'))
    if (fields === null) return null
    const status = readStringField(fields, 'status')
    return isStageValue(status) ? status : null
  } catch {
    return null
  }
}

export interface FeatureStageResolution {
  /** 报告用当前阶段(解析序产物)。 */
  readonly stage: FeatureStatus
  /** manifest.md 文件存在(缺席 = 存在性缺失项,状态规则并入不重复报)。 */
  readonly manifestPresent: boolean
  /** manifest frontmatter status 在词表内(存在但无效 → status 规则缺失项)。 */
  readonly manifestStatus: FeatureStatus | null
}

/**
 * feature 当前阶段解析(check 与门态动词共用;纯 fs + 快照读)。
 * manifest 损坏/缺失时不报错 —— 检查语义 = 缺失清单,非异常路径。
 */
export function resolveFeatureStage(db: RepoDb, projectId: string, featureSlug: string, featureDir: string): FeatureStageResolution {
  const manifestPresent = isFile(join(featureDir, 'manifest.md'))
  const manifestStatus = manifestPresent ? readManifestStatus(featureDir) : null
  if (manifestStatus !== null) {
    return { stage: manifestStatus, manifestPresent, manifestStatus }
  }
  const snapshot = getFeatureSnapshot(db, projectId, featureSlug)
  if (snapshot !== null && isStageValue(snapshot.status)) {
    return { stage: snapshot.status, manifestPresent, manifestStatus }
  }
  return { stage: 'prd', manifestPresent, manifestStatus }
}

// ---------------------------------------------------------------------------
// 任务集(SQLite 状态查询;读路由 = projects.data_authority,taskGet 先例)
// ---------------------------------------------------------------------------

/** 检查视角的任务行(两权威通道的统一投影)。 */
interface TaskView {
  readonly taskKey: string
  readonly localId: string
  readonly status: TaskStatus
  /** 同 feature 命名空间的本地 blocker 原词。 */
  readonly blockers: readonly string[]
  /** sqlite 通道:desc_path(features 根相对);files 通道 → null(index.json 解析)。 */
  readonly descPath: string | null
}

function taskSetOf(db: RepoDb, projectId: string, featureSlug: string, authority: 'files' | 'sqlite'): TaskView[] {
  if (authority === 'sqlite') {
    return listTasksByFeature(db, projectId, featureSlug).map(task => ({
      taskKey: task.taskKey,
      localId: localIdOfTaskKey(task.taskKey),
      status: task.status,
      blockers: task.blockers,
      descPath: task.descPath,
    }))
  }
  return listTaskSnapshots(db, projectId)
    .filter(row => row.featureSlug === featureSlug)
    .map(row => ({
      taskKey: row.taskKey,
      localId: localIdOfTaskKey(row.taskKey),
      status: row.status,
      blockers: row.blockers,
      descPath: null,
    }))
}

/**
 * 被派发任务 md 描述非空判定(任务 md 内容解析):正文(frontmatter 之后)
 * trim 后非空。解析失败(无 desc_path / 无 index 条目 / 文件缺失/损坏)→
 * 结构化原因,不炸检查。
 */
function dispatchedDescriptionState(
  task: TaskView,
  authority: 'files' | 'sqlite',
  featuresRoot: string,
  featureDir: string,
  entries: TaskIndexEntries | null,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  let path: string
  if (authority === 'sqlite') {
    if (task.descPath === null) {
      return { ok: false, reason: 'task carries no desc_path (structured status has no description anchor)' }
    }
    path = join(featuresRoot, task.descPath)
  } else {
    if (entries === null) {
      return { ok: false, reason: 'tasks/index.json unreadable — cannot locate the task md' }
    }
    let file: string | null = null
    for (const [stem, entry] of Object.entries(entries)) {
      if (entry.id !== task.localId) continue
      file = typeof entry.file === 'string' && entry.file !== '' ? entry.file : `${stem}.md`
      break
    }
    if (file === null) {
      return { ok: false, reason: `no tasks/index.json entry for local id '${task.localId}'` }
    }
    path = join(featureDir, 'tasks', file)
  }
  let markdown: string
  try {
    markdown = readFileSync(path, 'utf8')
  } catch {
    const rel = authority === 'sqlite' ? task.descPath : path.slice(featureDir.length + 1).replaceAll('\\', '/')
    return { ok: false, reason: `task md ${rel} does not exist` }
  }
  const { body } = splitFrontmatter(markdown)
  if (body.trim() === '') {
    return { ok: false, reason: 'task md body (after frontmatter) is empty' }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 依赖闭合(依赖引用可解析且无悬空;wildcard 语义 = tasks/deps 唯一权威)
// ---------------------------------------------------------------------------

/** 悬空 blocker 清单(逐任务逐引用;悬空原词入 detail,不改写)。 */
function danglingBlockersOf(tasks: readonly TaskView[]): Array<{ readonly task: TaskView; readonly blocker: string }> {
  const index = new TaskIndex(tasks.map(task => [
    task.localId,
    { id: task.localId, status: task.status, dependencies: [...task.blockers] },
  ] as const))
  const ids = new Set(tasks.map(task => task.localId))
  const dangling: Array<{ task: TaskView; blocker: string }> = []
  for (const task of tasks) {
    for (const blocker of task.blockers) {
      if (blocker.endsWith('.x')) {
        if (resolveWildcardDep(index, blocker).matches.length === 0) {
          dangling.push({ task, blocker })
        }
      } else if (!ids.has(blocker)) {
        dangling.push({ task, blocker })
      }
    }
  }
  dangling.sort((a, b) => (a.task.taskKey < b.task.taskKey ? -1 : a.task.taskKey > b.task.taskKey ? 1 : a.blocker < b.blocker ? -1 : 1))
  return dangling
}

// ---------------------------------------------------------------------------
// 期望清单主检查(PRD §各阶段期望产物清单,累计式矩阵)
// ---------------------------------------------------------------------------

/**
 * checkStageArtifacts 本体(确定性:fs + SQLite 查询)。项目不存在 →
 * ERR_PROJECT_NOT_FOUND(调用方契约错,非产物缺失);feature 目录由服务层
 * 前置校验(本函数信任 featureDir 存在)。
 */
export function checkStageArtifacts(
  db: RepoDb,
  input: { readonly projectId: string; readonly featureSlug: string; readonly featuresRoot: string },
): StageArtifactsReport {
  const authority = getProjectTaskAuthority(db, input.projectId)
  if (authority === null) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${input.projectId} does not exist`)
  }
  const featureDir = join(input.featuresRoot, input.featureSlug)
  const missing: MissingItem[] = []
  const add = (stage: FeatureStatus, rule: MissingItem['rule'], artifact: string, detail: string): void => {
    missing.push({ stage, rule, artifact, detail })
  }

  // —— 阶段解析 + prd 行(每阶段共底:manifest 存在性 / status 一致 / prd-spec)——
  const resolution = resolveFeatureStage(db, input.projectId, input.featureSlug, featureDir)
  if (!resolution.manifestPresent) {
    add('prd', 'file-missing', 'manifest.md', 'expected file manifest.md does not exist (status rule subsumed)')
  } else if (resolution.manifestStatus === null) {
    add('prd', 'manifest-status-mismatch', 'manifest.md', `manifest frontmatter status is missing or outside the vocabulary ${STAGE_PIPELINE.join('/')}`)
  }
  if (!isFile(join(featureDir, 'prd', 'prd-spec.md'))) {
    add('prd', 'file-missing', 'prd/prd-spec.md', 'expected file prd/prd-spec.md does not exist')
  }

  const stageIndex = STAGE_PIPELINE.indexOf(resolution.stage)

  // —— design 行:+ design/ ≥1 设计文档(存在性)——
  if (stageIndex >= 1 && countDirectMarkdown(join(featureDir, 'design')) === 0) {
    add('design', 'file-missing', 'design/', 'expected at least 1 design document under design/ (found 0)')
  }

  // —— tasks 行:+ tasks/ ≥1 任务 md / SQLite 任务集非空 / 依赖引用闭合 ——
  if (stageIndex >= 2) {
    if (countDirectMarkdown(join(featureDir, 'tasks')) === 0) {
      add('tasks', 'file-missing', 'tasks/', 'expected at least 1 task md under tasks/ (found 0)')
    }
    const tasks = taskSetOf(db, input.projectId, input.featureSlug, authority)
    if (tasks.length === 0) {
      add('tasks', 'task-set-empty', 'tasks', `SQLite task set for feature ${input.featureSlug} is empty`)
    }
    for (const { task, blocker } of danglingBlockersOf(tasks)) {
      add('tasks', 'dep-dangling', task.taskKey, `task ${task.taskKey} blocker '${blocker}' resolves to no task in feature ${input.featureSlug}`)
    }

    // —— in-progress 行:+ ≥1 任务 in_progress/completed;被派发任务 md 描述非空 ——
    if (stageIndex >= 3) {
      const dispatched = tasks.filter(task => DISPATCHED_STATUSES.has(task.status))
      if (dispatched.length === 0) {
        add('in-progress', 'no-dispatched-task', 'in-progress', 'no task is in_progress or completed yet (state query)')
      }
      const entries = authority === 'sqlite' ? null : readTaskIndex(join(featureDir, 'tasks', 'index.json'))
      for (const task of dispatched) {
        const state = dispatchedDescriptionState(task, authority, input.featuresRoot, featureDir, entries)
        if (!state.ok) {
          add('in-progress', 'task-md-empty', task.taskKey, `dispatched task ${task.taskKey} description md is empty or unresolvable: ${state.reason}`)
        }
      }

      // —— completed 行:全部任务终态;各阶段资产齐全(聚合查询 + 文件存在)——
      if (stageIndex >= 4) {
        for (const task of tasks) {
          if (!isTerminalStatus(task.status)) {
            add('completed', 'task-not-terminal', task.taskKey, `task ${task.taskKey} status '${task.status}' is not terminal (completed/skipped/rejected)`)
          }
        }
        // 资产齐全 = 推进门先行阶段的资产(stages/<S>.md 门 = 离开 S 的总结;
        // completed 自身资产无门消费面,不列入 —— PRD「每次阶段推进生成一份」
        // 的机制内推,应用侧不新增语义)。
        for (const stage of STAGE_PIPELINE.slice(0, 4)) {
          if (!isFile(join(featureDir, 'stages', `${stage}.md`))) {
            add('completed', 'stage-asset-missing', `stages/${stage}.md`, `stage asset stages/${stage}.md does not exist (advance-gate summary of stage ${stage})`)
          }
        }
      }
    }
  }

  return { stage: resolution.stage, satisfied: missing.length === 0, missing }
}
