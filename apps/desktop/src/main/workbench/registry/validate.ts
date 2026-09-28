// workbench/registry/validate — 注册/重指向校验链(任务 2.4)。
//
// registerProject / updateProject(repoint)的域校验,落在 repos(2.2)之上;
// 错误码语义 = tech-design §Error Types & Codes:
//
//   链序(编号即拒绝优先序;fs 操作仅发生在 Hard Rule 允许的位置):
//   1. 输入相干性(docLocationType 枚举 / in_repo 不带 path / external 带
//      非空 path)—— 形状错误直接抛普通 Error,行级 CHECK 仍是存储兜底;
//   2. code_root 可读性(存在且为目录)→ ERR_CODE_ROOT_UNREADABLE,
//      消息含路径与原因(不存在/权限/非目录);
//   3. 仓外路径冲突(external:path = 本项目 code_root / 既有项目
//      code_root / 既有项目仓外 doc 路径)→ ERR_DOC_PATH_CONFLICT
//      —— 纯 db 比对,零 fs;
//   4. 仓外显式授权 → ERR_EXTERNAL_PATH_UNREADABLE(未完成授权)。
//      先于任何对该路径的 fs 探测(Hard Rule:仅对已注册或已授权路径执行
//      fs 操作;未授权路径连探测都不做);
//   5. 仓外路径可读性 → ERR_EXTERNAL_PATH_UNREADABLE(消息含路径与原因);
//   6. forge 检出(.forge/ 或文档位置 docs/features)→
//      ERR_FORGE_NOT_DETECTED(消息指明缺失探测项);
//   7. repos 落库(UNIQUE(code_root) → ERR_PROJECT_EXISTS,经 repos 映射,
//      本层不重复实现)。
//
// 全程只读探测:零 forge CLI 调用、零项目目录写入(Hard Rule)。updateProject
// 仅在 patch 触及文档位置(repoint)时走完整链;纯 rename(displayName)
// 不做 fs 探测。校验通过后以规范化路径落库,与 repos 的 UNIQUE 比对口径
// 一致(normalizeRegisteredPath 单源)。

import { accessSync, constants, statSync } from 'node:fs'
import { detectForgeCheckout } from './forge-detect.ts'
import { isExternalDocPathAuthorized } from './authorize.ts'
import {
  listProjects,
  normalizeRegisteredPath,
  registerProject as insertProject,
  updateProject as updateProjectRow,
} from '../repos/projects.ts'
import {
  WorkbenchRepoError,
  type DocLocationType,
  type Project,
  type ProjectPatch,
  type RegisterProjectInput,
  type RepoDb,
} from '../repos/types.ts'

/** 本层错误码:tech-design §Error Types & Codes 中归属注册校验语义的部分。 */
export type WorkbenchRegistryErrorCode =
  | 'ERR_CODE_ROOT_UNREADABLE'
  | 'ERR_FORGE_NOT_DETECTED'
  | 'ERR_DOC_PATH_CONFLICT'
  | 'ERR_EXTERNAL_PATH_UNREADABLE'

/** registry 层域错误(`code` 对齐 tech-design 错误表;消息含路径与原因)。 */
export class WorkbenchRegistryError extends Error {
  constructor(
    readonly code: WorkbenchRegistryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'WorkbenchRegistryError'
  }
}

/** 相干后的文档位置(in_repo 恒 null path;external 为规范化非空路径)。 */
interface EffectiveDocLocation {
  readonly type: DocLocationType
  readonly path: string | null
}

/** fs 失败原因归类(AC:错误含路径与原因 —— 权限/不存在)。 */
function describeFsFailure(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return 'does not exist'
    if (code === 'EACCES' || code === 'EPERM') return 'permission denied'
    if (code === 'ENOTDIR') return 'not a directory'
    return error.message
  }
  return String(error)
}

type DirectoryProbe = { ok: true } | { ok: false; reason: string }

/** 只读探测:路径存在、为目录、可读(stat + access R_OK,零写入)。 */
/** 只读目录探测(导出于任务 1.7:services 的 probeCodeRoot 复用同一判定)。 */
export function probeReadableDirectory(path: string): DirectoryProbe {
  try {
    if (!statSync(path).isDirectory()) return { ok: false, reason: 'not a directory' }
    accessSync(path, constants.R_OK)
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: describeFsFailure(error) }
  }
}

/**
 * 输入相干性(链序 1):形状/枚举违规抛普通 Error —— 这是调用方契约错误,
 * 不是向导用户态;存储层行级 CHECK 仍是最后兜底。external 的 path 在此
 * 规范化,后续比对(冲突/授权/探测)与落库共用同一口径。
 */
function coerceDocLocation(type: unknown, path: unknown): EffectiveDocLocation {
  if (type !== 'in_repo' && type !== 'external') {
    throw new Error(`invalid docLocationType ${String(type)} — expected 'in_repo' or 'external'`)
  }
  if (type === 'in_repo') {
    if (path != null) {
      throw new Error(`in_repo doc location must not carry docLocationPath (got ${String(path)})`)
    }
    return { type, path: null }
  }
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error('external doc location requires a non-empty docLocationPath')
  }
  return { type, path: normalizeRegisteredPath(path) }
}

