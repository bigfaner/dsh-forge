// workbench/projects/lifecycle-service — M4 项目生命周期域服务(任务 1.3,
// tech-design §Interface 1 v3·P1 批)。verbs 面:
//
//   probeProjectPath  侦测动词(消费 1.2 DetectReport;主进程路径校验,
//                     固定前缀有界探测,禁 glob —— T4 缓解)
//   registerProject   v2 注册面(anchor / displayName / docsPlacement 四值 /
//                     customAuthorized;BEGIN IMMEDIATE;成功 → 投影期望
//                     push 事件占位 + project_list_changed)
//   renameProject     纯 DB 改名,零 fs(投影 rename 同步经 onProjectionRenamed
//                     hook —— 任务 3.4 接线,plan 组装归 projection 域)
//   archiveProject    archived=1(dsh 侧 workspace 保留 —— 归档 ≠ 删除)
//   restoreProject    archived=0
//   listProjects      v3 扩展列(archived / sortOrder / projectionState /
//                     docsPlacement),sort_order 注册序输出
//
// registerProject v2 硬校验仅 2 条(设计裁决:ERR_FORGE_NOT_DETECTED 废止,
// 「未检测到 git」= 信息态非错误):
//   1. anchor 存在 + 目录 + 可读(1.2 侦测事实)→ ERR_CODE_ROOT_UNREADABLE;
//   2. 跨项目唯一(D11 三层比对:canonical → pathKey → (dev,ino))→
//      ERR_PROJECT_EXISTS(命中 → 已注册快车道 payload:detail 携
//      JSON { projectId, displayName, codeRoot, tier };命中即仲裁回写自愈
//      —— 悬挂/漂移存储键按 fresh probe 回写,自愈失败不掩盖拒绝语义)。
//
// docsPlacement 落位映射(v1 存储列相干性由行级 CHECK 兜底):
//   repo-existing / repo-new → ('in_repo', NULL)——repo-new 的 docsPath 为
//     声明位(仓内懒物化落点,默认 <anchor>/docs;标准位置无需另存);
//   app → ('external', 内核派生 <docsRoot>/<文件夹名>)——派生即置备
//     (mkdir 应用管理空间,幂等),不要求授权登记(收窄后授权复检仅 custom);
//   custom → ('external', docsPath)——复检 = 授权在案
//     (ERR_EXTERNAL_PATH_UNREADABLE) + 可读 + 冲突比对(≠ 本项目 anchor /
//     既有项目 codeRoot / 仓外 doc 路径,复用 registry 单源比对)。
//
// 事件:仅经既有批量通道的载荷(onEvents sink 注入;≤500ms 合并在通道侧)。
// registerProject 成功发 projection_push_required(任务 3.2 起:
// onProjectionExpectation hook 在场 = projection 域真实载荷 —— 期望占位 +
// 自包含 plan 组装/relay 缺席降级归 projection/service;缺省兜底 = 1.3 占位
// 单 ensure plan)+ project_list_changed;renameProject(任务 3.4 起:
// onProjectionRenamed hook 在场 = projection 域自包含 plan push 含 rename
// op;归档项目零 op 不推送)先 projection_push_required 后
// project_list_changed;archive/restore = 零投影 op(必答⑤:workspace
// 保留,dsh 侧不动)仅发 project_list_changed;动词不因投影失败 reject
// (hook 异常仅 log)。
//
// removeProject 的语义扩展(投影 delete + FK cascade + 拆出窗关闭)在
// ipc/services.ts 的既有动词装配处承载:投影 delete plan 组装/推送 = 任务
// 3.4 接线(projection/lifecycle-hooks.ts);「拆出窗关闭」hook 留 TODO
// 注记(任务 4.2 窗口注册表落地后接线)。本域不引入跨相位实现。

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { shellLog } from '../../log.ts'
import {
  matchProjectIdentity,
  normalizeEntry,
  probeProjectPath as probeProjectPathCore,
  toComparableKey,
  toDisplayPath,
  type DetectReport,
  type IdentityMatchResult,
} from '../projects-identity/index.ts'
import { assertNoDocPathConflict, probeReadableDirectory, WorkbenchRegistryError } from '../registry/validate.ts'
import { isExternalDocPathAuthorized } from '../registry/authorize.ts'
import {
  healProjectIdentity,
  listProjectIdentities,
  listProjects,
  normalizeRegisteredPath,
  registerProjectV3,
  setProjectArchived,
  updateProject as updateProjectRow,
} from '../repos/projects.ts'
import type { Project, RepoDb } from '../repos/types.ts'
import type { ProjectionPlan, WorkbenchEvent } from '../indexer/diff.ts'

