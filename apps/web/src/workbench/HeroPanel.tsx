// 零项目 hero 面板（定位：装配——官方 main 面板 roster 的产品全局面板，fix-25）。
// UF-2 首用引导的降位载体：官方 `main` keyed 槽 key='dswf-hero' 占用者（官方先例 =
// ui-plugin-manager/ui-schedule 全局面板径）；选中/让位由 ShellHost 的 hero 面板驱动
// （boot 期零项目 → layout.selectPanel('dswf-hero')；注册成功 → selectPanel(null) 回
// 官方会话面——官方 hero 工作区行/输入就地可用，selectWorkspaceViaChip 链路零变化）。
// 内容本体 = HeroEmpty（纯渲染件——价值一句话 + 「添加项目」CTA，锚不动）。
import type { ReactNode } from 'react'
import { openAddProjectFlow } from '../flows/add-project/flow-open.js'
import { HeroEmpty } from './HeroEmpty.js'
import './workbench.css'

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
