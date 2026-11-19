// host/dirs · DirFactsPort provider 族（plugin-project 1.12——proposal seam 表
// `forge.dirFacts` + code-design §6「服务装配层重订：一 service 多 provider」）：
//   · 常驻 provider createDirFactsPort(deps)——锚解析缝 + 合并注册表（forge 本体五键 +
//     declare merge 第三方键）全量目录事实；
//   · 兜底 provider minimalDirFactsPort(deps)——仅内置 dirKeys（DIR_KEY_REGISTRY，
//     零第三方 merge）：独立模式/注入缺席时的最小查询面。
// 消费面统一 ctx.inject/reflected seam 契约（lib/api ports DirFactsPort——type-only
// 单源），不 import 具体类；本模块只做契约实现与结构适配，零 cordis 依赖。
import type { DirAnchorFact, DirAuditDiff, DirFactsPort } from '@dsh-forge/lib-api'
import {
  DIR_KEY_REGISTRY,
  DIR_DESTINATIONS,
  resolveDestination,
  type DirKeyEntry,
  type ForgePathsResolveContext,
} from './anchors.js'
import { auditDirTree } from './audit.js'
import { renderDocStyleSection } from './doc-style.js'

/** 锚解析缝（projectId → 锚四键运行时事实——装配方注入；plugin-forge faces.createForgePathsAnchors 同形） */
export interface DirFactsAnchorsFace {
  anchorsOf(projectId: string): Promise<Pick<ForgePathsResolveContext, 'projectHome' | 'taskHome' | 'forgeDir' | 'docsRoot'>>
}

/** DirFactsPort provider 装配依赖（锚解析缝 + 键源——常驻给合并注册表，兜底给内置键集） */
export interface DirFactsProviderDeps {
  /** projectId → 锚四键（运行时事实解析缝——缺席查询 = fail-loud，同 forgeDirs 工具口径） */
  readonly anchorsOf: (projectId: string) => Promise<Pick<ForgePathsResolveContext, 'projectHome' | 'taskHome' | 'forgeDir' | 'docsRoot'>>
  /** 现读键清单（合并注册表或内置键集——provider 差异面唯一在此） */
  readonly dirKeys: () => readonly DirKeyEntry[]
}

/** provider 共用实现（键源注入——常驻/兜底仅 dirKeys 源不同，行为逐项同构） */
function createDirFactsProvider(deps: DirFactsProviderDeps): DirFactsPort {
  return {
    async listAnchors(projectId: string, dirKey?: string): Promise<readonly DirAnchorFact[]> {
      const entries = deps.dirKeys()
      const anchors = await deps.anchorsOf(projectId)
      if (dirKey !== undefined) {
        const entry = entries.find((e) => e.dirKey === dirKey)
        if (entry === undefined) {
          throw new Error(`unknown dirKey '${dirKey}' — legal keys: ${entries.map((e) => e.dirKey).join(', ')}`)
        }
        return [{ dirKey: entry.dirKey, dir: entry.resolve(anchors), description: entry.description }]
      }
      return entries.map((e) => ({ dirKey: e.dirKey, dir: e.resolve(anchors), description: e.description }))
    },
    async resolveDestination(projectId, dest, params) {
      const entry = DIR_DESTINATIONS.find((d) => d.dest === dest)
      if (entry === undefined) {
        throw new Error(`unknown dest '${dest}' — legal destinations: ${DIR_DESTINATIONS.map((d) => d.dest).join(', ')}`)
      }
      return resolveDestination(entry, await deps.anchorsOf(projectId), params)
    },
    audit(root: string): DirAuditDiff {
      return auditDirTree(root)
    },
    docStyleSection(): string {
      return renderDocStyleSection()
    },
  }
}

/**
 * 常驻 provider（全量目录事实）：键源 = 合并注册表（装配方注入 dirKeyRegistry.entries +
 * 反向拉取第三方声明——与 forgeDirs 查询工具同源同键）。
 */
export function createDirFactsPort(deps: DirFactsProviderDeps): DirFactsPort {
  return createDirFactsProvider(deps)
}

/**
 * 最小兜底 provider（仅内置 dirKeys）：键源 = DIR_KEY_REGISTRY 本体五键，零第三方 merge
 * ——独立模式/注入缺席时退此实现（seam 表「兜底 = 仅内置 dirKeys 的最小 provider」）。
 */
export function minimalDirFactsPort(deps: Omit<DirFactsProviderDeps, 'dirKeys'>): DirFactsPort {
  return createDirFactsProvider({ ...deps, dirKeys: () => DIR_KEY_REGISTRY })
}
