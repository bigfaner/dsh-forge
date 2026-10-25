// @dsh-forge/git-worktree client —— worktree 切换闸视觉件（bug 267dcac1）：
// 点选 worktree → openWorkspace 异步敛棋前（~1s）composer 仍系旧树 blank，窗口内发送
// 即错绑（显示 a 实发 b）。本件 = pending 窗口的虚线外框面板（官方 hero 未加载态同形
// ——SealedComposerPlaceholder 同款虚线令牌）；「禁止输入/发送」由装配层（web 侧
// ForgeWorktreeSwitchOverlay）经 document 捕获层拦截，件本体纯呈现。
import type { ReactNode } from 'react'

/** 键击拦截谓词（纯函数——装配层捕获监听消费）：Enter 恒拦（发送动作窗口内禁发）；
 * 其余键仅当目标为可编辑元素时拦（输入禁止，全局快捷键不误伤）。 */
export function switchGateBlocksKey(event: { key: string; target: EventTarget | null }): boolean {
  if (event.key === 'Enter') return true
  const target = event.target as { tagName?: unknown; isContentEditable?: unknown } | null
  if (target === null || typeof target !== 'object') return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true
}

/**
 * 切换 pending 虚线外框面板（提示性视觉 + 装配层拦截的视觉锚）。data 锚：
 * data-dswt-switch-gate。
 */
export function WorktreeSwitchGate(): ReactNode {
  return (
    <div
      data-dswt-switch-gate=""
      role="status"
      style={{
        border: '0.5px dashed var(--dsw-alias-border-l2)',
        borderRadius: 16,
        padding: '12px 14px',
        fontSize: 14,
        lineHeight: '22px',
        color: 'var(--dsw-alias-label-caption)',
        background: 'var(--dsw-alias-bg-module-platform)',
        textAlign: 'center',
      }}
    >
      正在切换 worktree…
    </div>
  )
}
