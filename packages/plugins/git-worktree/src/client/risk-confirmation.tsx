// @dsh-forge/git-worktree client —— 跨分支风险确认框（1.19 用户裁决：官方机械复用不自绘）。
// hero chip 改选 worktree 与新建表单基准分支两处共用：目标分支/基准分支 ≠ 主树当前检出
// 分支时先弹本框——勾选知悉后才可确认，取消保持原状（不进任何编排/git）。
// 组合面 = 官方 Modal（mask/Escape/焦点环/Tab 圈闭/自动聚焦全官方承载）+ 官方 Button +
// 官方 focusWithoutRing；体面（警示行/勾选行/脚钮）逐样式复刻官方 RiskConfirmation
// （dsw 令牌同源）。不走官方 RiskConfirmation 整件的原因：其 description 类型缝是 string
// 且无第二勾选槽——「不再提示」行装不进去；复刻口径见官方 lib/RiskConfirmation.module.css。
import { useEffect, useState, type ReactNode } from 'react'
import { Button, IconWarningOutlineRegular, Modal, focusWithoutRing } from '@deepseek-ai/dsh-client-ui-primitives'

export interface WorktreeRiskConfirmationProps {
  readonly open: boolean
  /** 目标分支（hero 改选 = 行检出分支；新建 = 基准分支） */
  readonly targetBranch: string | null
  /** 主树当前检出分支（判定已在调用面经 isCrossBranchRisk 完成——本框纯呈现） */
  readonly currentBranch: string | null
  /** 标题/描述覆写（缺省 = 跨分支上下文风险文案） */
  readonly title?: string
  readonly description?: string
  readonly onCancel: () => void
  readonly onConfirm: () => void
  /** 「不再提示」勾选行（可选装——缺席 = 单勾选官方 RiskConfirmation 原形） */
  readonly dismissChecked?: boolean | undefined
  readonly onDismissChange?: ((next: boolean) => void) | undefined
}

/** 勾选行（官方 acknowledgement 行同款形制：16px 原生 checkbox + 14px/22px 文本） */
function AcknowledgementRow({
  label,
  checked,
  onChange,
  autoFocusTarget,
}: {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
  readonly autoFocusTarget?: boolean | undefined
}): ReactNode {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        marginTop: 20,
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 14,
        lineHeight: '22px',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        data-modal-autofocus={autoFocusTarget ? true : undefined}
        onChange={(event) => onChange(event.currentTarget.checked)}
        style={{
          flex: 'none',
          width: 16,
          height: 16,
          margin: '3px 0 0',
          accentColor: 'var(--dsw-alias-button-primary-fill)',
          cursor: 'pointer',
        }}
      />
      <span>{label}</span>
    </label>
  )
}

/** 确认框体（Modal 外提纯渲染面——renderToStaticMarkup 全相位可测，worktree-dialogs.test 同口径） */
export interface WorktreeRiskConfirmationBodyProps {
  readonly text: string
  readonly acknowledged: boolean
  readonly onAcknowledgedChange: (next: boolean) => void
  /** 「不再提示」勾选行（可选装——缺席 = 单勾选官方 RiskConfirmation 原形） */
  readonly dismissChecked?: boolean | undefined
  readonly onDismissChange?: ((next: boolean) => void) | undefined
}

export function WorktreeRiskConfirmationBody({
  text,
  acknowledged,
  onAcknowledgedChange,
  dismissChecked,
  onDismissChange,
}: WorktreeRiskConfirmationBodyProps): ReactNode {
  const withDismiss = dismissChecked !== undefined && onDismissChange !== undefined
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          color: 'var(--dsw-alias-label-secondary)',
          fontSize: 14,
          lineHeight: '22px',
        }}
      >
        <span
          style={{
            flex: 'none',
            marginTop: 2,
            color: 'var(--dsw-alias-state-error-primary)',
            display: 'flex',
          }}
        >
          <IconWarningOutlineRegular size={18} />
        </span>
        <p style={{ margin: 0 }}>{text}</p>
      </div>
      <AcknowledgementRow
        label="我已了解跨分支上下文风险"
        checked={acknowledged}
        onChange={onAcknowledgedChange}
        autoFocusTarget
      />
      {withDismiss && (
        <AcknowledgementRow label="我了解相关风险，不再提示" checked={dismissChecked} onChange={onDismissChange} />
      )}
    </>
  )
}

/**
 * 跨分支风险确认框：勾选知悉前确认钮不可用（官方 RiskConfirmation 同语义）；关闭即复位
 * 勾选（一次性确认刻度）。焦点补执（双 rAF）：Modal 挂载期官方自动聚焦勾选框，但装配链
 * 并发焦点命令（会话打开聚焦 composer）可后至抢占——补执把焦点拉回勾选框，空格键原生
 * 切换保持可用。
 */
export function WorktreeRiskConfirmation({
  open,
  targetBranch,
  currentBranch,
  title = '跨分支风险确认',
  description,
  onCancel,
  onConfirm,
  dismissChecked,
  onDismissChange,
}: WorktreeRiskConfirmationProps): ReactNode {
  const [acknowledged, setAcknowledged] = useState(false)
  useEffect(() => {
    if (!open) setAcknowledged(false)
  }, [open])
  // 焦点补执：open 置位后双 rAF（Modal 挂载聚焦 + 并发焦点命令均落帧），把焦点拉回本框
  // 勾选框（data-modal-autofocus 官方标记——role=dialog 取最后挂载者 = 本框）
  useEffect(() => {
    if (!open) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const dialogs = document.body.querySelectorAll<HTMLElement>('[role="dialog"]')
        const box = dialogs[dialogs.length - 1]?.querySelector<HTMLElement>('[data-modal-autofocus]') ?? null
        if (box !== null) focusWithoutRing(box)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [open])
  const text =
    description ??
    `目标分支 ${targetBranch ?? '(未知)'} 与主树当前检出分支 ${currentBranch ?? '(未知)'} 不同：` +
      '会话上下文与文件视图将切换到另一分支的 worktree，主树中的未同步改动不会随行。请确认后再继续。'
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      closeLabel="关闭"
      className="dswt-risk-modal"
      footer={
        <>
          <Button variant="outline" style={{ minWidth: 72 }} onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            style={{ minWidth: 136 }}
            // 官方语义：勾选知悉前确认钮不可用（disabled 不触勾选框——无死锁）
            disabled={!acknowledged}
            onClick={onConfirm}
          >
            确认继续
          </Button>
        </>
      }
    >
      <WorktreeRiskConfirmationBody
        text={text}
        acknowledged={acknowledged}
        onAcknowledgedChange={setAcknowledged}
        dismissChecked={dismissChecked}
        onDismissChange={onDismissChange}
      />
    </Modal>
  )
}
