// 收起/展开单源组件（task-ui-visual-copy-blitz S2——定位：纯文本 + 折叠、零 Markdown）。
// 消费面三处同件复用：时间线 Note 织入文本 / 弹窗「目标」行 / ResultView「结果」行；
// 另以 Fold 泛化面承载 submit 记录结构化块（AC 徽标列表——收起态计数摘要）。
// Hard Rules：多行文本默认收起显首行、点击展开全文、white-space: pre-wrap 保留换行；
// 结构化字段缺席 = fail-soft 纯文本（消费端判型，本组件只管折叠）。
import { useState, type ReactNode } from 'react'

/** 多行判定（含 \n = 折叠候选；单行恒直显） */
export function isMultiline(text: string): boolean {
  return text.includes('\n')
}

/** 首行截取（收起态展示面——去尾随 \r 兼容 CRLF） */
export function firstLineOf(text: string): string {
  const index = text.indexOf('\n')
  const line = index === -1 ? text : text.slice(0, index)
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

/**
 * 泛化折叠块（单源核心）：collapsed = summary（点击展开）/ expanded = 全量 children +
 * 收起钮。受控 expanded 缺席 = 内部态自持（SSR 测试面经受控 props 夹具双态夹取）。
 */
export function Fold({
  summary,
  children,
  expanded,
  className,
}: {
  readonly summary: ReactNode
  readonly children: ReactNode
  /** 受控展开态（缺席 = 内部态自持） */
  readonly expanded?: boolean
  readonly className?: string
}): ReactNode {
  const [internal, setInternal] = useState(false)
  const open = expanded ?? internal
  const toggle = (): void => {
    setInternal((v) => !v)
  }
  if (!open) {
    return (
      <button
        type="button"
        className={className === undefined ? 'dswf-td-fold' : `dswf-td-fold ${className}`}
        data-dswf-td-fold="collapsed"
        aria-expanded={false}
        onClick={toggle}
      >
        {summary}
        <span className="dswf-td-fold-caret" aria-hidden="true">
          {' '}
          ▾ 展开
        </span>
      </button>
    )
  }
  return (
    <div className={className === undefined ? 'dswf-td-fold' : `dswf-td-fold ${className}`} data-dswf-td-fold="expanded">
      <div className="dswf-td-fold-body">{children}</div>
      <button type="button" className="dswf-td-fold-collapse" data-dswf-td-fold-collapse="" aria-expanded={true} onClick={toggle}>
        ▴ 收起
      </button>
    </div>
  )
}

/**
 * 纯文本收起/展开（单源面——Note/目标/结果三处同件）：单行直显 span；多行默认收起显
 * 首行，点击展开全文（pre-wrap 保留换行）。
 */
export function CollapsibleText({ text, className, expanded }: { readonly text: string; readonly className?: string; readonly expanded?: boolean }): ReactNode {
  if (!isMultiline(text)) {
    return <span className={className}>{text}</span>
  }
  return (
    <Fold summary={firstLineOf(text)} {...(expanded !== undefined ? { expanded } : {})} className="is-text">
      <span className="dswf-td-fold-text">{text}</span>
    </Fold>
  )
}
