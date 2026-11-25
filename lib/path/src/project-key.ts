// @dsh-forge/lib-path · project-key —— projectKey 派生与主检出归拢单源（forge-dirs-unification
// §2.6：目录名、任务行归属键、spec/bug 归属键收敛为同一字符串）。
//   · projectKeyOf(path)：任意工作区路径 → projectKey（= deriveDirName 原文口径）；空/空白
//     路径抛 ProjectKeyDerivationError（ERR_PROJECT_KEY_DERIVATION）。
//   · resolveProjectKey(cwd, deps)：会话所属项目主检出归拢——先查注入的项目注册表查询函数
//     取该项目主工作区行；查不到时以 lib/path 已有 resolveMainCheckoutRoot git 现查归拢；
//     git 也失败 = fail-soft 回退 cwd 键 + fallbackReason（调用方经诊断面留痕，AGENTS §7）。
//     取得的路径先规范化（realpath 真实路径与大小写——projectKey 大小写敏感，不规范化会让
//     同一项目分裂两个键）再算 projectKey。
// 键拼写语义承袭 derive-dir：normalizeDirSpelling 归一（分隔符/尾分隔符不敏感，大小写敏感）。
import { realpathSync } from 'node:fs'
import { deriveDirName } from './derive-dir.js'
import { resolveMainCheckoutRoot, type GitPorcelainRunner } from './project-root.js'

/** projectKey 派生失败（空/空白路径——无归属可派生，fail-loud）。 */
export class ProjectKeyDerivationError extends Error {
  constructor() {
    super('project_key derivation failed: empty path (ERR_PROJECT_KEY_DERIVATION)')
    this.name = 'ProjectKeyDerivationError'
  }
}

/** 任意工作区路径 → projectKey（= deriveDirName；空/空白路径显式拒绝）。 */
export function projectKeyOf(path: string): string {
  if (typeof path !== 'string' || path.trim() === '') throw new ProjectKeyDerivationError()
  return deriveDirName(path)
}

/** 默认规范化：realpath 收敛真实路径与大小写（junction/subst/8.3 同径）；不可达 fail-soft 原样返回 */
function canonicalizePath(p: string): string {
  try {
    return realpathSync.native(p)
  } catch {
    return p
  }
}

/** resolveProjectKey 注入缝 */
export interface ProjectKeyDeps {
  /**
   * 项目注册表查询函数：cwd → 该项目主工作区行路径（主检出根）；查不到返回 undefined。
   * 命中即采信，零 git 调用。
   */
  readonly registryQuery: (cwd: string) => string | undefined
  /** git porcelain 探针缝（注册表缺席时的现查归拢径；缺省 = 生产探针） */
  readonly gitRunner?: GitPorcelainRunner
  /** 路径规范化缝（缺省 = realpath native + 不可达 fail-soft 原样返回） */
  readonly canonicalize?: (path: string) => string
}

/** 主检出归拢结果（rolledUp = 注册表命中或 git 现查归拢成功；fallbackReason = 回退原因） */
export interface ProjectKeyResolution {
  readonly projectKey: string
  /** 项目主检出路径（规范化后；rolledUp = true 时在场） */
  readonly mainCheckoutPath?: string
  readonly rolledUp: boolean
  /** 回退原因（rolledUp = false 时在场——注册表与 git 双失败的 fail-soft 诊断面） */
  readonly fallbackReason?: string
}

/**
 * 会话所属项目主检出归拢（§2.6 取法单源）：① 注册表命中 → 主工作区行路径；② 缺席 →
 * resolveMainCheckoutRoot git 现查归拢（主检出 = porcelain 首条目）；③ git fail-soft →
 * 回退 cwd 键 + fallbackReason。主检出路径先规范化（真实路径与大小写）再算 projectKey。
 */
export function resolveProjectKey(cwd: string, deps: ProjectKeyDeps): ProjectKeyResolution {
  const canonicalize = deps.canonicalize ?? canonicalizePath
  const registryHit = deps.registryQuery(cwd)
  if (registryHit !== undefined) {
    const main = canonicalize(registryHit)
    return { projectKey: projectKeyOf(main), mainCheckoutPath: main, rolledUp: true }
  }
  const probe = resolveMainCheckoutRoot(cwd, deps.gitRunner)
  if (probe.root === undefined) {
    return { projectKey: projectKeyOf(cwd), rolledUp: false, fallbackReason: probe.reason }
  }
  const main = canonicalize(probe.root)
  return { projectKey: projectKeyOf(main), mainCheckoutPath: main, rolledUp: true }
}
