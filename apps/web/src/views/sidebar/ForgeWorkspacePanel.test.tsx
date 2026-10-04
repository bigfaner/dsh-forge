// ForgeWorkspacePanel 单测 —— UF-1 面板相位与行语言（AC5 空态引导 + 会话行渲染）。
// renderToStaticMarkup 纯渲染面（同 2.6 组件测法）；交互接线（onSessionActivate →
// 动作绑定）在 sidebar-actions.test。fix-25：知识入口迁官方 sidebar.panellist 行——
// 本面板知识入口断言随迁（宽态无入口行）。
// fix-6 增面：头部四件（搜索/视图选项补齐）+ SidebarProjectsZone 受控缝（过滤应用/
// 行内空提示/相位正交——态机在面板层，同 WorkbenchZones→WorkbenchPanel 分层）。
// fix-42 增面：rail 图标列（空轨道退役）+ 视图菜单实装（groupBy/archivedFilter）+
// 项目行语言（expandOnRowClick 整行翻转 + 行尾 hover 动作）+ 段头内嵌搜索槽。
// 官方 Menu/Modal 开弹层静态不可渲染（portal——node 无 DOM）：菜单项数据面
// （SIDEBAR_VIEW_MENU_ITEMS / projectMenuItemsOf）与受控缝（SidebarProjectsZone/
// SidebarRail 直接渲染）承载静态断言；开弹层行为归 e2e（fix-24 同裁）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FISH_LOGO_PATH } from '@deepseek-ai/dsh-client-ui-primitives'
import { ForgeBrandMark, ForgeBrandName } from './ForgeBrand.js'
import {
  ForgeWorkspacePanel,
  SIDEBAR_VIEW_MENU_ITEMS,
  SidebarFilterRow,
  SidebarProjectsZone,
  SidebarRail,
  projectMenuItemsOf,
} from './ForgeWorkspacePanel.js'
import {
  SIDEBAR_SECTIONHEAD_SELECTOR,
  shouldCollapseFilterOnBlur,
  type SidebarProjectNode,
  type SidebarView,
} from './sidebar-model.js'

const NOW = 1_700_000_000_000

function node(overrides: Partial<SidebarProjectNode> = {}): SidebarProjectNode {
  return {
    projectId: 'p1',
    workspaceId: 'w1',
    name: '支付网关',
    archived: false,
    sessions: [
      { sessionId: 's1', title: '登录修复', status: 'attention', updatedAt: NOW - 5 * 60_000 },
      { sessionId: 's2', title: '索引重建', status: 'running', updatedAt: NOW - 3 * 3_600_000 },
      { sessionId: 's3', title: '文档补全', status: 'done', updatedAt: NOW - 2 * 86_400_000 },
      { sessionId: 's4', title: '静默会话', status: 'idle', updatedAt: NOW - 30_000 },
    ],
    ...overrides,
  }
}

function panel(overrides: Partial<Parameters<typeof ForgeWorkspacePanel>[0]> = {}): string {
  const props: Parameters<typeof ForgeWorkspacePanel>[0] = {
    wide: true,
    expandSidebar: () => {},
    tree: [node()],
    loading: false,
    currentSessionId: 's1',
    projectsPending: false,
    hasProjects: true,
    now: NOW,
    ...overrides,
  }
  return renderToStaticMarkup(<ForgeWorkspacePanel {...props} />)
}

