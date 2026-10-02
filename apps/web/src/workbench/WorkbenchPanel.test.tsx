// WorkbenchPanel 单测 —— 三区装配（2.12）：相位机（hero 单一条件 Hard Rule）+ 装配渲染面 +
// 工作台桥发布面。SSR 直渲（react-dom/server）：渲染面与纯函数在此断言；效应面（桥发布 /
// 会话锚跟随 / 项目数拉取）经纯发布函数与相位机语义覆盖，实机行为归 e2e（workbench-sc1.spec）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ProjectSummary } from '@dsh-forge/contracts'
import { createShellViewState, dispatchShellView, type ShellViewState } from '../shell/view-state.js'
import type { ProjectsPhase } from '../views/sidebar/use-forge-projects.js'
import { globalDockTab } from '../zones/dock.js'
import {
  chatKitOf,
  ForgeWorkbenchPanel,
  nextLastReadyCount,
  projectAnchorOf,
  sessionAnchorEvent,
  sessionZonePhase,
  WorkbenchAssembly,
  WorkspacesAnchor,
  type SessionZonePhase,
} from './WorkbenchPanel.js'
import { publishWorkbenchBridge, type DshForgeWorkbenchGlobal } from './workbench-bridge.js'

const view = (over: Partial<ShellViewState> = {}): ShellViewState => ({
  ...createShellViewState(),
  ...over,
})

describe('sessionZonePhase 相位机（Hard Rule：hero 仅由项目数驱动——单一条件）', () => {
  it('正零 → hero；≥1 → 会话视图', () => {
    const zero: SessionZonePhase = sessionZonePhase({ lastReadyCount: 0 })
    const one: SessionZonePhase = sessionZonePhase({ lastReadyCount: 1 })
    const five: SessionZonePhase = sessionZonePhase({ lastReadyCount: 5 })
    expect([zero, one, five]).toEqual(['hero', 'session', 'session'])
  })
  it('未就绪且在途 → 校平位（防会话面/hero 闪现跳变）；未就绪且失败 → fail-soft 会话视图（计数未知 ≠ 0，hero 需正零）', () => {
    const pending: SessionZonePhase = sessionZonePhase({ lastReadyCount: null })
    const failed: SessionZonePhase = sessionZonePhase({ lastReadyCount: null, failed: true })
    expect([pending, failed]).toEqual(['settling', 'session'])
  })
  it('就绪后在途/失败保持上一已知相位（注册成功重拉期不闪跳、不残留）', () => {
    const heroKept: SessionZonePhase = sessionZonePhase({ lastReadyCount: 0 })
    const sessionKept: SessionZonePhase = sessionZonePhase({ lastReadyCount: 1, failed: true })
    expect([heroKept, sessionKept]).toEqual(['hero', 'session'])
  })
})

describe('WorkbenchAssembly 三区槽位装配（相位注入纯渲染）', () => {
  const dockTabs = [globalDockTab('start', '开始')]
  const render = (phase: SessionZonePhase, over: Partial<Parameters<typeof WorkbenchAssembly>[0]> = {}): string =>
    renderToStaticMarkup(
      <WorkbenchAssembly
        view={view()}
        phase={phase}
        chatSurface={<b data-t="chat" />}
        knowledge={<b data-t="knowledge" />}
        dockTabs={dockTabs}
        onToggleDock={() => {}}
        onAddProject={() => {}}
        {...over}
      />,
    )

  it('hero 相位：中区呈现 hero（价值一句话 + CTA），无会话面板', () => {
    const markup = render('hero')
    expect(markup).toContain('data-dswf-hero')
    expect(markup).toContain('data-dswf-cta="add-project"')
    expect(markup).not.toContain('dswf-session-panel')
  })
  it('session 相位：SessionPanel 入槽（三 tab + chatSurface 注入）+ dock 角位常显开关', () => {
    const markup = render('session')
    expect(markup).toContain('dswf-session-panel')
    expect(markup).toContain('data-t="chat"')
    expect(markup).toContain('对话')
    expect(markup).toContain('轨迹')
    expect(markup).toContain('知识召回')
    expect(markup).toContain('aria-label="展开右侧栏"')
    expect(markup).not.toContain('data-dswf-hero')
  })
  it('session 相位：召回 tab 注入位落在召回 pane（3.8 装配产物）', () => {
    const markup = render('session', { recall: <b data-t="recall" /> })
    expect(markup).toContain('data-t="recall"')
  })
  it('settling 相位：校平位（aria-busy），无 hero 无会话面板', () => {
    const markup = render('settling')
    expect(markup).toContain('data-dswf-settling')
    expect(markup).not.toContain('data-dswf-hero')
    expect(markup).not.toContain('dswf-session-panel')
  })
  it('知识视图槽 = KnowledgeView 注入（3.8 自 M0 占位填入 UF-6 浏览面）——任何相位下常挂载', () => {
    for (const phase of ['settling', 'hero', 'session'] as const) {
      expect(render(phase)).toContain('data-t="knowledge"')
    }
  })
  it('dock 相位跟随视图态（收起角钮 ↔ 展开角钮文案）', () => {
    const collapsed = render('session', { view: view({ rightDock: false }) })
    const expanded = render('session', { view: view({ rightDock: true }) })
    expect(collapsed).toContain('aria-label="展开右侧栏"')
    expect(expanded).toContain('aria-label="收起右侧栏"')
  })
  it('视图互换渲染（装配经 zones 容器）：知识视图态 = 知识占位可见位、会话槽 hidden', () => {
    const markup = render('session', { view: view({ center: 'knowledge' }) })
    expect(markup).toContain('data-dswf-view="knowledge"')
    expect(markup).toContain('data-dswf-dock="hidden"')
  })
})

