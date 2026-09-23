// workbench/ipc/services — 动词服务装配(任务 2.7)。
//
// handler(Hard Rule:参数校验 + 服务调用 + 错误映射,零内联业务)之下的
// 服务层:装配 2.2-2.6 各仓储与服务 ——
//   - projects / app_state / session_links(2.2 repos);
//   - 派生快照读 + getTaskDetail 的详情装配(2.3/2.5 快照与解析方言);
//   - 注册/重指向校验链(2.4 registry);
//   - 感知编排(2.6 watcher + 2.5 scanForgeFiles):activateProject →
//     retarget + 立即重扫(看板首屏数据);updateProject repoint → 重扫
//     (Interface 1 注记「repoint 完成即重扫」);移除激活项目 → retarget
//     (null) 停链(watch.ts 委托给 2.7 接线)。
//
// 感知编排经 seam 注入(默认实现 = createWorkbenchWatcher + scanForgeFiles):
// watcher 的批推缓冲(2.6 events.ts,≤500ms 合并)sink 即 deps.onEvents;
// 动词触发的同步重扫将终态事件批直发同一 sink(已为最终形态,无回退面)。
// boot 恢复:start() 对已持久化的激活项目恢复感知(retarget + 重扫,不动
// last_activated_at —— 快照对账即重建,er-diagram 派生缓存语义)。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DOC_KIND_ANCHORS } from '../indexer/parse-feature.ts'
import { parseFeatureTasks, readTaskIndex, type TaskIndexEntries } from '../indexer/parse-task.ts'
import { resolveFeaturesDir, scanForgeFiles, type ScanOutcome, type ScanTarget } from '../indexer/scan.ts'
import { toSyncStatusPayload } from '../indexer/diff.ts'
import {
  registerProject as registerProjectValidated,
  updateProject as updateProjectValidated,
} from '../registry/validate.ts'
import { authorizeExternalDocPath as authorizeExternalDocPathRecord } from '../registry/authorize.ts'
import { getActiveProjectId, activateProject as activateProjectRow } from '../repos/app-state.ts'
import { listFeatureSnapshots } from '../repos/feature-snapshots.ts'
import {
  listProjects,
  removeProject as removeProjectRow,
} from '../repos/projects.ts'
import {
  assertProjectExists,
  WorkbenchRepoError,
  type DocKind,
  type Project,
  type ProjectPatch,
  type RepoDb,
  type TaskSnapshot,
} from '../repos/types.ts'
import { listSessionLinksByTask, recordSessionLink as recordSessionLinkRow, endSessionLink as endSessionLinkRow, supersedeActiveSessionLinks } from '../repos/session-links.ts'
import { getSyncState } from '../repos/sync-state.ts'
import { getTaskSnapshot, listTaskSnapshots } from '../repos/task-snapshots.ts'
import { createWorkbenchWatcher } from '../watcher/watch.ts'
import type { WorkbenchEventSink } from '../watcher/events.ts'
import { createPluginEnableGuard } from '../../plugin-runtime/guard.ts'
import { createPluginFace, readPluginManifestBundles, type PluginEnableGuard } from './plugins.ts'
import { toTaskSummary } from './task-summary.ts'
import { createTaskVerbService } from '../tasks/task-service.ts'
import { createMigrationService } from '../migration/pipeline.ts'
import { createReingestHook } from '../migration/reingest-watcher.ts'
import type {
  FeatureBoardData,
  FeatureDoc,
  PluginRow,
  RecordSessionLinkInput,
  RegisterProjectInput,
  SessionLink,
  TaskBoardData,
  TaskDepChainEntry,
  TaskDetail,
  TaskRecord,
  WorkbenchState,
  WorkbenchVerbServices,
} from './types.ts'

/** 感知编排 seam(默认 = 真 watcher;测试注入观测假体)。 */
export interface WorkbenchPerceptionSeam {
  /** 激活切换/重指向/移除后重建 watch 目标(null = 全停)。 */
  retarget(target: ScanTarget | null): void
  /** 立即同步重扫(事件批直发 onEvents sink;看板首屏/repoint 重扫)。 */
  rescan(target: ScanTarget): void
}