describe('宽态（AC1/AC2：项目树 + 会话列表行语言）', () => {
  const markup = panel()

  it('知识入口行缺席（fix-25：迁官方 sidebar.panellist 行——本区域纯项目树）', () => {
    expect(markup).not.toContain('data-dswf-nav="knowledge"')
  })

  it('项目区「＋」添加入口在场（UF-3 入口接线点——回调出，触发归槽位接线层）', () => {
    const withEntry = panel({ onAddProject: () => {} })
    expect(withEntry).toContain('data-dswf-nav="add-project"')
    expect(withEntry).toContain('aria-label="添加项目"')
    // fix-17：＋钮图标 = 官方 IconProjectAddOutlineRegular（文件夹+加号——原生 dsh 同款；
    // 官方件 artwork 路径前缀钉形，自绘纯加号退役）
    expect(withEntry).toContain('M5.54492 2.06738')
  })

  it('「＋」入口缺席容忍（onAddProject 未注入 = 不呈现——纯展示件零缺省动作）', () => {
    expect(panel({ onAddProject: undefined })).not.toContain('data-dswf-nav="add-project"')
  })

  it('项目节点（官方 DisclosureRow 形态）+ 会话行四件：状态点/标题/相对时间/选中', () => {
    expect(markup).toContain('data-dswf-project="p1"')
    expect(markup).toContain('data-disclosure-row')
    expect(markup).toContain('data-dswf-session="s1"')
    expect(markup).toContain('data-selected')
    expect(markup).toContain('登录修复')
    expect(markup).toContain('5 分钟前')
    expect(markup).toContain('3 小时前')
    expect(markup).toContain('2 天前')
    expect(markup).toContain('刚刚')
    // 状态点官方语义：attention→warning / running→ongoing / done→done / idle→idle
    expect(markup).toContain('data-state="warning"')
    expect(markup).toContain('data-state="ongoing"')
    expect(markup).toContain('data-state="done"')
    expect(markup).toContain('data-state="idle"')
  })

  it('归档项目弱化标记', () => {
    expect(panel({ tree: [node({ archived: true })] })).toContain('data-archived')
  })
})

describe('项目行语言对齐原生（fix-42：整行翻转 + 行尾 hover 动作——官方 ownRow 同型）', () => {
  const actions = {
    onStartSession: (_workspaceId: string) => {},
    onArchiveToggle: (_projectId: string, _archived: boolean) => {},
  }

  it('expandOnRowClick 官方开关生效：行 role=button + aria-expanded + data-expandable（fix-41 先行修复面收编）', () => {
    const markup = panel(actions)
    expect(markup).toContain('data-expandable')
    expect(markup).toContain('aria-expanded')
    // 整行翻转（row 本体 role=button——官方 treeitem onClick 同语义的官方开关面）
    expect(markup).toContain('role="button"')
  })

  it('当前会话所在项目 active 标记（官方 folderActive 同型——folder 图标染色面）', () => {
    expect(panel(actions)).toContain('data-active')
    expect(panel({ ...actions, currentSessionId: null })).not.toContain('data-active')
  })

  it('行尾动作在场：新会话钮（workspaceId 寻址）+ ellipsis 菜单锚', () => {
    const markup = panel(actions)
    expect(markup).toContain('data-dswf-project-action="new-session"')
    expect(markup).toContain('aria-label="在 支付网关 新建会话"')
    expect(markup).toContain('data-dswf-project-action="menu"')
    expect(markup).toContain('aria-label="项目操作 支付网关"')
  })

  it('动作回调缺席容忍：无新会话/变更回调 = 行尾动作区不呈现（纯展示件零缺省动作）', () => {
    expect(panel()).not.toContain('data-dswf-project-action')
  })

  it('ellipsis 菜单项（数据面）：改名 + 归档切换（随归档态换文案）；删除不出现（fix-27 后续里程碑）', () => {
    const itemIds = (entries: readonly { id?: string }[]): readonly (string | undefined)[] =>
      entries.map((entry) => entry.id)
    const active = projectMenuItemsOf({ archived: false }, true, true)
    expect(itemIds(active)).toEqual(['rename', 'archive'])
    const archived = projectMenuItemsOf({ archived: true }, true, true)
    const archiveEntry = archived.find((entry) => entry.id === 'archive')
    expect(archiveEntry).toMatchObject({ label: '取消归档' })
    // 变更面缺席（回调未注入）= 对应项不出现；全缺席 = 空菜单（行尾动作区整体离场）
    expect(itemIds(projectMenuItemsOf({ archived: false }, false, true))).toEqual(['archive'])
    expect(itemIds(projectMenuItemsOf({ archived: false }, true, false))).toEqual(['rename'])
    expect(projectMenuItemsOf({ archived: false }, false, false)).toEqual([])
  })

  it('改名模态缺省缺席（目标态归面板态机——开弹层行为归 e2e）', () => {
    expect(panel(actions)).not.toContain('data-dswf-rename-input')
  })
})

