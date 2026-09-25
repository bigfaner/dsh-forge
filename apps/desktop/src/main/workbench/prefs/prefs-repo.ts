// workbench/prefs/prefs-repo — 三级偏好单表 scope 化仓储(任务 3.1)。
//
// prefs 表(schema-v2.sql §6)= 单表 scope 化仓储:(scope, scope_id, key) PK;
// scope_id 约定(设计权威):global='' / project=项目id /
// feature=`<projectId>/<featureSlug>` 限定地址(防跨项目同 slug 键碰撞,
// feature_snapshot PK 含 project_id 同理)。
//
// 本模块是 prefs 表的唯一写入口(SAVEPOINT 事务路径,task-repo withTaskTx
// 先例);键集/类型校验在 registry/服务层,行层只承 CRUD。读路径对损坏
// value_json 防御解码(派生语义不放大存储损伤,repos 惯例)。

import { WorkbenchRepoError, type RepoDb } from '../repos/types.ts'
import { isSegment, PrefDomainError } from './registry.ts'

/** 三级词表(prefs.scope CHECK 同源)。 */
export type PrefScopeKind = 'global' | 'project' | 'feature'

/**
 * Interface 1 偏好动词的 scope 入参形态(tech-design §Interface 1:
 * `getPrefs(scope: 'global' | { project } | { feature })`;feature 字段 =
 * 限定地址 `<projectId>/<featureSlug>` 字符串)。
 */
export type PrefScope = 'global' | { readonly project: string } | { readonly feature: string }

/** 一个已解析的存储地址(scope + scope_id,落库形态)。 */
export interface PrefScopeAddress {
  readonly scope: PrefScopeKind
  readonly scopeId: string
}

/** prefs 表行(schema-v2.sql snake_case 投影)。 */
export interface PrefsRow {
  readonly scope: PrefScopeKind
  readonly scope_id: string
  readonly key: string
  readonly value_json: string
  readonly updated_at: string
}

// ---------------------------------------------------------------------------
// scope 入参 → 存储地址(限定地址拆解 + 项目存在性)
// ---------------------------------------------------------------------------

/** 限定地址 `<projectId>/<featureSlug>` 拆解;形态错 → ERR_PREF_SCOPE_INVALID。 */
export function parseFeatureScopeId(feature: string): { projectId: string; featureSlug: string } {
  const at = feature.indexOf('/')
  const lastAt = feature.lastIndexOf('/')
  if (at === -1 || at !== lastAt) {
    throw new PrefDomainError(
      'ERR_PREF_SCOPE_INVALID',
      `feature scope ${JSON.stringify(feature)} must be the qualified address '<projectId>/<featureSlug>' (exactly one '/')`,
    )
  }
  const projectId = feature.slice(0, at)
  const featureSlug = feature.slice(at + 1)
  if (!isSegment(projectId) || !isSegment(featureSlug)) {
    throw new PrefDomainError(
      'ERR_PREF_SCOPE_INVALID',
      `feature scope ${JSON.stringify(feature)} carries an empty segment or a path separator / control character`,
    )
  }
  return { projectId, featureSlug }
}

/**
 * scope 入参 → 存储地址。project/feature 级必须命中已注册项目
 * (ERR_PROJECT_NOT_FOUND —— 与 repos assertProjectExists 同码口径);
 * feature 级地址形态由 parseFeatureScopeId 前置校验。
 */
