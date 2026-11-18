// hero 面板注册面（定位：装配——1.44 自 apps/web 壳侧 plugin.ts registerCenterPanels
// 的 hero 登记迁入本包，fix-13 模式）：官方 main 面板 keyed 槽 'dswf-hero'（ui-layout
// 官方全局面板径——先例 ui-plugin-manager/ui-schedule）。组件 = ForgeHeroPanel（零项目
// 引导面板，HeroEmpty CTA[D 类载体]挂面板内——数据源 Typert forgeProjects，空态引导）。
// 与 knowledge-face.ts 同槽（main keyed）分键并存；门控：hero 不受宿主插件位门控
// （bug 2ffb0a82——仅 knowledge 族受门）。
// bug bd544d59（fix-3）：无壳官方宿主 hero 相位——会话头（官方 ui-sidebar-right
// ExpandButton 唯一载体）缺席 → 右栏永不展开 → 概览不可达（两段注册实际全在座）。
// 修口 = 官方缝复用零平行机制：hero 面板挂「打开右侧边栏」可达面，点击经官方
// ISidebarRight.openTab('dswf-overview') 开概览页（官方语义：docked tab 展开列同步，
// 空根面板走 default-page 规则单入口直接开出）。壳宿主（ShellHost 自有右栏缝）零注入，
// UX 零变化；sidebarRight 缺席/调用异常 = fail-soft 诚实降级。
import { ForgeHeroPanel } from './hero/HeroPanel.js'
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'
import { shellDriverPresentOf } from './hero-panel-drive.js'
import { DSWF_OVERVIEW_TAB_KIND } from './dock-tabs/dock-tabs.js'

/** 产品 hero 面板 key（= main keyed 登记键；壳 panel-model HERO_PANEL_KEY 同源字面量） */
export const HERO_PANEL_KEY = 'dswf-hero'

/** 官方右栏服务消费切片（ISidebarRight.openTab——docked tab 展开列同步，官方正缝） */
export interface SidebarRightOpenTabFace {
  openTab?(kind: string, options?: Record<string, unknown>): void
}

/**
 * hero 相位右栏可达缝工厂（bug bd544d59）：壳在场 = undefined（壳宿主零注入）；无壳
 * 官方宿主 = openTab('dswf-overview') 缝——face/openTab 缺席或调用异常 fail-soft 不炸。
 */
export function heroOpenOverviewOf(
  sidebarRightOf: () => SidebarRightOpenTabFace | undefined,
  shellPresent: boolean,
): (() => void) | undefined {
  if (shellPresent) return undefined
  return () => {
    const face = sidebarRightOf()
    const openTab = face?.openTab
    if (typeof openTab !== 'function') {
      console.warn('[dsh-forge/project] hero open-overview: ctx.sidebarRight.openTab absent——fail-soft 跳过')
      return
    }
    try {
      openTab.call(face, DSWF_OVERVIEW_TAB_KIND)
    } catch (error) {
      console.warn('[dsh-forge/project] hero open-overview 调用失败——fail-soft', error)
    }
  }
}

/**
 * hero 面板注册（apply 编排）：main keyed 'dswf-hero'。选中驱动：壳在场时 ShellHost
 * 选中/让位[C 类桥]；无壳官方宿主 = 空态自判定（hero-panel-drive.ts）。sidebarRightOf
 * 在场（官方宿主）= 额外注入 hero 相位右栏可达缝（inject 期现查壳缝，AGENTS 1.6）。
 * fail-soft 单面 try/catch。
 */
export function registerHeroPanelFace(
  slots: SectionSlotsFace,
  sidebarRightOf?: () => SidebarRightOpenTabFace | undefined,
): boolean {
  try {
    return registerKeyedSection(slots, {
      slot: 'main',
      key: HERO_PANEL_KEY,
      component: ForgeHeroPanel,
      ...(sidebarRightOf !== undefined
        ? {
            inject: () => {
              const openOverview = heroOpenOverviewOf(sidebarRightOf, shellDriverPresentOf())
              return openOverview !== undefined ? { openOverview } : {}
            },
          }
        : {}),
    }) !== undefined
  } catch (error) {
    console.warn('[dsh-forge/project] hero panel face registration failed——降级不注册', error)
    return false
  }
}
