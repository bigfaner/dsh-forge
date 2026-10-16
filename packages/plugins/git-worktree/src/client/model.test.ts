// client/model 单测 —— 视图模型纯函数面：来源标记推断 / worktree 名派生 /
// ahead-behind 徽标拆分 / 删除拦截判定 / ahead-behind 懒加载待拉清单。
import { describe, expect, it } from 'vitest'
import {
  aheadBehindSegments,
  collectSlugCandidates,
  createConflicts,
  deleteBlockers,
  deriveWorktreeName,
  filterSlugCandidates,
  inferSource,
  isDeleteBlocked,
  pendingAheadBehindPaths,
  type SlugCandidate,
  type WorktreeRow,
} from './model.js'

const row = (over: Partial<WorktreeRow> & Pick<WorktreeRow, 'path'>): WorktreeRow => ({
  branch: 'feat/a',
  worktreeName: 'wt-a',
  isMain: false,
  present: true,
  ...over,
})

describe('inferSource（来源标记：所配目录内 = DSH，自定义路径无标记）', () => {
  const dir = 'Z:/proj/.forge/worktrees'
  it('所配 worktree 目录内的路径 → dsh', () => {
    expect(inferSource('Z:/proj/.forge/worktrees/wt-a', dir)).toBe('dsh')
  })
  it('Windows 反斜杠与尾斜杠、大小写差异归一命中', () => {
    expect(inferSource('Z:\\proj\\.forge\\worktrees\\wt-a', 'z:/PROJ/.forge/worktrees/')).toBe('dsh')
  })
  it('自定义路径（目录外）→ null；目录本身（非子路径）→ null；未配置目录 → null', () => {
    expect(inferSource('D:/scratch/ui-lab', dir)).toBeNull()
    expect(inferSource('Z:/proj/.forge/worktrees', dir)).toBeNull()
    expect(inferSource('Z:/proj/.forge/worktrees/wt-a', undefined)).toBeNull()
  })
})

describe('deriveWorktreeName（worktree 名派生：feat/ 前缀映射 wt-）', () => {
  it('feat/remote-approval → wt-remote-approval；单段分支亦派生', () => {
    expect(deriveWorktreeName('feat/remote-approval')).toBe('wt-remote-approval')
    expect(deriveWorktreeName('main')).toBe('wt-main')
  })
  it('多段分支取尾段；空白 → 空串（不产 wt- 孤儿）', () => {
    expect(deriveWorktreeName('experiment/ui/lab')).toBe('wt-lab')
    expect(deriveWorktreeName('  ')).toBe('')
  })
})

describe('aheadBehindSegments（徽标拆分：零值段省略）', () => {
  it('↑2 ↓1 双段；仅 behind；零零 = 双空（无 upstream 同形）', () => {
    expect(aheadBehindSegments({ ahead: 2, behind: 1 })).toEqual({ ahead: '↑2', behind: '↓1' })
    expect(aheadBehindSegments({ ahead: 0, behind: 4 })).toEqual({ ahead: null, behind: '↓4' })
    expect(aheadBehindSegments({ ahead: 0, behind: 0 })).toEqual({ ahead: null, behind: null })
  })
})

describe('删除拦截判定（未提交变更/挂靠会话命中即拦；仅未 push 放行）', () => {
  it('双清 = 无拦截、可确认', () => {
    const checks = { dirtyCount: 0, aheadCount: 0, attachedSessions: 0 }
    expect(deleteBlockers(checks)).toEqual([])
    expect(isDeleteBlocked(checks)).toBe(false)
  })
  it('仅未 push 提交 = 警示展示但放行（本地 ref git 原生保留）', () => {
    const checks = { dirtyCount: 0, aheadCount: 2, attachedSessions: 0 }
    expect(deleteBlockers(checks)).toEqual([])
    expect(isDeleteBlocked(checks)).toBe(false)
  })
  it('未提交变更 / 挂靠会话各自命中即拦截；同命中去重', () => {
    expect(isDeleteBlocked({ dirtyCount: 1, aheadCount: 0, attachedSessions: 0 })).toBe(true)
    expect(isDeleteBlocked({ dirtyCount: 0, aheadCount: 0, attachedSessions: 1 })).toBe(true)
    expect(isDeleteBlocked({ dirtyCount: 3, aheadCount: 2, attachedSessions: 4 })).toBe(true)
  })
})

