// workbench/registry/authorize — 仓外文档路径显式授权登记(任务 2.4)。
//
// tech-design §Security T4/§Mitigations:仓外路径注册需向导步骤②的显式授权
// 确认。授权是**持久化记录**(app_state kv,经 repos 层写入),不是
// registerProject 的入参旗标 —— 校验链(validate.ts)只读本登记,入参无
// 任何字段可以「声明已授权」,后续 IPC 面也无法单方面绕过(Hard Rule:
// 授权状态持久化、不可绕过)。单写路径 = 本模块的 authorizeExternalDocPath。
//
// Hard Rule「仅对已注册(或注册中已通过授权)的路径执行 fs 操作」:本模块
// 自身零 fs 操作 —— 被登记的路径按定义尚未授权,探测它反而违反该规则;
// 可读性探测在校验链中、于授权确认之后进行。

import { readAppStateJson, writeAppStateJson } from '../repos/app-state.ts'
import { normalizeRegisteredPath } from '../repos/projects.ts'
import type { RepoDb } from '../repos/types.ts'

/** app_state 保留键:仓外文档路径授权登记(与 active_project_id 同域 kv)。 */
export const EXTERNAL_DOC_AUTHORIZATIONS_KEY = 'external_doc_authorizations'

/** 单条授权登记(路径已规范化,可与注册输入的分隔符/尾斜杠写法直接比对)。 */
export interface ExternalDocAuthorization {
  readonly path: string
  /** ISO 8601 UTC(用户确认时点;重复授权即刷新)。 */
  readonly authorizedAt: string
}

function isAuthorizationEntry(value: unknown): value is ExternalDocAuthorization {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.path === 'string' && typeof entry.authorizedAt === 'string'
}

/**
 * 读登记表(防御读:无行/损坏 JSON/畸形条目 → 空表,不炸读取路径;对齐
 * app_state 惯例)。输出按 path 排序,登记与列举口径稳定。
 */
function readAuthorizations(db: RepoDb): ExternalDocAuthorization[] {
  const parsed: unknown = readAppStateJson(db, EXTERNAL_DOC_AUTHORIZATIONS_KEY)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isAuthorizationEntry).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** 列出全部授权登记(path 升序)。 */
export function listExternalDocAuthorizations(db: RepoDb): ExternalDocAuthorization[] {
  return readAuthorizations(db)
}

/** 该路径是否已有显式授权(按规范化口径比对,分隔符/尾斜杠写法等价)。 */
export function isExternalDocPathAuthorized(db: RepoDb, path: string): boolean {
  const normalized = normalizeRegisteredPath(path)
  return readAuthorizations(db).some(entry => entry.path === normalized)
}

/**
 * 登记一条显式授权(用户在向导步骤②确认):幂等 upsert —— 同一路径重复
 * 确认仅刷新 authorizedAt,登记表恒为单条/路径。
 */
export function authorizeExternalDocPath(db: RepoDb, path: string): ExternalDocAuthorization {
  const normalized = normalizeRegisteredPath(path)
  const entry: ExternalDocAuthorization = { path: normalized, authorizedAt: new Date().toISOString() }
  const entries = readAuthorizations(db).filter(existing => existing.path !== normalized)
  entries.push(entry)
  writeAppStateJson(db, EXTERNAL_DOC_AUTHORIZATIONS_KEY, entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)))
  return entry
}
