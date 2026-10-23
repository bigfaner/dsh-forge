/**
 * 确认框（host 拒绝 → 选回/仍要切换；tech-design widgets 清单）。
 * 回执驱动通用二选一对话框：mount 即渲染、点按即 resolve、卸载即清理——
 * 无预检语义，仅承载调用方的守卫回执文案。mockup 无专属基线（屏⑤标注
 * 「交互说明，非 UI 元素」）——刻度对齐既有面板语言（#dadce0 边 / 14px 圆角）。
 */

export interface ConfirmOptions {
  readonly title: string
  readonly body: string
  /** 否决动作（hero 语义 = 选回）。 */
  readonly cancelLabel: string
  /** 确认动作（hero 语义 = 仍要切换）。 */
  readonly confirmLabel: string
}

export type ConfirmChoice = 'confirm' | 'cancel'

/**
 * 弹确认框并等待用户点按：resolve(true) = 确认动作、resolve(false) = 否决动作。
 * 点按任一按钮即摘除 DOM；同一 mount 重复调用取最近一次（覆盖呈现）。
 */
export function showConfirm(mount: HTMLElement, options: ConfirmOptions): Promise<ConfirmChoice> {
  // 覆盖呈现：同 mount 已有确认框先摘（单模态）
  mount.querySelectorAll('.confirm-mask').forEach((previous) => previous.remove())
  return new Promise<ConfirmChoice>((resolve) => {
    const mask = document.createElement('div')
    mask.className = 'confirm-mask'
    const card = document.createElement('div')
    card.className = 'confirm-card'
    const title = document.createElement('div')
    title.className = 'confirm-title'
    title.textContent = options.title
    const body = document.createElement('div')
    body.className = 'confirm-body'
    body.textContent = options.body
    const actions = document.createElement('div')
    actions.className = 'confirm-actions'
    const settle = (choice: ConfirmChoice): void => {
      mask.remove()
      resolve(choice)
    }
    const cancelButton = document.createElement('button')
    cancelButton.className = 'confirm-btn'
    cancelButton.textContent = options.cancelLabel
    cancelButton.addEventListener('click', () => settle('cancel'))
    const confirmButton = document.createElement('button')
    confirmButton.className = 'confirm-btn primary'
    confirmButton.textContent = options.confirmLabel
    confirmButton.addEventListener('click', () => settle('confirm'))
    actions.append(cancelButton, confirmButton)
    card.append(title, body, actions)
    mask.appendChild(card)
    mount.appendChild(mask)
  })
}
