// Bug chip 重建 overlay（定位：业务视图——composer-bug-reference / bug 4b34e5d8）：
// conversation.input.overlay 槽占用者（零视觉——纯效应挂载点）。槽 runtime 按 sessionId
// 递达；挂载即把该会话的「纯文本草稿 → chip 重建」订阅缝接上。重建闭包由插件 bundle 经
// 页内全局 __DSH_FORGE_BUG_CHIP_RESTORE__ 递达（发布面同族缝——两 bundle 禁共享模块
// 实例，模块级注册面会分叉；缺席 = 未装配/已卸载 → 挂载零效应 fail-soft）。
import { useEffect, type ReactNode } from 'react'

/** 重建缝签名（sessionId → 解绑 disposer；void = 一次性重建无订阅） */
export type BugChipRestorer = (sessionId: string) => (() => void) | void

/** 页内全局缝（插件 bundle 装配期发布——workbench bridge 同族） */
declare global {
  interface Window {
    __DSH_FORGE_BUG_CHIP_RESTORE__?: BugChipRestorer | undefined
  }
}

function restorerOf(): BugChipRestorer | undefined {
  return typeof window === 'undefined' ? undefined : window.__DSH_FORGE_BUG_CHIP_RESTORE__
}

/** 插件装配期发布/摘除重建闭包（摘除 = undefined——插件已废死闭包不残留） */
export function publishBugChipRestorer(fn: BugChipRestorer | undefined): void {
  if (typeof window !== 'undefined') window.__DSH_FORGE_BUG_CHIP_RESTORE__ = fn
}

/**
 * conversation.input.overlay 槽占用者（list 行 id 'dswf-bug-chip-restore'）：零渲染，
 * 会话作用域挂载期启停重建订阅（disposer 归 effect cleanup——组件卸载即解绑）。
 */
export function ForgeBugChipRestoreOverlay({
  sessionId,
}: {
  readonly sessionId?: string | undefined
}): ReactNode {
  useEffect(() => {
    const restore = restorerOf()
    if (sessionId === undefined || restore === undefined) return
    return restore(sessionId) || undefined
  }, [sessionId])
  return null
}
