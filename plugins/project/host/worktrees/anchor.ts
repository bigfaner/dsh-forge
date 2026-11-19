// 归属解析链 anchor（plugin-project 1.13，code-design §3 + R3 RED 锚③落位）。
// 链：cwd → rev-parse --git-common-dir（fail-soft null）→ tasksHome 目录清单匹配
// （deriveDirName 同源键）→ 主行反查 → projectKey。
// GitProbe 三动词构造注入（revParse / listDirs / exists）——R3 测试以 fake probe 注入
// 构造不可读证据，禁真权限操作（Windows CI 造 ACL 拒读不稳定）。
// 四态 Resolution：
//   · attached    主行在册且实体在场 → projectKey 注入；
//   · degraded    目录命中但主行缺席 / 主行在册而实体缺席——恒零注入；
//   · unattached  非 git / 目录未注册——恒零注入，不误归组；
//   · unreadable  tasksHome 不可读证据——emitDiag warn 留痕（onDiag 注入缝），禁静默当空集
//     （静默空集会把「不可读」误判成「未注册」，R3 判据面）。
import { join } from 'node:path'
import { deriveDirName } from '@dsh-forge/lib-path'

/** git 盘面探针（构造注入缝——anchor 零 git/文件系统直触，测试以 fake probe 注入） */
export interface GitProbe {
  /** `git rev-parse --git-common-dir` + realpath 归一锚；null = 非 git / 探测失败 */
  revParse(cwd: string): Promise<string | null>
  /** tasksHome 下已注册任务库目录名清单（`{flatten}@{hash8}` 名制）；不可读 = 抛错（禁静默空集） */
  listDirs(tasksHome: string): Promise<readonly string[]>
  /** 路径在场性（盘上事实） */
  exists(path: string): Promise<boolean>
}

/** 归属解析四态 Resolution（attached 才携带注入面，其余恒零注入） */
export type WorktreeResolution =
  | { readonly kind: 'attached'; readonly projectKey: string; readonly projectRoot: string }
  | { readonly kind: 'degraded' }
  | { readonly kind: 'unattached' }
  | { readonly kind: 'unreadable' }

export interface AnchorDeps {
  readonly probe: GitProbe
  /** 任务库派生根（config tasksHome——注册闭包同源） */
  readonly tasksHome: string
  /** cwd → 任务库目录名（lib/path deriveDirName 同源键；null = 非注册路径形态） */
  dirNameOf(cwd: string): string | null
  /** 主行反查缝（projects 域行级 DAO 投影）：目录名 → 主行 projectKey；null = main 行缺席 */
  mainRowOf(dirName: string): Promise<string | null> | string | null
  /** 诊断 emit 缝（host emitDiag('worktree-anchor', warn)）；缺席 = 零 emit 不 console 兜底 */
  readonly onDiag?: (message: string) => void
}

/**
 * 归属解析链（identity-anchor 三探针唯一 git 触点面；非 git = unattached 不误归组）。
 * tasksHome 清单匹配键 = dirNameOf(cwd)（deriveDirName 单源派生，注册闭包同基准）。
 */
export async function resolveProjectKey(cwd: string, deps: AnchorDeps): Promise<WorktreeResolution> {
  const anchor = await deps.probe.revParse(cwd).catch(() => null)
  if (anchor === null) return { kind: 'unattached' } // 非 git = unattached，不误归组
  let dirs: readonly string[]
  try {
    dirs = await deps.probe.listDirs(deps.tasksHome)
  } catch (cause) {
    // R3：tasksHome 不可读证据 → warn 留痕不静默——静默空集会把不可读误判成未注册。
    deps.onDiag?.(
      `[project] tasksHome 不可读（归属解析降级 unreadable，不静默当空集）：${deps.tasksHome}：${String(cause)}`,
    )
    return { kind: 'unreadable' }
  }
  const dirName = deps.dirNameOf(cwd)
  if (dirName === null || !dirs.includes(dirName)) return { kind: 'unattached' } // 目录未注册
  const projectKey = await deps.mainRowOf(dirName)
  if (projectKey === null || projectKey === '') return { kind: 'degraded' } // 目录命中、main 行缺席
  const storeDir = join(deps.tasksHome, dirName)
  const present = await deps.probe.exists(storeDir).catch(() => false)
  if (!present) return { kind: 'degraded' } // 主行在册、实体缺席——降级零注入
  return { kind: 'attached', projectKey, projectRoot: cwd }
}

/** 默认 dirNameOf：deriveDirName 单源（注册闭包同基准——拼写敏感有意设计，见 lib/path） */
export const defaultDirNameOf = (cwd: string): string | null => deriveDirName(cwd)
