// 1.44 随 hero 面板注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 零项目 hero 面板（定位：装配——官方 main 面板 roster 的产品全局面板，fix-25）。
// UF-2 首用引导的降位载体：官方 `main` keyed 槽 key='dswf-hero' 占用者（官方先例 =
// ui-plugin-manager/ui-schedule 全局面板径）；选中/让位：壳在场由 ShellHost 驱动
// （boot 期零项目 → layout.selectPanel('dswf-hero')；注册成功 → selectPanel(null) 回
// 官方会话面——官方 hero 工作区行/输入就地可用，selectWorkspaceViaChip 链路零变化）；
// 无壳官方宿主 = 空态自判定（ui/hero-panel-drive.ts——零项目 + 官方缺省面板自选一次）。
// 内容本体 = HeroEmpty（纯渲染件——价值一句话 + 「添加项目」CTA，锚不动）。
// bug bd544d59（fix-3）：openOverview 注入面 = hero 相位右栏可达面（无壳官方宿主会话头
// ExpandButton 载体缺席——点击经官方 openTab('dswf-overview') 开概览并展开右栏）。
import type { ReactNode } from 'react'
import { Button, IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { openAddProjectFlow } from '../add-project/flow-open.js'
import { HeroEmpty } from './HeroEmpty.js'
import './hero.css'

export interface ForgeHeroPanelProps {
  /** hero 相位右栏可达缝（注册面 inject 注入——缺席 = 不渲染，壳宿主零变化） */
  readonly openOverview?: () => void
}

/**
 * 零项目 hero 面板（main keyed 'dswf-hero' 占用者——root 作用域，无会话依赖）。
 * 根 = 全高居中舞台（官方 CenterColumn 内自排）；data-dswf-hero-panel = 面板在场锚；
 * data-dswf-hero-open-overview = 右栏可达面锚（e2e/走查——bug bd544d59）。
 */
export function ForgeHeroPanel({ openOverview }: ForgeHeroPanelProps): ReactNode {
  return (
    <div className="dswf-hero-panel" data-dswf-hero-panel="">
      {openOverview !== undefined && (
        <div className="dswf-hero-rightbar-affordance" data-dswf-hero-open-overview="">
          <Button
            variant="ghost"
            size="sm"
            icon={<IconPanelLeftOutlineRegular />}
            aria-label="打开右侧边栏"
            onClick={openOverview}
          />
        </div>
      )}
      <HeroEmpty
        onAddProject={() => {
          openAddProjectFlow()
        }}
      />
    </div>
  )
}
