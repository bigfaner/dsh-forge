// workbench/prefs/prefs-service — 偏好动词服务(任务 3.1)。
//
// tech-design §Interface 1 偏好段的服务实现(getPrefs/setPrefs/
// clearPrefOverride;装配律与 task-service/knowledge-service 同型):
//   - getPrefs:注册表全键投影 = 生效值 + 来源层级 + 本级覆盖位 +
//     类型元数据(键集经 API 暴露,UI 不硬编码 —— ui-design §偏好编辑面);
//   - setPrefs:事务原子(校验全部前置,写入同一 SAVEPOINT 事务,失败
//     整体回滚零半写)+ 键集/类型校验(registry 权威面);
//   - clearPrefOverride:删本级覆盖行(幂等),生效值回落下一级;
//   - 写操作完成 → prefs_updated 事件(tech-design §Interface 1 事件扩展,
//     经装配注入的 onEvent 直发同一 sink/批推通道,迁移面同款)。
//
// 偏好为编排面动词(人 = 偏好修改,操作主体模型);prefs 表无 actor 列
// (schema 权威),零审计槽位 —— 与 task 写集的 updated_by 分立。

import type { RepoDb } from '../repos/types.ts'
import type { WorkbenchEvent } from '../indexer/diff.ts'
import type { PrefEntry, PrefRow, PrefScope } from '../ipc/types.ts'
import { normalizePrefValue, requireKnownPrefKey } from './registry.ts'
import {
  deletePref,
  prefScopeAddressOf,
  upsertPref,
  withPrefsTx,
  type PrefScopeAddress,
} from './prefs-repo.ts'
import { resolvePrefs } from './resolve.ts'

/** 服务依赖缝(db + 事件推送端;装配缺省丢弃,测试注入观测)。 */
export interface PrefsVerbDeps {
  readonly db: RepoDb
  /** 写操作完成的事件直发端(单事件批;迁移面 onEvent 同款)。 */
  readonly onEvent?: (event: WorkbenchEvent) => void
}

/** 本模块装配产物:三个偏好动词(并入 WorkbenchVerbServices)。 */
export interface PrefsVerbService {
  getPrefs(scope: PrefScope): PrefRow[]
  setPrefs(scope: PrefScope, entries: readonly PrefEntry[]): void
  clearPrefOverride(scope: PrefScope, key: string): void
}

function prefsUpdatedEvent(address: PrefScopeAddress): WorkbenchEvent {
  return { type: 'prefs_updated', scope: address.scope, scopeId: address.scopeId }
}

export function createPrefsVerbService(deps: PrefsVerbDeps): PrefsVerbService {
  const { db } = deps
  const emit = (address: PrefScopeAddress): void => deps.onEvent?.(prefsUpdatedEvent(address))

  return {
    getPrefs(scope: PrefScope): PrefRow[] {
      return resolvePrefs(db, scope) as unknown as PrefRow[]
    },

    setPrefs(scope: PrefScope, entries: readonly PrefEntry[]): void {
      const address = prefScopeAddressOf(db, scope)
      // 校验全部前置(键集 + 类型规范化),失败零写入;写入同一事务,
      // 中途失败整体回滚 —— 双保险的「无半写」(AC3)。
      const normalized = entries.map((entry) => {
        const def = requireKnownPrefKey(entry.key)
        return { key: entry.key, value: normalizePrefValue(def, entry.value) }
      })
      withPrefsTx(db, () => {
        if (normalized.length === 0) return
        const updatedAt = new Date().toISOString()
        for (const entry of normalized) {
          upsertPref(db, address, entry.key, JSON.stringify(entry.value), updatedAt)
        }
      })
      if (normalized.length > 0) emit(address)
    },

    clearPrefOverride(scope: PrefScope, key: string): void {
      const address = prefScopeAddressOf(db, scope)
      requireKnownPrefKey(key) // 键集外清除同 ERR_PREF_KEY_UNKNOWN(键集封闭双动词一致)
      let deleted = false
      withPrefsTx(db, () => {
        deleted = deletePref(db, address, key)
      })
      if (deleted) emit(address) // 幂等 no-op 不产事件(无变更即无信号)
    },
  }
}
