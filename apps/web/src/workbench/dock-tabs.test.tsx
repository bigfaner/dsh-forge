// dock-tabs 单测 —— 4.1 右栏两 dock tab 装配体：地址编解码（去重键）+ tabInfo 钩子形制
//（TabInfoReader 子件）+ 概览装配体全相位 SSR（无锚空态/三视图接线/抽屉/转移对话框）+
// 文档 tab body 地址解析。effect 面（事件订阅/详情拉取/桥订阅驱动）归 e2e（5.2）——
// renderToStaticMarkup 零 effect 同全仓口径。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { TaskStatus } from '@dsh-forge/contracts'
import type { RpcClientFactory } from '../rpc/index.js'
import {
  DSWF_DOC_ADDRESS_PREFIX,
  ForgeDocsTab,
  ForgeOverviewTab,
  OverviewDockAssembly,
  TabInfoReader,
  dockDocOpener,
  forgeDocAddress,
  nextTaskFocusApply,
  parseForgeDocAddress,
  type DockTabActionsMirror,
  type UseDockTabInfoMirror,
} from './dock-tabs.js'
import {
  createWorkbenchBridge,
  initialOverviewContext,
  type ForgeCenterNav,
  type WorkbenchBridge,
} from './workbench-bridge.js'

/** 假 RPC client 构造器（装载在途——SSR 无 effect，恒骨架相位） */
const pendingClient = vi.fn() as unknown as RpcClientFactory

const noopNav: ForgeCenterNav = { showKnowledge: () => {}, showSession: () => {} }

/** 建真桥（快照可写回——setOverviewContext 消费面直测） */
function freshBridge(): WorkbenchBridge {
  return createWorkbenchBridge(noopNav)
}

describe('文档 tab 地址编解码（AC3：address(docRel) 去重键）', () => {
  it('前缀 = dsh-resource://dswf-doc/（资源面 scheme——官方 placeResource 恒要求）', () => {
    expect(DSWF_DOC_ADDRESS_PREFIX).toBe('dsh-resource://dswf-doc/')
    expect(forgeDocAddress('p1', 'docs/features/x/proposal.md')).toBe(
      'dsh-resource://dswf-doc/p1/docs/features/x/proposal.md',
    )
  })

  it('roundtrip：encode → parse 还原 projectId + docRel（docRel 含子目录/空格/CJK 原样保持）', () => {
    expect(parseForgeDocAddress(forgeDocAddress('abc-123', 'docs/a.md'))).toEqual({ projectId: 'abc-123', docRel: 'docs/a.md' })
    expect(parseForgeDocAddress(forgeDocAddress('p', 'root.md'))).toEqual({ projectId: 'p', docRel: 'root.md' })
    expect(parseForgeDocAddress(forgeDocAddress('p', 'docs/鲸游 书海/设计.md'))).toEqual({
      projectId: 'p',
      docRel: 'docs/鲸游 书海/设计.md',
    })
  })

  it('parse 拒绝：异前缀地址 / 缺 projectId / 缺 docRel（持久化布局陈旧地址 → 占位面不炸）', () => {
    expect(parseForgeDocAddress('sidebar://guide')).toBeNull()
    expect(parseForgeDocAddress('dsh-resource://dswf-doc/')).toBeNull()
    expect(parseForgeDocAddress('dsh-resource://dswf-doc/p1/')).toBeNull()
    expect(parseForgeDocAddress('dsh-resource://dswf-doc/docs/a.md')).toEqual({ projectId: 'docs', docRel: 'a.md' }) // 首段 = projectId（uuid 无斜杠契约）
  })

  it('同 address 同键（contentId = 地址本身——官方资源面 reveal 去重）；异 docRel 异地址', () => {
    expect(forgeDocAddress('p1', 'a.md')).toBe(forgeDocAddress('p1', 'a.md'))
    expect(forgeDocAddress('p1', 'a.md')).not.toBe(forgeDocAddress('p1', 'b.md'))
    expect(forgeDocAddress('p1', 'a.md')).not.toBe(forgeDocAddress('p2', 'a.md'))
  })
})

