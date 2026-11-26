// @dsh-forge/lib-path · project-key —— projectKey 派生与主检出归拢单源（forge-dirs-unification
// §2.6：目录名、任务行归属键、spec/bug 归属键收敛为同一字符串）。
//   · projectKeyOf(path)：任意工作区路径 → projectKey（= deriveDirName 原文口径）；空/空白
//     路径抛 ProjectKeyDerivationError（ERR_PROJECT_KEY_DERIVATION）。
//   · resolveProjectKey(cwd, deps)：会话所属项目主检出归拢——先查注入的项目注册表查询函数
//     取该项目主工作区行；查不到 → 标记预检（cwd 不落 .forge/worktrees 段 = 零 git 调用，
//     原样 cwd 键）→ resolveMainCheckoutRoot git 现查归拢 → 清单不含 cwd（非本仓 worktree）
//     回退 cwd 键。归拢成功的主根先改写为 cwd 同分隔符拼写，再做规范化（真实路径与大小写——
//     projectKey 大小写敏感）后算 projectKey。回退原因由调用方经诊断面留痕（AGENTS §7）。
// 键拼写语义承袭 derive-dir：normalizeDirSpelling 归一（分隔符/尾分隔符不敏感，大小写敏感）。
import { realpathSync } from 'node:fs'
import { deriveDirName } from './derive-dir.js'
import { isInWorktreeTree, matchPathSpelling, resolveMainCheckoutRoot, type GitPorcelainRunner } from './project-root.js'

/** projectKey 派生失败（空/空白路径——无归属可派生，fail-loud；typed 码 ERR_PROJECT_KEY_DERIVATION）。 */
export class ProjectKeyDerivationError extends Error {
  readonly code = 'ERR_PROJECT_KEY_DERIVATION'
  constructor() {
    super('project_key derivation failed: empty cwd (ERR_PROJECT_KEY_DERIVATION)')
    this.name = 'ProjectKeyDerivationError'
  }
}

/** 任意工作区路径 → projectKey（= deriveDirName；空/空白路径显式拒绝）。 */
export function projectKeyOf(path: string): string {
  if (typeof path !== 'string' || path.trim() === '') throw new ProjectKeyDerivationError()
  return deriveDirName(path)
}

/** worktree 检出形态触发标记（归拢的廉价预检——命中才现查 git） */
export const MARKER_PATTERN = /[\\/]\.forge[\\/]worktrees[\\/]/

/** 非本仓回退原因（git 清单不含 cwd） */
const NON_MEMBER_FALLBACK_REASON = 'porcelain 清单不含 cwd（非本仓 worktree）——回退 cwd 键'

/** 默认规范化：realpath 收敛真实路径与大小写（junction/subst/8.3 同径）；不可达原样返回 */
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
  /** 路径规范化缝（缺省 = realpath native + 不可达原样返回） */
  readonly canonicalize?: (path: string) => string
}

/** 主检出归拢结果（rolledUp = 注册表命中或 git 现查归拢成功；fallbackReason = 回退原因） */
export interface ProjectKeyResolution {
  readonly key: string
  /** git 现查推导出的主检出根（rolledUp = true 时在场） */
  readonly mainRoot?: string
  readonly rolledUp: boolean
  /** 回退原因（标记不命中时缺席；git 失败 / 非本仓回退时在场） */
  readonly fallbackReason?: string
}

/**
 * 会话所属项目主检出归拢：① 注册表命中 → 主工作区行路径（规范化后派生键）；② 标记不命中 → 零 git 调用原样
 * cwd 键；③ git 现查，cwd 归属清单任一条目子树 → 主根 = 首条目（git 主行恒先列）；④ git
 * 失败 / 清单不含 cwd → 回退 cwd 键 + fallbackReason。空 cwd 派生拒绝由 projectKeyOf 上抛。
 */
export function resolveProjectKey(cwd: string, deps: ProjectKeyDeps): ProjectKeyResolution {
  const canonicalize = deps.canonicalize ?? canonicalizePath
  const registryHit = deps.registryQuery(cwd)
  if (registryHit !== undefined) {
    const main = canonicalize(registryHit)
    return { key: projectKeyOf(main), mainRoot: main, rolledUp: true }
  }
  if (!MARKER_PATTERN.test(cwd)) {
    return { key: projectKeyOf(cwd), rolledUp: false }
  }
  const probe = resolveMainCheckoutRoot(cwd, deps.gitRunner)
  if (probe.entries === undefined) {
    return { key: projectKeyOf(cwd), rolledUp: false, fallbackReason: probe.reason }
  }
  if (!isInWorktreeTree(probe.entries, cwd)) {
    return { key: projectKeyOf(cwd), rolledUp: false, fallbackReason: NON_MEMBER_FALLBACK_REASON }
  }
  const main = canonicalize(matchPathSpelling(cwd, probe.entries[0]!.path))
  return { key: projectKeyOf(main), mainRoot: main, rolledUp: true }
}
