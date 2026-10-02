// 添加项目流程动作装配（定位：业务——UF-3 组装 2.10 交互转移面：依赖注入纯函数，
// renderToStaticMarkup 面测不了的状态转移在此单测——form-actions 同形制）。
// 语义锚：取消 = 安全边界（Hard Rules）——requestClose/cancel 只在取消点窗口内产 finish
// 通知，任何路径都不触达 register；确认执行一次性（beginExecute form 相位守卫——双发
// 第二击、取消点误触、终态重入全部拦截）；register 同步抛经 Promise 归一异步落失败相位
// （不炸流程壳）。
import type { RegisterProjectInput, RegisterResult } from '@dsh-forge/contracts'
import { createForgeRpcClient, preloadTransport } from '../../rpc/index.js'
import type { BrowserSelection } from './browser-model.js'
import {
  backToBrowser,
  beginExecute,
  closeIntentOf,
  failExecute,
  finishExecute,
  selectDirectory,
  toFlowFailure,
  type FlowState,
} from './flow-model.js'

/** 注册执行源（注入面：RPC 真身 rpcRegisterSource() / 测试计数桩） */
export type RegisterSource = (input: RegisterProjectInput) => Promise<RegisterResult>

/**
 * 缺省注册源真身：preload RPC 面（forge:projects/register）。client 构造延迟到调用点——
 * preload 缺席（非 Electron 载体）由 confirm 的 Promise 归一收敛为失败相位，不炸壳。
 */
export function rpcRegisterSource(): RegisterSource {
  return (input) => {
    const client = createForgeRpcClient(preloadTransport())
    return client.projects.register(input)
  }
}

/** 动作依赖（React setState 同形注入——测试替身直落内存） */
export interface FlowActionsDeps {
  readonly register: RegisterSource
  /** 流程态写（函数式更新） */
  readonly setState: (updater: (prev: FlowState) => FlowState) => void
  /** 流程态读（最新——装配壳经 ref 桥接） */
  readonly getState: () => FlowState
  /** 流程收场通知（取消干净退出 / 失败关闭 / 成功自动关闭——宿主据此落模态） */
  readonly finish: () => void
}

/** 流程动作集（AddProjectFlow 装配壳消费；View 回调同形） */
export interface FlowActions {
  /** 段一确认（初始/重选同径）→ 表单态 */
  pick(selection: BrowserSelection): void
  /** 返回上一步（表单态 → 段一重选；表单保持挂载保已填状态） */
  back(): void
  /** 取消点关闭（干净退出——Hard Rules：零 register 零补偿，仅 finish 通知） */
  cancel(): void
  /** Esc/✕/遮罩统一入口（closeIntentOf 三分：cancel → finish；dismiss → finish；ignore no-op） */
  requestClose(): void
  /** 确认执行（form 相位一次性放行 → executing → register → success/failure） */
  confirm(input: RegisterProjectInput): void
}

export function flowActions(deps: FlowActionsDeps): FlowActions {
  return {
    pick: (selection) => {
      deps.setState((prev) => selectDirectory(prev, selection))
    },
    back: () => {
      deps.setState((prev) => backToBrowser(prev))
    },
    cancel: () => {
      // 取消点守卫：非取消点相位（执行中/终态）显式 cancel 亦 no-op
      if (closeIntentOf(deps.getState()) === 'cancel') deps.finish()
    },
    requestClose: () => {
      const intent = closeIntentOf(deps.getState())
      if (intent === 'ignore') return // 执行中不可中断；成功收场 = 自动关闭
      deps.finish()
    },
    confirm: (input) => {
      const next = beginExecute(deps.getState(), input)
      if (next === null) return // 一次性守卫：非 form 相位（双发/取消点/终态）不再放行
      deps.setState(() => next)
      // async 体首段同步执行：register 即时调用（一次性语义的时序半边）；同步抛
      // （transport 缺席等）被 try 捕获，同径异步落失败相位——不炸流程壳
      void (async () => {
        try {
          const result = await deps.register(input)
          deps.setState((prev) => finishExecute(prev, result))
        } catch (error) {
          deps.setState((prev) => failExecute(prev, toFlowFailure(error)))
        }
      })()
    },
  }
}
