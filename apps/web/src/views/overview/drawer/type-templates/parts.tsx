// 模板共享子件（定位：业务——各族模板复用的呈现原子；层次阶梯 v12/v13：
// 子标题 tc-k（次色加粗）→ 组标签 scope-k（三级色加粗）→ 内容行；键标签一并加粗）。
// 官方件复用优先：无对应官方原子时自绘吃令牌（样式归 ../drawer.css——类前缀 dswf-td-*）。
import type { ReactNode } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskDocRef } from '@dsh-forge/contracts'

/** 子标题（目标/结果/参考文档/改动范围/验收标准/症状/命令…——12/600 次色阶梯的类位） */
export function SubTitle({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div className="dswf-td-tck" data-dswf-td-tck="">
      {children}
    </div>
  )
}

/** 键值行（键标签加粗——症状/验证/交付物/读者/命令/基线/评估对象/结论） */
export function KvRow({ k, children }: { readonly k: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="dswf-td-kvrow">
      <span className="dswf-td-kv-k">{k}</span>
      <span className="dswf-td-kv-v">{children}</span>
    </div>
  )
}

/** 代码体片段（命令/交付物路径——着 link 色） */
export function CodeSpan({ children }: { readonly children: ReactNode }): ReactNode {
  return <span className="dswf-td-code">{children}</span>
}

/** 编号步骤列表（修复步骤/大纲/走查步骤） */
export function StepsList({ items }: { readonly items: readonly string[] }): ReactNode {
  return (
    <div className="dswf-td-steps">
      {items.map((item, index) => (
        <div className="dswf-td-step" key={`${index}-${item}`}>
          <span className="dswf-td-step-num" aria-hidden="true">
            {index + 1}
          </span>
          <span className="dswf-td-step-text">{item}</span>
        </div>
      ))}
    </div>
  )
}

/** checklist（验收标准/检查项——终态全勾 + 划线类位 is-done） */
export function Checklist({ items, allDone }: { readonly items: readonly string[]; readonly allDone: boolean }): ReactNode {
  return (
    <div className={allDone ? 'dswf-td-acc is-done' : 'dswf-td-acc'}>
      {items.map((item, index) => (
        <div className="dswf-td-acc-item" key={`${index}-${item}`}>
          <span className="dswf-td-acc-box" aria-hidden="true">
            {allDone ? '✓' : ''}
          </span>
          <span className="dswf-td-acc-text">{item}</span>
        </div>
      ))}
    </div>
  )
}

/** 无序列表（采集指标/通用数组负载） */
export function PlainList({ items }: { readonly items: readonly string[] }): ReactNode {
  return (
    <div className="dswf-td-plainlist">
      {items.map((item, index) => (
        <div className="dswf-td-li" key={`${index}-${item}`}>
          · {item}
        </div>
      ))}
    </div>
  )
}

/** 参考文档 chips（AC3：resolved = 链接态可点 → dock 开 tab 回调；未命中置灰不可点） */
export function RefChips({
  refs,
  onOpenDoc,
}: {
  readonly refs: readonly TaskDocRef[]
  readonly onOpenDoc: (docRel: string) => void
}): ReactNode {
  const seen = new Set<string>()
  return (
    <div className="dswf-td-refs">
      {refs
        .filter((ref) => {
          if (seen.has(ref.docRel)) return false // docRel 去重
          seen.add(ref.docRel)
          return true
        })
        .map((ref) =>
          ref.resolved ? (
            <Tooltip key={ref.docRel} label={ref.docRel} portal>
              <button
                type="button"
                className="dswf-td-ref is-link"
                data-dswf-td-ref={ref.docRel}
                onClick={() => {
                  onOpenDoc(ref.docRel) // 抽屉保持——开 tab 不关抽屉（调用方 dock 语义）
                }}
              >
                {ref.docRel}
              </button>
            </Tooltip>
          ) : (
            <span className="dswf-td-ref is-muted" key={ref.docRel} data-dswf-td-ref-unresolved={ref.docRel}>
              {ref.docRel}
            </span>
          ),
        )}
    </div>
  )
}