/** registerProject v2 入参(tech-design §Interface 1;v1 面见 repos 层)。 */
export interface RegisterProjectV2Input {
  /** 代码根目录(D11 anchor;裸盘符/相对路径入口即拒)。 */
  readonly anchor: string
  /** 缺省 = 文件夹名。 */
  readonly displayName?: string
  readonly docsPlacement: 'repo-existing' | 'repo-new' | 'app' | 'custom'
  /** repo-new / custom 必填;app = 内核派生。 */
  readonly docsPath?: string
  /** custom 必填 true(BIZ-001/003 收窄;形状校验在 handler 层)。 */
  readonly customAuthorized?: boolean
}

/** renameProject 入参。 */
export interface RenameProjectInput {
  readonly projectId: string
  readonly displayName: string
}

/** archiveProject / restoreProject 入参。 */
export interface ProjectRefInput {
  readonly projectId: string
}

/**
 * ERR_PROJECT_EXISTS 的已注册快车道形态(任务 1.3):detail 携 JSON
 * payload —— C7 卡 Registered 态的「已注册 · 打开」数据源(probe 的
 * registered 字段为侦测面快车道,本形态为提交面竞态兜底,两者同键集)。
 * toWorkbenchIpcError 按 `.code` + `.detail`(字符串)透传封装。
 */
export class RegisteredProjectExistsError extends Error {
  readonly code: string = 'ERR_PROJECT_EXISTS'

  constructor(message: string, readonly detail: string) {
    super(message)
    this.name = 'RegisteredProjectExistsError'
  }
}

/** 生命周期服务装配入参。 */
export interface ProjectLifecycleDeps {
  readonly db: RepoDb
  /** 内核管理文档根(<userData>/workbench/docs;'app' 落位派生基)。 */
  readonly docsRoot: string
  /** 事件批推送端(sink;单批直发形态,合并在批量通道侧)。 */
  readonly onEvents: (events: readonly WorkbenchEvent[]) => void
  /**
   * 注册成功 → 投影期望占位 + 真实 plan push(任务 3.2 接线:ipc/services
   * 注入 projection 域 pushForRegistration;期望占位 + 自包含 plan 组装归
   * projection/service)。缺省 = 1.3 占位单 ensure plan 兜底(isolated 装配)。
   * Hard Rule:hook 异常仅 log —— 注册语义永不因投影失败 reject。
   */
  readonly onProjectionExpectation?: (projectId: string) => void
  /**
   * 改名成功 → 自包含 plan push 含 rename op(任务 3.4 接线:ipc/services
   * 注入 projection 域 pushForRename;归档项目零 op 不推送给该域承载)。
   * 缺省 = 纯 DB 改名零投影事件(isolated 装配)。Hard Rule 同上:hook 异常
   * 仅 log —— 改名语义永不因投影失败 reject。
   */
  readonly onProjectionRenamed?: (projectId: string) => void
}

/** 缺省显示名 = canonical 展示路径的最后一段目录名(与 repos 缺省同口径)。 */
function folderNameOf(codeRoot: string): string {
  const idx = codeRoot.lastIndexOf('/')
  const base = idx === -1 ? codeRoot : codeRoot.slice(idx + 1)
  return base === '' ? codeRoot : base
}

