// 视图下拉（定位：业务——M3 4.4 UF-3：M2 三视图控件形态改下拉[ui-design v22 ㉟]——
// pill 右侧·类模式下拉·收窄占位；M2 三视图语义不变：受控 view/onViewChange（切换保持
// 过滤/排序态——过滤/搜索/排序归帧侧单一来源，本组件零本地态透传）。
// 控件 = 官方 Menu（selection='check' 当前项尾随 ✓；onClose 内聚外点关闭/Escape；
// 锚钮 = 当前视图直出 + ▾）。开合受控（open/onOpenChange——4.6 工具栏接线持有，
// feature pill Menu 同形制）。工具栏落位（pill 右侧 + 诊断/派发右簇）= 4.6。
import type { ReactNode } from 'react'
import { Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { TASK_VIEWS, type TaskViewMode } from './task-tab-model.js'
import './task-tab.css'

/** 锚钮 tooltip（ui-design UF-3 概览 tab 宽度行注——M2 三视图语义不变·形态为下拉） */
export const VIEW_DROPDOWN_TITLE = '切换任务视图（列表 / DAG / 泳道）——同 M2 三视图，控件形态为下拉'

/** 三选项（TASK_VIEWS 单源——label 直出菜单行；导出 = 静态测试锚——Menu 开合面
 *  携 portal 材质层[官方 MenuSurface backing]，静态不渲沿 4.2 Modal 同裁） */
export const VIEW_DROPDOWN_ITEMS = TASK_VIEWS.map((view) => ({ id: view.value, label: view.label }))

/** 菜单 id 守卫（未知 id = undefined 不派发——Menu onSelect 防御面） */
export function asTaskViewMode(id: string): TaskViewMode | undefined {
  return TASK_VIEWS.find((view) => view.value === id)?.value
}

export interface ViewDropdownProps {
  /** 当前视图（受控——切换保持过滤/排序态归帧侧） */
  readonly view: TaskViewMode
  /** 菜单开合（受控——4.6 工具栏持有） */
  readonly open: boolean
  /** 视图切换（选项激活——当前项再选 = 同值幂等） */
  readonly onViewChange: (view: TaskViewMode) => void
  /** 开合变化（锚钮点击翻转 + 菜单 onClose[外点/Escape/选中]收拢） */
  readonly onOpenChange: (open: boolean) => void
}

/** 视图下拉（AC1：当前视图直出 + ▾；选项 列表|DAG|泳道 当前项 ✓；外点关闭） */
export function ViewDropdown({ view, open, onViewChange, onOpenChange }: ViewDropdownProps): ReactNode {
  const current = TASK_VIEWS.find((mode) => mode.value === view)?.label ?? view
  return (
    <Menu
      open={open}
      side="bottom"
      items={VIEW_DROPDOWN_ITEMS}
      selectedId={view}
      selection="check"
      listClassName="dswf-tt-viewmenu"
      onClose={() => {
        onOpenChange(false)
      }}
      onSelect={(id) => {
        onOpenChange(false)
        const next = asTaskViewMode(id)
        if (next !== undefined) onViewChange(next)
      }}
      anchor={
        <Tooltip label={VIEW_DROPDOWN_TITLE} portal>
          <button
            type="button"
            className="dswf-tt-viewbtn"
            data-dswf-tt-viewbtn={view}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => {
              onOpenChange(!open)
            }}
          >
            {`视图：${current}`}
            <span className="dswf-tt-viewbtn-caret" aria-hidden="true">
              ▾
            </span>
          </button>
        </Tooltip>
      }
    />
  )
}