describe('dockDocOpener 文档开出动作（AC5：文档行 → dock 开文档 tab）', () => {
  const actions: DockTabActionsMirror = { openResource: vi.fn() }

  it('动作面 + 项目锚齐备 → openResource(地址, {kind:"dswf-doc"})（落本 tab 窗格——官方 tab 自有动作面）', () => {
    const open = dockDocOpener(actions, 'p1')
    expect(open).toBeDefined()
    open!('docs/x/proposal.md')
    expect(actions.openResource).toHaveBeenCalledWith('dsh-resource://dswf-doc/p1/docs/x/proposal.md', {
      kind: 'dswf-doc',
    })
  })

  it('任一缺席 → undefined（概览文档行/抽屉参考 chip 非交互呈现）；官方动作面异常 fail-soft', () => {
    expect(dockDocOpener(undefined, 'p1')).toBeUndefined()
    expect(dockDocOpener(actions, null)).toBeUndefined()
    const throwing: DockTabActionsMirror = {
      openResource: () => {
        throw new Error('no surface')
      },
    }
    expect(() => dockDocOpener(throwing, 'p1')!('a.md')).not.toThrow()
  })
})

describe('TabInfoReader 钩子形制（fix-33 ⑤：可选 tabInfo 钩子经子件无条件调用）', () => {
  it('子件渲染期执行钩子读取并递入 children（渲染递_props）', () => {
    const seen: string[] = []
    const hook: UseDockTabInfoMirror = () => {
      seen.push('read')
      return { tab: { kind: 'dswf-doc', contentId: 'x' } }
    }
    const markup = renderToStaticMarkup(
      <TabInfoReader hook={hook}>{(info) => <span data-seen={info.tab.contentId} />}</TabInfoReader>,
    )
    expect(markup).toContain('data-seen="x"')
    expect(seen).toHaveLength(1)
  })
})

describe('OverviewDockAssembly 概览装配体全相位（AC5：抽屉/对话框/三视图接线）', () => {
  const base = {
    onOpenTask: vi.fn(),
    onCloseDrawer: vi.fn(),
    onOpenTransition: vi.fn(),
    onCloseTransition: vi.fn(),
    makeClient: pendingClient,
  }

  it('无锚（projectId null）= 诚实空态（不猜首个——多项目无会话同文案）；不渲染概览主体', () => {
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly {...base} projectId={null} drawerTaskId={null} transitionTarget={null} />,
    )
    expect(markup).toContain('data-dswf-ov-unanchored')
    expect(markup).toContain('未锚定项目')
    expect(markup).not.toContain('data-dswf-ov-panel')
  })

  it('有锚 = 概览主体（ov-panel + 三子 tab 帧在位）呈现——骨架相位（SSR 零 effect；renderTasksTab 槽随任务子 tab 激活装载）', () => {
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly {...base} projectId="p1" sessionCount={3} drawerTaskId={null} transitionTarget={null} />,
    )
    expect(markup).toContain('data-dswf-ov-panel')
    expect(markup).toContain('data-dswf-ov-subtab="tasks"') // 任务子 tab 在位（三视图装载入口）
    expect(markup).not.toContain('data-dswf-ov-unanchored')
  })

  it('抽屉开（drawerTaskId 在场）= 抽屉壳挂载（data-dswf-td-drawer——装载在途骨架壳）', () => {
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly {...base} projectId="p1" drawerTaskId="t-1" transitionTarget={null} />,
    )
    expect(markup).toContain('data-dswf-td-drawer')
    expect(markup).toContain('data-dswf-td-close')
  })

  it('转移对话框开（transitionTarget 在场）= 对话框挂载（allowedTransitions 唯一源直喂——选项集所见即所得）', () => {
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly
        {...base}
        projectId="p1"
        drawerTaskId={null}
        transitionTarget={{
          task: { taskId: 't-1', slug: 'feat', localId: '2.1', taskStatus: 'pending' },
          allowedTransitions: ['in_progress' as TaskStatus, 'blocked' as TaskStatus],
        }}
      />,
    )
    expect(markup).toContain('data-dswf-td-tr-dialog')
    expect(markup).toContain('data-dswf-td-tr-to')
    expect(markup).not.toContain('data-dswf-td-drawer') // 对话框独立于抽屉（两入口同喂）
  })
})

