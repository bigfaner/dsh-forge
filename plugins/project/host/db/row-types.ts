// project.db 行类型（plugin-project 1.9）：repo 行级门进出边界——布尔列域侧 boolean、
// 库侧 0/1 INTEGER（映射收敛在 repositories 单点）；蛇列/驼列互斥不出本目录。
export interface ProjectRow {
  id: string
  projectKey: string
  title: string
  forgeDir: string
  forgeDirExternal: boolean
  worktreeDir: string
  sortOrder: number | null
  archived: boolean
  createdAt: string
  updatedAt: string
}

export type WorkspaceMemberRole = 'main' | 'worktree'

export interface WorkspaceRow {
  id: number | null
  projectId: string
  workspaceId: string
  wsPath: string
  memberRole: WorkspaceMemberRole
  boundAt: string
  createdAt: string
}

export type BugStatus = 'open' | 'fixed' | 'unresolved'

export interface BugRow {
  id: string
  projectKey: string
  summary: string
  bugDesc: string
  triggerDesc: string
  expected: string
  actual: string
  suspected: string | null
  errorType: string | null
  bugStatus: BugStatus
  commitHash: string | null
  worktree: string | null
  branch: string | null
  unresolvedReason: string | null
  fixApproach: string | null
  sourceTaskId: string | null
  recurrenceOf: string | null
  containerSlug: string | null
  reportSessionId: string | null
  fixSessionId: string | null
  fixer: string | null
  reporter: string
  createdAt: string
  updatedAt: string
}
