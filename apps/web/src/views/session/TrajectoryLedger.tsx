// 轨迹台账（定位：业务——UF-4 轨迹 tab 最简台账：本轮消息与工具调用时序列表）。
// 行组件 = 自绘领域组件（官方无台账行对应件——样式纪律第 2 条自绘白名单：知识卡片/域树行/
// 召回分组行等台账行同类）；徽章 = StateChip（官方 Tag 包装）。数据 = transcript.ts 投影输出
// （AC-3 一致性由投影单测 pin，渲染面零再排序）。结构基准 = 原型 traj-panel 台账列
// （role=list aria-label=执行台账）；轮次收展/时长统计/搜索为原型示意，P1 不实现。
import type { ReactNode } from 'react'
import { EmptyState, StateChip } from '../../components/index.js'
import { buildTrajectoryLedger, type TranscriptEntry, type TrajectoryLedgerRow } from './transcript.js'

/** 工具相位徽章文案（started/running/result → 展示态） */
const TOOL_PHASE_LABEL: Readonly<Record<'started' | 'running' | 'result', string>> = {
  started: '已开始',
  running: '运行中',
  result: '已返回',
}

/** 消息侧别文案（用户/助手） */
const SIDE_LABEL: Readonly<Record<'user' | 'assistant', string>> = {
  user: '用户',
  assistant: '助手',
}

export interface TrajectoryLedgerProps {
  /** 转录条目（数据源快照切片；投影在本组件内执行——同数据源单投影） */
  readonly entries: readonly TranscriptEntry[]
}

/** 轨迹台账（时序列表；零条目 = 空态占位） */
export function TrajectoryLedger({ entries }: TrajectoryLedgerProps): ReactNode {
  const rows = buildTrajectoryLedger(entries)
  if (rows.length === 0) {
    return <EmptyState title="暂无轨迹" description="本轮消息与工具调用将在此列示" />
  }
  return (
    <div className="dswf-traj-ledger" role="list" aria-label="执行台账">
      {rows.map((row) => (
        <TrajectoryRow key={row.key} row={row} />
      ))}
    </div>
  )
}

/** 台账行（四类行组件——按行 kind 分形；行键 = 转录锚键） */
export function TrajectoryRow({ row }: { readonly row: TrajectoryLedgerRow }): ReactNode {
  switch (row.kind) {
    case 'message':
      return (
        <div
          className="dswf-traj-row dswf-traj-row-message"
          role="listitem"
          data-dswf-traj-row="message"
          data-dswf-side={row.side}
        >
          <span className="dswf-traj-who">{SIDE_LABEL[row.side]}</span>
          <span className="dswf-traj-text">{row.text}</span>
        </div>
      )
    case 'tool':
      return (
        <div className="dswf-traj-row dswf-traj-row-tool" role="listitem" data-dswf-traj-row="tool">
          <span className="dswf-traj-who">工具</span>
          <span className="dswf-traj-text">{row.toolName}</span>
          <StateChip className="dswf-traj-phase" status={TOOL_PHASE_LABEL[row.phase]} />
        </div>
      )
    case 'event':
      return (
        <div className="dswf-traj-row dswf-traj-row-event" role="listitem" data-dswf-traj-row="event">
          <span className="dswf-traj-who">系统</span>
          <span className="dswf-traj-text">{row.text}</span>
        </div>
      )
    case 'error':
      return (
        <div className="dswf-traj-row dswf-traj-row-error" role="listitem" data-dswf-traj-row="error">
          <span className="dswf-traj-who">错误</span>
          <span className="dswf-traj-text">{row.text}</span>
        </div>
      )
    default: {
      const exhaustive: never = row
      throw new Error(`dsh-forge web: 未知台账行类：${String((exhaustive as { kind: string }).kind)}`)
    }
  }
}
