// 派发按钮（定位：业务——M3 4.4 UF-3：终态判定纯函数驱动的亮起/置灰 + 点击双路由纯派生）。
// 可用态（ui-design v22 ㊱ / v24 ㊵）：存在未终态（pending/in_progress/blocked/suspended——
// terminal-state.ts 与相位推导机口径同源）→ 亮起可点（**与其它按钮同款式**——无主操作蓝，
// 同 bg/边框/字重·位置居右簇最右）；全终态/零任务 → 置灰（**深灰实底·非透明淡出**——
// css is-off：label-secondary 填充 + bg-base 反色文字，v24 原型 --dsw-fg-2 的官方令牌
// 最近语义映射）。D37：控件自释零气泡——三态载注（v22 ㊱ 置灰说明/装载中/亮起 DAG
// 顺序领取语义）随 D30 机械化包裹退役——置灰形态自释 + 置灰不可点已闭环（零死代码）。
// 双路由（图 13 / v22 ㊲）：执行中任务在场且有其最新派发挂接会话 → jump（openExistingSession
// ——不新建不重发不切模式）；否则 new（openSessionWithPreset 容器对应模式 + autosend
// 「/run-dag-tasks <任务源标识>」指令单行——S5 缓切：known command 经上游 slash 仲裁路由至
// command plane 执行宿主派发循环（新会话即主会话），零新增 RPC·4.1 DISPATCH_COMMAND_PREFIX 串接）。
// 路由执行（RPC taskDetail 取挂接 + 编排器两出口）= 4.6 接线；本件 = 按钮呈现 +
// 路由纯派生（dispatchRouteOf——AC6 双路由分支测试锚）。
// Hard Rule（v22 ㊳）：无单任务直接执行入口——本族组件零任务行/详情动作。
import type { ReactNode } from 'react'
import type { Mode, SessionTaskLinkCard, TaskStats } from '@dsh-forge/contracts'
import { DISPATCH_COMMAND_PREFIX } from '../message-format.js'
import { hasNonTerminalTask } from './terminal-state.js'
import './task-tab.css'

/** 派发指令单行（S5 缓切：`/run-dag-tasks <source-slug>`——known command 路由 command plane 执行宿主派发循环） */
export function dispatchCommandOf(containerSlug: string): string {
  return `${DISPATCH_COMMAND_PREFIX}${containerSlug}`
}

/**
 * 最新派发挂接会话（AC4 跳转目标）：sessions（taskDetail 水化——task_session_links ∪
 * records 双源分型）中 source='link'（claim upsert 派发会话）末位 = 最新；零 link = undefined
 *（执行记录会话不是派发挂接——不可跳）。
 */
export function latestDispatchSessionOf(sessions: readonly SessionTaskLinkCard[]): SessionTaskLinkCard | undefined {
  const links = sessions.filter((session) => session.source === 'link')
  return links[links.length - 1]
}

/** 双路由派生输入（执行中判据与挂接目标 = 4.6 装配侧数据；容器两参 = 当前容器单源） */
export interface DispatchRouteInput {
  /** 执行中任务（runningTaskOf 容器全集产出；缺席 = 无在场派发循环） */
  readonly runningTask?: { readonly taskId: string; readonly slug: string; readonly localId: string }
  /** 执行中任务的最新派发挂接（latestDispatchSessionOf(taskDetail.sessions) 产出） */
  readonly latestDispatchSession?: { readonly sessionId: string }
  /** 容器对应模式（feature → expedition / 突击提案 → blitz） */
  readonly containerMode: Mode
  /** 任务源标识（指令单行参数——command plane 解析为 dispatchTask source 对） */
  readonly containerSlug: string
}

/** 双路由（图 13）：jump = 按会话 id 打开既有派发会话（三不：不新建/不重发/不切模式）；new = 新开（容器对应模式）+ autosend 指令单行 */
export type DispatchRoute =
  | { readonly kind: 'jump'; readonly sessionId: string; readonly taskKey: string }
  | { readonly kind: 'new'; readonly mode: Mode; readonly command: string }

/**
 * 双路由分支（AC4）：执行中在场 **且** 有派发挂接 → jump（会话 id + 任务自然键——
 * toast 指明执行中任务）；否则 new。执行中在场但零挂接（人工 transition 置
 * in_progress 等）→ new：无在场派发循环即无「不重发」约束可违——空跳无意义。
 */
export function dispatchRouteOf(input: DispatchRouteInput): DispatchRoute {
  if (input.runningTask !== undefined && input.latestDispatchSession !== undefined) {
    return {
      kind: 'jump',
      sessionId: input.latestDispatchSession.sessionId,
      taskKey: `${input.runningTask.slug}/${input.runningTask.localId}`,
    }
  }
  return { kind: 'new', mode: input.containerMode, command: dispatchCommandOf(input.containerSlug) }
}

export interface DispatchButtonProps {
  /** 容器任务七态计数（stats 单源——未过滤；undefined = 装载在途置灰） */
  readonly stats: TaskStats | undefined
  /** 派发点击（仅亮起态可发——双路由数据组装与执行归 4.6 接线） */
  readonly onDispatch: () => void
}

/**
 * 派发按钮（AC3）：stats 单源终态判定 → 亮起（同款式 is-on）/ 置灰（深灰实底 is-off）；
 * 固定右簇最右的落位（taskbar-right）= 4.6。
 * D37：控件自释零气泡——「派发」label 自明；置灰态 = 深灰实底自释（D30 机械化
 * 包裹的三态载注随裁决退役——全终态说明由 is-off 深灰实底自释，零死代码残留）。
 */
export function DispatchButton({ stats, onDispatch }: DispatchButtonProps): ReactNode {
  const dispatchable = stats !== undefined && hasNonTerminalTask(stats)
  return (
    <button
      type="button"
      className={dispatchable ? 'dswf-tt-dispatch is-on' : 'dswf-tt-dispatch is-off'}
      data-dswf-tt-dispatch={dispatchable ? 'on' : 'off'}
      disabled={!dispatchable}
      onClick={dispatchable ? onDispatch : undefined}
    >
      派发
    </button>
  )
}
