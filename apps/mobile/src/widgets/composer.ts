/**
 * composer 底行：输入框 + 模式 · worktree（截断）· 滑杆设置钮 · 发送。
 * mockup 屏① 刻度；stale 置灰 = 发送/模式钮 disabled（数据驱动，AD-1）。
 * feature：/ 命令 + @ 文件 mention 唤醒菜单（super-composer InputTriggerController
 * 语义的移动端轻量镜像——触发判定/过滤/span 替换为纯函数，候选源由视图注入，
 * 发送原文不动：host 端斜杠仲裁照旧，@path 为纯文本由 agent 以文本理解）。
 */

/** 唤醒候选项（insert = 选中后替换触发 span 的完整文本，尾带空格）。 */
export interface SuggestItem {
  readonly insert: string
  readonly label: string
  readonly description?: string
}

export type SuggestKind = '/' | '@'

import { el } from './msg-cards.ts'

export interface ComposerOptions {
  readonly mode: string
  readonly worktree: string
  readonly onSend: (text: string) => void
  readonly onSettings: () => void
  readonly onWorktreeTap?: () => void
  readonly onModeTap?: () => void
  readonly modeReadOnly?: boolean
  /** 唤醒候选源（缺席 = 对应触发不唤醒——视图按能力注入）。 */
  readonly suggest?: (kind: SuggestKind) => Promise<readonly SuggestItem[]>
}

// ── 纯逻辑面（触发判定 / 过滤 / span 替换——单测主战场）──────────────

export interface TriggerHit {
  readonly kind: SuggestKind
  readonly query: string
  /** 触发符在文本中的下标。 */
  readonly start: number
}

/** 触发判定（official scanTextRefs 同语义）：行首/空白后的 / 或 @，query 至光标；
 *  / 的 query = 词字符（命令名），@ 的 query 允许路径字符（含 /）与 CJK；
 *  词中触发符（3/4、a@b）不触发；query 后随空白 = 已完成，菜单关。 */
export function detectTrigger(text: string, caret: number): TriggerHit | null {
  if (caret <= 0 || caret > text.length) return null
  const before = text.slice(0, caret)
  const slash = /(?:^|[\s])\/([\w-]*)$/.exec(before)
  if (slash !== null) return { kind: '/', query: slash[1] ?? '', start: caret - (slash[1]!.length + 1) }
  const at = /(?:^|[\s])@([^\s@]*)$/.exec(before)
  if (at !== null) return { kind: '@', query: at[1] ?? '', start: caret - (at[1]!.length + 1) }
  return null
}

/** 候选过滤：label 子串不区分大小写；空 query 全量。 */
export function filterItems(items: readonly SuggestItem[], query: string): readonly SuggestItem[] {
  const needle = query.toLowerCase()
  if (needle === '') return items
  return items.filter((item) => item.label.toLowerCase().includes(needle))
}

/** span 替换：触发符起至光标 → insert；返回新文本 + 落位光标。 */
export function applySuggestion(text: string, hit: TriggerHit, insert: string): { readonly text: string; readonly caret: number } {
  const head = text.slice(0, hit.start)
  const tail = text.slice(hit.start + (hit.query.length + 1))
  return { text: `${head}${insert}${tail}`, caret: hit.start + insert.length }
}

export interface ComposerHandle {
  readonly root: HTMLElement
  setStale(stale: boolean): void
  setSending(sending: boolean): void
  setWorktree(name: string): void
  /** worktree chip 可见性（bug 488e860d：非 git / 无可挂靠行 = 隐藏——选择面不呈现死路）。 */
  setWorktreeVisible(visible: boolean): void
  setMode(name: string): void
  /** 草稿回填（bug 53b5d685：发送失败文本退回输入框可重试）。 */
  setDraft(value: string): void
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

