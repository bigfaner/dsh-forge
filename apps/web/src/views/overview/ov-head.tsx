// 概览折叠头（定位：业务——UF-1 ov-head：默认折叠 = 项目名 + 一行状态摘要；展开路径详情
// 4 行[工作区/文档位置/知识目录/任务清单@hash8]）。M3.1 D20（原型十一轮）：展开/收起 =
// 名称行内同一枚按钮同位翻转（官方 ChevronDown 旋转 + 展开↔收起文案 + aria-expanded）——
// 行内 ghost ▾/▴ 字符钮与底部右对齐收起钮退役。官方件复用：折叠钮 = 官方 Button（ghost/sm）
// + 官方 IconChevronDownOutlineRegular；信息行自绘（官方无对应件）全令牌。
// 受控件（open/onToggle 上抛——展开态归 OverviewTab 本地态，AC3 切子 tab 不清头部）。
import type { ReactNode } from 'react'
import { Button, IconChevronDownOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import './overview.css'

/** ov-head 信息行（4 行数据形状——值与标签由装配面合成） */
export interface OverviewHeadRow {
  readonly label: string
  readonly value: string
}

export interface OverviewHeadProps {
  /** 项目名（projects.get name） */
  readonly projectName: string
  /** 一行状态摘要（overviewHeadSummary 合成——「feature · N 会话 · N 完成」） */
  readonly summary: string
  /** 展开路径详情 4 行（overviewHeadRows 合成） */
  readonly rows: readonly OverviewHeadRow[]
  /** 展开态（默认折叠——受控） */
  readonly open: boolean
  /** 折叠 toggle 上抛 */
  readonly onToggle: () => void
}

/** 概览折叠头（M3.1 D20：同一枚按钮同位翻转——ChevronDown 旋转 + 展开↔收起文案） */
export function OverviewHead({ projectName, summary, rows, open, onToggle }: OverviewHeadProps): ReactNode {
  return (
    <div className="dswf-ov-head" data-dswf-ov-head="">
      <div className="dswf-ov-head-line">
        {/* D30：原生 title 退役——官方 Tooltip（portal 逃逸概览滚动容器） */}
        <Tooltip label={projectName} portal>
          <span className="dswf-ov-name">{projectName}</span>
        </Tooltip>
        <span className="dswf-ov-summary">{summary}</span>
        <Tooltip label={open ? '收起位置详情' : '展开位置详情'} portal>
          <Button
            variant="ghost"
            size="sm"
            className="dswf-ov-head-toggle"
            aria-expanded={open}
            aria-label={open ? '收起位置详情' : '展开位置详情'}
            data-dswf-ov-head-toggle=""
            onClick={onToggle}
          >
            <IconChevronDownOutlineRegular
              size={11}
              className={open ? 'dswf-ov-head-caret is-open' : 'dswf-ov-head-caret'}
            />
            {open ? '收起' : '展开'}
          </Button>
        </Tooltip>
      </div>
      {open ? (
        <div className="dswf-ov-info">
          {rows.map((row) => (
            <div className="dswf-ov-info-row" key={row.label}>
              <span className="dswf-ov-info-k">{row.label}</span>
              <Tooltip label={row.value} portal>
                <span className="dswf-ov-info-v">{row.value}</span>
              </Tooltip>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