describe('相位（UF-1 States）', () => {
  it('空项目（ready 且空）→ 首用引导指向 hero（AC5）', () => {
    const markup = panel({ tree: [], hasProjects: false })
    expect(markup).toContain('data-dswf-empty')
    expect(markup).toContain('尚未注册项目')
    expect(markup).toContain('添加项目')
  })

  it('项目 RPC 在途 / 账本 pending → 行级骨架（防空态闪现）', () => {
    expect(panel({ projectsPending: true })).toContain('data-dswf-sidebar-skeleton')
    expect(panel({ loading: true })).toContain('data-dswf-sidebar-skeleton')
  })

  it('项目 RPC 失败 → 错误条 + 重试入口', () => {
    const markup = panel({ projectsError: 'No handler registered', onRetryProjects: () => {} })
    expect(markup).toContain('data-dswf-error')
    expect(markup).toContain('项目列表加载失败')
    expect(markup).toContain('重试')
  })

  it('项目无会话 → 「暂无会话」占位（UF-1 States 会话列表空）', () => {
    expect(panel({ tree: [node({ sessions: [] })] })).toContain('暂无会话')
  })
})

describe('收起态 rail（AC1：图标列非空——fix-42 空轨道退役）', () => {
  const actions = {
    onAddProject: () => {},
    onSessionActivate: (_sessionId: string) => {},
  }

  function rail(overrides: Partial<Parameters<typeof SidebarRail>[0]> = {}): string {
    const props: Parameters<typeof SidebarRail>[0] = {
      tree: [node(), node({ projectId: 'p2', workspaceId: 'w2', name: '文档站', sessions: [] })],
      view: { groupBy: 'tree', archivedFilter: 'default' } satisfies SidebarView,
      currentSessionId: 's1',
      expandSidebar: () => {},
      onSearchOpen: () => {},
      ...actions,
      ...overrides,
    }
    return renderToStaticMarkup(<SidebarRail {...props} />)
  }

  it('面板 rail 分支 = 图标列（非空轨道）：项目 folder 图标 + 搜索钮 + 「＋」在轨', () => {
    const markup = panel({ wide: false, ...actions })
    expect(markup).toContain('data-dswf-sidebar="rail"')
    expect(markup).toContain('data-dswf-rail-project="p1"')
    expect(markup).toContain('data-dswf-search-toggle')
    expect(markup).toContain('data-dswf-nav="add-project"')
    // rail 态不渲染宽态内容（项目区文案/会话行缺席——图标列恒项目口径）
    expect(markup).not.toContain('dswf-sidebar-projects')
    expect(markup).not.toContain('data-dswf-session=')
  })

  it('零会话项目图标在轨（点击 = 仅展开侧栏——首会话选择缺席面）', () => {
    expect(rail()).toContain('data-dswf-rail-project="p2"')
  })

  it('当前会话所在项目 active 标记（官方 folderActive 同型）', () => {
    const markup = rail()
    expect(markup).toContain('data-dswf-rail-project="p1" data-active')
    expect(markup).not.toContain('data-dswf-rail-project="p2" data-active')
  })

  it('归档过滤随视图态共享：hide = 归档项目图标离轨 / only = 仅归档图标', () => {
    const tree = [
      node(),
      node({ projectId: 'p9', workspaceId: 'w9', name: '旧项目', archived: true, sessions: [] }),
    ]
    const hide = rail({ tree, view: { groupBy: 'tree', archivedFilter: 'hide' } })
    expect(hide).not.toContain('data-dswf-rail-project="p9"')
    const only = rail({ tree, view: { groupBy: 'tree', archivedFilter: 'only' } })
    expect(only).toContain('data-dswf-rail-project="p9"')
    expect(only).not.toContain('data-dswf-rail-project="p1"')
  })

  it('搜索钮/「＋」缺席容忍（回调缺席 = 钮不呈现）', () => {
    const markup = rail({ onAddProject: undefined })
    expect(markup).not.toContain('data-dswf-nav="add-project"')
    expect(markup).toContain('data-dswf-search-toggle') // 搜索钮恒在（expandSidebar 壳回调必在）
  })
})