describe('sessionAnchorEvent 官方会话锚跟随（UF-5 切回会话视图接缝）', () => {
  it('锚出现/变更 → select-session；无变化/清空 → null', () => {
    expect(sessionAnchorEvent(undefined, undefined)).toBeNull()
    expect(sessionAnchorEvent('s-1', 's-1')).toBeNull()
    expect(sessionAnchorEvent('s-1', undefined)).toBeNull()
    expect(sessionAnchorEvent(undefined, 's-1')).toEqual({ type: 'select-session', sessionId: 's-1' })
    expect(sessionAnchorEvent('s-1', 's-2')).toEqual({ type: 'select-session', sessionId: 's-2' })
  })
  it('事件语义直驱视图态机（回会话视图 + 会话锚定）', () => {
    let state = dispatchShellView(createShellViewState(), { type: 'show-knowledge' })
    const event = sessionAnchorEvent(undefined, 's-9')
    expect(event).not.toBeNull()
    state = dispatchShellView(state, event!)
    expect(state.center).toBe('session')
    expect(state.focus.sessionId).toBe('s-9')
  })
})

describe('nextLastReadyCount 项目数相位计数（注册成功永久让位的机制面）', () => {
  const ready = (n: number): ProjectsPhase => ({
    phase: 'ready',
    projects: Array.from({ length: n }, (_, i) => ({
      id: `p-${i}`,
      workspaceId: `ws-${i}`,
      name: `项目 ${String(i)}`,
      wsPath: `Z:\\ws\\${String(i)}`,
      archived: false,
    })),
  })
  it('ready 取计数；在途/失败保持上一已知（防闪跳/不残留）', () => {
    expect(nextLastReadyCount(null, { phase: 'loading' })).toBeNull()
    expect(nextLastReadyCount(null, { phase: 'error', message: 'x' })).toBeNull()
    expect(nextLastReadyCount(null, ready(0))).toBe(0)
    expect(nextLastReadyCount(null, ready(1))).toBe(1)
    expect(nextLastReadyCount(0, { phase: 'loading' })).toBe(0)
    expect(nextLastReadyCount(1, { phase: 'error', message: 'x' })).toBe(1)
  })
})

describe('projectAnchorOf 当前项目锚推导（3.8：知识视图/召回 tab 范围锚）', () => {
  const project = (id: string, workspaceId: string): ProjectSummary => ({
    id,
    workspaceId,
    name: `项目 ${id}`,
    wsPath: `Z:\\ws\\${id}`,
    archived: false,
  })
  const workspaces = (items: ReadonlyArray<{ workspaceId: string; sessionIds: readonly string[] }>) => ({
    items,
  })
  it('会话锚在场：归属 workspace 名下项目命中', () => {
    const out = projectAnchorOf({
      sessionId: 's-1',
      workspaces: workspaces([{ workspaceId: 'ws-a', sessionIds: ['s-0', 's-1'] }]),
      projects: [project('p-a', 'ws-a'), project('p-b', 'ws-b')],
    })
    expect(out).toBe('p-a')
  })
  it('会话未归属任何 workspace / 快照缺席：唯一项目兜底（单人无歧义相位）', () => {
    const single = [project('p-a', 'ws-a')]
    expect(projectAnchorOf({ sessionId: 's-x', workspaces: workspaces([]), projects: single })).toBe('p-a')
    expect(projectAnchorOf({ sessionId: null, workspaces: null, projects: single })).toBe('p-a')
    expect(projectAnchorOf({ sessionId: null, workspaces: workspaces([{ workspaceId: 'ws-a', sessionIds: [] }]), projects: single })).toBe('p-a')
  })
  it('多项目无会话锚/未匹配 = null（不猜首个——浏览与召回面按无锚降级）', () => {
    const multi = [project('p-a', 'ws-a'), project('p-b', 'ws-b')]
    expect(projectAnchorOf({ sessionId: null, workspaces: null, projects: multi })).toBeNull()
    expect(
      projectAnchorOf({ sessionId: 's-x', workspaces: workspaces([{ workspaceId: 'ws-c', sessionIds: ['s-x'] }]), projects: multi }),
    ).toBeNull()
  })
  it('会话归属 workspace 未注册为项目（裸 workspace 非产品对象）= 不命中该 workspace', () => {
    const out = projectAnchorOf({
      sessionId: 's-1',
      workspaces: workspaces([{ workspaceId: 'ws-bare', sessionIds: ['s-1'] }]),
      projects: [project('p-a', 'ws-a'), project('p-b', 'ws-b')],
    })
    expect(out).toBeNull()
  })
})

