// 知识浏览工具栏（定位：业务——UF-6 工具栏：关键词搜索 + 范围显示）。
// Hard Rule 官方件复用：输入 = 官方 Input（前导检索图标）、范围 = 官方 Pill、
// 清除钮 = 官方 Button——本文件零自绘输入控件。Esc 清空 = 原型交互（kb-clear）。
// fix-bug 范围切换：行集 + 拾取回调在场 = 范围 Pill 升格项目切换控件（对话面板
// composer 上方项目选择控件同款语义——HeroWorkspacePicker 同型官方 Menu 复用：
// 项目行（官方文件夹图标 + 选中态）+「添加项目…」footer（openAddProjectFlow
// 同一入口）；单项目亦可开菜单——添加入口恒在。P1 项目级文案面不变（范围下钻
// 域级菜单归后续里程碑，PRD UF-6 Notes）。
import { useCallback, useState, type ReactNode } from 'react'
import {
  Button,
  IconChevronDownOutlineRegular,
  IconCloseFillRegular,
  IconFolderCloseRegular,
  IconPlusOutlineRegular,
  IconSearchOutlineRegular,
  Input,
  Menu,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { openAddProjectFlow } from '../../flows/add-project/flow-open.js'
import './knowledge.css'

/** 切换菜单「添加项目…」行 id（菜单内保留字——项目行 id 恒为 forge 项目 uuid 无碰撞面；HeroWorkspacePicker 同义字面同保留） */
const ADD_PROJECT = 'dswf-add-project'
/** 添加行文案（产品口径——hero 弹层/左栏「＋」入口同义词面） */
const ADD_LABEL = '添加项目…'

/** 范围切换行集行（装配面自 forge:projects/list 收敛——archived 排除） */
export interface ScopeProjectOption {
  readonly id: string
  readonly name: string
}

export interface KnowledgeToolbarProps {
  /** 关键词输入值（过滤态机单一来源——受控件） */
  readonly keyword: string
  /** 关键词变更（原样上抛——细分语义归服务端） */
  readonly onKeywordChange: (keyword: string) => void
  /** 项目名（范围显示——P1 项目级；空串 = 未就绪回退「当前项目」） */
  readonly projectName?: string
  /** 当前浏览锚项目 id（切换菜单选中行——Menu selectedId） */
  readonly currentProjectId?: string
  /** 可切换项目行集（≥1 行 + 回调在场 = 范围 Pill 升格切换控件；archived 排除归装配面） */
  readonly scopeProjects?: readonly ScopeProjectOption[]
  /** 拾取项目（切换浏览锚——显式拾取优先，见 panel-model.pickedProjectAnchor） */
  readonly onScopePick?: (projectId: string) => void
}

/** 范围显示文案（纯函数——P1 项目级；空名回退「当前项目」） */
export function scopeLabel(projectName: string | undefined): string {
  return `项目 · ${projectName === undefined || projectName === '' ? '当前项目' : projectName}`
}

/** Esc 清空判据（纯函数——原型 kb-clear 交互语义） */
export function isEscapeKey(key: string): boolean {
  return key === 'Escape'
}

/** 范围切换判据（纯函数）：行集非空 + 回调在场（单项目亦可开——菜单含添加入口，composer 同语义） */
export function isScopeSwitchable(
  scopeProjects: readonly ScopeProjectOption[] | undefined,
  onScopePick: ((projectId: string) => void) | undefined,
): boolean {
  return scopeProjects !== undefined && scopeProjects.length > 0 && onScopePick !== undefined
}

/** 知识浏览工具栏（范围 Pill/切换控件 + 检索输入 + 条件性清除钮） */
export function KnowledgeToolbar({
  keyword,
  onKeywordChange,
  projectName,
  currentProjectId,
  scopeProjects,
  onScopePick,
}: KnowledgeToolbarProps): ReactNode {
  const switchable = isScopeSwitchable(scopeProjects, onScopePick)
  const [scopeOpen, setScopeOpen] = useState(false)
  const closeScope = useCallback((): void => {
    setScopeOpen(false)
  }, [])
  const handleScopeSelect = useCallback(
    (id: string): void => {
      // 添加行 = 注册流入口（先收菜单再开流——HeroPicker openAdd 同序）；项目行 = 拾取切换
      setScopeOpen(false)
      if (id === ADD_PROJECT) {
        openAddProjectFlow()
        return
      }
      onScopePick?.(id)
    },
    [onScopePick],
  )

  // 范围面：非切换面 = 纯文本 Pill（原 P1 形态）；切换面 = Menu anchor（官方锚包裹 +
  // 条件列表——闭合期仅触发器在场，开启期列表就地定位）
  const scopeFace = switchable ? (
    <Menu
      open={scopeOpen}
      anchor={
        <Pill
          className="dswf-kn-scope"
          title="切换项目范围"
          onClick={() => {
            setScopeOpen(true)
          }}
          aria-haspopup="menu"
          aria-expanded={scopeOpen}
          data-dswf-kn-scope-trigger=""
        >
          <span className="dswf-kn-scope-label">{scopeLabel(projectName)}</span>
          <IconChevronDownOutlineRegular size={12} className="dswf-kn-scope-chevron" />
        </Pill>
      }
      items={scopeProjects!.map((project) => ({
        id: project.id,
        label: project.name,
        icon: <IconFolderCloseRegular size={16} />,
      }))}
      selectedId={currentProjectId}
      onSelect={handleScopeSelect}
      onClose={closeScope}
      footer={[{ id: ADD_PROJECT, label: ADD_LABEL, icon: <IconPlusOutlineRegular size={16} /> }]}
      listClassName="dswf-kn-scope-menu"
    />
  ) : (
    <Pill className="dswf-kn-scope" title="范围（P1 = 项目级知识）">
      {scopeLabel(projectName)}
    </Pill>
  )

  return (
    <div className="dswf-kn-toolbar" data-dswf-kn-toolbar="">
      {scopeFace}
      <div className="dswf-kn-searchrow">
        <Input
          icon={<IconSearchOutlineRegular size={14} />}
          className="dswf-kn-search"
          type="text"
          placeholder="搜索关键词…"
          aria-label="知识关键词搜索"
          value={keyword}
          onChange={(event) => {
            onKeywordChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (isEscapeKey(event.key)) onKeywordChange('')
          }}
        />
        {keyword === '' ? null : (
          <Button
            variant="toolbar"
            size="sm"
            className="dswf-kn-searchclear"
            aria-label="清除搜索"
            title="清除（Esc）"
            onClick={() => {
              onKeywordChange('')
            }}
          >
            <IconCloseFillRegular size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}
