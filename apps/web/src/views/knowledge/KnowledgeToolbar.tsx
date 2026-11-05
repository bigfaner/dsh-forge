// 知识浏览工具栏（定位：业务——UF-6 工具栏：关键词搜索 + 状态过滤 chips + 多选功能组 + 范围显示）。
// Hard Rule 官方件复用：输入 = 官方 Input（前导检索图标）、状态片/多选钮 = 官方 Pill、
// 清除钮 = 官方 Button、驳回确认框 = 官方 Modal（SessionArchiveConfirmDialog 同型——清单+数量）。
// Esc 清空 = 原型交互（kb-clear）。
// fix-bug 范围切换：行集 + 拾取回调在场 = 范围 Pill 升格项目切换控件（对话面板
// composer 上方项目选择控件同款官方 Menu 视觉：项目行 + 官方文件夹图标 + 选中态）。
// 菜单 = 纯项目行集（无「添加项目…」入口——添加径归 hero 弹层/左栏「＋」既有入口，
// 产品口径：知识面只做浏览范围切换）；单项目亦可开菜单（切换一致性）。
// P1 项目级文案面不变（范围下钻域级菜单归后续里程碑，PRD UF-6 Notes）。
// knowledge-review-ui（SC-E/SC-F）：状态 chips 接 statusFilter 服务端过滤（零客户端过滤语义）；
// 多选功能组五钮仅多选模式在场——「多选」↔「取消」同位切换 + 已选 N/共 M + 通过/驳回/全选，
// 同刻度胶囊实线描边（语义色：通过 accent / 驳回 error / 其余中性）；驳回必过确认框。
import { useCallback, useState, type ReactNode } from 'react'
import type { EntryStatusFilter } from '@dsh-forge/contracts'
import {
  Button,
  IconChevronDownOutlineRegular,
  IconCloseFillRegular,
  IconFolderCloseRegular,
  IconSearchOutlineRegular,
  Input,
  Menu,
  Modal,
  Pill,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import './knowledge.css'

/** 范围切换行集行（装配面自 forge:projects/list 收敛——archived 排除） */
export interface ScopeProjectOption {
  readonly id: string
  readonly name: string
}

/** 状态过滤 chip 行（官方 Pill——value = EntryStatusFilter 封闭值域） */
export interface StatusChipOption {
  readonly value: EntryStatusFilter
  readonly label: string
}

export interface KnowledgeToolbarProps {
  /** 关键词输入值（过滤态机单一来源——受控件） */
  readonly keyword: string
  /** 关键词变更（原样上抛——细分语义归服务端） */
  readonly onKeywordChange: (keyword: string) => void
  /** 状态过滤片（undefined = 未接入状态过滤面——chips 不在场） */
  readonly statusFilter?: EntryStatusFilter
  /** 状态片变更（原样上抛——过滤语义归服务端 statusFilter） */
  readonly onStatusFilterChange?: (statusFilter: EntryStatusFilter) => void
  /** 多选模式在场（SC-F——缺省 false = 仅「多选」切换钮形态由调用方决定） */
  readonly multiSelectActive?: boolean
  /** 已选条数（勾选集计数——「已选 N / 共 M」的 N） */
  readonly selectedCount?: number
  /** 共 M = 当前过滤结果集计数（SC-F4 全选口径） */
  readonly totalCount?: number
  /** 多选模式切换（同位「多选」↔「取消」） */
  readonly onToggleMultiSelect?: () => void
  /** 全选当前过滤结果集 */
  readonly onSelectAll?: () => void
  /** 批量通过勾选集（免确认框） */
  readonly onConfirmSelected?: () => void
  /** 批量驳回勾选集（本件先弹确认框——清单+数量——确认后才上抛） */
  readonly onRejectSelected?: () => void
  /** 裁决动作在途（通过/驳回禁用防重复提交） */
  readonly actionBusy?: boolean
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

/** 范围切换判据（纯函数）：行集非空 + 回调在场（单项目亦可开——切换一致性） */
export function isScopeSwitchable(
  scopeProjects: readonly ScopeProjectOption[] | undefined,
  onScopePick: ((projectId: string) => void) | undefined,
): boolean {
  return scopeProjects !== undefined && scopeProjects.length > 0 && onScopePick !== undefined
}

/** 切换菜单行集（纯函数）：项目行且仅项目行（文件夹图标行——无添加/分隔行） */
export function scopeMenuEntries(
  scopeProjects: readonly ScopeProjectOption[],
): readonly { readonly id: string; readonly label: string; readonly icon: ReactNode }[] {
  return scopeProjects.map((project) => ({
    id: project.id,
    label: project.name,
    icon: <IconFolderCloseRegular size={16} />,
  }))
}

/** 状态 chips 行集（纯函数——官方 Pill 三片：全部/待审核/已确认，EntryStatusFilter 封闭值域） */
export function statusFilterChips(): readonly StatusChipOption[] {
  return [
    { value: 'all', label: '全部' },
    { value: 'unconfirmed', label: '待审核' },
    { value: 'confirmed', label: '已确认' },
  ]
}

/** 状态 chip 激活判据（纯函数）：当前片 = active（undefined 过滤态 = 仅「全部」零态判 false——装配面传 'all'） */
export function statusChipIsActive(value: EntryStatusFilter, statusFilter: EntryStatusFilter | undefined): boolean {
  return statusFilter !== undefined && statusFilter === value
}

/** 多选计数文案（纯函数——SC-F4：N = 勾选集计数，M = 过滤结果集计数） */
export function selectCountLabel(selectedCount: number, totalCount: number): string {
  return `已选 ${String(selectedCount)} / 共 ${String(totalCount)}`
}

/** 知识浏览工具栏（范围 Pill/切换控件 + 状态 chips + 检索输入 + 条件性清除钮 + 多选功能组） */
export function KnowledgeToolbar({
  keyword,
  onKeywordChange,
  statusFilter,
  onStatusFilterChange,
  multiSelectActive = false,
  selectedCount = 0,
  totalCount = 0,
  onToggleMultiSelect,
  onSelectAll,
  onConfirmSelected,
  onRejectSelected,
  actionBusy = false,
  projectName,
  currentProjectId,
  scopeProjects,
  onScopePick,
}: KnowledgeToolbarProps): ReactNode {
  const switchable = isScopeSwitchable(scopeProjects, onScopePick)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [rejectConfirming, setRejectConfirming] = useState(false)
  const closeScope = useCallback((): void => {
    setScopeOpen(false)
  }, [])
  const handleScopeSelect = useCallback(
    (id: string): void => {
      setScopeOpen(false)
      onScopePick?.(id)
    },
    [onScopePick],
  )
  const actable = onConfirmSelected !== undefined && onRejectSelected !== undefined
  const actableDisabled = selectedCount === 0 || actionBusy

  // 范围面：非切换面 = 纯文本 Pill（原 P1 形态）；切换面 = Menu anchor（官方锚包裹 +
  // 条件列表——闭合期仅触发器在场，开启期列表就地定位）
  const scopeFace = switchable ? (
    <Menu
      open={scopeOpen}
      anchor={
        // D30：原生 title 退役——官方 Tooltip
        <Tooltip label="切换项目范围" portal>
          <Pill
            className="dswf-kn-scope"
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
        </Tooltip>
      }
      items={scopeMenuEntries(scopeProjects!)}
      selectedId={currentProjectId}
      onSelect={handleScopeSelect}
      onClose={closeScope}
      listClassName="dswf-kn-scope-menu"
    />
  ) : (
    <Tooltip label="范围（P1 = 项目级知识）" portal>
      <Pill className="dswf-kn-scope">{scopeLabel(projectName)}</Pill>
    </Tooltip>
  )

  // 状态过滤面（SC-E）：回调在场 = 官方 Pill 三片（服务端 statusFilter——零客户端过滤语义）
  const statusFace =
    onStatusFilterChange === undefined ? null : (
      <div className="dswf-kn-statuschips" role="group" aria-label="状态过滤">
        {statusFilterChips().map((chip) => (
          <Pill
            key={chip.value}
            active={statusChipIsActive(chip.value, statusFilter)}
            className="dswf-kn-statuschip"
            data-dswf-kn-statuschip={chip.value}
            aria-pressed={statusChipIsActive(chip.value, statusFilter)}
            onClick={() => {
              onStatusFilterChange(chip.value)
            }}
          >
            {chip.label}
          </Pill>
        ))}
      </div>
    )

  // 多选功能组（SC-F）：「多选」↔「取消」同位切换常驻右端；功能组四元素仅多选模式在场
  const multiSelectFace = (
    <div className="dswf-kn-multiselect" data-dswf-kn-multiselect="">
      {multiSelectActive ? (
        <>
          <span className="dswf-kn-selcount" data-dswf-kn-selcount="">
            {selectCountLabel(selectedCount, totalCount)}
          </span>
          {actable ? (
            <>
              <Pill
                className="dswf-kn-act is-accent"
                data-dswf-kn-act-confirm=""
                disabled={actableDisabled}
                onClick={onConfirmSelected}
              >
                通过
              </Pill>
              <Pill
                className="dswf-kn-act is-error"
                data-dswf-kn-act-reject=""
                disabled={actableDisabled}
                onClick={() => {
                  setRejectConfirming(true)
                }}
              >
                驳回
              </Pill>
            </>
          ) : null}
          <Pill
            className="dswf-kn-act"
            data-dswf-kn-act-selectall=""
            disabled={actionBusy}
            onClick={onSelectAll}
          >
            全选
          </Pill>
        </>
      ) : null}
      <Pill
        className="dswf-kn-act"
        data-dswf-kn-multiselect-toggle=""
        aria-pressed={multiSelectActive}
        onClick={onToggleMultiSelect}
      >
        {multiSelectActive ? '取消' : '多选'}
      </Pill>
    </div>
  )

  return (
    <div className="dswf-kn-toolbar" data-dswf-kn-toolbar="">
      {scopeFace}
      {statusFace}
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
          <Tooltip label="清除（Esc）" portal>
            <Button
              variant="ghost"
              size="sm"
              className="dswf-kn-searchclear"
              aria-label="清除搜索"
              onClick={() => {
                onKeywordChange('')
              }}
            >
              <IconCloseFillRegular size={14} />
            </Button>
          </Tooltip>
        )}
      </div>
      <div className="dswf-kn-toolbar-tail">
        {multiSelectFace}
      </div>
      <Modal
        open={rejectConfirming}
        onClose={() => {
          setRejectConfirming(false)
        }}
        title={`驳回 ${String(selectedCount)} 条待审核条目？`}
        description="驳回将删除条目文件（不可逆），已确认条目不受影响。"
        closeLabel="关闭"
        className="dswf-kn-reject-modal"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setRejectConfirming(false)
              }}
            >
              取消
            </Button>
            <Button
              variant="primary"
              data-modal-autofocus=""
              onClick={() => {
                setRejectConfirming(false)
                onRejectSelected?.()
              }}
            >
              确认驳回
            </Button>
          </>
        }
      >
        <span>将驳回当前勾选的 {String(selectedCount)} 条条目并删除其文件。</span>
      </Modal>
    </div>
  )
}
