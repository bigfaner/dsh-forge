// @dsh-forge/git-worktree client —— 封存三通道提示（原型第三卡；均提示性视觉，
// 「不可发送」硬保证在 host 发送拦截面，UI 不做硬禁用——官方 composer 无禁用 API）：
// ① SealNotice——一次性 notice banner，紧贴会话头分界线置顶（官方 notice 形态）；
// ② SealedComposerPlaceholder——composer 占位文案（提示性）；
// ③ chip 失效态见 session-worktree-chip.tsx（sealed 变体）。
import type { ReactNode } from 'react'
import { IconWarningTriangleOutlineRegular } from './icons.js'

export interface SealNoticeProps {
  /** 被删 worktree 名（banner 引述） */
  readonly worktreeName: string
  /** 一次性关闭（dismiss 后装配层不再渲染——一次性语义） */
  readonly onClose: () => void
}

/**
 * 封存 notice banner（警告色描边 + 8% 警告底 + 上边线免除——紧贴会话头分界线置顶）。
 * data 锚：data-dswt-seal-notice。
 */
export function SealNotice({ worktreeName, onClose }: SealNoticeProps): ReactNode {
  return (
    <div
      data-dswt-seal-notice=""
      role="status"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        border: '0.5px solid var(--dsw-alias-state-warn-primary)',
        borderTop: 'none',
        borderRadius: '0 0 12px 12px',
        padding: '10px 14px',
        marginBottom: 12,
        fontSize: 13,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)',
      }}
    >
      <span style={{ display: 'inline-flex', color: 'var(--dsw-alias-state-warn-primary)' }} aria-hidden="true">
        <IconWarningTriangleOutlineRegular size={15} />
      </span>
      <span>
        该会话挂靠的 worktree{' '}
        <b style={{ fontFamily: 'var(--ds-font-family-code, monospace)' }}>{worktreeName}</b>{' '}
        已被删除，会话已封存——可查看历史，不可发送消息。
      </span>
      <span
        role="button"
        aria-label="关闭提示"
        data-dswt-seal-notice-close=""
        onClick={onClose}
        style={{
          marginLeft: 'auto',
          color: 'var(--dsw-alias-label-tertiary)',
          cursor: 'pointer',
          fontSize: 12,
          lineHeight: '20px',
        }}
      >
        ✕
      </span>
    </div>
  )
}

/**
 * composer 封存占位文案（提示性——不硬禁用；composer 本体为官方件，产品侧仅让
 * 占位行呈现封存语义）。data 锚：data-dswt-seal-placeholder。
 */
export function SealedComposerPlaceholder(): ReactNode {
  return (
    <div
      data-dswt-seal-placeholder=""
      style={{
        border: '0.5px dashed var(--dsw-alias-border-l2)',
        borderRadius: 16,
        padding: '12px 14px',
        fontSize: 14,
        lineHeight: '22px',
        color: 'var(--dsw-alias-label-caption)',
        background: 'var(--dsw-alias-bg-module-platform)',
      }}
    >
      worktree 已删除，会话已封存——可查看历史
    </div>
  )
}
