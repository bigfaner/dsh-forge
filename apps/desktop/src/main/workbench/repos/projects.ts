// workbench/repos/projects — 注册表 CRUD(任务 2.2;M4 v3 增列扩展 = 任务 1.3)。
//
// Interface 1 动词落位:registerProject / updateProject / removeProject /
// listProjects(+ v3:listProjectIdentities / registerProjectV3 /
// setProjectArchived / healProjectIdentity)。行级契约(er-diagram §projects):
// code_root UNIQUE + 注册时规范化(分隔符/尾斜杠统一,保证 UNIQUE 比对可靠);
// in_repo/external 的相干性由 schema-v1.sql 行级 CHECK 兜底(路径语义校验 =
// registry 层,任务 2.3);v3 增列(code_root_key UNIQUE 折叠键 / archived /
// sort_order / docs_placement / projection_state)由 schema-v3 ALTER 承载。
//
// removeProject:FK CASCADE 在引擎层波及 session_links 与三张派生快照表
// (+ v3 project_ui_state / workspace_projection,同样 CASCADE;本层对快照表
// 零手写删除——「快照表不动」);app_state 无 FK,激活指针由本函数在事务内
// 显式清空(er-diagram §app_state 注记),保证 removeProject 后
// getActiveProject 不再返回被删项目、不抛 FK 错。

import { resolve } from 'node:path'
import { backfillStoredIdentity, type IdentityHeal, type RegisteredProjectIdentity } from '../projects-identity/index.ts'
import {
  isUniqueViolation,
  toProject,
  WorkbenchRepoError,
  type DocsPlacement,
  type Project,
  type ProjectPatch,
  type ProjectRow,
  type ProjectionState,
  type RegisterProjectInput,
  type RepoDb,
} from './types.ts'

/**
 * 注册路径规范化(code_root 与仓外文档路径共用):resolve 后统一为正斜杠、
 * 去尾斜杠(盘符根/POSIX 根保留原形)。UNIQUE(code_root) 的可比性依赖这
 * 一步——同一目录的不同分隔符/尾斜杠写法必须折叠为同一存储值;registry
 * 层(任务 2.4)的授权登记与冲突比对沿用同一函数,保证两处口径不漂移。
 */
export function normalizeRegisteredPath(codeRoot: string): string {
  const resolved = resolve(codeRoot).replaceAll('\\', '/')
  if (resolved === '/' || /^[A-Za-z]:\/$/.test(resolved)) return resolved
  return resolved.replace(/\/+$/, '')
}

/** 缺省显示名 = 规范化 code_root 的最后一段目录名。 */
function defaultDisplayName(codeRoot: string): string {
  const idx = codeRoot.lastIndexOf('/')
  const base = idx === -1 ? codeRoot : codeRoot.slice(idx + 1)
  return base === '' ? codeRoot : base
}

function selectProjectRow(db: RepoDb, id: string): ProjectRow | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
}

/**
 * 注册项目(v1 面,M2/M3 向导;v3 增列随行补齐):生成 uuid 主键、规范化
 * code_root、落缺省显示名。v3 列随 INSERT 补齐 —— code_root_key/identity =
 * 归一化管线 best-effort(D11 折叠键使同目录异体写法在 UNIQUE(code_root_key)
 * 处同口径拒绝;realpath 失败走字符串回退,不阻断);sort_order = 注册序
 * (MAX+1 子查询,单语句原子);docs_placement 按既有 type 归类(in_repo →
 * repo-existing;external → custom + 授权位,该面 external 恒经授权链)。
 * UNIQUE 冲突 → ERR_PROJECT_EXISTS;行级 CHECK 失败(in_repo 带 path /
 * external 缺 path)原样上抛——该输入相干性应由 registry 层前置校验。
 */
