// 添加项目流程纯模型（定位：业务——UF-3 组装 2.10：两段状态机 + 取消点语义 + 执行/反馈相位）。
// AC 映射：取消点窗口与关闭意图三分（AC1/AC5——isCancelPoint/closeIntentOf，Esc/✕ 仅取消点
// 窗口内有效的机制半边）；一次性执行守卫（AC2——beginExecute 仅 form 相位放行，双发第二击
// null 拦截）；成功/失败落位（AC3/AC4）；typed error 归一 + code → 文案映射（AC4——
// data.compensated 存在 = 补偿已执行，core ForgeErrorData 口径）。
// Hard Rules（取消 = 安全边界）：本模型的取消路径只产「关闭通知」，不触达 register/补偿——
// 调用侧唯一入口 = flow-actions.confirm（form 相位守卫）。
import type { ErrorCode, RegisterProjectInput, RegisterResult } from '@dsh-forge/contracts'
import { RpcClientError } from '../../rpc/index.js'
import type { BrowserSelection } from './browser-model.js'

/** 流程相位（两段浏览器 ⇄ 表单 + 三个流程终局相位；repick = 表单态返回上一步重选） */
export type FlowPhase = 'browser' | 'form' | 'repick' | 'executing' | 'success' | 'failure'

/** 失败信息（typed error 归一——code null = 非 typed 错误；compensated = ④ 补偿已执行） */
export interface FlowFailure {
  readonly code: ErrorCode | null
  readonly message: string
  /** true = RpcErrorPayload.data.compensated 在场（UI 失败反馈的补偿说明口径） */
  readonly compensated: boolean
}

/** 流程状态（零隐藏态：相位 + 段一选定 + 确认载荷 + 执行结果/失败） */
export interface FlowState {
  readonly phase: FlowPhase
  /** 段一选定（form/repick 相位非空；repick 保持 = 段一起始目录锚 + 表单挂载判据） */
  readonly selection: BrowserSelection | null
  /** 最近一次确认载荷（executing 起 in 场——成功反馈展示名依据） */
  readonly input: RegisterProjectInput | null
  readonly result: RegisterResult | null
  readonly failure: FlowFailure | null
}

/** 初始态（流程打开 = 段一浏览器起步） */
export function initialFlowState(): FlowState {
  return { phase: 'browser', selection: null, input: null, result: null, failure: null }
}

/** 段一确认 → 表单态（初始进入与返回上一步重选同径：selection 替换 → 联动判据） */
export function selectDirectory(state: FlowState, selection: BrowserSelection): FlowState {
  return { ...state, phase: 'form', selection }
}

/** 返回上一步（form → repick：selection 保留——表单保持挂载 + 段一起始目录锚）；非 form no-op */
export function backToBrowser(state: FlowState): FlowState {
  return state.phase === 'form' ? { ...state, phase: 'repick' } : state
}

/**
 * 确认执行（form → executing）：非 form 相位返回 null——一次性执行的机制守卫
 * （双发第二击 / 取消点误触 / 终态重入都不再放行 register 调用）。
 */
export function beginExecute(state: FlowState, input: RegisterProjectInput): FlowState | null {
  if (state.phase !== 'form') return null
  return { ...state, phase: 'executing', input }
}

/** 执行成功落位（executing → success） */
export function finishExecute(state: FlowState, result: RegisterResult): FlowState {
  return { ...state, phase: 'success', result }
}

/** 执行失败落位（executing → failure：失败反馈相位，补偿说明随 failure 携带） */
export function failExecute(state: FlowState, failure: FlowFailure): FlowState {
  return { ...state, phase: 'failure', failure }
}

/** 取消点判据：两段对话框任一（browser/form/repick，均在 dsh create 之前） */
export function isCancelPoint(phase: FlowPhase): boolean {
  return phase === 'browser' || phase === 'form' || phase === 'repick'
}

/** 关闭意图（Esc/✕/遮罩统一入口的三分映射） */
export type CloseIntent = 'cancel' | 'dismiss' | 'ignore'

/**
 * 关闭意图映射：取消点 → cancel（干净退出）；失败反馈 → dismiss（事后关闭≠取消，
 * 无副作用同径）；执行中/成功 → ignore（不可交互中断——AC2；成功由自动关闭承载）。
 */
export function closeIntentOf(state: FlowState): CloseIntent {
  if (isCancelPoint(state.phase)) return 'cancel'
  if (state.phase === 'failure') return 'dismiss'
  return 'ignore'
}

/**
 * 模态卡片宽度口径映射（fix-7 回炉：挂点 = 官方 Modal className——落对话框卡片
 * （clsx(css.dialog, className)），fix-3 误挂 contentClassName 内容层致卡片 380 裁切）。
 * 浏览器相位 browser/repick → 加宽 680；表单与终局相位（executing/success/failure）
 * → 基宽 560——宽度刻度见 flow.css `.dswf-ap-dialog` / `.dswf-ap-dialog-wide`。
 */
export function modalClassName(phase: FlowPhase): string {
  return phase === 'browser' || phase === 'repick'
    ? 'dswf-ap-dialog dswf-ap-dialog-wide'
    : 'dswf-ap-dialog'
}

/** typed error 归一：RpcClientError → code + compensated 判定；其余 → code null 原样文案 */
export function toFlowFailure(error: unknown): FlowFailure {
  if (error instanceof RpcClientError) {
    const data = error.data as { compensated?: unknown } | null | undefined
    return {
      code: error.code,
      message: error.message,
      compensated: typeof data?.compensated === 'object' && data.compensated !== null,
    }
  }
  return { code: null, message: error instanceof Error ? error.message : String(error), compensated: false }
}

/** 失败反馈文案（title = 归类；detail = 处置与补偿结果说明——AC4） */
export interface FlowFailureCopy {
  readonly title: string
  readonly detail: string
}

/**
 * typed error code → 失败文案（AC4）：三注册码逐支映射（创建中止无补偿 / 写入失败
 * 补偿已执行·dsh 零孤儿 / 写入失败挂接保护未补偿 / 补偿失败记账对账提示），
 * 未知错误（code null 或非本面码）兜底。补偿口径与 core ForgeErrorData 注释逐行对齐。
 */
export function registerFailureCopy(failure: FlowFailure): FlowFailureCopy {
  switch (failure.code) {
    case 'ERR_WORKSPACE_CREATE':
      return {
        title: 'dsh 工作区创建失败（注册中止）',
        detail: '注册在创建工作区阶段中止，未产生任何写入，无需补偿——请检查目录可用性后重新确认。',
      }
    case 'ERR_PROJECT_WRITE':
      return failure.compensated
        ? {
            title: '应用库写入失败（补偿已执行）',
            detail: '本次创建的 dsh 工作区已自动补偿删除（保目录保会话日志），dsh 侧无残留——可重新确认注册。',
          }
        : {
            title: '应用库写入失败（挂接既有，未补偿）',
            detail: '挂接既有工作区受 ownership 保护，未执行补偿——既有工作区不受影响，可重新确认。',
          }
    case 'ERR_COMPENSATION':
      return {
        title: '补偿执行失败（已记账）',
        detail: '补偿删除失败已记录记账日志，启动对账时将提示孤儿工作区（仅提示不自动删除）。',
      }
    default:
      return {
        title: '注册失败（未预期错误）',
        detail: '发生未预期的错误，注册未完成——可重新确认或稍后重试。',
      }
  }
}
