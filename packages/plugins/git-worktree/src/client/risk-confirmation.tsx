// @dsh-forge/git-worktree client —— 跨分支风险确认框（1.19 用户裁决：官方 RiskConfirmation
// 复用不自绘）。hero chip 改选 worktree 与新建表单基准分支两处共用：目标分支/基准分支
// ≠ 主树当前检出分支时先弹本框——勾选知悉后才可确认，取消保持原状（不进任何编排/git）。
import { useEffect, useState, type ReactNode } from 'react'
import { RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'

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
}

/**
 * 官方 RiskConfirmation 薄封装（状态缝合 = 允许的胶水面）：勾选知悉（acknowledged）
 * 前确认钮不可用（官方内部语义）；关闭即复位勾选（一次性确认刻度）。
 */
export function WorktreeRiskConfirmation({
  open,
  targetBranch,
  currentBranch,
  title = '跨分支风险确认',
  description,
  onCancel,
  onConfirm,
}: WorktreeRiskConfirmationProps): ReactNode {
  const [acknowledged, setAcknowledged] = useState(false)
  useEffect(() => {
    if (!open) setAcknowledged(false)
  }, [open])
  const text =
    description ??
    `目标分支 ${targetBranch ?? '(未知)'} 与主树当前检出分支 ${currentBranch ?? '(未知)'} 不同：` +
      '会话上下文与文件视图将切换到另一分支的 worktree，主树中的未同步改动不会随行。请确认后再继续。'
  return (
    <RiskConfirmation
      open={open}
      title={title}
      description={text}
      acknowledgeLabel="我已了解跨分支上下文风险"
      cancelLabel="取消"
      closeLabel="关闭"
      confirmLabel="确认继续"
      acknowledged={acknowledged}
      // 注意：不传 disabled——官方组件 disabled 会连带禁用勾选框（死锁）；
      // 「勾选知悉前确认钮不可用」语义由官方内部 `disabled || !acknowledged` 承载。
      onAcknowledgedChange={setAcknowledged}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
