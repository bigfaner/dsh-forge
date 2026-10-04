// 添加项目流程动作装配（定位：业务——UF-3 组装 2.10 交互转移面：依赖注入纯函数，
// renderToStaticMarkup 面测不了的状态转移在此单测——form-actions 同形制）。
// 语义锚：取消 = 安全边界（Hard Rules）——requestClose/cancel 只在取消点窗口内产 finish
// 通知，任何路径都不触达 register；确认执行一次性（beginExecute form 相位守卫——双发
// 第二击、取消点误触、终态重入全部拦截）；register 同步抛经 Promise 归一异步落失败相位
// （不炸流程壳）。fix-14：段一原生选取（官方 __DSH_DIRECTORY_PICKER__ 桥主路径）——
// 在途态防双开对话框 + 取消零副作用 + canonical 对账（listDir 口径）+ 迟到结果守卫。
// fix-16：入口直达编排收口动作面 open()——桥在场冷启（项目树「＋」/ hero CTA 经
// openAddProjectFlow 缝）直入 native-pick 在途（模态不出场），收场 reveal 通知开模态。
import type { RegisterProjectInput, RegisterResult } from '@dsh-forge/contracts'
import { preloadRpcClientFactory } from '../../rpc/index.js'
import { selectionOf, type BrowserSelection } from './browser-model.js'
import type { DirSource } from './dir-source.js'
import { EMPTY_REGISTERED, type NativePickSource } from './dir-picker.js'
import {
  backToBrowser,
  beginExecute,
  beginNativePick,
  closeIntentOf,
  endNativePick,
  failExecute,
  finishExecute,
  initialFlowState,
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
  return (input) => preloadRpcClientFactory().projects.register(input)
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
  /** 模态开面通知（fix-16 冷启直达收场：选中 → 表单相位开模态 / pick·对账失败 → 起源相位带
   * 错误面开；取消不开（干净退出零模态残留）。幂等——模态已开（按钮/repick 路径）时 no-op） */
  readonly reveal?: () => void
  /** 原生选取源（fix-14：桥真身/测试桩；缺省 undefined = 桥缺席——动作面 no-op，View 回退浏览器） */
  readonly nativePick?: NativePickSource
  /** 目录数据源（原生选取 canonical 对账——applyListing 同口径经 listDir 对账；回退浏览器自持数据） */
  readonly dirSource?: DirSource
  /** 已注册路径集合读（原生选中落 form 的挂接预演标记判据） */
  readonly getRegisteredPaths?: () => ReadonlySet<string>
}

/** 流程动作集（AddProjectFlow 装配壳消费；View 回调同形） */
export interface FlowActions {
  /**
   * 流程打开（fix-16 直达编排——openAddProjectFlow 缝的收口路由）：桥在场 = 复位后直入
   * native-pick 在途（模态不出场；选中/失败收场 reveal 通知开模态，取消不开）；桥缺席 =
   * 现行形态（reveal 即开模态、browser 相位内嵌浏览器起步）。入口层在途守卫：native-pick
   * 相位再点 no-op（pick 在途防重入——OS 对话框应用级模态下的防御面）。
   */
  open(): void
  /** 段一确认（初始/重选同径）→ 表单态 */
  pick(selection: BrowserSelection): void
  /**
   * 段一原生选取（fix-14 桥在场主路径）：browser/repick → native-pick 在途 → 系统 OS
   * 目录对话框；选中经 dirSource canonical 对账 → form；取消回落起源相位零副作用；
   * pick/对账失败回落 + 错误文案；双击第二击/迟到结果（相位已离场）全部拦截。
   */
  nativePick(): void
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
  // 段一原生选取在途体（fix-14 收场语义，open/nativePick 两径共享）：选中经 canonical 对账
  // 落 form；取消回落起源零副作用；pick/对账失败回落 + 错误文案；迟到结果相位守卫丢弃。
  // fix-16 直达收场 reveal：冷启直达（模态未开）选中/失败开模态，取消不开——按钮/repick
  // 路径模态已开，reveal 幂等 no-op。
  const runNativePick = (): void => {
    const picker = deps.nativePick
    const dirSource = deps.dirSource
    if (picker === undefined || dirSource === undefined) return // 桥缺席：动作面 no-op（View 已回退浏览器）
    void (async () => {
      try {
        const picked = await picker()
        if (deps.getState().phase !== 'native-pick') return // 迟到守卫：在途收场/重开后结果丢弃
        if (picked === null) {
          // 取消：回落起源相位零副作用（selection 保持——repick 起源表单挂载不丢）
          deps.setState((prev) => endNativePick(prev) ?? prev)
          return
        }
        // canonical 对账：选中路径经 host listDir 对账（applyListing 同口径——不信输入原样；
        // 不可达路径 = listDir 失败走错误面）
        const listing = await dirSource(picked)
        if (deps.getState().phase !== 'native-pick') return // 对账在途收场同样丢弃
        const registered = deps.getRegisteredPaths?.() ?? EMPTY_REGISTERED
        deps.setState((prev) => selectDirectory(prev, selectionOf(listing.path, registered)))
        deps.reveal?.() // 直达落点：模态开在表单相位（选中路径已回填/联动）
      } catch (error) {
        if (deps.getState().phase !== 'native-pick') return
        const message = error instanceof Error ? error.message : String(error)
        deps.setState((prev) => endNativePick(prev, message) ?? prev)
        deps.reveal?.() // 失败：模态开在起源相位带错误面（现行错误面复用）
      }
    })()
  }
  return {
    open: () => {
      // 入口层在途守卫（fix-16）：pick 在途时入口再点 no-op——不复位态机不复跑 pick（防双开
      // 系统对话框；OS 对话框应用级模态下入口交互自然被阻，本守卫为防御面）
      if (deps.getState().phase === 'native-pick') return
      const fresh = initialFlowState()
      if (deps.nativePick === undefined || deps.dirSource === undefined) {
        // 桥缺席回退：现行打开形态零变化——模态即开（reveal）、browser 相位内嵌浏览器起步
        deps.setState(() => fresh)
        deps.reveal?.()
        return
      }
      // 桥在场直达：复位残态后直入 native-pick 在途（模态不出场——beginNativePick(fresh)
      // 必为 browser 起源，收场回 browser；落点成功 reveal 开表单相位模态）
      deps.setState(() => beginNativePick(fresh) ?? fresh)
      runNativePick()
    },
    pick: (selection) => {
      deps.setState((prev) => selectDirectory(prev, selection))
    },
    nativePick: () => {
      if (deps.nativePick === undefined || deps.dirSource === undefined) return // 桥缺席：动作面 no-op（View 已回退浏览器）
      const next = beginNativePick(deps.getState())
      if (next === null) return // 双击第二击/非段一起源相位拦截（在途态防双开系统对话框）
      deps.setState(() => next)
      runNativePick()
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