export function createProjectLifecycleService(deps: ProjectLifecycleDeps): {
  probeProjectPath(input: { path: string }): DetectReport
  registerProject(input: RegisterProjectV2Input): Project
  renameProject(input: RenameProjectInput): Project
  archiveProject(input: ProjectRefInput): Project
  restoreProject(input: ProjectRefInput): Project
  listProjects(): Project[]
} {
  const { db } = deps
  const notifyListChanged = (): void => {
    deps.onEvents([{ type: 'project_list_changed' }])
  }

  return {
    probeProjectPath(input: { path: string }): DetectReport {
      // 只读侦测:注册表身份行 + 1.2 侦测管线(快车道 registered 随行)。
      return probeProjectPathCore(input, listProjectIdentities(db))
    },

    registerProject(input: RegisterProjectV2Input): Project {
      const registered = listProjectIdentities(db)

      // —— 硬校验 1(前置):anchor 入口形态(裸盘符/相对路径零 fs 拒)——
      const entry = normalizeEntry(input.anchor)
      if (!entry.ok) {
        throw new WorkbenchRegistryError(
          'ERR_CODE_ROOT_UNREADABLE',
          `code root ${input.anchor} is not a registrable path (${entry.message})`,
        )
      }

      // 侦测事实(1.2 管线;evidence 位对注册面为冗余携带,不另探测)。
      const report = probeProjectPathCore({ path: input.anchor }, registered)

      // —— 硬校验 1:存在 + 目录 + 可读 ——
      if (!report.exists || !report.isDir || !report.readable) {
        const reason = !report.exists ? 'does not exist' : report.isDir ? 'not readable' : 'not a directory'
        throw new WorkbenchRegistryError(
          'ERR_CODE_ROOT_UNREADABLE',
          `code root ${input.anchor} is not a readable directory (${reason})`,
        )
      }

      // —— 硬校验 2:跨项目唯一(D11 三层比对;命中 → 快车道 payload)——
      if (report.registered !== null) {
        const match: IdentityMatchResult = matchProjectIdentity(
          {
            canonicalPath: report.canonicalPath,
            pathKey: report.pathKey,
            identity: report.identity,
            identityVerified: report.canonicalPath !== null,
          },
          registered,
        )
        if (match.matched && match.heal !== null) {
          // 命中即仲裁回写自愈:悬挂/漂移存储键按 fresh probe 回写;失败
          // 不掩盖拒绝语义(ERR_PROJECT_EXISTS 为权威答案)。
          try {
            healProjectIdentity(db, match.heal)
          } catch {
            // 自愈 best-effort:拒绝路径原样上抛。
          }
        }
        const hit = report.registered
        const tier = match.matched ? match.tier : 'canonical'
        // 快车道 payload 的 codeRoot 取自命中行(match.project 携全量身份列;
        // report.registered 仅侦测面两字段)。
        const hitCodeRoot = match.matched
          ? match.project.codeRoot
          : registered.find(row => row.projectId === hit.projectId)?.codeRoot ?? ''
        throw new RegisteredProjectExistsError(
          `code root ${input.anchor} is already registered as ${hit.displayName} (${hit.projectId})`,
          JSON.stringify({ projectId: hit.projectId, displayName: hit.displayName, codeRoot: hitCodeRoot, tier }),
        )
      }

      // —— docsPlacement 落位映射(行级 CHECK 相干性在此前置保证)——
      // 自冲突守卫(折叠比较:v2 的 anchor 存 canonical 形,docsPath 存
      // resolve 形 —— 异写法同目录在折叠键处拦截;跨项目比对沿用 registry
      // 单源 assertNoDocPathConflict 的存储形态比对)。
      const anchorFolded = report.pathKey ?? toComparableKey(entry.absolute)
      const assertDocPathNotAnchor = (path: string): void => {
        if (toComparableKey(path) === anchorFolded) {
          throw new WorkbenchRegistryError(
            'ERR_DOC_PATH_CONFLICT',
            `doc location ${path} must not equal its own code root ${codeRootOf(entry, report)}`,
          )
        }
      }
      let docLocationType: 'in_repo' | 'external' = 'in_repo'
      let docLocationPath: string | null = null
      let customAuthorized = false
      if (input.docsPlacement === 'app') {
        // 内核派生:<docsRoot>/<文件夹名>(应用管理空间,置备幂等;不要求
        // 授权登记 —— 收窄后授权复检仅 custom)。
        const derived = normalizeRegisteredPath(join(deps.docsRoot, folderNameOf(codeRootOf(entry, report))))
        try {
          mkdirSync(derived, { recursive: true })
        } catch {
          // 置备失败由下方可读性探测给出明确拒绝。
        }
        assertDocPathNotAnchor(derived)
        assertNoDocPathConflict(db, codeRootOf(entry, report), derived, null)
        const probe = probeReadableDirectory(derived)
        if (!probe.ok) {
          throw new WorkbenchRegistryError(
            'ERR_EXTERNAL_PATH_UNREADABLE',
            `app-managed doc location ${derived} is not a readable directory (${probe.reason})`,
          )
        }
        docLocationType = 'external'
        docLocationPath = derived
      } else if (input.docsPlacement === 'custom') {
        // custom 复检:授权在案 + 可读 + 冲突比对(先授权后探测 —— 未授权
        // 路径连探测都不做,M2 Hard Rule 延续)。
        const path = normalizeRegisteredPath(input.docsPath ?? '')
        assertDocPathNotAnchor(path)
        assertNoDocPathConflict(db, codeRootOf(entry, report), path, null)
        if (!isExternalDocPathAuthorized(db, path)) {
          throw new WorkbenchRegistryError(
            'ERR_EXTERNAL_PATH_UNREADABLE',
            `custom doc location ${path} has no explicit authorization on record — confirm the path before registering`,
          )
        }
        const probe = probeReadableDirectory(path)
        if (!probe.ok) {
          throw new WorkbenchRegistryError(
            'ERR_EXTERNAL_PATH_UNREADABLE',
            `custom doc location ${path} is not a readable directory (${probe.reason})`,
          )
        }
        docLocationType = 'external'
        docLocationPath = path
        customAuthorized = true
      }
      // repo-existing / repo-new:('in_repo', NULL)——repo-new 的 docsPath
      // 为仓内声明位(懒物化默认 <anchor>/docs),标准位置无需另存。

      // —— 落库(BEGIN IMMEDIATE;UNIQUE = 三层比对后的兜底)——
      const codeRoot = codeRootOf(entry, report)
      const project = registerProjectV3(db, {
        codeRoot,
        codeRootKey: report.pathKey ?? toComparableFallback(entry),
        identityDev: report.identity?.dev ?? null,
        identityIno: report.identity?.ino ?? null,
        identityVerified: report.canonicalPath !== null ? 1 : 0,
        displayName: input.displayName,
        docLocationType,
        docLocationPath,
        docsPlacement: input.docsPlacement,
        customAuthorized,
      })

      // —— 事件:投影期望 push + 列表变更 ——
      // 任务 3.2 接线:onProjectionExpectation在场(ipc/services 真实装配)=
      // projection 域接管(期望占位 insertExpectationPlaceholder + 真实自
      // 包含 plan 经 projection_push_required 推送;relay 缺席降级归该域);
      // 缺省(isolated 装配)= 1.3 占位单 ensure plan 兜底。Hard Rule
      // (Propagation Strategy):注册/生命周期动词不因投影失败 reject ——
      // hook 异常仅结构化 log,注册语义不受影响。
      if (deps.onProjectionExpectation !== undefined) {
        try {
          deps.onProjectionExpectation(project.id)
        } catch (error) {
          shellLog.error({
            code: 'ERR_PROJECTION_OP_FAILED',
            message: 'post-register projection push failed (registration unaffected)',
            data: { projectId: project.id, detail: error instanceof Error ? error.message : String(error) },
          })
        }
      } else {
        // 占位 plan = 单 ensure op(注册即确保 workspace 在场;全量 plan
        // 组装归 projection 域,本兜底不承载 reorder/rename/delete)。
        const plan: ProjectionPlan = {
          projectId: project.id,
          ops: [{ kind: 'ensure', canonicalPath: project.codeRoot, title: project.displayName }],
        }
        deps.onEvents([
          { type: 'projection_push_required', projectId: project.id, plan },
          { type: 'project_list_changed' },
        ])
        return project
      }
      deps.onEvents([{ type: 'project_list_changed' }])
      return project
    },

    renameProject(input: RenameProjectInput): Project {
      // 纯 DB 更新,零 fs;感知不随改名触发。投影 rename 同步(任务 3.4):
      // onProjectionRenamed hook 在场(ipc/services 真实装配)= projection
      // 域自包含 plan push(rename op 依实况派生);缺省(isolated 装配)=
      // 零投影事件。Hard Rule(Propagation Strategy):hook 异常仅结构化
      // log —— 改名语义永不因投影失败 reject。
      const displayName = input.displayName.trim()
      if (displayName === '') {
        throw new Error('workbench.renameProject: displayName must be a non-empty string')
      }
      const updated = updateProjectRow(db, input.projectId, { displayName })
      if (deps.onProjectionRenamed !== undefined) {
        try {
          deps.onProjectionRenamed(input.projectId)
        } catch (error) {
          shellLog.error({
            code: 'ERR_PROJECTION_OP_FAILED',
            message: 'post-rename projection push failed (rename unaffected)',
            data: { projectId: input.projectId, detail: error instanceof Error ? error.message : String(error) },
          })
        }
      }
      notifyListChanged()
      return updated
    },

    archiveProject(input: ProjectRefInput): Project {
      const updated = setProjectArchived(db, input.projectId, true)
      notifyListChanged()
      return updated
    },

    restoreProject(input: ProjectRefInput): Project {
      const updated = setProjectArchived(db, input.projectId, false)
      notifyListChanged()
      return updated
    },

    listProjects(): Project[] {
      return listProjects(db)
    },
  }
}

/** canonical 展示路径(realpath 失败 = 字符串回退 display 形)。 */
function codeRootOf(
  entry: { readonly absolute: string },
  report: DetectReport,
): string {
  return report.canonicalPath ?? toDisplayPath(entry.absolute)
}

/** pathKey 缺席防御(entry.ok 已保证非 null;理论不可达,折叠键单源)。 */
function toComparableFallback(entry: { readonly absolute: string }): string {
  return toComparableKey(entry.absolute)
}
