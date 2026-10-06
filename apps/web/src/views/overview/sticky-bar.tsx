// 概览 sticky 区（定位：业务——UF-1：三子 tab（用户定向顺序 提案|feature|任务）+
// 搜索行（限宽 + 清除钮；IME 安全）+ 排序 pill（⇅ 活跃优先 ↔ 最新创建，右固定））。
// Hard Rule「搜索过滤服务端承载」：本组件只上抛关键词原文，过滤归数据层查询参。
// IME 安全（AC2）：搜索行 = 稳定受控子树——输入值变更仅回流 input value 属性与
// （非空时的）清除钮，子 tab/排序/内容区变更不重建搜索行（结构不变式见 sticky-bar.test）。
// 官方件复用：输入 = 官方 Input（前导检索图标）、清除/排序 = 官方 Button/Pill——零自绘输入控件。
import type { ReactNode } from 'react'
import { Button, IconCloseFillRegular, IconSearchOutlineRegular, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  OVERVIEW_SORT_LABELS,
  OVERVIEW_SUBTABS,
  searchPlaceholderOf,
  type OverviewSort,
  type OverviewSubtab,
} from './overview-model.js'
import './overview.css'

export interface StickyBarProps {
  /** 当前子 tab（受控） */
  readonly subtab: OverviewSubtab
  /** 子 tab 切换（帧侧经 switchSubtab 清空搜索/chips/展开态） */
  readonly onSubtabChange: (subtab: OverviewSubtab) => void
  /** 搜索关键词原文（受控输入值——服务端过滤参经 searchQueryOf 归一） */
  readonly search: string
  /** 关键词变更（原样上抛——过滤语义归服务端） */
  readonly onSearchChange: (search: string) => void
  /** 排序模式（受控） */
  readonly sort: OverviewSort
  /** 排序 pill 点击（活跃优先 ↔ 最新创建） */
  readonly onSortToggle: () => void
}

/** 概览 sticky 区（子 tab 行 + 搜索行 + 排序 pill——AC2） */
export function StickyBar({
  subtab,
  onSubtabChange,
  search,
  onSearchChange,
  sort,
  onSortToggle,
}: StickyBarProps): ReactNode {
  return (
    <div className="dswf-ov-sticky" data-dswf-ov-sticky="">
      <div className="dswf-ov-subtabs" role="tablist" aria-label="概览子视图">
        {OVERVIEW_SUBTABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={subtab === tab.value}
            className={subtab === tab.value ? 'dswf-ov-subtab is-active' : 'dswf-ov-subtab'}
            data-dswf-ov-subtab={tab.value}
            onClick={() => {
              onSubtabChange(tab.value)
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="dswf-ov-searchbar">
        {/* 搜索行稳定子树锚：IME 安全判据（结构不随关键词重建——见单测） */}
        <div className="dswf-ov-searchrow" data-dswf-ov-searchrow="">
          <Input
            icon={<IconSearchOutlineRegular size={13} />}
            className="dswf-ov-search"
            type="text"
            placeholder={searchPlaceholderOf(subtab)}
            aria-label="概览搜索"
            value={search}
            onChange={(event) => {
              onSearchChange(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onSearchChange('')
            }}
          />
          {search === '' ? null : (
            <Button
              variant="toolbar"
              size="sm"
              className="dswf-ov-searchclear"
              aria-label="清除搜索"
              title="清除（Esc）"
              data-dswf-ov-searchclear=""
              onClick={() => {
                onSearchChange('')
              }}
            >
              <IconCloseFillRegular size={12} />
            </Button>
          )}
        </div>
        <span className="dswf-ov-spacer" />
        <Pill
          className="dswf-ov-sort"
          title="切换排序方式"
          data-dswf-ov-sort=""
          onClick={onSortToggle}
        >
          {`⇅ ${OVERVIEW_SORT_LABELS[sort]}`}
        </Pill>
      </div>
    </div>
  )
}
