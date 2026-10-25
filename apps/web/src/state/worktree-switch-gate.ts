// worktree 切换闸状态（bug 267dcac1——hero composer 发送竞速 openWorkspace 生效前落旧树）：
// 点选链置位 → openWorkspace 敛棋解除；pending 窗口内 composer 禁输（虚线外框 + 捕获层
// 键击/指针拦截），窗口归零即 WYSIWYG 收口（显示 a = 发送落 a）。
// 共享组件域模块（WorktreeFaces / ForgeWorktreeSwitchOverlay 共 import；client-plugin
// 入口禁 import——classic 形状 pin，判例 20be1ba7）。

type Listener = () => void

const listeners = new Set<Listener>()
let count = 0

/** 超时自动解除上界（fail-open——openWorkspace 永不敛棋亦不永锁 composer） */
const AUTO_RELEASE_MS = 3000

export function isWorktreeSwitchPending(): boolean {
  return count > 0
}

/** 订阅 pending 变更（React 组件经 useSyncExternalStore 消费） */
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
