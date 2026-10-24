// 绑定失配哨兵 toast（WYSIWYG 哨兵——用户裁决 2026-10-24）：host 判读「绑定树 ≠ chip
// 显示树」→ 左下角 notice（6s 自动消失，点击关闭）+ 消息按原会话投递（不搬家不归档）。
// 样式 = dsw-raw 局部刻度（connection-lost-banner 先例同制：令牌 var + 局部裸值注释锚）。
export interface SessionBindingMismatchEventLike {
  readonly sessionId: string
  readonly binding: string | null
  readonly displayed: string
}

const TOAST_TTL_MS = 6000

/** 失配 toast 呈现（一次性 DOM 挂 body 顶层；DOM 缺席/异常 = 静默——日志行已落） */
export function showBindingMismatchToast(event: SessionBindingMismatchEventLike): void {
  if (typeof document === 'undefined') return
  try {
    const toast = document.createElement('div')
    toast.setAttribute('data-dswf-binding-mismatch-toast', '')
    toast.style.cssText = [
      'position:fixed',
      'left:16px',
      'bottom:16px',
      'z-index:2147483000',
      'max-width:420px',
      'padding:10px 14px', // dsw-raw notice 内距（局部刻度）
      'border-radius:10px', // dsw-raw 圆角（局部刻度——remote toast 同形）
      'border:1px solid var(--dsw-alias-state-warn-primary)',
      'background:var(--dsw-alias-bg-layer-2)',
      'color:var(--dsw-alias-label-primary)',
      'box-shadow:var(--dsw-alias-shadow-overlay, 0 4px 16px rgb(0 0 0 / 0.16))', // dsw-raw 弹层阴影（remote 同源）
      'font:var(--dsw-font-xs-13, 13px sans-serif)',
      'cursor:pointer',
    ].join(';')
    toast.textContent = `绑定失配：此会话属于 ${event.binding ?? '（未绑定）'}，chip 选的是 ${event.displayed}——消息仍在原会话投递`
    toast.addEventListener('click', () => toast.remove())
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), TOAST_TTL_MS)
  } catch {
    // DOM 呈现失败不外溢（事件日志行已落）
  }
}
