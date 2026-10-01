// ForgeWorkspacePanel 单测 —— UF-1 面板相位与行语言（AC3 知识库入口 / AC4 rail 图标 /
// AC5 空态引导 + 会话行渲染）。renderToStaticMarkup 纯渲染面（同 2.6 组件测法）；
// 交互接线（onOpenKnowledge/onSessionActivate → 动作绑定）在 sidebar-actions.test。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ForgeBrandMark, ForgeBrandName } from './ForgeBrand.js'
import { ForgeWorkspacePanel } from './ForgeWorkspacePanel.js'
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
  it('mark：尺寸随壳请求 + 「知」字标', () => {
    const markup = renderToStaticMarkup(<ForgeBrandMark size={24} />)
    expect(markup).toContain('知')
    expect(markup).toContain('width:24px')
    expect(markup).toContain('height:24px')
  })
  it('name：dsh-forge 字标（自持内容）', () => {
    expect(renderToStaticMarkup(<ForgeBrandName />)).toContain('dsh-forge')
  })
})
