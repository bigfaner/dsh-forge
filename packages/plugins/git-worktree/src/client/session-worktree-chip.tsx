// @dsh-forge/git-worktree client —— 会话头 actions 槽只读一体 chip（原型第二卡）：
// 样式对齐官方 AgentPresetLabel（模式标签）一体形态——radius-xs pill + fill-tsp-secondary
// 底 + 14px 分支图标（opacity .7）+ 12px 文本。点击展示完整信息卡（分支/worktree 名/
// 完整路径/项目根/ahead-behind/封存警示），失焦 1 秒后自动消失（焦点出入卡片内部不断开）。
// 封存态 = 失效变体（警示色 + 删除线）；非 git 项目零注入。
import { useRef, useState, type ReactNode } from 'react'
import { aheadBehindSegments } from './model.js'
import type { AheadBehind } from '../worktree-ops.js'
import { IconBranchOutlineRegular } from './icons.js'

const mono = { fontFamily: 'var(--ds-font-family-code, monospace)' } satisfies React.CSSProperties

export interface SessionWorktreeChipProps {
  /** 能力位（身份归并层产出）——非 git = 零注入 */
  readonly isGit: boolean
  readonly branch: string
  readonly worktreeName: string
  /** worktree 完整路径（完整信息卡行；缺席 = 卡内不呈现该行） */
  readonly worktreePath?: string | undefined
  /** 归并项目根（完整信息卡行；缺席 = 卡内不呈现该行） */
  readonly projectRoot?: string | undefined
  /** ahead/behind（懒加载/缓存值；缺省 = 不展示） */
  readonly aheadBehind?: AheadBehind | undefined
  /** 封存态（挂靠 worktree 已被删——chip 转失效态） */
  readonly sealed?: boolean | undefined
}

/** 完整信息卡（受控呈现面导出 = 单测直测；SSR 面不可达的交互态由本面锁定） */
export function SessionWorktreeInfoCard({
  branch,
  worktreeName,
  worktreePath,
  projectRoot,
  aheadBehind,
  sealed = false,
}: Omit<SessionWorktreeChipProps, 'isGit'>): ReactNode {
  const segments = aheadBehind !== undefined ? aheadBehindSegments(aheadBehind) : null
  const ab =
    segments !== null && (segments.ahead !== null || segments.behind !== null)
      ? [segments.ahead, segments.behind].filter(Boolean).join(' ')
      : null
  const row = (label: string, value: ReactNode): ReactNode => (
    <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ flex: 'none', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }}>{label}</span>
      <span style={{ ...mono, color: 'var(--dsw-alias-label-primary)', fontSize: 12, wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
  return (
    <div
      data-dswt-session-chip-popover=""
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0,
        zIndex: 30,
        minWidth: 280,
        maxWidth: 420,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 12,
        borderRadius: 'var(--dsw-radius-sm)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        boxShadow: 'var(--dsw-alias-shadow-menu, 0 4px 16px rgba(0,0,0,.08))',
        textAlign: 'left',
      }}
    >
      {sealed && (
        <div style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 }}>
          worktree 已被删除，会话已封存——可查看历史，不可发送消息
        </div>
      )}
      {row('分支', branch)}
      {row('worktree', worktreeName)}
      {worktreePath !== undefined && row('路径', worktreePath)}
      {projectRoot !== undefined && row('项目', projectRoot)}
      {ab !== null && row('领先/落后', ab)}
    </div>
  )
}

/**
 * 会话头只读一体 chip（注入 `conversation.session.header.actions` 槽——官方动作带，
 * 样式基准 = 官方 AgentPresetLabel 模式标签）。点击展示完整信息卡；失焦 1 秒自动
 * 消失（焦点在 chip/卡片内部不断开——出入卡片移动指针零闪烁）。data 锚：
 * data-dswt-session-chip / data-dswt-session-chip-popover。
 */
export function SessionWorktreeChip({
  isGit,
  branch,
  worktreeName,
  worktreePath,
  projectRoot,
  aheadBehind,
  sealed = false,
}: SessionWorktreeChipProps): ReactNode {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  if (!isGit) return null // 非 git 项目：会话头 actions 槽零注入
  const segments = aheadBehind !== undefined && !sealed ? aheadBehindSegments(aheadBehind) : null
  const errorColor = 'var(--dsw-alias-state-error-primary)'
  const cancelClose = (): void => {
    if (closeTimer.current !== undefined) {
      clearTimeout(closeTimer.current)
      closeTimer.current = undefined
    }
  }
  return (
    <span
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onFocusCapture={cancelClose}
      onBlurCapture={(event) => {
        // 焦点移入 chip/卡片内部（React onBlur 冒泡）不断开；真失焦 → 1 秒后自动消失
        const next = event.relatedTarget
        if (next instanceof Node && wrapRef.current?.contains(next)) return
        cancelClose()
        closeTimer.current = setTimeout(() => setOpen(false), 1_000)
      }}
    >
      <button
        type="button"
        data-dswt-session-chip={sealed ? 'sealed' : 'live'}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={sealed ? 'worktree 已被删除' : undefined}
        onClick={() => {
          cancelClose()
          setOpen((prev) => !prev)
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 22,
          padding: '0 2px 0 0',
          borderRadius: 'var(--dsw-radius-xs)',
          border: 'none',
          fontSize: 12,
          lineHeight: '22px',
          color: sealed ? errorColor : 'var(--dsw-alias-label-tertiary)',
          background: 'var(--dsw-alias-fill-tsp-secondary)',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          maxWidth: 260,
          overflow: 'hidden',
        }}
      >
        <span style={{ opacity: 0.7, flex: 'none', display: 'inline-flex', color: sealed ? errorColor : 'var(--dsw-alias-label-primary)' }}>
          <IconBranchOutlineRegular size={14} />
        </span>
        <span style={{ ...mono, color: sealed ? errorColor : 'var(--dsw-alias-label-primary)', textDecoration: sealed ? 'line-through' : undefined }}>
          {branch}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--dsw-alias-label-caption)' }}>
          ·
        </span>
        <span style={{ ...mono, color: sealed ? errorColor : 'var(--dsw-alias-label-primary)', textDecoration: sealed ? 'line-through' : undefined, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {worktreeName}
        </span>
        {segments !== null && (segments.ahead !== null || segments.behind !== null) && (
          <span data-dswt-chip-ab="" style={{ fontSize: 11, color: 'var(--dsw-alias-label-caption)' }}>
            {[segments.ahead, segments.behind].filter(Boolean).join(' ')}
          </span>
        )}
      </button>
      {open && (
        <SessionWorktreeInfoCard
          branch={branch}
          worktreeName={worktreeName}
          worktreePath={worktreePath}
          projectRoot={projectRoot}
          aheadBehind={aheadBehind}
          sealed={sealed}
        />
      )}
    </span>
  )
}
