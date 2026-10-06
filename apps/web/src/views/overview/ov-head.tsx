// 概览折叠头（定位：业务——UF-1 ov-head：默认折叠 = 项目名 + 一行状态摘要 + ▾；
// 展开路径详情 4 行[工作区/文档位置/知识目录/任务清单@hash8] + ▴ 收起）。
// 官方件复用：折叠钮 = 官方 Button（ghost/sm）；信息行自绘（官方无对应件）全令牌。
// 受控件（open/onToggle 上抛——展开态归 OverviewTab 本地态，AC3 切子 tab 不清头部）。
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
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

/** 概览折叠头（AC1：默认折叠一行；▾ 展开 4 行；▴ 收起） */
export function OverviewHead({ projectName, summary, rows, open, onToggle }: OverviewHeadProps): ReactNode {
  return (
    <div className="dswf-ov-head" data-dswf-ov-head="">
      <div className="dswf-ov-head-line">
        <span className="dswf-ov-name" title={projectName}>
          {projectName}
        </span>
        <span className="dswf-ov-summary">{summary}</span>
        <Button
          variant="ghost"
          size="sm"
          className="dswf-ov-head-toggle"
          aria-expanded={open}
          aria-label={open ? '收起位置详情' : '展开位置详情'}
          title={open ? '收起位置详情' : '展开位置详情'}
          data-dswf-ov-head-toggle=""
          onClick={onToggle}
        >
          {open ? '▴ 收起' : '▾'}
        </Button>
      </div>
      {open ? (
        <div className="dswf-ov-info">
          {rows.map((row) => (
            <div className="dswf-ov-info-row" key={row.label}>
              <span className="dswf-ov-info-k">{row.label}</span>
              <span className="dswf-ov-info-v" title={row.value}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