describe('pendingAheadBehindPaths（懒加载待拉清单：展开才拉、缓存免重拉）', () => {
  const rows: WorktreeRow[] = [
    row({ path: 'Z:/proj', branch: 'main', isMain: true }),
    row({ path: 'Z:/proj/.forge/worktrees/wt-a', branch: 'feat/a' }),
    row({ path: 'Z:/proj/.forge/worktrees/wt-old', branch: 'spike/old', present: false }),
    row({ path: 'Z:/proj/.forge/worktrees/wt-detached', branch: null }),
  ]
  it('收起态恒空清单（收起不触发任何拉取）', () => {
    expect(pendingAheadBehindPaths(false, rows, new Map())).toEqual([])
  })
  it('展开：在场且有分支、未缓存者入选；失配行与 detached 行不拉', () => {
    expect(pendingAheadBehindPaths(true, rows, new Map())).toEqual([
      'Z:/proj',
      'Z:/proj/.forge/worktrees/wt-a',
    ])
  })
  it('缓存命中不重拉（懒加载 + 缓存纪律）', () => {
    const cache = new Map([['Z:/proj', { ahead: 0, behind: 0 }]])
    expect(pendingAheadBehindPaths(true, rows, cache)).toEqual(['Z:/proj/.forge/worktrees/wt-a'])
  })
})

describe('collectSlugCandidates（slug 候选：去重 + 未完成排前）', () => {
  it('提案与 feature slug 合并；同 slug 去重（任一未完成即未完成）；未完成排前、组内保持输入序', () => {
    const proposals: SlugCandidate[] = [
      { slug: 'done-proposal', done: true },
      { slug: 'open-proposal', done: false },
      { slug: 'shared', done: true },
    ]
    const features: SlugCandidate[] = [
      { slug: 'open-feature', done: false },
      { slug: 'done-feature', done: true },
      { slug: 'shared', done: false },
    ]
    expect(collectSlugCandidates(proposals, features)).toEqual([
      { slug: 'open-feature', done: false },
      { slug: 'shared', done: false },
      { slug: 'open-proposal', done: false },
      { slug: 'done-feature', done: true },
      { slug: 'done-proposal', done: true },
    ])
  })
  it('空输入 = 空候选', () => {
    expect(collectSlugCandidates([], [])).toEqual([])
  })
})

describe('filterSlugCandidates（输入过滤：大小写不敏感子串匹配；空输入 = 全量）', () => {
  const cands: SlugCandidate[] = [
    { slug: 'worktree-branch-management', done: false },
    { slug: 'mobile-remote-approval', done: true },
  ]
  it('子串命中（大小写不敏感）', () => {
    expect(filterSlugCandidates(cands, 'WORKTREE')).toEqual([{ slug: 'worktree-branch-management', done: false }])
    expect(filterSlugCandidates(cands, 'remote')).toEqual([{ slug: 'mobile-remote-approval', done: true }])
  })
  it('空查询 = 全量；无命中 = 空', () => {
    expect(filterSlugCandidates(cands, '  ')).toEqual(cands)
    expect(filterSlugCandidates(cands, 'zzz')).toEqual([])
  })
})

describe('createConflicts（同名冲突判定：分支 vs branches、worktree vs 既有名——进 git 前拦截）', () => {
  it('分支同名命中 branch-exists；worktree 名同名命中 worktree-exists；双中皆报', () => {
    expect(createConflicts('feat/a', 'wt-new', ['main', 'feat/a'], ['wt-b'])).toEqual(['branch-exists'])
    expect(createConflicts('feat/c', 'wt-a', ['main'], ['wt-a', 'wt-b'])).toEqual(['worktree-exists'])
    expect(createConflicts('feat/a', 'wt-a', ['feat/a'], ['wt-a'])).toEqual(['branch-exists', 'worktree-exists'])
  })
  it('无冲突 = 空；空白归一（trim + 大小写不敏感——Windows 路径保守口径）', () => {
    expect(createConflicts('feat/new', 'wt-new', ['main'], ['wt-a'])).toEqual([])
    expect(createConflicts('  feat/a ', ' WT-B ', ['main', 'feat/a'], ['wt-b'])).toEqual(['branch-exists', 'worktree-exists'])
  })
  it('空输入（未填）不判冲突', () => {
    expect(createConflicts('', '', ['main'], ['wt-a'])).toEqual([])
  })
})
