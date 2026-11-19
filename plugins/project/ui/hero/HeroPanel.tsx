// 1.44 随 hero 面板注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 零项目 hero 面板（定位：装配——官方 main 面板 roster 的产品全局面板，fix-25）。
// UF-2 首用引导的降位载体：官方 `main` keyed 槽 key='dswf-hero' 占用者（官方先例 =
// ui-plugin-manager/ui-schedule 全局面板径）；选中/让位：壳在场由 ShellHost 驱动
// （boot 期零项目 → layout.selectPanel('dswf-hero')；注册成功 → selectPanel(null) 回
// 官方会话面——官方 hero 工作区行/输入就地可用，selectWorkspaceViaChip 链路零变化）。
// bug bd544d59（fix-3）：插件侧空态自判定退役——选中驱动单源归 ShellHost（无壳官方宿主
// hero 相位会话面缺席 → 官方右栏控制器 require session surface 拒，右栏全面不可达）。
// 内容本体 = HeroEmpty（纯渲染件——价值一句话 + 「添加项目」CTA，锚不动）。
import type { ReactNode } from 'react'
import { openAddProjectFlow } from '../add-project/flow-open.js'
import { HeroEmpty } from './HeroEmpty.js'
import './hero.css'

/**
 * 零项目 hero 面板（main keyed 'dswf-hero' 占用者——root 作用域，无会话依赖）。
 * 根 = 全高居中舞台（官方 CenterColumn 内自排）；data-dswf-hero-panel = 面板在场锚。
 */
export function ForgeHeroPanel(): ReactNode {
  return (
    <div className="dswf-hero-panel" data-dswf-hero-panel="">
      <HeroEmpty
        onAddProject={() => {
          openAddProjectFlow()
        }}
      />
    </div>
  )
}