  // ---- 唤醒菜单（/ 命令 + @ mention——文档流块在输入卡上方，非光标锚定浮层）----
  const suggestBox = document.createElement('div')
  suggestBox.className = 'suggest'
  suggestBox.hidden = true
  let openHit: TriggerHit | null = null
  let openItems: readonly SuggestItem[] = []
  let itemsLoading = false
  let highlight = 0
  let composing = false
  let itemsToken = 0 // 异步候选源竞态守卫（新一轮触发使旧回执作废）
  const closeSuggest = (): void => {
    openHit = null
    openItems = []
    itemsLoading = false
    suggestBox.hidden = true
    suggestBox.textContent = ''
  }
  const renderSuggest = (): void => {
    if (openHit === null) return
    const visible = filterItems(openItems, openHit.query)
    // 加载中/暂无命中 = 菜单不显但触发态保留（候选回执到达后即显——bug：先前
    // 空列表即 closeSuggest 会把 in-flight 回执作废，菜单永不弹出）
    if (itemsLoading || visible.length === 0) {
      suggestBox.hidden = true
      suggestBox.textContent = ''
      return
    }
    if (highlight >= visible.length) highlight = 0
    suggestBox.hidden = false
    suggestBox.textContent = ''
    visible.forEach((item, index) => {
      const row = el('div', `mi${index === highlight ? ' picked' : ''}`)
      const label = el('span', 'k', item.label)
      row.appendChild(label)
      if (item.description !== undefined) row.appendChild(el('span', 'hint', item.description))
      // mousedown preventDefault——点击落选不抢 textarea 焦（official InputBar keepFocus 同径）
      row.addEventListener('mousedown', (event) => event.preventDefault())
      row.addEventListener('click', () => {
        pickSuggest(item)
      })
      suggestBox.appendChild(row)
    })
  }
  const pickSuggest = (item: SuggestItem): void => {
    if (openHit === null) return
    const applied = applySuggestion(input.value, openHit, item.insert)
    input.value = applied.text
    input.selectionStart = input.selectionEnd = applied.caret
    closeSuggest()
    syncHeight()
    syncSend()
    input.focus()
  }
  const updateSuggest = (): void => {
    if (options.suggest === undefined || composing) return
    const hit = detectTrigger(input.value, input.selectionStart ?? input.value.length)
    if (hit === null) {
      if (openHit !== null) closeSuggest()
      return
    }
    if (openHit === null || openHit.kind !== hit.kind) {
      openHit = hit
      highlight = 0
      openItems = []
      itemsLoading = true
      const token = ++itemsToken
      void options
        .suggest(hit.kind)
        .then((items) => {
          if (token !== itemsToken) return
          itemsLoading = false
          openItems = items
          renderSuggest()
        })
        .catch(() => {
          if (token === itemsToken) closeSuggest()
        })
    } else {
      openHit = hit
    }
    renderSuggest()
  }
  input.addEventListener('compositionstart', () => {
    composing = true
  })
  input.addEventListener('compositionend', () => {
    composing = false
    updateSuggest()
  })
  input.addEventListener('input', () => {
    syncHeight()
    syncSend()
    updateSuggest()
  })
  input.addEventListener('keyup', updateSuggest)
  input.addEventListener('click', updateSuggest)
  input.addEventListener('keydown', (event) => {
    if (openHit === null || suggestBox.hidden) return
    const visible = filterItems(openItems, openHit.query)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      highlight = (highlight + delta + visible.length) % Math.max(visible.length, 1)
      renderSuggest()
    } else if (event.key === 'Enter') {
      // 菜单开 = Enter 选中高亮（菜单关 = 换行——多行化裁决不变）
      event.preventDefault()
      const item = visible[highlight]
      if (item !== undefined) pickSuggest(item)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeSuggest()
    }
  })

  let stale = false
  let sending = false
  const syncSend = (): void => {
    sendButton.disabled = stale || sending || input.value.trim() === ''
  }
  input.addEventListener('input', syncSend)
  sendButton.addEventListener('click', () => {
    if (sendButton.disabled) return
    closeSuggest()
    options.onSend(input.value)
    input.value = ''
    syncHeight()
    syncSend()
  })

  crow.append(modeChip, worktreeChip, settingsButton, sendButton)
  composer.append(input, crow)
  inputbar.append(suggestBox, composer)
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
    // bug 53b5d685：发送失败文本退回输入框可重试
    setDraft(value: string) {
      input.value = value
      syncHeight()
      syncSend()
    },
    focus: () => input.focus(),
  }
}