export interface WorkbenchIpcServiceDeps {
  readonly db: RepoDb
  /** 产品插件清单路径(只读)。 */
  readonly pluginBundlesPath: string
  /** userData 根(覆盖文件 plugin-runtime.json 落于此)。 */
  readonly userDataPath: string
  /** setPluginEnabled 守卫(缺省 = 3.1 真守卫,mandatory 派生自同一产品清单)。 */
  readonly pluginGuard?: PluginEnableGuard
  /** 事件批推送端(2.7 接 IPC 订阅广播;缺省丢弃)。 */
  readonly onEvents?: WorkbenchEventSink
  /** 感知编排 seam(缺省 = createWorkbenchWatcher + scanForgeFiles)。 */
  readonly perception?: WorkbenchPerceptionSeam
}

/** 装配产物:动词服务面 + boot 恢复 + 收尾。 */
export interface WorkbenchIpcServiceAssembly {
  readonly verbs: WorkbenchVerbServices
  /** boot 恢复:对已持久化的激活项目恢复感知(不迁移 last_activated_at)。 */
  start(): void
  /** 收尾:停 watcher(冲刷 2.6 批缓冲,不丢事件)。 */
  dispose(): void
}

/** task_snapshot 行 → TaskSummary DTO(剥离仓储侧 projectId;key = 限定地址)。 */
// M3(任务 1.3):映射器抽驻 ./task-summary.ts(读路由双分支共用);本模块
// import 复用,行为不变。

function findProjectRow(db: RepoDb, id: string): Project | undefined {
  return listProjects(db).find(project => project.id === id)
}

function scanTargetOf(project: Project): ScanTarget {
  return { id: project.id, codeRoot: project.codeRoot, docLocationPath: project.docLocationPath }
}

/**
 * 上游传递链(blockers 递归展开,拓扑序 = 最上游在前):blockers 为同
 * feature 命名空间的本地 key,解析时按行 feature_slug 限定为看板地址;
 * 环经 visited 集合截断;悬空引用(快照无行)跳过不虚构。
 */