describe('品牌行件（壳品牌行的内容洞位）', () => {
  it('mark：「鲸游书海」内联 SVG（fix-38）——官方鲸几何零拷贝 + 尺寸随壳请求 + currentColor 单色 + aria-hidden', () => {
    const markup = renderToStaticMarkup(<ForgeBrandMark size={24} />)
    // 母版三层（docs/brand/whale-sea-mark.svg）：双层书页浪 + 鲸 + 闪电喷泉，viewBox 缩放
    expect(markup).toContain('viewBox="0 0 24 24"')
    expect(markup).toContain('width="24"')
    expect(markup).toContain('height="24"')
    expect(markup).toContain('aria-hidden="true"')
    // 几何零拷贝（任务①红线）：鲸剪影 = 官方 FISH_LOGO_PATH 经导出面消费（非字面量拷贝）
    expect(markup).toContain(`d="${FISH_LOGO_PATH}"`)
    expect(markup).toContain('transform="translate(5.0 4.9) scale(0.62)"')
    // 产品自有元素照母版内联：书页浪双路径（.88/.6 档）+ 闪电喷泉
    expect(markup).toContain('opacity=".88"')
    expect(markup).toContain('opacity=".6"')
    expect(markup).toContain('M13.0 1.1 11.4 3.5 H12.4 L11.1 5.1 13.8 2.6 H12.8 Z')
    // 单色纪律（docs/brand 禁用约定沿 fix-15）：四路径全 currentColor，零固定色值
    expect(markup.match(/fill="currentColor"/g)).toHaveLength(4)
    // 旧「知」字方块/fix-15「书 + 闪电」几何均已退役（历史档归 docs/brand）
    expect(markup).not.toContain('知')
    expect(markup).not.toContain('M13.6 1.5 9.1 9.7')
    // 尺寸随壳请求缩放（品牌行/rail 24，其它请求同型缩放——16px 可辨锚 = 鲸尾卷 + 闪电）
    expect(renderToStaticMarkup(<ForgeBrandMark size={16} />)).toContain('width="16"')
  })
  it('name：dsh-forge 字标（自持内容）', () => {
    expect(renderToStaticMarkup(<ForgeBrandName />)).toContain('dsh-forge')
  })
})

