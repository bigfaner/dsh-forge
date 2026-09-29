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

import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { shellLog } from '../../log.ts'
import { DOC_KIND_ANCHORS } from '../indexer/parse-feature.ts'
import { parseFeatureTasks, readTaskIndex, type TaskIndexEntries } from '../indexer/parse-task.ts'
import { resolveFeaturesDir, resolveProposalsDir, scanForgeFiles, type ScanOutcome, type ScanTarget } from '../indexer/scan.ts'
import { toSyncStatusPayload } from '../indexer/diff.ts'
import {
  probeReadableDirectory,
  registerProject as registerProjectValidated,
  updateProject as updateProjectValidated,
} from '../registry/validate.ts'
import { detectForgeCheckout } from '../registry/forge-detect.ts'
import { authorizeExternalDocPath as authorizeExternalDocPathRecord } from '../registry/authorize.ts'
import { getActiveProjectId, activateProject as activateProjectRow } from '../repos/app-state.ts'
import { listFeatureSnapshots } from '../repos/feature-snapshots.ts'
import {
  listProjects,
  normalizeRegisteredPath,
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
import { toTaskSummary, toTaskSummaryFromAuthoritative } from './task-summary.ts'
import { createTaskVerbService } from '../tasks/task-service.ts'
import { getProjectTaskAuthority, listTasks } from '../tasks/task-repo.ts'
import { createMigrationService, type MigrationFaults } from '../migration/pipeline.ts'
import { createReingestHook } from '../migration/reingest-watcher.ts'
import { createDeviationHook } from '../stages/deviation-watcher.ts'
import { createKnowledgeVerbService } from '../knowledge/knowledge-service.ts'
import { createPrefsVerbService } from '../prefs/prefs-service.ts'
import { createStagesVerbService } from '../stages/stages-service.ts'
import { createStageWriteService } from '../stages/advance-service.ts'
import { createProposalsVerbService } from '../proposals/proposals-service.ts'
import { createDispatchVerbService } from '../dispatch/dispatch-service.ts'
import { createPresynthEngine } from '../dispatch/presynth/assemble.ts'
import { createProjectLifecycleService, type RegisterProjectV2Input } from '../projects/lifecycle-service.ts'
import { createProjectionReconcileService } from '../projection/service.ts'
import { createLifecycleProjectionHooks } from '../projection/lifecycle-hooks.ts'
import { DEFAULT_PROJECT_LAYOUT, sanitizeProjectLayout } from '../ui-state/layout-schema.ts'
import { getProjectUiStateRow, saveProjectLayout } from '../ui-state/ui-state-repo.ts'
import type {
  FeatureBoardData,
  FeatureDoc,
  PluginRow,
  ProbeCodeRootInput,
  ProbeCodeRootResult,
  RecordSessionLinkInput,
  RegisterProjectInput,
  SessionLink,
  SkillDirSyncAlert,
  TaskBoardData,
  TaskDepChainEntry,
  TaskDetail,
  TaskRecord,
  WorkbenchPaths,
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
  /** forensic search 的 home 基目录(缺省 os.homedir;e2e/测试确定性注入面,任务 2.2)。 */
  readonly forensicHomeDir?: string
  /**
   * customSkillDirs boot 同步告警(任务 5.7;缺省/空 = 无告警)。boot 接线
   * 侧(host-profile/skill-dirs.ts 的聚合结局)注入;getState 只读呈现。
   */
  readonly skillDirSyncAlerts?: readonly SkillDirSyncAlert[] | undefined
  /**
   * 迁移注错缝(任务 6.4,SC2 e2e「失败重试」腿;TEST-ONLY)。缺省
   * undefined → 无注错(生产面恒缺省);注入 = 逐次 startMigration 重新
   * 求值的解析器(env 缝族 DSH_FORGE_MIGRATION_FAULTS,见
   * migration/faults-stub.ts)。boot 接线(main/index.ts)传入。
   */
  readonly migrationFaults?: () => MigrationFaults | undefined
  /**
   * 投影 relay 在场探测(任务 3.2;ERR_PROJECTION_CHANNEL_UNAVAILABLE 的
   * 判据 = 事件订阅登记非空)。缺省恒真 = 乐观直发(1.3 占位事件同款
   * 行为);boot 接线(main/index.ts)注入 workbenchEvents.size 探测。
   */
  readonly relayPresence?: () => boolean
  /**
   * 项目移除时收回该项目全部 detached 窗口(任务 4.2;tech-design
   * §Interface 1 removeProject「拆出窗关闭」)。缺省 no-op(测试装配/
   * 窗口面不在场);boot 接线(main/index.ts)注入壳层窗口注册表收回
   * 面。toast 通知口径留 4.3(GUI)。
   */
  readonly recallProjectWindows?: (projectId: string) => void
  /**
   * 归档/恢复 → 该项目 detached 窗标题刷新(任务 4.3;ui-design C10「标题
   * 追加『已归档』」)。缺省 no-op(测试装配/窗口面不在场);boot 接线
   * (main/index.ts)注入壳层窗口管理器的 setProjectArchived 面。
   */
  readonly markDetachedWindowsArchived?: (projectId: string, archived: boolean) => void
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

/**
 * ERR_LAYOUT_INVALID 落 log(任务 4.1;tech-design §Error Types & Codes 该行
 * 口径:重置默认布局 + log,不弹错、不拒动词面)。读/写两相位共用 —— 读侧
 * = 行内 blob 违规;写侧 = 服务端二次校验拦下的非法入参(落库为默认布局)。
 */
function logLayoutInvalid(phase: 'read' | 'write', projectId: string, reason: string | null): void {
  shellLog.warn({
    code: 'ERR_LAYOUT_INVALID',
    message: `project ${projectId} layout blob failed the v1 whitelist schema and was reset to the default layout (${phase})`,
    ...(reason === null ? {} : { data: { projectId, phase, reason } }),
  })
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
    // M3 任务 1.5/4.2:外部写回收 + feature 级偏离检测钩子挂接感知基座 ——
    // 每轮感知扫描(M2 watcher 触发或动词同步重扫)同一包装内执行:
    //   - 偏离检测在扫描【前】(判据 = pre-scan 快照 vs 活性 manifest;内核
    //     advanceStage 对两者成对同步写,恒不触发)→ deviation_detected
    //     (featureSlug 载荷)+ feature_snapshot.deviated 置位;
    //   - 重摄入在扫描【后】(1.5:已迁移项目 index.json 复现/变更回收)。
    // 两路事件(deviation_detected 项目/feature 级 + migration_progress
    // reingest)并入同一扫描事件批,走同一 sink/批推通道(同通道不同载荷);
    // 钩子均永不抛错、检测/回收失败仅日志(感知面纪律,不弹 UI)。
    const reingest = createReingestHook({ db })
    const deviation = createDeviationHook({ db })
    const scanWithHooks = (target: ScanTarget): ScanOutcome => {
      const deviationEvents = deviation.beforeScan(target)
      const outcome = scanForgeFiles(db, target)
      const reingestEvents = reingest.afterScan(target)
      const extra = [...deviationEvents, ...reingestEvents]
      return extra.length > 0 ? { ...outcome, events: [...outcome.events, ...extra] } : outcome
    }
    const watcher = createWorkbenchWatcher(db, { scan: (_db, target) => scanWithHooks(target), onEvents: sink })
    return {
      retarget: target => watcher.rebuild(target),
      rescan: (target) => {
        const outcome = scanWithHooks(target)
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
    // 任务 6.3(SC1):权威任务写随写直发 task_updated(单批直发,迁移/偏好/
    // 编排面 onEvent 同款形态)—— 否则 sqlite 项目的看板回流无推送面(感知
    // 扫描只覆盖 files 项目),SC1 的 ≤5s 回流链断。
    onEvent: event => sink([event]),
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
    ...(deps.migrationFaults === undefined ? {} : { faults: deps.migrationFaults }),
  })

  // M3 任务 2.2(D4):知识系 + feature 读动词服务。文件数据面直读写
  // (fact = codeRoot/.forge;lesson/research/feature = 文档根;forensic =
  // 机器全局只读源),路径授权与动作分派在 knowledge-service。
  const knowledgeVerbs = createKnowledgeVerbService({
    db,
    ...(deps.forensicHomeDir === undefined ? {} : { homeDir: deps.forensicHomeDir }),
  })

  // M3 任务 3.1:偏好动词服务(三级解析 + 键集封闭 + 事务原子写)。写完成
  // 事件(prefs_updated)经同一 sink 批推(迁移面 onEvent 同款直发形态)。
  const prefsVerbs = createPrefsVerbService({ db, onEvent: event => sink([event]) })

  // M3 任务 3.2:stages 读动词服务(确定性清单 + 门态 + 资产索引读)。零写
  // 面、零事件(advanceStage/summarize 写侧归 4.1);features 根解析与
  // taskVerbs 同源注入(文档根三分模型单一解析)。
  const resolveFeaturesRoot = (projectId: string): string | null => {
    const project = findProjectRow(db, projectId)
    return project === undefined ? null : resolveFeaturesDir(scanTargetOf(project))
  }
  const stagesVerbs = createStagesVerbService({
    db,
    resolveFeaturesRoot,
  })

  // M3 任务 4.1:stages 写动词服务(forge.stage.summarize 内核写面 +
  // advanceStage 推进门内化)。features 根解析与读动词同源;stage_advanced
  // 事件经同一 sink 直发单批(迁移/偏好面 onEvent 同款形态);manifest 写入
  // 仅经本服务内核路径(外部直改由 4.2 watcher 判偏离)。
  const stageWriteVerbs = createStageWriteService({
    db,
    resolveFeaturesRoot,
    onEvent: event => sink([event]),
  })

  // M3 任务 5.3:proposals 读动词服务(proposal_snapshot 派生索引读 +
  // hasEval 活性拼接 + markdown 原文只读)。只读硬约束 —— 本域零写动词、
  // 零事件;proposals 根解析与 features 根同源(scan.resolveProposalsDir,
  // 文档根三分模型单一解析),感知回流由 proposals/ 感知根 + 每轮扫描同步
  // 承载(DF007 ≤5s)。
  const proposalsVerbs = createProposalsVerbService({
    db,
    resolveProposalsRoot: (projectId: string): string | null => {
      const project = findProjectRow(db, projectId)
      return project === undefined ? null : resolveProposalsDir(scanTargetOf(project))
    },
  })

  // M3 任务 3.4:预合成引擎(三要素组装 + prompt_hash 口径物)。取 代
  // forge prompt —— 派发链的注入内容自此由内核确定性合成,零 CLI 自跑
  // 路径;每派发现读 stage_asset/偏好/任务 frontmatter(动态性,零缓存)。
  const presynthEngine = createPresynthEngine({ db, resolveFeaturesRoot })

  // M3 任务 3.3:编排动词服务(dispatch/approval 域)。装配缝:
  //   - checkArtifacts = stagesVerbs.checkStageArtifacts(3.2 确定性清单的
  //     dispatch 消费面,缺失 = blocked 联合返回);
  //   - composePrompt = presynthEngine(3.4 接线:组合首条消息 + 预铸
  //     sessionId;hash = sha256(消息)随行落库);
  //   - launchPort 缺省(3.5 host dispatch-launch 接线前行留 starting;
  //     Hard Rule:内核不持会话创建权);
  //   - 事件经同一 sink 批推(dispatch_updated/approval_received;迁移/
  //     偏好面 onEvent 同款单批直发形态)。
  // host 回调面(receiveApproval/notify*——3.5 approval-bridge 与
  // dispatch-launch 接线)保留在 dispatchVerbs 域面对象上,不入 IPC 动词面。
  const dispatchVerbs = createDispatchVerbService({
    db,
    checkArtifacts: (projectId, featureSlug) => stagesVerbs.checkStageArtifacts({ projectId, featureSlug }),
    composePrompt: task => presynthEngine.compose(task),
    onEvents: events => sink(events),
  })

  // M3 任务 1.7(UF3 集成读):内核管理位置 + 向导真实探测 + 可迁移判定
  // 的文档侧半边。全部只读 fs(探测/扫描);唯一写面 = 仓外默认路径的
  // 应用管理目录置备(下方 provision —— userData 空间,非项目目录)。
  const workbenchPaths: WorkbenchPaths = {
    docsRoot: join(deps.userDataPath, 'workbench', 'docs'),
    backupsRoot: join(deps.userDataPath, 'workbench', 'backups'),
  }

  // M4 任务 3.2:投影对账 service(Interface 1 v3·P3 批四动词的芯 + 1.3
  // registerProject 占位 hook 的真实载荷接线)。对账重算 = 3.1 内核
  // (diff → verdict 桥 → 状态机);relay 缺席 → 重试一次后 degraded
  // (ERR_PROJECTION_CHANNEL_UNAVAILABLE,plan 保留 —— 期望在库);事件经
  // 同一 sink 批推(迁移/偏好/编排面 onEvent 同款单批直发形态)。任务 3.4
  // 扩:pushForRename(改名同步)/ buildRemovalPlan(移除 delete plan 组装,
  // 行删除前)/ 回填终态 no-op(移除竞态)。
  const projection = createProjectionReconcileService({
    db,
    onEvents: events => sink(events),
    ...(deps.relayPresence === undefined ? {} : { relayPresence: deps.relayPresence }),
  })

  // M4 任务 3.4:生命周期动词 × 投影的单一接线点(四操作映射矩阵见该模块
  // 头注:注册 ensure/改名 rename plan/归档恢复零 op/移除 delete plan)。
  const projectionHooks = createLifecycleProjectionHooks({
    projection,
    onEvents: events => sink(events),
  })

  // M4 任务 1.3:项目生命周期域服务(v3·P1 批 —— 侦测/注册 v2/rename/
  // archive/restore/list;D11 三层比对 + 投影占位事件 + project_list_changed
  // 经同一 sink 批推,迁移/偏好/编排面 onEvent 同款直发形态)。任务 3.2
  // 接线:注册成功 → 期望占位 + 真实 plan push(projection 域组装;1.3 的
  // 占位单 ensure plan 降级为 isolated 装配的兜底)。任务 3.4 接线:改名
  // 成功 → 自包含 plan push 含 rename op(onProjectionRenamed;归档项目零
  // op 不推送)。
  const lifecycle = createProjectLifecycleService({
    db,
    docsRoot: workbenchPaths.docsRoot,
    onEvents: events => sink(events),
    onProjectionExpectation: projectId => projectionHooks.onRegistered(projectId),
    onProjectionRenamed: projectId => projectionHooks.onRenamed(projectId),
  })

  /** 目录直下列表(缺失/不可读 → 空数组;探测语境不放大 fs 噪声)。 */
  const listSubdirs = (dir: string): readonly string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
    } catch {
      return []
    }
  }

  /**
   * 任务态语料扫描(只读):含可解析 tasks/index.json 的 feature 计数 +
   * 任务合计 + 任一检出位。probeCodeRoot(向导)与 getMigrationStatus 的
   * indexJsonDetected(卡片)共用 —— 单实现,零两边漂移。
   */
  const scanTaskCorpus = (featuresDir: string): { featureTotal: number; taskTotal: number; indexJsonDetected: boolean } => {
    let featureTotal = 0
    let taskTotal = 0
    let indexJsonDetected = false
    for (const slug of listSubdirs(featuresDir)) {
      const entries = readTaskIndex(join(featuresDir, slug, 'tasks', 'index.json'))
      if (entries === null) continue // 无 index.json / 不可解析 —— 摄入会拒,检出位不亮
      featureTotal += 1
      taskTotal += Object.keys(entries).length
      indexJsonDetected = true
    }
    return { featureTotal, taskTotal, indexJsonDetected }
  }

  /** probeCodeRoot(向导 step-①/② 定型后探测;detectForgeCheckout 同语义)。 */
  const probeCodeRootImpl = (input: ProbeCodeRootInput): ProbeCodeRootResult => {
    const codeRoot = input.codeRoot.trim()
    const rootProbe = probeReadableDirectory(codeRoot)
    if (!rootProbe.ok) {
      return { available: false, reasonCode: 'ERR_CODE_ROOT_UNREADABLE', detail: rootProbe.reason }
    }
    const docLocationPath = typeof input.docLocationPath === 'string' && input.docLocationPath.trim() !== ''
      ? input.docLocationPath.trim()
      : null
    const detection = detectForgeCheckout({ codeRoot, docLocationPath })
    if (!detection.detected) {
      return {
        available: false,
        reasonCode: 'ERR_FORGE_NOT_DETECTED',
        detail: `neither ${detection.probes.forgeDir} nor ${detection.probes.docsFeatures} exists`,
      }
    }
    const corpus = scanTaskCorpus(resolveFeaturesDir({ id: 'probe', codeRoot, docLocationPath }))
    return {
      available: true,
      taskTotal: corpus.taskTotal,
      featureTotal: corpus.featureTotal,
      indexJsonDetected: corpus.indexJsonDetected,
    }
  }

  /**
   * 仓外默认路径置备(G7/SC9 默认值翻转的落地面):external 路径位于内核
   * docsRoot 之下 → 注册/重指向动词先建目录(应用管理空间,幂等),校验链
   * 的只读纪律不变(用户自供路径永不建、永不变更)。授权记录仍为前置
   * (BIZ-workbench-001 延续:仓外须显式授权 —— 置备不等于授权)。
   */
  const provisionAppManagedDocRoot = (docLocationType: unknown, docLocationPath: unknown): void => {
    if (docLocationType !== 'external' || typeof docLocationPath !== 'string' || docLocationPath.trim() === '') return
    const target = normalizeRegisteredPath(docLocationPath)
    const root = normalizeRegisteredPath(workbenchPaths.docsRoot)
    // normalizeRegisteredPath 双侧折叠为 `/` 方言 —— 前缀比对同方言。
    if (target !== root && !target.startsWith(`${root}/`)) return
    try {
      statSync(target)
    } catch {
      // 缺失(ENOENT 等)→ 置备;置备失败不拦截:校验链的可读性探测
      // 随后给出明确拒绝(ERR_EXTERNAL_PATH_UNREADABLE,消息含路径与原因)。
      try {
        mkdirSync(target, { recursive: true })
      } catch {
        // 已存在(并发注册同一路径)或不可创建 —— 校验链兜底。
      }
      return
    }
    // stat 成功但非目录 → 不动(校验链会以 not a directory 拒绝)。
  }

  return {
    verbs: {
      getState(): WorkbenchState {
        return {
          projects: listProjects(db),
          activeProjectId: getActiveProjectId(db),
          plugins: pluginFace.listRows(),
          ...(deps.skillDirSyncAlerts === undefined || deps.skillDirSyncAlerts.length === 0
            ? {}
            : { skillDirSyncAlerts: [...deps.skillDirSyncAlerts] }),
        }
      },

      registerProject(input: RegisterProjectInput): Project {
        // M4 任务 1.3:v2 入参(anchor/docsPlacement)走 D11 生命周期链;
        // v1 入参(M2/M3 向导冻结面)走 registry 链,行为不变。
        if ('anchor' in input) {
          return lifecycle.registerProject(input as RegisterProjectV2Input)
        }
        provisionAppManagedDocRoot(input.docLocationType, input.docLocationPath)
        return registerProjectValidated(db, input)
      },

      updateProject(id: string, patch: ProjectPatch): Project {
        // 1.7:重指向到内核管理路径同样先置备(repoint 与注册同一外部语义;
        // type 未变且 path 缺省 = 纯改名,guard 直接短路)。
        provisionAppManagedDocRoot(patch.docLocationType, patch.docLocationPath)
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
        // M4 任务 3.4:投影 delete(语义扩展第一腿)—— plan 组装必须先于
        // 行删除(期望并集随后 FK cascade 消失);组装失败不阻断删除
        // (ERR_PROJECT_NOT_FOUND 唯一权威 = removeProjectRow)。
        const removalPlan = projectionHooks.removalPlanBeforeDelete(id)
        removeProjectRow(db, id)
        // 投影 delete(第二腿):行删除后发 delete plan push(relay 执行 dsh
        // workspace 移除;回填按终态 no-op)。FK cascade 已随行清除期望快照
        // (workspace_projection)与布局记忆(project_ui_state)。relay 缺席
        // 世界 = 事件无人消费,dsh 侧可能残留 workspace(孤儿 = 用户自有
        // 数据,原生可删)—— 删除动词不被阻断(PRD 必答④降级语义)。
        if (removalPlan !== null) projectionHooks.emitRemovalPush(removalPlan)
        // 任务 4.2(Interface 1 removeProject「拆出窗关闭」):行删除后收回
        // 该项目全部 detached 窗口(壳层注册表按 projectId 关窗;每窗
        // 'closed' 路径自带 detached-closed 事件兜底)。窗面不在场/收回
        // 失败不阻断删除 —— 项目行已删,残留窗口随主窗关闭对账。
        deps.recallProjectWindows?.(id)
        if (wasActive) perception.retarget(null)
        // M4 任务 1.3:移除即列表变更(project_list_changed;DB 删除 + FK
        // cascade 已由 repos 事务承载)。
        sink([{ type: 'project_list_changed' }])
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
        // 任务 6.3(SC1):读路由按 data_authority 分流(tech-design §Interface 1
        // 读动词口径 —— 1.3 落了 taskGet/taskQuery,本动词此前漏分流,已迁移项
        // 目的看板会读 files 侧快照缓存:迁移归档 index.json 后扫描将清空
        // task_snapshot,看板随之失真)。sqlite → task 权威表(files 快照缓存
        // 仅是 files 项目的派生投影)。
        const tasks = getProjectTaskAuthority(db, projectId) === 'sqlite'
          ? listTasks(db, projectId).map(toTaskSummaryFromAuthoritative)
          : listTaskSnapshots(db, projectId).map(toTaskSummary)
        return {
          tasks,
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
          // 任务 4.4(Integration #2):偏离徽标数据源 —— feature_snapshot.
          // deviated 投影(4.2 watcher 置位 / 内核合法推进清除)。
          deviated: snapshot.deviated,
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

      // —— M3 知识系 + feature 读动词(任务 2.2,D4):委托 knowledge/
      //    knowledge-service(文件数据面;读写语义 = forge CLI 对应命令)。 ——
      knowledgeFact: input => knowledgeVerbs.knowledgeFact(input),
      knowledgeLesson: input => knowledgeVerbs.knowledgeLesson(input),
      knowledgeResearch: input => knowledgeVerbs.knowledgeResearch(input),
      knowledgeForensic: input => knowledgeVerbs.knowledgeForensic(input),
      featureList: projectId => knowledgeVerbs.featureList(projectId),
      featureStatus: input => knowledgeVerbs.featureStatus(input),

      // —— M3 偏好动词(任务 3.1):委托 prefs/prefs-service(三级解析 +
      //    键集/类型校验 + 事务原子;事件 prefs_updated 随写直发)。 ——
      getPrefs: scope => prefsVerbs.getPrefs(scope),
      setPrefs: (scope, entries) => prefsVerbs.setPrefs(scope, entries),
      clearPrefOverride: (scope, key) => prefsVerbs.clearPrefOverride(scope, key),

      // —— M3 stages 读动词(任务 3.2):委托 stages/stages-service
      //    (checkStageArtifacts 确定性清单 + getStageGate/listStageAssets)。 ——
      checkStageArtifacts: input => stagesVerbs.checkStageArtifacts(input),
      getStageGate: (projectId, featureSlug) => stagesVerbs.getStageGate(projectId, featureSlug),
      listStageAssets: (projectId, featureSlug) => stagesVerbs.listStageAssets(projectId, featureSlug),

      // —— M3 stages 写动词(任务 4.1):委托 stages/advance-service
      //    (forge.stage.summarize 写面 + advanceStage 推进门;stage_advanced
      //    事件随写直发)。 ——
      advanceStage: (projectId, featureSlug) => stageWriteVerbs.advanceStage(projectId, featureSlug),
      stageSummarize: input => stageWriteVerbs.stageSummarize(input),

      // —— M3 proposals 读动词(任务 5.3):委托 proposals/proposals-service
      //    (proposal_snapshot 索引读 + 排序基线 + hasEval 活性拼接 + markdown
      //    原文只读;只读硬约束 —— 零写动词)。 ——
      getProposalBoard: projectId => proposalsVerbs.getProposalBoard(projectId),
      readProposalDoc: input => proposalsVerbs.readProposalDoc(input),

      // —— M3 编排动词(任务 3.3):委托 dispatch/dispatch-service
      //    (可派发集校验 + 产物检查消费 + 审批决策 + ⇔ 不变式;
      //    subagent 启动位点 = host 回调接口,不经动词面)。 ——
      dispatchTasks: (input, actor) => dispatchVerbs.dispatchTasks(input, actor),
      redispatch: (dispatchId, actor) => dispatchVerbs.redispatch(dispatchId, actor),
      getDispatches: projectId => dispatchVerbs.getDispatches(projectId),
      listApprovals: projectId => dispatchVerbs.listApprovals(projectId),
      decideApproval: (input, actor) => dispatchVerbs.decideApproval(input, actor),

      // —— M3 dispatch host 回调段(任务 3.5):renderer relay 替 host 半身
      //    (dispatch-launch/approval-bridge)转发的回调面 —— 域面方法直通
      //    (receiveApproval 入列/notify* 回填;事务与 ⇔ 不变式在域内)。 ——
      receiveApproval: input => dispatchVerbs.receiveApproval(input),
      notifySessionStarted: (dispatchId, sessionId) => dispatchVerbs.notifySessionStarted(dispatchId, sessionId),
      notifyLaunchFailed: (dispatchId, error) => dispatchVerbs.notifyLaunchFailed(dispatchId, error),

      // —— M3 迁移动词(任务 1.4):委托 migration/pipeline(守卫/备份/
      //    摄入/对拍/切读/归档 + migration_event 审计 + migration_progress)。 ——
      getMigrationStatus: (projectId) => {
        const status = migrationService.getMigrationStatus(projectId)
        if (status.authority !== 'files') return { ...status, indexJsonDetected: false }
        const project = findProjectRow(db, projectId)
        return {
          ...status,
          indexJsonDetected: project === undefined
            ? false
            : scanTaskCorpus(resolveFeaturesDir(scanTargetOf(project))).indexJsonDetected,
        }
      },
      startMigration: (projectId) => {
        // 任务 6.3(SC1):向导路径 register→migrate 之间无激活/扫描位 ——
        // verify 对拍的 task_snapshot 派生投影可能从未建立(0 行 →
        // ERR_MIGRATION_VERIFY 误拒)。从未扫描的项目先行一次同步重扫
        // (感知基座既有面,派生缓存重建幂等;已扫描项目路径不变)。
        if (getSyncState(db, projectId) === null) {
          perception.rescan(scanTargetOf(requireProject(projectId)))
        }
        return migrationService.startMigration(projectId)
      },
      // —— M3 UF3 集成读(任务 1.7)——
      probeCodeRoot: input => probeCodeRootImpl(input),
      getWorkbenchPaths: () => workbenchPaths,

      // —— M4 v3 项目中心动词(任务 1.3):委托 projects/lifecycle-service
      //    (D11 侦测/注册 v2/生命周期;事件经同一 sink 批推)。 ——

      probeProjectPath: input => lifecycle.probeProjectPath(input),
      renameProject: input => lifecycle.renameProject(input),
      // 任务 4.3(ui-design C10 窗口语义「归档 → 窗口保持可用,标题追加
      // 『已归档』」):归档/恢复动词落地即刷新该项目 detached 窗标题
      // (hook 缺省 no-op —— 窗口面不在场的世界;boot 接线注入)。
      archiveProject: (input) => {
        const updated = lifecycle.archiveProject(input)
        deps.markDetachedWindowsArchived?.(updated.id, true)
        return updated
      },
      restoreProject: (input) => {
        const updated = lifecycle.restoreProject(input)
        deps.markDetachedWindowsArchived?.(updated.id, false)
        return updated
      },
      listProjects: () => lifecycle.listProjects(),

      // —— M4 v3 投影动词(任务 3.2):委托 projection/service(对账重算 +
      //    幂等全量重推 + relay 回填映射;动词不因投影失败 reject)。 ——
      retryProjection: input => projection.retryProjection(input),
      getProjectionStatus: input => projection.getProjectionStatus(input),
      submitWorkspaceSnapshot: input => projection.submitSnapshot(input.workspaces),
      reportProjectionOutcome: input => projection.reportOutcome(input),

      // —— M4 v3 ui-state 动词(任务 4.1):布局记忆读写(Interface 1 v3·P4
      //    批两动词)。schema 白名单校验 = 服务端第二道防线(客户端 debounce
      //    之上;T5):非法 blob 落库为默认布局 + ERR_LAYOUT_INVALID log,
      //    不拒动词面;唯一 reject 面 = ERR_PROJECT_NOT_FOUND。 ——
      getProjectUiState: (input) => {
        assertProjectExists(db, input.projectId)
        const row = getProjectUiStateRow(db, input.projectId)
        if (row === null) return { layout: DEFAULT_PROJECT_LAYOUT }
        if (row.reset) logLayoutInvalid('read', input.projectId, row.reason)
        return { layout: row.layout }
      },
      setProjectUiState: (input) => {
        assertProjectExists(db, input.projectId)
        const sanitized = sanitizeProjectLayout(input.layout)
        if (sanitized.reset) logLayoutInvalid('write', input.projectId, sanitized.reason)
        saveProjectLayout(db, input.projectId, sanitized.layout, new Date().toISOString())
      },
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
      // 3.2:冲刷 pending 对账(同步末次重算,不丢状态迁移;watcher 冲刷
      // 批缓冲的同款收尾纪律)。
      projection.dispose()
    },
  }
}
