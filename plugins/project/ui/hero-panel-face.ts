// hero 面板注册面（定位：装配——1.44 自 apps/web 壳侧 plugin.ts registerCenterPanels
// 的 hero 登记迁入本包，fix-13 模式）：官方 main 面板 keyed 槽 'dswf-hero'（ui-layout
// 官方全局面板径——先例 ui-plugin-manager/ui-schedule）。组件 = ForgeHeroPanel（零项目
// 引导面板，HeroEmpty CTA[D 类载体]挂面板内——数据源 Typert forgeProjects，空态引导）。
// 与 knowledge-face.ts 同槽（main keyed）分键并存；门控：hero 不受宿主插件位门控
// （bug 2ffb0a82——仅 knowledge 族受门）。
import { ForgeHeroPanel } from './hero/HeroPanel.js'
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'

/** 产品 hero 面板 key（= main keyed 登记键；壳 panel-model HERO_PANEL_KEY 同源字面量） */
export const HERO_PANEL_KEY = 'dswf-hero'

/**
 * hero 面板注册（apply 编排）：main keyed 'dswf-hero'——零 inject（面板数据 =
// Typert forgeProjects 自取，驱动面：壳在场时 ShellHost 选中/让位[C 类桥]；官方宿主
// 上空态自判定）。fail-soft 单面 try/catch。
 */
export function registerHeroPanelFace(slots: SectionSlotsFace): boolean {
  try {
    return registerKeyedSection(slots, {
      slot: 'main',
      key: HERO_PANEL_KEY,
      component: ForgeHeroPanel,
    }) !== undefined
  } catch (error) {
    console.warn('[dsh-forge/project] hero panel face registration failed——降级不注册', error)
    return false
  }
}
