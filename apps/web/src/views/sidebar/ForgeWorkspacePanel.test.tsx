// ForgeWorkspacePanel 单测 —— UF-1 面板相位与行语言（AC3 知识库入口 / AC4 rail 图标 /
// AC5 空态引导 + 会话行渲染）。renderToStaticMarkup 纯渲染面（同 2.6 组件测法）；
// 交互接线（onOpenKnowledge/onSessionActivate → 动作绑定）在 sidebar-actions.test。
// fix-6 增面：头部四件（搜索/视图选项补齐）+ SidebarProjectsZone 受控缝（过滤应用/
// 行内空提示/相位正交——态机在面板层，同 WorkbenchZones→WorkbenchPanel 分层）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ForgeBrandMark, ForgeBrandName } from './ForgeBrand.js'
import {
  ForgeWorkspacePanel,
  SIDEBAR_VIEW_MENU_ITEMS,
  SIDEBAR_VIEW_MENU_SELECTED_ID,
  SidebarFilterRow,
  SidebarProjectsZone,
} from './ForgeWorkspacePanel.js'
import type { SidebarProjectNode } from './sidebar-model.js'

const NOW = 1_700_000_000_000

function node(overrides: Partial<SidebarProjectNode> = {}): SidebarProjectNode {
  return {
    projectId: 'p1',
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

  it('知识库入口行在场（AC3）', () => {
    expect(markup).toContain('data-dswf-nav="knowledge"')
    expect(markup).toContain('知识库')
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

describe('相位（UF-1 States）', () => {
  it('空项目（ready 且空）→ 首用引导指向 hero（AC5）', () => {
    const markup = panel({ tree: [], hasProjects: false })
    expect(markup).toContain('data-dswf-empty')
    expect(markup).toContain('尚未注册项目')
    expect(markup).toContain('添加项目')
  })

  it('项目 RPC 在途 / 账本 pending → 行级骨架（防空态闪现）', () => {
    expect(panel({ projectsPending: true })).toContain('data-dswf-skeleton')
    expect(panel({ loading: true })).toContain('data-dswf-skeleton')
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

describe('收起态 rail（AC4：图标保留悬停提示）', () => {
  it('rail 分支 = 知识库图标钮（aria-label 即悬停提示锚）', () => {
    const markup = panel({ wide: false })
    expect(markup).toContain('data-dswf-sidebar="rail"')
    expect(markup).toContain('aria-label="知识库"')
    // rail 态不渲染宽态内容（项目区/入口行文案缺席）
    expect(markup).not.toContain('dswf-sidebar-projects')
    expect(markup).not.toContain('dswf-sidebar-entry-label')
  })
})

describe('品牌行件（壳品牌行的内容洞位）', () => {
  it('mark：「书 + 闪电」内联 SVG（fix-15）——尺寸随壳请求 + currentColor 单色 + aria-hidden', () => {
    const markup = renderToStaticMarkup(<ForgeBrandMark size={24} />)
    // 母版几何（docs/brand/dsh-forge-mark.svg）：闪电 + 左右书页三路径，viewBox 缩放
    expect(markup).toContain('viewBox="0 0 24 24"')
    expect(markup).toContain('width="24"')
    expect(markup).toContain('height="24"')
    expect(markup).toContain('aria-hidden="true"')
    // 单色纪律（docs/brand 禁用约定）：三路径全 currentColor，零固定色值
    expect(markup.match(/fill="currentColor"/g)).toHaveLength(3)
    // 旧「知」字方块已退役（近黑方块根修对象）
    expect(markup).not.toContain('知')
    // 尺寸随壳请求缩放（品牌行/rail 24，其它请求同型缩放）
    expect(renderToStaticMarkup(<ForgeBrandMark size={16} />)).toContain('width="16"')
  })
  it('name：dsh-forge 字标（自持内容）', () => {
    expect(renderToStaticMarkup(<ForgeBrandName />)).toContain('dsh-forge')
  })
})

describe('头部四件 + 过滤（fix-6：搜索钮/视图选项钮补齐——原型 sb-head 基准）', () => {
  it('头部四件齐且顺序对齐原型：label + 搜索钮 → 视图选项钮 → ＋（既有 add-project 锚不动）', () => {
    const markup = panel({ onAddProject: () => {} })
    expect(markup).toContain('dswf-sidebar-sectionlabel')
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

  it('过滤行缺省收起（默认渲染不含 searchrow / 空提示）', () => {
    const markup = panel()
    expect(markup).not.toContain('data-dswf-searchrow')
    expect(markup).not.toContain('data-dswf-filterempty')
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

  it('视图选项菜单（P1 占位）：「按项目树」当前项 + 后续里程碑说明，无实际排列逻辑', () => {
    expect(SIDEBAR_VIEW_MENU_ITEMS.some((entry) => 'label' in entry && entry.label === '按项目树')).toBe(true)
    expect(SIDEBAR_VIEW_MENU_SELECTED_ID).toBe('tree')
    expect(SIDEBAR_VIEW_MENU_ITEMS.some((entry) => 'text' in entry && entry.text.includes('后续里程碑'))).toBe(true)
  })
})

describe('SidebarProjectsZone 受控缝（fix-6：过滤应用 + 相位正交）', () => {
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
      ...overrides,
    }
    return renderToStaticMarkup(<SidebarProjectsZone {...props} />)
  }

  it('过滤行随 searchOpen 在场（受控展开态）', () => {
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
    expect(zone({ loading: true, query: '索引' })).toContain('data-dswf-skeleton')
    expect(zone({ projectsPending: true, query: '索引' })).toContain('data-dswf-skeleton')
    const err = zone({ projectsError: 'No handler registered', query: '索引' })
    expect(err).toContain('data-dswf-error')
    expect(err).not.toContain('data-dswf-filterempty')
    const empty = zone({ tree: [], hasProjects: false, query: '索引' })
    expect(empty).toContain('data-dswf-empty')
    expect(empty).not.toContain('data-dswf-filterempty')
  })
})