export function prefScopeAddressOf(db: RepoDb, scope: PrefScope): PrefScopeAddress {
  if (scope === 'global') return { scope: 'global', scopeId: '' }
  if (typeof scope === 'object' && scope !== null && 'project' in scope) {
    const projectId = scope.project
    if (typeof projectId !== 'string' || projectId === '') {
      throw new PrefDomainError('ERR_PREF_SCOPE_INVALID', 'project scope must carry a non-empty project id')
    }
    requireRegisteredProject(db, projectId)
    return { scope: 'project', scopeId: projectId }
  }
  if (typeof scope === 'object' && scope !== null && 'feature' in scope) {
    const feature = scope.feature
    if (typeof feature !== 'string' || feature === '') {
      throw new PrefDomainError('ERR_PREF_SCOPE_INVALID', 'feature scope must carry a non-empty qualified address')
    }
    const { projectId } = parseFeatureScopeId(feature)
    requireRegisteredProject(db, projectId)
    return { scope: 'feature', scopeId: feature }
  }
  throw new PrefDomainError('ERR_PREF_SCOPE_INVALID', `unknown pref scope form: ${JSON.stringify(scope)}`)
}

function requireRegisteredProject(db: RepoDb, projectId: string): void {
  const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
  }
}

/**
 * 解析序(三级生效链,最特异在前):feature → [feature, 所属 project, global];
 * project → [project, global];global → [global]。
 */
export function prefScopeChain(address: PrefScopeAddress): readonly PrefScopeAddress[] {
  if (address.scope === 'feature') {
    const { projectId } = parseFeatureScopeId(address.scopeId)
    return [
      address,
      { scope: 'project', scopeId: projectId },
      { scope: 'global', scopeId: '' },
    ]
  }
  if (address.scope === 'project') {
    return [address, { scope: 'global', scopeId: '' }]
  }
  return [address]
}

// ---------------------------------------------------------------------------
// 事务(SAVEPOINT 承载,嵌套安全;task-repo withTaskTx 同款)
// ---------------------------------------------------------------------------

/**
 * prefs 写路径统一事务语义:批量写入原子(失败整体回滚,零半写);
 * 独立调用自持事务,嵌套于外层事务时安全降级为子事务。
 */
export function withPrefsTx<T>(db: RepoDb, run: () => T): T {
  db.exec('SAVEPOINT dsh_forge_prefs_tx')
  try {
    const result = run()
    db.exec('RELEASE dsh_forge_prefs_tx')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK TO dsh_forge_prefs_tx')
      db.exec('RELEASE dsh_forge_prefs_tx')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// 行级 CRUD(唯一写入口;读取防御解码)
// ---------------------------------------------------------------------------

/** 单地址全量行(键升序;编辑面/解析共用读取面)。 */
export function listPrefsRows(db: RepoDb, address: PrefScopeAddress): PrefsRow[] {
  return db
    .prepare('SELECT * FROM prefs WHERE scope = ? AND scope_id = ? ORDER BY key')
    .all(address.scope, address.scopeId) as PrefsRow[]
}

/**
 * 单键行读取(解码 value_json;行缺失或 JSON 损坏 → undefined —— 损坏行
 * 视同未设置,继承链继续下探,读取面不炸)。
 */
export function readPrefValue(db: RepoDb, address: PrefScopeAddress, key: string): unknown {
  const row = db
    .prepare('SELECT value_json FROM prefs WHERE scope = ? AND scope_id = ? AND key = ?')
    .get(address.scope, address.scopeId, key) as { readonly value_json: string } | undefined
  if (row === undefined) return undefined
  try {
    return JSON.parse(row.value_json) as unknown
  } catch {
    return undefined
  }
}

/** upsert(键集/类型校验由服务层前置;本层只承写入)。 */
export function upsertPref(db: RepoDb, address: PrefScopeAddress, key: string, valueJson: string, updatedAt: string): void {
  db.prepare(
    `INSERT INTO prefs (scope, scope_id, key, value_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (scope, scope_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(address.scope, address.scopeId, key, valueJson, updatedAt)
}

/** 删除本级覆盖;返回是否实际删除(幂等 no-op = false)。 */
export function deletePref(db: RepoDb, address: PrefScopeAddress, key: string): boolean {
  const result = db
    .prepare('DELETE FROM prefs WHERE scope = ? AND scope_id = ? AND key = ?')
    .run(address.scope, address.scopeId, key)
  return Number(result.changes) > 0
}