describe('头部四件 + 过滤（fix-6 + fix-42 段头内嵌搜索槽——官方 searchSlot 形态）', () => {
  it('头部四件齐且顺序对齐原型：label + 搜索钮 → 视图选项钮 → ＋（既有 add-project 锚不动）', () => {
    const markup = panel({ onAddProject: () => {} })
    expect(markup).toContain('dswf-sidebar-sectionlabel')
    expect(markup).toContain('>项目</div>') // 段头标签（tree 缺省）
    const searchBtn = markup.indexOf('data-dswf-search-toggle')
    const viewBtn = markup.indexOf('data-dswf-view-menu')
    const addBtn = markup.indexOf('data-dswf-nav="add-project"')
    expect(searchBtn).toBeGreaterThanOrEqual(0)
    expect(viewBtn).toBeGreaterThanOrEqual(0)
    expect(searchBtn).toBeLessThan(viewBtn) // 原型序：搜索 → 视图 → ＋
    expect(viewBtn).toBeLessThan(addBtn)
    expect(markup).toContain('aria-label="搜索项目与会话"')
    expect(markup).toContain('aria-label="视图选项"')
  })

  it('过滤行缺省收起（默认渲染不含 searchrow / 空提示）——收起态四件齐', () => {
    const markup = panel()
    expect(markup).not.toContain('data-dswf-searchrow')
    expect(markup).not.toContain('data-dswf-filterempty')
    expect(markup).toContain('data-dswf-search-toggle')
    expect(markup).toContain('dswf-sidebar-sectionlabel')
  })

  it('SidebarFilterRow：官方 Input 受控件（value 原样）+ 原型占位/aria 文案（Esc/收起接线归态机层）', () => {
    const markup = renderToStaticMarkup(
      <SidebarFilterRow query="索引" onQueryChange={() => {}} onCollapse={() => {}} />,
    )
    expect(markup).toContain('data-dswf-searchrow')
    expect(markup).toContain('value="索引"')
    expect(markup).toContain('placeholder="过滤项目名 / 会话标题…"')
    expect(markup).toContain('aria-label="项目与会话过滤"')
  })

  it('视图选项菜单（fix-42 实装）：分组二值 + 归档三态；orderBy/手动排序/树嵌套项不出现', () => {
    const ids = SIDEBAR_VIEW_MENU_ITEMS.map((entry) => ('id' in entry ? entry.id : null))
    expect(ids).toContain('tree')
    expect(ids).toContain('flat')
    expect(ids).toContain('default')
    expect(ids).toContain('hide')
    expect(ids).toContain('only')
    // P1 裁剪：orderBy/手动换序/工作区树嵌套不做出现在菜单（不置灰——边界记任务文件）
    expect(ids).not.toContain('manual')
    expect(ids).not.toContain('updated')
    expect(ids).not.toContain('workspace-tree')
    const labels = SIDEBAR_VIEW_MENU_ITEMS.map((entry) => ('label' in entry ? String(entry.label) : null))
    expect(labels).toContain('按项目树')
    expect(labels).toContain('平铺')
    expect(labels).toContain('不含归档')
    expect(labels).toContain('仅归档')
  })
})

describe('过滤行 blur 自动收起（fix-22：失焦收起规格 + 头部钮 blur 竞态守卫口径 a）', () => {
  // 态机行为面照 fix-6/flow-model 形制：renderToStaticMarkup 不可发事件，blur 语义抽
  // 纯裁决函数直测（SidebarFilterRow onBlur → 守卫命中才 onCollapse——与 Esc 同缝，
  // 收起即清空查询由面板态机 onSearchToggle 既有语义承载）
  it('移出即收起：null（点空白无焦点目标）/ 非 Element 目标 / closest 不命中头部容器（BODY/树行/其他区域）', () => {
    expect(shouldCollapseFilterOnBlur(null)).toBe(true)
    // 非 Element 目标（罕见——如 Document）：closest 缺席按移出处理
    expect(shouldCollapseFilterOnBlur({})).toBe(true)
    // BODY / 树行 / 其它区域元素：closest 探测头部容器不命中
    expect(shouldCollapseFilterOnBlur({ closest: () => null })).toBe(true)
  })

  it('头部钮守卫：relatedTarget 在头部钮容器内（搜索钮/视图选项钮/＋）→ 不收起（头部交互保持搜索态）', () => {
    // closest 命中 .dswf-sidebar-sectionhead（含钮自身的 closest 上溯）＝焦点移入头部
    const sectionHeadHost = { closest: () => ({ className: 'dswf-sidebar-sectionhead' }) }
    expect(shouldCollapseFilterOnBlur(sectionHeadHost)).toBe(false)
  })

  // renderToStaticMarkup 面：守卫选择器 ↔ 头部容器 class 互钉（改名即红——守卫契约面）
  it('守卫选择器命中头部容器 class（SIDEBAR_SECTIONHEAD_SELECTOR ↔ sectionhead 元素钉面）', () => {
    const markup = panel()
    expect(markup).toContain(`class="${SIDEBAR_SECTIONHEAD_SELECTOR.slice(1)}"`)
  })
})

