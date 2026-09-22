// workbench/registry/forge-detect — forge 检出判定(任务 2.4)。
//
// 检出语义 = 「该项目是 forge 工程」:codeRoot 下存在 `.forge/` 目录,或
// 文档位置(docs/features,仓外时位于 docLocationPath 之下)存在 forge
// 过程文档目录(tech-design §Error Types & Codes ERR_FORGE_NOT_DETECTED:
// 「.forge/ 与文档位置均无」)。纯 fs 只读探测,刻意不解析 forge CLI 可用
// 性 —— 那是发起链(Interface 2 resolveCli,任务 4.1)的职责;本判定在
// forge CLI 不在 PATH 时照常工作(AC1),且 Hard Rule:注册校验零 forge
// CLI 调用(无 spawn、无写操作)。

import { statSync } from 'node:fs'
import { join } from 'node:path'

/** 探测点(错误信息指明缺失项用:实际 fs 路径)。 */
export interface ForgeCheckoutProbes {
  /** `<codeRoot>/.forge` */
  readonly forgeDir: string
  /** `<docBase>/docs/features`(仓外时 docBase = docLocationPath) */
  readonly docsFeatures: string
}

/** 检出结果:detected = 任一指标命中。 */
export interface ForgeCheckoutDetection {
  readonly detected: boolean
  readonly probes: ForgeCheckoutProbes
  /** 各探测点是否存在且为目录。 */
  readonly indicators: { readonly forgeDir: boolean; readonly docsFeatures: boolean }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * 判定 codeRoot 是否为 forge 检出。仓内文档位置(docLocationPath = null)
 * 时 docs/features 探测点落在 codeRoot 自身之下;仓外时落在显式路径之下。
 */
export function detectForgeCheckout(input: {
  codeRoot: string
  docLocationPath: string | null
}): ForgeCheckoutDetection {
  const docBase = input.docLocationPath ?? input.codeRoot
  const probes: ForgeCheckoutProbes = {
    forgeDir: join(input.codeRoot, '.forge'),
    docsFeatures: join(docBase, 'docs', 'features'),
  }
  const indicators = {
    forgeDir: isDirectory(probes.forgeDir),
    docsFeatures: isDirectory(probes.docsFeatures),
  }
  return { detected: indicators.forgeDir || indicators.docsFeatures, probes, indicators }
}