/**
 * 仓外路径冲突(链序 3,纯 db 比对):path 不得等于本项目 code_root,也不
 * 得命中任何既有项目(重指向时排除自身)的 code_root 或仓外 doc 路径。
 * 任务 1.3 起导出:registerProject v2 面(app/custom 落点)复用同一比对,
 * 两处口径不漂移。
 */
export function assertNoDocPathConflict(db: RepoDb, codeRoot: string, externalPath: string, selfId: string | null): void {
  if (externalPath === codeRoot) {
    throw new WorkbenchRegistryError(
      'ERR_DOC_PATH_CONFLICT',
      `external doc location ${externalPath} must not equal its own code root ${codeRoot}`,
    )
  }
  for (const other of listProjects(db)) {
    if (other.id === selfId) continue
    if (externalPath === other.codeRoot) {
      throw new WorkbenchRegistryError(
        'ERR_DOC_PATH_CONFLICT',
        `external doc location ${externalPath} conflicts with the registered code root of project ${other.id}`,
      )
    }
    if (other.docLocationPath !== null && externalPath === normalizeRegisteredPath(other.docLocationPath)) {
      throw new WorkbenchRegistryError(
        'ERR_DOC_PATH_CONFLICT',
        `external doc location ${externalPath} conflicts with the registered external doc location of project ${other.id}`,
      )
    }
  }
}

/** 校验链主体(链序 2-6;注册与重指向共用,Hard Rule 的 fs 边界在此执行)。 */
function runValidationChain(db: RepoDb, codeRoot: string, doc: EffectiveDocLocation, selfId: string | null): void {
  const rootProbe = probeReadableDirectory(codeRoot)
  if (!rootProbe.ok) {
    throw new WorkbenchRegistryError(
      'ERR_CODE_ROOT_UNREADABLE',
      `code root ${codeRoot} is not a readable directory (${rootProbe.reason})`,
    )
  }
  if (doc.type === 'external' && doc.path !== null) {
    assertNoDocPathConflict(db, codeRoot, doc.path, selfId)
    if (!isExternalDocPathAuthorized(db, doc.path)) {
      throw new WorkbenchRegistryError(
        'ERR_EXTERNAL_PATH_UNREADABLE',
        `external doc location ${doc.path} has no explicit authorization on record — confirm the path (registration wizard step 2) before registering`,
      )
    }
    const docProbe = probeReadableDirectory(doc.path)
    if (!docProbe.ok) {
      throw new WorkbenchRegistryError(
        'ERR_EXTERNAL_PATH_UNREADABLE',
        `external doc location ${doc.path} is not a readable directory (${docProbe.reason})`,
      )
    }
  }
  const detection = detectForgeCheckout({ codeRoot, docLocationPath: doc.type === 'external' ? doc.path : null })
  if (!detection.detected) {
    const missing: string[] = []
    if (!detection.indicators.forgeDir) missing.push(`.forge directory (${detection.probes.forgeDir})`)
    if (!detection.indicators.docsFeatures) missing.push(`docs/features (${detection.probes.docsFeatures})`)
    throw new WorkbenchRegistryError(
      'ERR_FORGE_NOT_DETECTED',
      `no forge data detected for code root ${codeRoot}: missing ${missing.join(' and ')}`,
    )
  }
}

/**
 * 注册(Interface 1 registerProject 语义):完整校验链通过后经 repos 落库。
 * ERR_PROJECT_EXISTS 由 repos 的 UNIQUE 映射产生(链序 7),本层不预查
 * ——注册探测只读,重复路径的探测本身即 Hard Rule 允许的「已注册路径」。
 */
export function registerProject(db: RepoDb, input: RegisterProjectInput): Project {
  const codeRoot = normalizeRegisteredPath(input.codeRoot)
  const doc = coerceDocLocation(input.docLocationType, input.docLocationPath ?? null)
  runValidationChain(db, codeRoot, doc, null)
  return insertProject(db, {
    codeRoot,
    docLocationType: doc.type,
    docLocationPath: doc.path,
    displayName: input.displayName,
  })
}

/**
 * 更新(Interface 1 updateProject 语义):rename(displayName)直通 repos;
 * repoint(触及 docLocationType/Path)将 patch 与现行行合并为相干配置后走
 * 与注册相同的校验链(仓外同样需授权 —— 编辑模式无豁免)。code_root 不可
 * 经 patch 变更,故无 ERR_PROJECT_EXISTS 面;未知 id → ERR_PROJECT_NOT_FOUND。
 */
export function updateProject(db: RepoDb, id: string, patch: ProjectPatch): Project {
  const current = listProjects(db).find(project => project.id === id)
  if (current === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${id} does not exist`)
  }
  const touchesDocLocation = patch.docLocationType !== undefined || patch.docLocationPath !== undefined
  if (!touchesDocLocation) {
    return updateProjectRow(db, id, patch)
  }
  const doc = coerceDocLocation(
    patch.docLocationType ?? current.docLocationType,
    patch.docLocationPath !== undefined ? patch.docLocationPath : current.docLocationPath,
  )
  runValidationChain(db, current.codeRoot, doc, id)
  return updateProjectRow(db, id, { ...patch, docLocationType: doc.type, docLocationPath: doc.path })
}