describe('chatKitOf 官方会话面 kit 组装（缺席降级判据）', () => {
  const hook = () => undefined
  const factory = () => null
  it('三成员齐备 → 嵌入面；任一缺席 → undefined（降级占位）', () => {
    expect(chatKitOf({})).toBeUndefined()
    expect(chatKitOf({ useSession: hook })).toBeUndefined()
    expect(chatKitOf({ useSession: hook, useSessions: hook })).toBeUndefined()
    expect(chatKitOf({ useSessions: hook, renderFactorySlot: factory })).toBeUndefined()
    const full = chatKitOf({
      sessionId: 's-1',
      useSession: hook,
      useSessions: hook,
      renderFactorySlot: factory,
    })
    expect(full).toMatchObject({ sessionId: 's-1' })
  })
})

describe('ForgeWorkbenchPanel SSR 面板渲染（效应面零执行——装配结构在场）', () => {
  it('无 kit/无 RPC 解析（SSR 首帧）= 校平位相位 + zones 容器装配在场', () => {
    const markup = renderToStaticMarkup(<ForgeWorkbenchPanel />)
    expect(markup).toContain('data-dswf-workbench')
    expect(markup).toContain('data-dswf-phase="settling"')
    expect(markup).toContain('data-dswf-settling')
    expect(markup).toContain('data-dswf-knowledge-view') // 3.8：知识视图槽 = KnowledgeView（M0 占位已替换；settling 相位无会话面板——召回面归 session 相位装配测试）
    expect(markup).toContain('data-dswf-dock="collapsed"')
  })
  it('kit 齐备 + useWorkspaces 在场：面板渲染不炸（SSR 首帧仍校平位——效应面归 e2e；嵌入产物入位见 WorkbenchAssembly/ChatSurface 组）', () => {
    const selectorHook = (state: unknown) => (sel: (s: never) => unknown) => sel(state as never)
    const markup = renderToStaticMarkup(
      <ForgeWorkbenchPanel
        sessionId="s-1"
        useSession={selectorHook({ openState: 'open' })}
        useSessions={selectorHook({ byId: { 's-1': { blank: false } } })}
        useWorkspaces={selectorHook({ items: [] })}
        renderFactorySlot={() => <b data-t="official-chat" />}
      />,
    )
    expect(markup).toContain('data-dswf-workbench')
    expect(markup).toContain('data-dswf-phase="settling"')
  })
  it('workspace 归属锚子件：SSR 渲染期执行钩子读取（快照选择器直连）且渲染为 null（效应回调归 e2e）', () => {
    const seen: unknown[] = []
    const markup = renderToStaticMarkup(
      <WorkspacesAnchor
        hook={(sel) => {
          const value = sel({ items: [] } as never)
          seen.push(value)
          return value
        }}
        onChange={() => {}}
      />,
    )
    expect(markup).toBe('')
    expect(seen).toEqual([{ items: [] }])
  })
})

describe('publishWorkbenchBridge 工作台桥发布面', () => {
  it('发布/撤销 __DSH_FORGE_WORKBENCH__（sidebar-actions 读取缝同键）', () => {
    const g = globalThis as DshForgeWorkbenchGlobal
    const prev = g.__DSH_FORGE_WORKBENCH__
    const dispatchRecord: string[] = []
    publishWorkbenchBridge({ dispatch: (e) => { dispatchRecord.push(String(e.type)) } })
    expect(g.__DSH_FORGE_WORKBENCH__).toBeDefined()
    g.__DSH_FORGE_WORKBENCH__!.dispatch({ type: 'show-knowledge' })
    expect(dispatchRecord).toEqual(['show-knowledge'])
    publishWorkbenchBridge(undefined)
    expect(g.__DSH_FORGE_WORKBENCH__).toBeUndefined()
    if (prev === undefined) delete g.__DSH_FORGE_WORKBENCH__
    else g.__DSH_FORGE_WORKBENCH__ = prev
  })
  it('桥事件语义 = shell/view-state 转移表（发布面透传不解释）', () => {
    let state = createShellViewState()
    publishWorkbenchBridge({ dispatch: (e) => { state = dispatchShellView(state, e) } })
    gDispatch({ type: 'show-knowledge' })
    expect(state.center).toBe('knowledge')
    gDispatch({ type: 'show-session' })
    expect(state.center).toBe('session')
    publishWorkbenchBridge(undefined)
  })
})

const g = globalThis as DshForgeWorkbenchGlobal
function gDispatch(event: Parameters<NonNullable<DshForgeWorkbenchGlobal['__DSH_FORGE_WORKBENCH__']>['dispatch']>[0]): void {
  g.__DSH_FORGE_WORKBENCH__!.dispatch(event)
}