describe('SidebarProjectsZone 受控缝（fix-6 过滤 + fix-42 视图应用——相位正交）', () => {
  function zone(overrides: Partial<Parameters<typeof SidebarProjectsZone>[0]> = {}): string {
    const props: Parameters<typeof SidebarProjectsZone>[0] = {
      tree: [node()],
      loading: false,
      currentSessionId: 's1',
      projectsPending: false,
      hasProjects: true,
      onAddProject: () => {},
      now: NOW,
      searchOpen: true,
      onSearchToggle: () => {},
      query: '',
      onQueryChange: () => {},
      viewMenuOpen: false,
      onViewMenuOpenChange: () => {},
      view: { groupBy: 'tree', archivedFilter: 'default' } satisfies SidebarView,
      onViewPick: () => {},
      ...overrides,
    }
    return renderToStaticMarkup(<SidebarProjectsZone {...props} />)
  }

  it('过滤行随 searchOpen 在场（受控展开态——fix-42 段头内嵌：searchrow 锚保持）', () => {
    expect(zone()).toContain('data-dswf-searchrow')
    expect(zone({ searchOpen: false })).not.toContain('data-dswf-searchrow')
  })

  it('过滤即时生效：会话标题命中仅留命中行；全不命中 = 行内「无匹配项目/会话」空提示', () => {
    const hit = zone({ query: '索引' })
    expect(hit).toContain('data-dswf-session="s2"')
    expect(hit).not.toContain('data-dswf-session="s1"')
    expect(hit).not.toContain('data-dswf-filterempty')
    const miss = zone({ query: '不存在' })
    expect(miss).toContain('data-dswf-filterempty')
    expect(miss).toContain('无匹配项目/会话')
    expect(miss).not.toContain('data-dswf-project=')
  })

  it('项目名命中而会话全不命中 → 项目在场 + 行内「无匹配会话」占位（原型 sess-empty-note 同型）', () => {
    const markup = zone({ query: '支付' })
    expect(markup).toContain('data-dswf-project="p1"')
    expect(markup).toContain('无匹配会话')
    expect(markup).not.toContain('暂无会话')
  })

  it('无过滤空项目 → 「暂无会话」占位文案不变（未点名元素保持不变）', () => {
    expect(zone({ tree: [node({ sessions: [] })] })).toContain('暂无会话')
  })

  it('过滤不改变选中态（PRD UF-1 Validation）：过滤隐藏选中行不重置锚，清过滤即恢复可见', () => {
    const filtered = zone({ query: '索引', currentSessionId: 's1' })
    expect(filtered).not.toContain('data-dswf-session="s1"') // 选中行被滤除
    const cleared = zone({ query: '', currentSessionId: 's1' })
    expect(cleared).toContain('data-dswf-session="s1"')
    expect(cleared).toContain('data-selected') // 锚未重置——恢复可见且仍选中
  })

  it('骨架/错误/首用空态相位与过滤正交（相位优先，过滤行在场不干扰）', () => {
    expect(zone({ loading: true, query: '索引' })).toContain('data-dswf-sidebar-skeleton')
    expect(zone({ projectsPending: true, query: '索引' })).toContain('data-dswf-sidebar-skeleton')
    const err = zone({ projectsError: 'No handler registered', query: '索引' })
    expect(err).toContain('data-dswf-error')
    expect(err).not.toContain('data-dswf-filterempty')
    const empty = zone({ tree: [], hasProjects: false, query: '索引' })
    expect(empty).toContain('data-dswf-empty')
    expect(empty).not.toContain('data-dswf-filterempty')
  })
})