function buildDepChain(all: readonly TaskSnapshot[], taskKey: string): TaskDepChainEntry[] {
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

/** 任务文件原文(descriptionMarkdown):index.json 条目定位,缺失回退空串。 */
function readTaskDescription(entries: TaskIndexEntries, tasksDir: string, localId: string): string {
  for (const [stem, entry] of Object.entries(entries)) {
    if (entry.id !== localId) continue
    const file = typeof entry.file === 'string' && entry.file !== '' ? entry.file : `${stem}.md`
    try {
      return readFileSync(join(tasksDir, file), 'utf8')
    } catch {
      return '' // 任务文件不存在:详情页描述区空态,非错误(快照行仍在)
    }
  }
  return ''
}

export function createWorkbenchIpcServices(deps: WorkbenchIpcServiceDeps): WorkbenchIpcServiceAssembly {
  const { db } = deps
  const sink: WorkbenchEventSink = deps.onEvents ?? (() => {})
  const pluginFace = createPluginFace({
    manifestPath: deps.pluginBundlesPath,
    overlayPath: join(deps.userDataPath, 'plugin-runtime.json'),
    // 3.1:真守卫(mandatory → ERR_PLUGIN_MANDATORY);名单来源 = 同一
    // 产品清单,不另立名单(G6)。2.7 桩守卫已退役。
    guard: deps.pluginGuard ?? createPluginEnableGuard(() => readPluginManifestBundles(deps.pluginBundlesPath)),
  })
  const defaultPerception = (): WorkbenchPerceptionSeam => {
    // M3 任务 1.5:外部写回收钩子挂接感知基座 —— 每轮感知扫描(M2 watcher
    // 触发或动词同步重扫)后同步检查已迁移项目的 index.json 复现/变更;
    // 回收产出的事件(deviation_detected / migration_progress reingest)并入
    // 同一扫描事件批,走同一 sink/批推通道;钩子永不抛错、files 项目短路。
    const reingest = createReingestHook({ db })
    const scanWithReingest = (target: ScanTarget): ScanOutcome => {
      const outcome = scanForgeFiles(db, target)
      const events = reingest.afterScan(target)
      return events.length > 0 ? { ...outcome, events: [...outcome.events, ...events] } : outcome
    }
    const watcher = createWorkbenchWatcher(db, { scan: (_db, target) => scanWithReingest(target), onEvents: sink })
    return {
      retarget: target => watcher.rebuild(target),
      rescan: (target) => {
        const outcome = scanWithReingest(target)
        if (outcome.events.length > 0) sink(outcome.events)
      },
    }
  }
  const perception = deps.perception ?? defaultPerception()

  const requireProject = (projectId: string): Project => {
    const project = findProjectRow(db, projectId)
    if (project === undefined) {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
    }
    return project
  }

  // M2 详情装配(getTaskDetail 既有实现,行为钉定)。M3 任务 1.3 起同时
  // 作为 taskGet 读路由 files 分支的注入实现 —— files 项目走 task_snapshot
  // 派生投影(M2 行为不变,tech-design §Interface 1 读路由)。
  const readFilesTaskDetail = (projectId: string, taskKey: string): TaskDetail => {
    const project = requireProject(projectId)
    const snapshot = getTaskSnapshot(db, projectId, taskKey)
    if (snapshot === null) {
      // 快照无行 = 任务不存在(或尚未扫入);按未知异常口径回通用错误。
      throw new Error(`task ${taskKey} not found in project ${projectId} snapshots`)
    }
    const featuresDir = resolveFeaturesDir(scanTargetOf(project))
    const tasksDir = join(featuresDir, snapshot.featureSlug, 'tasks')
    const entries = readTaskIndex(join(tasksDir, 'index.json')) ?? {}
    const localId = taskKey.includes('/') ? taskKey.slice(taskKey.indexOf('/') + 1) : taskKey
    // 执行记录:复用 2.5 解析方言(write-once 记录 .md;TaskRecord 适配
    // 形态无虚构字段);index.json 不可读时记录区为空,不放大损伤。
    const parsed = parseFeatureTasks(tasksDir, snapshot.featureSlug, entries, '')
    const parsedTask = parsed.tasks?.find(task => task.taskKey === taskKey)
    const records: TaskRecord[] = (parsedTask?.records ?? []).map(record => ({
      at: record.at,
      kind: record.kind,
      source: record.source,
      summary: record.summary,
    }))
    return {
      summary: toTaskSummary(snapshot),
      descriptionMarkdown: readTaskDescription(entries, tasksDir, localId),
      depChain: buildDepChain(listTaskSnapshots(db, projectId), taskKey),
      records,
      links: listSessionLinksByTask(db, projectId, taskKey),
    }
  }

  // M3 任务 1.3:任务动词服务(五写集 + taskGet/taskQuery 读路由)。
  // files 详情装配注入(行为不变);文档根解析注入(sqlite 分支的
  // desc_path/记录 .md 寻址,SoT 分治:md 留文档树)。
  const taskVerbs = createTaskVerbService({
    db,
    readFilesTaskDetail,
    resolveFeaturesRoot: (projectId: string): string | null => {
      const project = findProjectRow(db, projectId)
      return project === undefined ? null : resolveFeaturesDir(scanTargetOf(project))
    },
  })

  // M3 任务 1.4:迁移动词服务(Interface 4 第 1-6 步内核管线)。相位事件
  // 经同一 sink 批推(单事件批;2.6 节流语义面向 watcher 扫描批,迁移面
  // 直发不损语义 —— 批内合并键已含 migration_progress)。库文件路径由
  // pipeline 缺省解析(boot 落位同源 resolveWorkbenchDbPath)。
  const migrationService = createMigrationService({
    db,
    userDataPath: deps.userDataPath,
    loadProject: projectId => findProjectRow(db, projectId) ?? null,
    onEvent: event => sink([event]),
  })

  return {
    verbs: {
      getState(): WorkbenchState {
        return {
          projects: listProjects(db),
          activeProjectId: getActiveProjectId(db),
          plugins: pluginFace.listRows(),
        }
      },

      registerProject(input: RegisterProjectInput): Project {
        return registerProjectValidated(db, input)
      },

      updateProject(id: string, patch: ProjectPatch): Project {
        const updated = updateProjectValidated(db, id, patch)
        const touchesDocLocation = patch.docLocationType !== undefined || patch.docLocationPath !== undefined
        if (touchesDocLocation) {
          // Interface 1 注记:repoint 完成即重扫;激活项目的 watch 根随文档
          // 位置变化重建(2.6 rebuild 全量释放旧 watch)。
          const target = scanTargetOf(updated)
          if (getActiveProjectId(db) === id) perception.retarget(target)
          perception.rescan(target)
        }
        return updated
      },

      removeProject(id: string): void {
        const wasActive = getActiveProjectId(db) === id
        removeProjectRow(db, id)
        if (wasActive) perception.retarget(null)
      },

      activateProject(id: string): void {
        activateProjectRow(db, id)
        const project = requireProject(id)
        const target = scanTargetOf(project)
        perception.retarget(target)
        perception.rescan(target)
      },

      getTaskBoard(projectId: string): TaskBoardData {
        assertProjectExists(db, projectId)
        const sync = getSyncState(db, projectId)
        return {
          tasks: listTaskSnapshots(db, projectId).map(toTaskSummary),
          generatedAt: new Date().toISOString(),
          // 从未扫描(行不存在)→ idle + 空游标:看板空态(状态门),非错误。
          sync: sync === null ? { state: 'idle', lastScanAt: null } : toSyncStatusPayload(sync),
        }
      },

      getTaskDetail(projectId: string, taskKey: string): TaskDetail {
        return readFilesTaskDetail(projectId, taskKey)
      },

      getFeatureBoard(projectId: string): FeatureBoardData {
        assertProjectExists(db, projectId)
        const features = listFeatureSnapshots(db, projectId).map(snapshot => ({
          slug: snapshot.featureSlug,
          status: snapshot.status,
          docKinds: [...snapshot.docKinds],
          taskTotal: snapshot.taskTotal,
          taskCompleted: snapshot.taskCompleted,
          updatedAt: snapshot.updatedAt,
        }))
        return { features, generatedAt: new Date().toISOString() }
      },

      readFeatureDoc(projectId: string, featureSlug: string, kind: DocKind): FeatureDoc {
        const project = requireProject(projectId)
        const anchor = DOC_KIND_ANCHORS.find(([docKind]) => docKind === kind)?.[1]
        if (anchor === undefined) {
          throw new Error(`unknown doc kind ${String(kind)} — expected one of manifest/prd/design/ui/tasks`)
        }
        // T4:每次读取前复验存在性 —— 文档缺失/不可读即错误态,不静默。
        const docPath = join(resolveFeaturesDir(scanTargetOf(project)), featureSlug, anchor)
        let markdown: string
        try {
          markdown = readFileSync(docPath, 'utf8')
        } catch (error) {
          throw new Error(`feature doc ${featureSlug}/${anchor} is unreadable (${String(error)})`)
        }
        return { kind, markdown }
      },

      listPlugins(): PluginRow[] {
        return pluginFace.listRows()
      },

      setPluginEnabled(name: string, enabled: boolean): PluginRow[] {
        return pluginFace.setEnabled(name, enabled)
      },

      recordSessionLink(input: RecordSessionLinkInput): SessionLink {
        // 4.2 发起侧收敛:同任务换会话再发起 = 旧 active 挂接置 ended
        // (历史保留;同 session 重复登记不受影响 —— keepSessionId 排除)。
        // ended 迁移只发生在发起侧(本收敛 + 显式 endSessionLink),不做
        // agent-status 启发,也不在应用退出时收敛(Story2 AC3)。
        supersedeActiveSessionLinks(db, input.projectId, input.taskKey, input.sessionId)
        return recordSessionLinkRow(db, input)
      },

      endSessionLink(linkId: string): void {
        endSessionLinkRow(db, linkId)
      },

      authorizeExternalDocPath(path: string): void {
        // 6.4:向导步骤②授权确认的落库通道(2.4 单写路径)。纯登记,零 fs
        // 探测 —— 可读性/forge 检出探测由注册/重指向校验链在读取该记录
        // 之后执行(Hard Rule:未授权路径连探测都不做)。
        authorizeExternalDocPathRecord(db, path)
      },

      // —— M3 任务动词(任务 1.3):委托 tasks/task-service(唯一写入口 =
      // task-repo 内核事务路径;读路由按 projects.data_authority)。 ——

      taskAdd: (input, actor) => taskVerbs.taskAdd(input, actor),
      taskClaim: (input, actor) => taskVerbs.taskClaim(input, actor),
      taskTransition: (input, actor) => taskVerbs.taskTransition(input, actor),
      taskSubmit: (input, actor) => taskVerbs.taskSubmit(input, actor),
      taskReopen: (input, actor) => taskVerbs.taskReopen(input, actor),
      taskGet: input => taskVerbs.taskGet(input),
      taskQuery: input => taskVerbs.taskQuery(input),

      // —— M3 迁移动词(任务 1.4):委托 migration/pipeline(守卫/备份/
      //    摄入/对拍/切读/归档 + migration_event 审计 + migration_progress)。 ——
      getMigrationStatus: projectId => migrationService.getMigrationStatus(projectId),
      startMigration: projectId => migrationService.startMigration(projectId),
    },

    start(): void {
      const activeId = getActiveProjectId(db)
      if (activeId === null) return
      const project = findProjectRow(db, activeId)
      if (project === undefined) return // 悬空指针防御:读取面不放大存储损伤
      const target = scanTargetOf(project)
      perception.retarget(target)
      perception.rescan(target)
    },

    dispose(): void {
      perception.retarget(null)
    },
  }
}