describe('ForgeOverviewTab 概览 tab body（keyed 占用者）', () => {
  it('桥订阅读锚定上下文：ShellHost 写回 → 概览主体可见（真桥直驱）', () => {
    const bridge = freshBridge()
    bridge.setOverviewContext({ projectId: 'p-anchored', workspaceId: 'w-1', sessionCount: 2 })
    const markup = renderToStaticMarkup(<ForgeOverviewTab bridge={bridge} makeClient={pendingClient} />)
    expect(markup).toContain('data-dswf-ov-panel')
    expect(markup).not.toContain('data-dswf-ov-unanchored')
  })

  it('桥缺席 / 无锚 = 空态降级（fail-soft——不炸 tab body）', () => {
    const markup = renderToStaticMarkup(<ForgeOverviewTab makeClient={pendingClient} />)
    expect(markup).toContain('data-dswf-ov-unanchored')
  })

  it('useTabInfo 在场（seat inject 生产面）不炸渲染；缺席（非壳载体）同径降级', () => {
    const hook: UseDockTabInfoMirror = () => ({
      tab: { kind: 'dswf-overview', contentId: 'sidebar://dswf-overview', actions: { openResource: () => {} } },
    })
    expect(renderToStaticMarkup(<ForgeOverviewTab useTabInfo={hook} makeClient={pendingClient} />)).toContain(
      'data-dswf-ov-unanchored', // 桥缺席 → 无锚（动作面在场不改变锚定来源）
    )
  })
})

describe('ForgeDocsTab 文档 tab body（keyed 占用者）', () => {
  it('useTabInfo 缺席 = null（非壳载体降级——生产面 seat inject 恒递达）', () => {
    expect(renderToStaticMarkup(<ForgeDocsTab />)).toBe('')
  })

  it('合法地址 → DocsTab 呈现（骨架相位——SSR 零 effect）；地址锚 = projectId#docRel', () => {
    const hook: UseDockTabInfoMirror = () => ({
      tab: { kind: 'dswf-doc', contentId: forgeDocAddress('p1', 'docs/features/x/proposal.md') },
    })
    const markup = renderToStaticMarkup(<ForgeDocsTab useTabInfo={hook} makeClient={pendingClient} />)
    expect(markup).toContain('data-dswf-doc-panel')
    expect(markup).toContain('data-dswf-doc-key="p1#docs/features/x/proposal.md"')
  })

  it('陈旧/非法地址（持久化布局携带）= 占位空态不炸 tab', () => {
    const hook: UseDockTabInfoMirror = () => ({ tab: { kind: 'dswf-doc', contentId: 'sidebar://guide' } })
    const markup = renderToStaticMarkup(<ForgeDocsTab useTabInfo={hook} makeClient={pendingClient} />)
    expect(markup).toContain('data-dswf-doc-invalid')
    expect(markup).toContain('文档地址无效')
  })
})

describe('桥概览上下文缝（与 workbench-bridge.test 互补——装配消费面）', () => {
  it('initialOverviewContext = 无锚缺省（桥刚创建——概览 tab 首读不猜）', () => {
    const bridge = freshBridge()
    expect(bridge.getSnapshot().overview).toEqual(initialOverviewContext())
  })
})

