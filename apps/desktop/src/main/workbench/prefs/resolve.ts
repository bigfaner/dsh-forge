// workbench/prefs/resolve — 三级生效解析(任务 3.1;纯读,无写面)。
//
// 生效序(feature > project > global,PRD G5/DF008):沿 prefScopeChain 从
// 最特异级下探,首个显式行即生效值;三级皆未设置 → 注册表权威默认值
// (source='default',forgeconfig 默认;worktree.* 无默认 → source=null)。
//
// 消费面:①getPrefs 动词(生效值 + 来源 + 本级覆盖位,编辑面/AC 行同源);
// ②forge_pref_get tool(读生效值);③预合成三要素之「生效偏好」
// (3.4 dispatch,resolveEffectiveValues 面)。

import type { RepoDb } from '../repos/types.ts'
import { PREF_KEY_REGISTRY, type CoverageStrategy, type PrefKeyDefinition } from './registry.ts'
import {
  listPrefsRows,
  prefScopeAddressOf,
  prefScopeChain,
  readPrefValue,
  type PrefScope,
  type PrefScopeAddress,
  type PrefScopeKind,
} from './prefs-repo.ts'

/** 生效值来源层级(解析产物;null = 无任何级设置且无默认)。 */
export type PrefSource = PrefScopeKind | 'default' | null

/** getPrefs 行(Interface 1 PrefRow:键 + 类型元数据 + 生效值 + 来源 + 覆盖位)。 */
export interface ResolvedPrefRow {
  readonly key: string
  /** 键分组(auto/worktree/coverage/eval;UI 折叠区)。 */
  readonly group: PrefKeyDefinition['group']
  /** 值类型元数据(布尔/数值/文本/列表/覆盖策略;经 API 暴露,UI 不硬编码)。 */
  readonly type: PrefKeyDefinition['type']
  /** 控件提示(forge config 键定义的消费面)。 */
  readonly control: PrefKeyDefinition['control']
  /** 最终生效值(类型化;无值键 = null)。 */
  readonly value: unknown
  /** 生效值来源层级(feature/project/global/default;无值 = null)。 */
  readonly source: PrefSource
  /** 查询 scope 本级是否有显式覆盖行。 */
  readonly override: boolean
  /** 本级覆盖值(override=false → null)。 */
  readonly localValue: unknown
  /** 注册表权威默认值(三级皆未设置时的生效候选;无默认 → null)。 */
  readonly defaultValue: boolean | number | string | readonly string[] | CoverageStrategy | null
}

/**
 * 一个 scope 的全键解析(注册表暴露序;查询级 override/localValue 相对
 * 查询地址计算 —— 三级查询共用同一实现)。
 */
export function resolvePrefs(db: RepoDb, scope: PrefScope): readonly ResolvedPrefRow[] {
  const address = prefScopeAddressOf(db, scope)
  const chain = prefScopeChain(address)
  // 查询级显式行集(override/localValue 判据;一次读取替代逐键 probe)。
  const localRows = new Map(listPrefsRows(db, address).map(row => [row.key, row]))

  return PREF_KEY_REGISTRY.map((def) => {
    let value: unknown = undefined
    let source: PrefSource = null
    for (const level of chain) {
      const found = readPrefValue(db, level, def.key)
      if (found !== undefined) {
        value = found
        source = level.scope
        break
      }
    }
    if (value === undefined && def.defaultValue !== undefined) {
      value = def.defaultValue
      source = 'default'
    }
    const localRow = localRows.get(def.key)
    return {
      key: def.key,
      group: def.group,
      type: def.type,
      control: def.control,
      value: value ?? null,
      source,
      override: localRow !== undefined,
      localValue: localRow === undefined ? null : decodeJson(localRow.value_json),
      defaultValue: def.defaultValue ?? null,
    }
  })
}

/**
 * 生效值映射(键 → 最终生效值;预合成三要素「生效偏好」的消费面,3.4
 * dispatch 注入渲染;forge_pref_get 同源)。无值键不出现在产物中。
 */
export function resolveEffectiveValues(db: RepoDb, scope: PrefScope): Readonly<Record<string, unknown>> {
  const address: PrefScopeAddress = prefScopeAddressOf(db, scope)
  const chain = prefScopeChain(address)
  const effective: Record<string, unknown> = {}
  for (const def of PREF_KEY_REGISTRY) {
    for (const level of chain) {
      const found = readPrefValue(db, level, def.key)
      if (found !== undefined) {
        effective[def.key] = found
        break
      }
    }
    if (effective[def.key] === undefined && def.defaultValue !== undefined) {
      effective[def.key] = def.defaultValue
    }
  }
  return effective
}

function decodeJson(encoded: string): unknown {
  try {
    return JSON.parse(encoded) as unknown
  } catch {
    return null // 行存在但 JSON 损坏:override 位保留,显示值退 null(读取面不炸)
  }
}
