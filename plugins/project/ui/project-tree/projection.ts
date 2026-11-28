// 项目树数据层——projects→worktrees 层级投影（1.8 D 类产品化新增·矩阵行 13/28/29 同批）。
// 定位：纯函数投影面（定位：业务数据层——非 UI 非传输）：forge:projects/list 项目行 +
// forge:worktree/list 清单 → 项目 → worktree 两级层级投影（列表序保持——forge:projects/list
// 全序即侧栏/选择器呈现序，主树行 host 侧天然在首）。数据通路 = ui/rpc.ts Typert 正典
// 缝（forgeProjects/forgeWorktree 两族 remote namespace，插件自供五缝——不依赖
// @dsh-forge/core，消费点经 ForgeRpcClient 现查）。客户端零仲裁：归属判据只取
// WorktreeListRequest.projectRoot = ProjectSummary.wsPath（host 身份归并单点），
// 本层零路径拼接零归属改写。
// fail-soft 口径：单项目 worktree.list 失败 = 该项目 worktrees 空列（行保留——项目行
// 不因单侧数据链断裂消失），错误摘要挂 node.error 供上层 diag/空态呈现；projects.list
// 失败归调用面 phase（use-project-tree）。
import type { ProjectSummary } from '@dsh-forge/lib-api/dto/project'
import type { WorktreeEntryDto, WorktreeListResult } from '@dsh-forge/lib-api/dto/worktree'

/** 层级投影行：项目行 + 其 worktree 清单（列表序 = projects 入参序） */
export interface ProjectWorktreeNode {
  readonly project: ProjectSummary
  /** 该项目 worktree 清单（list 失败 = 空列 fail-soft——项目行保留） */
  readonly worktrees: readonly WorktreeEntryDto[]
  /** 单项目清单失败摘要（成功 = undefined——上层 diag/空态呈现消费） */
  readonly error?: string
}

/** 逐项目清单供给面（Typert worktree.list 切片——键 = projectRoot（wsPath）） */
export type WorktreeListByProject = ReadonlyMap<string, WorktreeListResult>

/**
 * projects→worktrees 层级投影（纯函数）：archived 项目行剔除；清单缺失（Map 无键 /
 * 单项目失败）= worktrees 空列 fail-soft。零排序零改写——呈现序 = 调用方入参序。
 */
export function projectWorktreeTreeOf(
  projects: readonly ProjectSummary[],
  worktreesByProject: WorktreeListByProject,
): readonly ProjectWorktreeNode[] {
  const tree: ProjectWorktreeNode[] = []
  for (const project of projects) {
    if (project.archived) continue
    const result = worktreesByProject.get(project.wsPath)
    if (result === undefined) {
      tree.push({ project, worktrees: [], error: `worktree list unavailable (projectRoot=${project.wsPath})` })
      continue
    }
    tree.push({ project, worktrees: result.entries })
  }
  return tree
}