export function registerProject(db: RepoDb, input: RegisterProjectInput): Project {
  const id = crypto.randomUUID()
  const codeRoot = normalizeRegisteredPath(input.codeRoot)
  const displayName = input.displayName?.trim() || defaultDisplayName(codeRoot)
  const identity = backfillStoredIdentity(codeRoot)
  const docsPlacement: DocsPlacement = input.docLocationType === 'external' ? 'custom' : 'repo-existing'
  try {
    db.prepare(
      'INSERT INTO projects ('
        + 'id, display_name, code_root, doc_location_type, doc_location_path, created_at, last_activated_at, '
        + 'code_root_key, identity_dev, identity_ino, identity_verified, archived, sort_order, docs_placement, custom_authorized, projection_state, workspace_id'
        + ') VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projects), ?, ?, ?, NULL)',
    ).run(
      id,
      displayName,
      codeRoot,
      input.docLocationType,
      input.docLocationPath ?? null,
      new Date().toISOString(),
      identity.codeRootKey,
      identity.identityDev,
      identity.identityIno,
      identity.identityVerified,
      docsPlacement,
      input.docLocationType === 'external' ? 1 : 0,
      'pending',
    )
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new WorkbenchRepoError('ERR_PROJECT_EXISTS', `code root ${codeRoot} is already registered`)
    }
    throw error
  }
  const row = selectProjectRow(db, id)
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} vanished right after registration`)
  }
  return toProject(row)
}

/** 列表查询(v3:sort_order 注册序权威;created_at/id 升序兜底并列)。 */
export function listProjects(db: RepoDb): Project[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY sort_order, created_at, id').all() as ProjectRow[]
  return rows.map(toProject)
}

/**
 * D11 身份行只读(v3 三层比对输入;任务 1.2 identity-match 的消费面):
 * projects v3 身份列 → RegisteredProjectIdentity。code_root_key NULL
 * (悬挂/回填失败)按原样透传 —— 比对级容忍,命中后经 healProjectIdentity
 * 回写自愈。
 */
export function listProjectIdentities(db: RepoDb): RegisteredProjectIdentity[] {
  const IDENTITY_COLUMNS = 'id, display_name, code_root, code_root_key, identity_dev, identity_ino'
  return (db
    .prepare(`SELECT ${IDENTITY_COLUMNS} FROM projects`)
    .all() as Array<{
    id: string
    display_name: string
    code_root: string
    code_root_key: string | null
    identity_dev: string | null
    identity_ino: string | null
  }>).map(row => ({
    projectId: row.id,
    displayName: row.display_name,
    codeRoot: row.code_root,
    codeRootKey: row.code_root_key,
    identityDev: row.identity_dev,
    identityIno: row.identity_ino,
  }))
}

/** v3 注册入参(任务 1.3 registerProject v2 面的落库形态;身份列已由调用方归一化)。 */
export interface RegisterProjectV3Input {
  /** canonical 展示路径(realpath 失败 = 字符串回退 display 形)。 */
  readonly codeRoot: string
  readonly codeRootKey: string
  readonly identityDev: string | null
  readonly identityIno: string | null
  readonly identityVerified: 0 | 1
  readonly displayName?: string
  readonly docLocationType: 'in_repo' | 'external'
  readonly docLocationPath: string | null
  readonly docsPlacement: DocsPlacement
  readonly customAuthorized: boolean
}

/**
 * v3 注册(任务 1.3 registerProject v2 面):BEGIN IMMEDIATE 事务内
 * 「sort_order = MAX+1 求值 + INSERT」原子落库(注册序不因并发注册漂移;
 * 单写者内核下 UNIQUE(code_root / code_root_key)为三层比对之后的兜底)。
 * UNIQUE 冲突 → ERR_PROJECT_EXISTS;投影状态恒 'pending'(3.x 对账接线)。
 */
export function registerProjectV3(db: RepoDb, input: RegisterProjectV3Input): Project {
  const id = crypto.randomUUID()
  const displayName = input.displayName?.trim() || defaultDisplayName(input.codeRoot)
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(
      'INSERT INTO projects ('
        + 'id, display_name, code_root, doc_location_type, doc_location_path, created_at, last_activated_at, '
        + 'code_root_key, identity_dev, identity_ino, identity_verified, archived, sort_order, docs_placement, custom_authorized, projection_state, workspace_id'
        + ') VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projects), ?, ?, ?, NULL)',
    ).run(
      id,
      displayName,
      input.codeRoot,
      input.docLocationType,
      input.docLocationPath,
      new Date().toISOString(),
      input.codeRootKey,
      input.identityDev,
      input.identityIno,
      input.identityVerified,
      input.docsPlacement,
      input.customAuthorized ? 1 : 0,
      'pending',
    )
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    if (isUniqueViolation(error)) {
      throw new WorkbenchRepoError(
        'ERR_PROJECT_EXISTS',
        `code root ${input.codeRoot} is already registered (folded key ${input.codeRootKey})`,
      )
    }
    throw error
  }
  const row = selectProjectRow(db, id)
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} vanished right after registration`)
  }
  return toProject(row)
}

/**
 * 归档/恢复(任务 1.3 archiveProject / restoreProject):仅 archived 位翻转,
 * 纯 DB 零 fs(dsh 侧 workspace 保留 —— 归档 ≠ 删除);幂等(重复置位 =
 * 同值 UPDATE,不误报);未知 id → ERR_PROJECT_NOT_FOUND。
 */
