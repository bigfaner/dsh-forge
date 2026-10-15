// @dsh-forge/git-worktree client —— 删除二次确认弹窗（原型第五卡逐位对照）：
// 危险操作必经二次确认——官方 Modal 展示分支/worktree 状态清单：未提交变更、未 push
// 提交（警示展示——本地 ref git 原生保留，可确认）、挂靠会话；存在未提交变更或挂靠
// 会话（含 in-progress 任务）→ 确认钮禁用即拦截；双清 → 可确认删除。
// 状态清单体（DeleteChecksList）Modal 外提——单测直测（官方 Modal 门户壳 SSR 不可达
// ——apps/web AddProjectFlow.test 头注同口径）。
import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { deleteBlockers, type DeleteChecks } from './model.js'

export interface DeleteWorktreeDialogProps {
  readonly open: boolean
  /** worktree 名（标题引述） */
  readonly worktreeName: string
  /** 分支短名 */
  readonly branch: string | null
  /** worktree 路径（引述所在位置） */
  readonly path: string
  /** 状态清单（装配层经管理域拉取后传入） */
  readonly checks: DeleteChecks
  readonly onClose: () => void
  readonly onConfirm: () => void
}

const mono = { fontFamily: 'var(--ds-font-family-code, monospace)' } satisfies React.CSSProperties
const checkBase: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: '8px 10px',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  textAlign: 'left',
}

/** 单检查项行：ok（✓ 绿）= 干净；warn（✕ 黄）= 警示放行；block（✕ 红）= 拦截 */
function CheckRow({
  tone,
  title,
  detail,
}: {
  tone: 'ok' | 'warn' | 'block'
  title: string
  detail: ReactNode
}): ReactNode {
  const color = tone === 'ok'
    ? 'var(--dsw-alias-state-success-primary)'
    : tone === 'warn'
      ? 'var(--dsw-alias-state-warn-label)'
      : 'var(--dsw-alias-state-error-primary)'
  return (
    <div
      data-dswt-check={tone}
      style={{
        ...checkBase,
        borderColor:
          tone === 'ok'
            ? 'var(--dsw-alias-state-success-tertiary)'
            : tone === 'warn'
              ? 'var(--dsw-alias-state-warn-primary)'
              : 'var(--dsw-alias-state-error-primary)',
      }}
    >
      <span style={{ color, fontSize: 13 }} aria-hidden="true">
        {tone === 'ok' ? '✓' : '✕'}
      </span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }}>{title}</div>
        <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' }}>{detail}</div>
      </div>
    </div>
  )
}

/** 状态清单体（三检查项——弹窗 body 内容，Modal 外提单测面） */
export function DeleteChecksList({ checks, branch }: { checks: DeleteChecks; branch: string | null }): ReactNode {
  const branchLabel = branch ?? '(detached)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <CheckRow
        tone={checks.dirtyCount > 0 ? 'block' : 'ok'}
        title="未提交变更"
        detail={
          checks.dirtyCount > 0
            ? `工作区有 ${checks.dirtyCount} 个文件修改——存在未提交变更时删除被拦截`
            : '工作区干净（0 个文件修改）'
        }
      />
      <CheckRow
        tone={checks.aheadCount > 0 ? 'warn' : 'ok'}
        title="未 push 提交"
        detail={
          checks.aheadCount > 0 ? (
            <>
              分支 <span style={mono}>{branchLabel}</span> 领先远端 {checks.aheadCount}
              {' '}个提交——删除后仅存于本地 ref（git 原生保留），界面不再列出
            </>
          ) : (
            '分支与远端同步'
          )
        }
      />
      <CheckRow
        tone={checks.attachedSessions > 0 ? 'block' : 'ok'}
        title="挂靠会话"
        detail={
          checks.attachedSessions > 0
            ? `${checks.attachedSessions} 个会话正挂靠本 worktree——存在挂靠会话（含 in-progress 任务）时删除被拦截`
            : '无会话挂靠本 worktree'
        }
      />
    </div>
  )
}

/**
 * 删除 worktree 二次确认弹窗（官方 Modal；contentClassName = .dswt-delete-dialog）。
 * 确认钮 data-dswt-delete-confirm——拦截命中（isDeleteBlocked）即 disabled。
 */
export function DeleteWorktreeDialog({
  open,
  worktreeName,
  branch,
  path,
  checks,
  onClose,
  onConfirm,
}: DeleteWorktreeDialogProps): ReactNode {
  const blocked = deleteBlockers(checks).length > 0
  const branchLabel = branch ?? '(detached)'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="删除 worktree"
      closeLabel="关闭"
      contentClassName="dswt-delete-dialog"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            data-dswt-delete-confirm=""
            disabled={blocked}
            onClick={() => {
              onConfirm()
            }}
          >
            确认删除
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)', marginBottom: 12 }}>
        即将删除 <span style={{ ...mono, color: 'var(--dsw-alias-label-primary)' }}>{worktreeName}</span>（分支{' '}
        <span style={{ ...mono, color: 'var(--dsw-alias-label-primary)' }}>{branchLabel}</span>，位于{' '}
        <span style={{ ...mono, color: 'var(--dsw-alias-label-primary)' }}>{path}</span>）。删除前请确认以下状态：
      </div>
      <DeleteChecksList checks={checks} branch={branch} />
    </Modal>
  )
}
