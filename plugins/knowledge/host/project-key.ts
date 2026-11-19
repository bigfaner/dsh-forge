// forge project key 派生单源（fix-11 B 方案·身份统一）：官方 workspaceRegistry 投影行
// id 与服务面解析链统一在 forge project key 域——lib-path deriveDirName 单源函数
//（plugins/project project-key.ts:84 同款先例），键基准 = canonical realpath
//（knowledge_registry ws_path 键同域，派生键与注册行解析可互逆回查）。
import { deriveDirName } from '@dsh-forge/lib-path'
import { canonicalWsPath } from './storage/registry.js'

/** wsPath → 稳定 forge project key（`{flatten}@{hash8}`——canonical 基准） */
export function projectKeyOf(wsPath: string): string {
  return deriveDirName(canonicalWsPath(wsPath))
}
