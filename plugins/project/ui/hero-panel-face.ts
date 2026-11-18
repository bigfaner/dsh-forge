// hero 面板注册面（定位：装配——1.44 自 apps/web 壳侧 plugin.ts registerCenterPanels
// 的 hero 登记迁入本包，fix-13 模式）：官方 main 面板 keyed 槽 'dswf-hero'（ui-layout
// 官方全局面板径——先例 ui-plugin-manager/ui-schedule）。组件 = ForgeHeroPanel（零项目
// 引导面板，HeroEmpty CTA[D 类载体]挂面板内——数据源 Typert forgeProjects，空态引导）。
// 与 knowledge-face.ts 同槽（main keyed）分键并存；门控：hero 不受宿主插件位门控
// （bug 2ffb0a82——仅 knowledge 族受门）。
// bug bd544d59（fix-3）：选中驱动单源归壳宿主 ShellHost——插件侧空态自判定退役
// （无壳官方宿主 selectPanel('dswf-hero') 切离会话面 → 官方右栏控制器 require session
// surface 拒 → 右栏全面不可达；空态引导由会话面内 hero picker「添加项目…」/侧栏 CTA 承载）。
import { ForgeHeroPanel } from './hero/HeroPanel.js'
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'

/** 产品 hero 面板 key（= main keyed 登记键；壳 panel-model HERO_PANEL_KEY 同源字面量） */
export const HERO_PANEL_KEY = 'dswf-hero'

/**
 * hero 面板注册（apply 编排）：main keyed 'dswf-hero'——零 inject（面板数据 =
 * Typert forgeProjects 自取）。选中/让位驱动：壳宿主 ShellHost 单驱动（boot 期零项目 →
 * selectPanel('dswf-hero')；注册成功 → selectPanel(null) 回官方会话面）。fail-soft 单面
 * try/catch。
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