describe('任务聚焦消费（4.2 UF-3 流程 7 右栏半段——pill 点击 → 概览 + 抽屉全链路）', () => {
  it('nextTaskFocusApply 纯面：未应用 nonce → 应用；已应用/无聚焦 → null（重复点击 nonce 恒新恒应用）', () => {
    const focus = { taskId: 't-1', featureSlug: 'feat-a', nonce: 3 }
    expect(nextTaskFocusApply(-1, focus)).toBe(focus)
    expect(nextTaskFocusApply(3, focus)).toBeNull() // 已应用同 nonce
    expect(nextTaskFocusApply(3, { ...focus, nonce: 4 })).toEqual({ ...focus, nonce: 4 }) // 重复点击恒新
    expect(nextTaskFocusApply(-1, null)).toBeNull()
  })

  it('装配体聚焦注入（静态面）：挂载即带聚焦 = 任务子 tab 激活（OverviewTab 初始态直取 tasks）+ 抽屉开（drawerTaskId 注入位）', () => {
    // SSR 零 effect → head 缺席（features 空 → TasksTab feature 空态）——聚焦的两静态可观测面：
    // ①初始子 tab = tasks（renderTasksTab 装载 = 空态在场面）②抽屉壳（taskId 经装配递达）
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly
        {...{
          onOpenTask: vi.fn(),
          onCloseDrawer: vi.fn(),
          onOpenTransition: vi.fn(),
          onCloseTransition: vi.fn(),
          makeClient: pendingClient,
        }}
        projectId="p1"
        drawerTaskId="t-42"
        transitionTarget={null}
        taskFocus={{ taskId: 't-42', featureSlug: 'feat-focused', nonce: 1 }}
      />,
    )
    expect(markup).toContain('aria-selected="true" class="dswf-ov-subtab is-active" data-dswf-ov-subtab="tasks"') // ①聚焦 → 任务子 tab
    expect(markup).toContain('暂无任务容器') // renderTasksTab 装载在场面（容器空态——SSR 零 effect 头路缺席）
    expect(markup).toContain('data-dswf-td-drawer') // ②抽屉开（taskId 注入——drawerTaskId 受控面）
  })

  it('聚焦缺席 = 提案子 tab 缺省（初始态不受扰动——用户定向顺序首位）', () => {
    const markup = renderToStaticMarkup(
      <OverviewDockAssembly
        {...{
          onOpenTask: vi.fn(),
          onCloseDrawer: vi.fn(),
          onOpenTransition: vi.fn(),
          onCloseTransition: vi.fn(),
          makeClient: pendingClient,
        }}
        projectId="p1"
        drawerTaskId={null}
        transitionTarget={null}
      />,
    )
    expect(markup).toContain('aria-selected="true" class="dswf-ov-subtab is-active" data-dswf-ov-subtab="proposals"')
  })

  it('桥聚焦直驱（ForgeOverviewTab 面桥缝）：openTaskFocus 写回 → 快照递达面在场（effect 应用归 e2e——renderToStaticMarkup 零 effect 同全仓口径）', () => {
    const bridge = freshBridge()
    bridge.setOverviewContext({ projectId: 'p-anchored', workspaceId: 'w-1' })
    bridge.openTaskFocus({ taskId: 't-9', featureSlug: 'feat-9' })
    expect(bridge.getSnapshot().taskFocus).toEqual({ taskId: 't-9', featureSlug: 'feat-9', nonce: 1 })
    expect(bridge.getSnapshot().overview).toEqual({ projectId: 'p-anchored', workspaceId: 'w-1' }) // 三缝独立互不扰动
    // 概览 body 挂载不炸（taskFocus 经桥订阅递达——消费 effect 归 5.2 e2e）
    expect(() =>
      renderToStaticMarkup(<ForgeOverviewTab bridge={bridge} makeClient={pendingClient} />),
    ).not.toThrow()
  })
})