describe('SidebarProjectsZone 视图应用（fix-42：groupBy 平铺 + archivedFilter 三态）', () => {
  const twoProjects: readonly SidebarProjectNode[] = [
    node(),
    node({
      projectId: 'p2',
      workspaceId: 'w2',
      name: '文档站',
      archived: true,
      sessions: [
        { sessionId: 's9', title: '归档行', status: 'idle', updatedAt: NOW - 60_000 },
      ],
    }),
  ]

  function zone(overrides: Partial<Parameters<typeof SidebarProjectsZone>[0]> = {}): string {
    const props: Parameters<typeof SidebarProjectsZone>[0] = {
      tree: twoProjects,
      loading: false,
      currentSessionId: 's1',
      projectsPending: false,
      hasProjects: true,
      now: NOW,
      searchOpen: false,
      onSearchToggle: () => {},
      query: '',
      onQueryChange: () => {},
      viewMenuOpen: false,
      onViewMenuOpenChange: () => {},
      view: { groupBy: 'tree', archivedFilter: 'default' } satisfies SidebarView,
      onViewPick: () => {},
      ...overrides,
    }
    return renderToStaticMarkup(<SidebarProjectsZone {...props} />)
  }

  it('tree 缺省：两项目块在场 + 段头标签「项目」', () => {
    const markup = zone()
    expect(markup).toContain('data-dswf-project="p1"')
    expect(markup).toContain('data-dswf-project="p2"')
    expect(markup).toContain('>项目</div>')
    expect(markup).not.toContain('data-dswf-flatlist')
  })

  it('flat：段头标签「会话」（官方 groupBy 切换同型）+ 平铺行跨项目按 updatedAt 降序', () => {
    const markup = zone({ view: { groupBy: 'flat', archivedFilter: 'default' } })
    expect(markup).toContain('>会话</div>')
    expect(markup).toContain('data-dswf-flatlist')
    expect(markup).not.toContain('data-dswf-project=') // 无项目块（树壳退役）
    const order = [
      markup.indexOf('data-dswf-session="s4"'), // 刚刚（最新）
      markup.indexOf('data-dswf-session="s1"'), // 5 分钟前
      markup.indexOf('data-dswf-session="s2"'), // 3 小时前
    ]
    expect(order[0]).toBeLessThan(order[1]!)
    expect(order[1]).toBeLessThan(order[2]!)
  })

  it('flat 过滤：标题/项目名命中；全不命中行内空提示', () => {
    const hit = zone({ view: { groupBy: 'flat', archivedFilter: 'default' }, query: '文档站' })
    expect(hit).toContain('data-dswf-session="s9"') // 项目名命中 → 全行在场
    const miss = zone({ view: { groupBy: 'flat', archivedFilter: 'default' }, query: '不存在' })
    expect(miss).toContain('data-dswf-filterempty')
  })

  it('archivedFilter=hide：归档项目块离场；only：仅归档在场（归档弱化标记随之）', () => {
    const hide = zone({ view: { groupBy: 'tree', archivedFilter: 'hide' } })
    expect(hide).toContain('data-dswf-project="p1"')
    expect(hide).not.toContain('data-dswf-project="p2"')
    const only = zone({ view: { groupBy: 'tree', archivedFilter: 'only' } })
    expect(only).not.toContain('data-dswf-project="p1"')
    expect(only).toContain('data-dswf-project="p2"')
  })

  it('视图菜单触发钮 + 选中面随视图态（selectedIds 官方双选面——闭态锚保持）', () => {
    const markup = zone()
    expect(markup).toContain('data-dswf-view-menu')
    // 闭态 Menu 只渲染锚（portal 开弹层归 e2e——fix-24 同裁）
    expect(markup).not.toContain('按项目树')
  })
})
