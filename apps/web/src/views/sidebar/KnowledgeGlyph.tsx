// 知识面板行字形（定位：业务装配——官方 sidebar.panellist 槽位占用者，fix-25）。
// 官方 PanelRow 行语言：行按钮/aria/激活态/tooltip 全归官方 SidebarRoot——占用者只供
// 字形（ownerProps = { size, active }——官方 renderSlot('sidebar.panellist', {size, active},
// {only: id}) 面包）。图标 = 官方件（IconDeliverDocRegular——原产品知识入口同款，口径对齐）。
import type { ReactNode } from 'react'
import { IconDeliverDocRegular } from '@deepseek-ai/dsh-client-ui-primitives'

/** panellist 占用者 owner props（官方 PanelRow 递达面——结构同型镜像） */
export interface ForgeKnowledgeGlyphProps {
  /** 字形尺寸（宽态 16 / rail 态 18——官方 PanelRow 口径） */
  readonly size?: number
  /** 面板激活态（官方行 aria-current 同源——预留字形态用） */
  readonly active?: boolean
}

/** 知识库面板行字形（官方 PanelRow 内嵌——行本体零自绘） */
export function ForgeKnowledgeGlyph({ size, active }: ForgeKnowledgeGlyphProps): ReactNode {
  return <IconDeliverDocRegular size={size ?? 16} data-active={active ? '' : undefined} />
}
