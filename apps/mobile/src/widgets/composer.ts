/**
 * composer 底行：输入框 + 模式 · worktree（截断）· 滑杆设置钮 · 发送。
 * mockup 屏① 刻度；stale 置灰 = 发送/模式钮 disabled（数据驱动，AD-1）。
 */

export interface ComposerOptions {
  readonly mode: string
  readonly worktree: string
  readonly onSend: (text: string) => void
  readonly onSettings: () => void
  readonly onWorktreeTap?: () => void
  readonly onModeTap?: () => void
  readonly modeReadOnly?: boolean
}

export interface ComposerHandle {
  readonly root: HTMLElement
  setStale(stale: boolean): void
  setSending(sending: boolean): void
  setWorktree(name: string): void
  /** worktree chip 可见性（bug 488e860d：非 git / 无可挂靠行 = 隐藏——选择面不呈现死路）。 */
  setWorktreeVisible(visible: boolean): void
  setMode(name: string): void
  focus(): void
}

export function createComposer(options: ComposerOptions): ComposerHandle {
  const inputbar = document.createElement('div')
  inputbar.className = 'inputbar'
  const composer = document.createElement('div')
  composer.className = 'composer'
  // 用户裁决 2026-10-22：composer 多行化——textarea 默认 2 行、随内容自增高；Enter=换行，
  // 发送只走按钮（移动端惯例——软键盘回车即换行）
  const input = document.createElement('textarea')
  input.placeholder = '发消息或输入指令…'
  input.rows = 2
  input.maxLength = 32_000
  const syncHeight = (): void => {
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`
  }
  input.addEventListener('input', () => {
    syncHeight()
    syncSend()
  })
  const crow = document.createElement('div')
  crow.className = 'crow'

  const modeChip = document.createElement('div')
  modeChip.className = `plugin${options.modeReadOnly === true ? ' disabled' : ''}`
  modeChip.title = options.modeReadOnly === true ? '会话内模式只读' : '点击切换模式'
  modeChip.innerHTML = '<svg class="ic"><use href="#i-mode"/></svg>'
  modeChip.appendChild(document.createTextNode(options.mode))

  const worktreeChip = document.createElement('div')
  worktreeChip.className = 'plugin wt'
  worktreeChip.title = '点击查看完整分支/worktree'
  worktreeChip.innerHTML = '<svg class="ic"><use href="#i-branch"/></svg>'
  const worktreeName = document.createElement('span')
  worktreeName.className = 'wtname'
  worktreeName.textContent = options.worktree
  worktreeChip.appendChild(worktreeName)
  worktreeChip.insertAdjacentHTML('beforeend', '<svg class="ic" style="width:11px;height:11px"><use href="#i-chev"/></svg>')
  if (options.onWorktreeTap !== undefined)
    worktreeChip.addEventListener('click', () => options.onWorktreeTap?.())
  if (options.onModeTap !== undefined)
    modeChip.addEventListener('click', () => options.onModeTap?.())

  const settingsButton = document.createElement('button')
  settingsButton.className = 'setbtn'
  settingsButton.title = '会话设置 · 模型 / 思考强度'
  settingsButton.innerHTML = '<svg class="ic"><use href="#i-sliders"/></svg>'
  settingsButton.addEventListener('click', () => options.onSettings())

  const sendButton = document.createElement('button')
  sendButton.className = 'send'
  sendButton.title = '发送'
  sendButton.innerHTML = '<svg class="ic"><use href="#i-send"/></svg>'

  let stale = false
  let sending = false
  const syncSend = (): void => {
    sendButton.disabled = stale || sending || input.value.trim() === ''
  }
  input.addEventListener('input', syncSend)
  sendButton.addEventListener('click', () => {
    if (sendButton.disabled) return
    options.onSend(input.value)
    input.value = ''
    syncHeight()
    syncSend()
  })

  crow.append(modeChip, worktreeChip, settingsButton, sendButton)
  composer.append(input, crow)
  inputbar.appendChild(composer)
  syncSend()

  return {
    root: inputbar,
    setStale(next) {
      stale = next
      modeChip.classList.toggle('disabled', next || options.modeReadOnly === true)
      syncSend()
    },
    setSending(next) {
      sending = next
      syncSend()
      if (next) {
        input.value = ''
        syncHeight()
      }
    },
    setWorktree(name) {
      worktreeName.textContent = name
    },
    setWorktreeVisible(visible) {
      // bug 45e635af 残留：`.plugin` 显式 display 压制 hidden 属性——可见位走 style.display
      worktreeChip.style.display = visible ? '' : 'none'
    },
    setMode(name) {
      modeChip.textContent = ''
      modeChip.innerHTML = '<svg class="ic"><use href="#i-mode"/></svg>'
      modeChip.appendChild(document.createTextNode(name))
    },
    focus: () => input.focus(),
  }
}
