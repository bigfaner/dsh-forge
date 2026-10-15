// @dsh-forge/git-worktree client —— 会话头 actions 槽只读一体 chip（原型第二卡）：
// feat/a · wt-api 一体形态 + ahead/behind 次级小字（低频刷新，懒加载由装配层给值）；
// 无切换入口（纯展示 span，非 button）；封存态 = 失效变体（警示色 + 删除线 +
// tooltip「worktree 已被删除」）；非 git 项目零注入。
import type { ReactNode } from 'react'
import { aheadBehindSegments } from './model.js'
import type { AheadBehind } from '../worktree-ops.js'

const mono = { fontFamily: 'var(--ds-font-family-code, monospace)' } satisfies React.CSSProperties

export interface SessionWorktreeChipProps {
  /** 能力位（身份归并层产出）——非 git = 零注入 */
  readonly isGit: boolean
  readonly branch: string
  readonly worktreeName: string
  /** ahead/behind（懒加载/缓存值；缺省 = 不展示次级小字） */
  readonly aheadBehind?: AheadBehind | undefined
  /** 封存态（挂靠 worktree 已被删——chip 转失效态） */
  readonly sealed?: boolean | undefined
}

/**
 * 会话头只读一体 chip（注入 `conversation.session.header.actions` 槽——官方动作带，
 * 产品占用先例 = 派发任务 pill）。data 锚：data-dswt-session-chip。
 */
export function SessionWorktreeChip({
  isGit,
  branch,
  worktreeName,
  aheadBehind,
  sealed = false,
}: SessionWorktreeChipProps): ReactNode {
  if (!isGit) return null // 非 git 项目：会话头 actions 槽零注入
  const segments = aheadBehind !== undefined && !sealed ? aheadBehindSegments(aheadBehind) : null
  const errorColor = 'var(--dsw-alias-state-error-primary)'
  return (
    <span
      data-dswt-session-chip={sealed ? 'sealed' : 'live'}
      title={sealed ? 'worktree 已被删除' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 24,
        padding: '0 10px',
        borderRadius: 999,
        border: `0.5px solid ${sealed ? errorColor : 'var(--dsw-alias-border-l2)'}`,
        fontSize: 12,
        color: sealed ? errorColor : 'var(--dsw-alias-label-secondary)',
        background: 'var(--dsw-alias-bg-layer-1)',
        textDecoration: sealed ? 'line-through' : undefined,
        cursor: sealed ? 'help' : 'default',
      }}
    >
      <span style={{ ...mono, color: sealed ? errorColor : 'var(--dsw-alias-label-primary)' }}>{branch}</span>
      <span aria-hidden="true" style={{ color: 'var(--dsw-alias-label-caption)' }}>
        ·
      </span>
      <span style={{ ...mono, color: sealed ? errorColor : 'var(--dsw-alias-label-primary)' }}>{worktreeName}</span>
      {segments !== null && (segments.ahead !== null || segments.behind !== null) && (
        <span data-dswt-chip-ab="" style={{ fontSize: 11, color: 'var(--dsw-alias-label-caption)' }}>
          {[segments.ahead, segments.behind].filter(Boolean).join(' ')}
        </span>
      )}
    </span>
  )
}
