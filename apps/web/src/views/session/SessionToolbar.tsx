// 会话面板头部 titleRow 行（fix-9 建立 / fix-13 融合）——对齐 dsh 布局：官方
// conversation.session.header 槽位的 titleRow 行语言（lineage 血统簇 + actions 动作区 +
// utilities 工具簇 + corner 角位四座），经官方件组合承载（Button toolbar/sm + 官方图标
// ——Hard Rule 官方件复用优先）。fix-13 起 titleRow 与页签行融合为 .dswf-session-header
// 一体头部单元（本组件根 = titleRow 座行，容器刻度/发线归 SessionPanel 头部容器——
// 「浮一条工具栏 + 一个页签控件」两截形态退役；页签行语言决策变更：SegmentedTabs 分段
// 控件 → 官方 ConversationRoot .tabs 扁平页签，注记见 SessionPanel.tsx 头）。
// 装配路径裁决（fix-9 Implementation Notes 两路径，以 S2 槽面清点为准）：
//   嵌入配方（conversation.content variant=embedded）不透出 header 槽位——upstream
//   ui-conversation ConversationContent（lib/client.js data-conversation-content 产物树）
//   仅渲染 body/composer；header 链（conversation.header → conversation.session.header
//   五子槽）由官方 main.conversation 占用者 ConversationRoot/ConversationMainPanel 渲染，
//   而该洞位已被产品工作台影子替换（client-plugin/plugin.ts -100）。直填官方
//   session.header 槽位亦不可行：官方占用者 ConversationSessionHeader 自带 tabs 行
//   （showTabs = !hideChrome && tabs.length>1——官方 roster chat+trajectory 恒 2），与本
//   面板三页签（PRD UF-4 终裁形态 (a)）叠加成平行页签行，违 Hard Rule「三页签形态零变化」
//   → 取「官方件组合在 SessionPanel 内组装」路径。
// 行刻度 = 官方 ConversationRoot.module.css titleRow 镜像（titleRow min-height 30 /
// header 内衬 10-28-0-20（fix-13 迁容器）/ titleCluster gap 10 / headerUtilities gap 8 +
// margin-left 20 / crumb current 主色 500——session.css dsw-raw 注记逐处说明）。
// P1 最简面：lineage = 当前会话标题（官方 sessions 账本 displayTitle 直读——SC2 零缓存，
// sidebar-model 会话头同源字段；无会话 = 空位不猜标题）；actions = 空位保留（M2 任务域）；
// utilities = 「在编辑器中打开工作区」占位钮（title 注明；动作归后续里程碑——宿主
// shell.openPath 能力面届时裁决）；corner = 面板钮（右栏收展 toggle，原
// .dswf-workbench-docktoggle 角位绝对定位钮迁入归位——原型 conv-corner 同位同义，
// dispatch('toggle-right-dock') 同径；图标 = 官方 ui-sidebar-right ExpandButton 同式
// PanelLeft + scaleX(-1) 右栏语义镜像）。
// hero 相位让位（原型 .conv-root[data-phase=hero] .conv-title-row 退场同语义 + 官方
// blank 相位 hideChrome 行为）：标题簇与 utilities 让位，corner 座独存（官方 corner
// 常驻语义 + 产品 dock 角位常显开关既有口径——e2e L59 session 相位实钮锚）。
// 相位标记 = data-dswf-toolbar-hero（独立命名空间——data-dswf-hero 为 HeroEmpty 专属锚）。
import type { ReactNode } from 'react'
import { Button, IconFolderOpenRegular, IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import './session.css'

export interface SessionToolbarProps {
  /** 会话标题（官方 sessions 账本 displayTitle 直读；undefined = 无会话空位） */
  readonly title?: string
  /** hero 相位（官方会话面相位：无选中会话/空白会话）——true = 标题簇与 utilities 让位 */
  readonly hero?: boolean
  /** 右栏展开态（面板钮 aria/title 语义源） */
  readonly dockOpen: boolean
  /** 面板钮收展回调（装配绑定 dispatch('toggle-right-dock')——原角位钮同径迁移） */
  readonly onToggleDock: () => void
}

/**
 * 会话面板顶部 toolbar（官方件组合——Button toolbar/sm + 官方图标；行刻度官方 titleRow
 * 镜像）。hero 相位 = 官方 blank 相位同语义让位：标题簇整簇空置、utilities 退场，corner
 * 座（面板钮）独存——不与官方 hero 空会话引导争位，右栏收展入口不失。
 */
export function SessionToolbar({ title, hero = false, dockOpen, onToggleDock }: SessionToolbarProps): ReactNode {
  return (
    <div
      className="dswf-session-toolbar"
      data-dswf-session-toolbar=""
      data-dswf-toolbar-hero={hero ? '' : undefined}
      data-dswf-wco={dockOpen ? undefined : 'avoid'}
    >
      {/* 标题簇（官方 titleCluster 座——flex:1 常渲染保右对齐，hero 相位内容让位置空） */}
      <div className="dswf-session-toolbar-cluster">
        {hero ? null : (
          <>
            {/* lineage（P1 最简：当前会话标题——feature/会话位置面包屑归 M2 任务域） */}
            <nav className="dswf-session-lineage" aria-label="会话标题">
              {title === undefined ? null : (
                <span className="dswf-session-title" data-dswf-session-title="">
                  {title}
                </span>
              )}
            </nav>
            {/* actions 槽位保留（P1 空位——官方 headerActions 座，M2 动作件归位处） */}
            <div className="dswf-session-actions" />
          </>
        )}
      </div>
      {/* utilities 簇（官方 headerUtilities 座——hero 相位整簇让位，官方 blank 同语义） */}
      {hero ? null : (
        <div className="dswf-session-utils">
          {/* 在编辑器中打开工作区：P1 占位钮（title 注明；动作实现归后续里程碑） */}
          <Button
            variant="toolbar"
            size="sm"
            className="dswf-session-utility"
            data-dswf-utility="open-in-editor"
            aria-label="在编辑器中打开工作区"
            title="在编辑器中打开工作区（动作即将接入）"
            icon={<IconFolderOpenRegular size={16} />}
          />
        </div>
      )}
      {/* corner 座（官方 headerCorner 语义——常驻控制位，blank/hero 相位独存） */}
      <div className="dswf-session-corner">
        <Button
          variant="toolbar"
          size="sm"
          className="dswf-workbench-docktoggle"
          data-dswf-utility="panel-toggle"
          aria-label={dockOpen ? '收起右侧栏' : '展开右侧栏'}
          title={dockOpen ? '收起右侧栏' : '展开右侧栏'}
          onClick={onToggleDock}
          icon={<IconPanelLeftOutlineRegular size={16} className="dswf-session-panelicon" />}
        />
      </div>
    </div>
  )
}
