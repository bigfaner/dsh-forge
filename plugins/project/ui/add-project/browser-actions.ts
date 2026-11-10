// 浏览器动作装配（定位：业务——UF-3 段一交互逻辑面：依赖注入纯函数，renderToStaticMarkup
// 面测不了的转移语义在此单测——sidebar-actions 同形制）。
// 语义锚：导航即时落位 + 选中清零；成功按 host canonical path 对账；失败拦截（导航态保持
// 失败目标 = 重试口径，错误条由相位承载——不出浏览器态 AC4）；竞态守卫仅最新请求落位。
import {
  applyListing,
  navigateTo,
  selectEntry,
  type BrowserState,
} from './browser-model.js'
import { fetchDirListing, type DirSource, type ListingPhase } from './dir-source.js'

/** 动作依赖（React setState 同形注入——测试替身直落内存） */
export interface BrowserActionsDeps {
  readonly source: DirSource
  /** 导航态写（函数式更新） */
  readonly setNav: (updater: (prev: BrowserState) => BrowserState) => void
  /** 列举相位写 */
  readonly setPhase: (phase: ListingPhase) => void
  /** 导航态读（最新——装配壳经 ref 桥接） */
  readonly getNav: () => BrowserState
  /** 列举相位读（最新——装配壳经 ref 桥接） */
  readonly getPhase: () => ListingPhase
}

/** 浏览器动作集（DirectoryBrowser 装配壳消费；View 回调同形） */
export interface BrowserActions {
  /** 列举目标目录（缺省 = 主目录）；双击进入 / 面包屑跳转共用 */
  load(dirPath?: string): void
  /** 单击选中（唯一） */
  select(dirPath: string): void
  /** 上一级（根目录 / 非就绪相位 no-op） */
  up(): void
  /** 错误相位重试（重发失败目标 = nav.cwd；首拉主目录失败 = 缺省请求） */
  retry(): void
}

export function browserActions(deps: BrowserActionsDeps): BrowserActions {
  let seq = 0 // 竞态守卫：仅最新列举请求落位（快速导航丢弃迟到响应）
  const load = (dirPath?: string): void => {
    seq += 1
    const current = seq
    deps.setPhase({ phase: 'loading' })
    deps.setNav((prev) => navigateTo(prev, dirPath))
    void fetchDirListing(deps.source, dirPath).then((outcome) => {
      if (current !== seq) return // 迟到响应丢弃
      if (outcome.phase === 'ready') deps.setNav((prev) => applyListing(prev, outcome.listing))
      // 失败：导航态保持失败目标（retry 口径）——错误条由相位承载，不出浏览器态（AC4）
      deps.setPhase(outcome)
    })
  }
  return {
    load,
    select: (dirPath) => {
      deps.setNav((prev) => selectEntry(prev, dirPath))
    },
    up: () => {
      const phase = deps.getPhase()
      if (phase.phase === 'ready' && phase.listing.parentPath !== null) {
        load(phase.listing.parentPath)
      }
    },
    retry: () => {
      load(deps.getNav().cwd ?? undefined)
    },
  }
}
