// host/dirs · DirFactsPort provider 族（plugin-project 1.12——proposal seam 表
// `forge.dirFacts` + code-design §6「服务装配层重订：一 service 多 provider」）：
//   · 常驻 provider createDirFactsPort(deps)——三运行时事实解析缝 + 声明集（基座键 + project
//     条目 + dirKeys.* 拉取声明）全量目录事实；
//   · 兜底 provider minimalDirFactsPort(deps)——内置声明 + 同一声明拉取（reflectOf 注入，
//     缺席 = 仅内置）：独立模式/注入缺席时的最小查询面。
// 输出完全由注册表条目派生（resolveForgeDirs——lib/path 单源）：listAnchors = 声明集逐键
// resolve + description；resolveDestination = 带参条目（dest 即键名）派生枚举与参数校验。
// 本模块只做契约实现与结构适配，零 cordis 依赖。
import type { DirAnchorFact, DirAuditDiff, DirFactsPort } from '@dsh-forge/lib-api'
import {
  FORGE_DIRS_BASE_DECLARATION,
  collectDeclaredDirKeys,
  declaredEntryOf,
  declaredDirKeys,
  mergeDeclarations,
  resolveDeclaredDirs,
  workspacePartitionsOf,
  type DirKeysPullDiagFace,
  type ReflectDeclarePullFace,
} from './anchors.js'
import { auditDirTree } from './audit.js'
import { renderDocStyleSection } from './doc-style.js'
import type { ForgeDirDeclaration, ForgeDirSources } from '@dsh-forge/lib-path'

/** DirFactsPort provider 装配依赖（三事实解析缝 + 声明集源——常驻/兜底仅声明源不同） */
export interface DirFactsProviderDeps {
  /** projectId → 三运行时事实（缺席查询 = fail-loud，同 forgeDirs 工具口径） */
  readonly sourcesOf: (projectId: string) => Promise<ForgeDirSources>
  /** 现读声明集（每次调用现拉合并——检测永不缓存，AGENTS 1.6） */
  readonly declarations: () => readonly ForgeDirDeclaration[]
  /** 降级诊断发射缝（声明拉取/分区解析降级 warn——缺席零发射） */
  readonly onDiag?: DirKeysPullDiagFace
}

/** provider 共用实现（声明源注入——行为逐项同构） */
function createDirFactsProvider(deps: DirFactsProviderDeps): DirFactsPort {
  return {
    async listAnchors(projectId: string, dirKey?: string): Promise<readonly DirAnchorFact[]> {
      const declarations = deps.declarations()
      // 输出 = 无参条目（带参条目参数缺席被解析器跳过——forge_dirs 同口径）
      const resolved = resolveDeclaredDirs(declarations, await deps.sourcesOf(projectId))
      const keys = declaredDirKeys(declarations).filter((key) => key in resolved)
      if (dirKey !== undefined) {
        const entry = declaredEntryOf(declarations, dirKey)
        if (entry === undefined) {
          throw new Error(`unknown dirKey '${dirKey}' — legal keys: ${declaredDirKeys(declarations).join(', ')}`)
        }
        return [{ dirKey, dir: resolved[dirKey]!, description: entry.description }]
      }
      return keys.map((key) => ({ dirKey: key, dir: resolved[key]!, description: declaredEntryOf(declarations, key)!.description }))
    },
    async resolveDestination(projectId, dest, params) {
      const declarations = deps.declarations()
      const paramed = declaredDirKeys(declarations).filter((key) => (declaredEntryOf(declarations, key)!.params?.length ?? 0) > 0)
      const entry = declaredEntryOf(declarations, dest)
      if (entry === undefined || paramed.indexOf(dest) === -1) {
        throw new Error(
          `unknown dest '${dest}' — legal destinations: ${paramed
            .map((key) => `${key} (requires: ${declaredEntryOf(declarations, key)!.params!.join(', ')})`)
            .join('; ')}`,
        )
      }
      const resolved = resolveDeclaredDirs(declarations, await deps.sourcesOf(projectId), params)
      return resolved[dest]!
    },
    audit(root: string): DirAuditDiff {
      // 分区 = 同一声明集按 root 为 workspaceRoot 键表派生（与 init/forge_dirs 同源）
      return auditDirTree(root, workspacePartitionsOf(root, deps.declarations(), deps.onDiag))
    },
    docStyleSection(): string {
      return renderDocStyleSection()
    },
  }
}

/**
 * 常驻 provider（全量目录事实）：声明集 = 装配方注入（与 forgeDirs 查询工具同源同键）。
 */
export function createDirFactsPort(deps: DirFactsProviderDeps): DirFactsPort {
  return createDirFactsProvider(deps)
}

/**
 * 最小兜底 provider：声明 = 内置声明（基座 + project）+ dirKeys.* 反向拉取（reflectOf 缺席 = 仅内置）——
 * 独立模式/注入缺席时退此实现（seam 表「兜底 = 最小 provider」）。
 */
export function minimalDirFactsPort(deps: {
  readonly sourcesOf: (projectId: string) => Promise<ForgeDirSources>
  /** reflect 现查取法（缺席 = 声明拉取缝零贡献） */
  readonly reflectOf?: () => ReflectDeclarePullFace | undefined
  /** 声明拉取降级诊断发射缝（缺席 = 零发射） */
  readonly onDeclareDiag?: DirKeysPullDiagFace
}): DirFactsPort {
  return createDirFactsProvider({
    sourcesOf: deps.sourcesOf,
    declarations: () => mergeDeclarations(collectDeclaredDirKeys(deps.reflectOf?.(), deps.onDeclareDiag)),
    onDiag: deps.onDeclareDiag,
  })
}

/** 基座声明再导出（本域消费单入口） */
export { FORGE_DIRS_BASE_DECLARATION }