export function setProjectArchived(db: RepoDb, id: string, archived: boolean): Project {
  const changes = db.prepare('UPDATE projects SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id)
  if (Number(changes.changes) !== 1) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} does not exist`)
  }
  const row = selectProjectRow(db, id)
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} vanished right after archive flip`)
  }
  return toProject(row)
}

/**
 * D11 命中即仲裁回写自愈(任务 1.2 IdentityHeal 的消费面):fresh probe 值
 * 覆盖悬挂/漂移的存储键与物理位(probe null 不会出现在 heal 载荷 ——
 * identity-match.computeHeal 已按「probe null 保存储值」合并)。自愈失败
 * 不阻断主流程语义由调用方(注册拒绝路径)决定;本函数原样上抛。
 */
export function healProjectIdentity(db: RepoDb, heal: IdentityHeal): void {
  db.prepare(
    'UPDATE projects SET code_root = ?, code_root_key = ?, identity_dev = ?, identity_ino = ?, identity_verified = ? WHERE id = ?',
  ).run(
    heal.codeRoot,
    heal.codeRootKey,
    heal.identityDev,
    heal.identityIno,
    heal.identityVerified ? 1 : 0,
    heal.projectId,
  )
}

/**
 * 投影状态机写位(任务 3.1;projection/state-machine 裁决结果的落库通道,
 * 3.2 对账 service 消费):projects.projection_state CHECK 4 值词表由
 * ProjectionState 类型承载(词表校验在类型面,SQL 端 CHECK 兜底)。未知
 * id → ERR_PROJECT_NOT_FOUND。Hard Rule(单写者):projection 域经本函数
 * 写 projects,不手写越层 SQL。
 */
export function setProjectProjectionState(db: RepoDb, id: string, state: ProjectionState): void {
  const changes = db.prepare('UPDATE projects SET projection_state = ? WHERE id = ?').run(state, id)
  if (Number(changes.changes) !== 1) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} does not exist`)
  }
}

/**
 * dsh WorkspaceId 信息位写位(任务 3.1;er-diagram:「dsh 侧删除重建后由
 * ensure 更新」):expectation-repo.recordSuccessfulPush 同事务镜像调用;
 * 独立导出仅供 repos 层消费面复用。未知 id → ERR_PROJECT_NOT_FOUND。
 */
export function setProjectWorkspaceId(db: RepoDb, id: string, workspaceId: string | null): void {
  const changes = db.prepare('UPDATE projects SET workspace_id = ? WHERE id = ?').run(workspaceId, id)
  if (Number(changes.changes) !== 1) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} does not exist`)
  }
}

/**
 * patch 更新:rename(displayName)与 repoint(docLocationType+Path 成对)。
 * patch 与现行行合并后不相干(in_repo 留 path 等)由行级 CHECK 原样上抛,
 * UPDATE 原子回滚;未知 id → ERR_PROJECT_NOT_FOUND。
 */
export function updateProject(db: RepoDb, id: string, patch: ProjectPatch): Project {
  const current = selectProjectRow(db, id)
  if (current === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} does not exist`)
  }
  const displayName = patch.displayName !== undefined ? patch.displayName : current.display_name
  const docLocationType = patch.docLocationType ?? current.doc_location_type
  const docLocationPath = patch.docLocationPath !== undefined ? patch.docLocationPath : current.doc_location_path
  const changes = db
    .prepare('UPDATE projects SET display_name = ?, doc_location_type = ?, doc_location_path = ? WHERE id = ?')
    .run(displayName, docLocationType, docLocationPath, id)
  if (Number(changes.changes) !== 1) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} does not exist`)
  }
  const row = selectProjectRow(db, id)
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} vanished right after update`)
  }
  return toProject(row)
}

/**
 * 按 id 移除:单事务内「显式清激活指针 + 删项目行」;session_links 与三张
 * 快照表由 FK CASCADE 波及(本层不手写快照删除)。移除不动项目磁盘文件,
 * 也移除非激活项目的指针语义之外的任何状态。未知 id → ERR_PROJECT_NOT_FOUND。
 */
export function removeProject(db: RepoDb, id: string): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    // app_state 无 FK(value 为 JSON):指向被删项目的激活指针必须显式清空。
    db.prepare("DELETE FROM app_state WHERE key = 'active_project_id' AND value = ?").run(JSON.stringify(id))
    const changes = db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    if (Number(changes.changes) !== 1) {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} does not exist`)
    }
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw error
  }
}
