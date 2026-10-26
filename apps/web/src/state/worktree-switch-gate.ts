// worktree 切换闸状态（bug 267dcac1——hero composer 发送竞速 openWorkspace 生效前落旧树）：
// 点选链置位 → openWorkspace 敛棋解除。消费面 = 官方 composer block 缝（conversation.blocks，
// ui-conversation client.js:3747「the one way another plugin stops a session's input」——
// blocked 会话 composer 渲染为 inert textarea + reason 占位，与「会话无 workspace」同形）：
// pending 窗口内 composer 整体禁输虚线框，窗口归零即 WYSIWYG 收口（显示 a = 发送落 a）。
// 共享组件域模块（WorktreeFaces 共 import；client-plugin 入口禁 import——classic 形状
// pin，判例 20be1ba7）：入口经 window 锚 `__dshForgeWorktreeSwitchGate` 消费（双注同
// selected-tree-window 口径）。

type Listener = () => void

const listeners = new Set<Listener>()
let count = 0

/** 超时自动解除上界（fail-open——openWorkspace 永不敛棋亦不永锁 composer） */
const AUTO_RELEASE_MS = 3000

export function isWorktreeSwitchPending(): boolean {
  return count > 0
}

/** 订阅 pending 变更（入口侧经 window 锚消费） */
export function subscribeWorktreeSwitch(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * 置位切换 pending；返回敛棋函数（幂等）。并发切换计数语义：前一次敛棋、后一次
 * 未敛 = 闸仍 pending。3s 超时自动解除。
 */
export function beginWorktreeSwitch(): () => void {
  count += 1
  if (count === 1) notify()
  let done = false
  const settle = (): void => {
    if (done) return
    done = true
    clearTimeout(timer)
    count = Math.max(0, count - 1)
    if (count === 0) notify()
  }
  const timer = setTimeout(settle, AUTO_RELEASE_MS)
  return settle
}

// 入口侧 window 锚（双注：读取器 = client-plugin/worktree-switch-gate-install.ts，
// KEY 契约随注释维护——入口与共享组件禁共 import 模块）
;(globalThis as unknown as Record<string, unknown>)['__dshForgeWorktreeSwitchGate'] = {
  isPending: isWorktreeSwitchPending,
  subscribe: subscribeWorktreeSwitch,
}
