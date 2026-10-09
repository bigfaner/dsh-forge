// ShellHost 单测 —— 常驻壳宿主（fix-25：shell.overlay 槽位件；m3.1 D21/D23 增任务详情
// 弹窗宿主——挂载独立于 dock）。
// SSR 首帧 = 装配结构 + 相位锚（效应面零执行归 e2e）；hero 面板驱动 = 纯函数直测
// （一次性守卫 + 边沿让位）；workspace 归属锚 = SSR 钩子读取面（WorkbenchPanel 同形制迁入）。
// fix-33 ⑤：usePanelInfo 内联可选调用 → PanelInfoAnchor 子件（hooks 规则合规）——
// 钩子形制断言 = 子件直测（渲染期读取 + null 渲染），效应上抛面归 e2e。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { ForgeShellHost, PanelInfoAnchor, heroPanelDrive, readActivePanelId } from './ShellHost.js'
import { HERO_PANEL_KEY } from './panel-model.js'
import { createWorkbenchBridge, type ForgeCenterNav } from './workbench-bridge.js'

const noopNav: ForgeCenterNav = { showKnowledge: () => {}, showSession: () => {} }

describe('ForgeShellHost SSR 首帧（效应面零执行——装配结构在场）', () => {
  it('无 kit/无 RPC（SSR 首帧）= 校平位相位 + 三锚齐备（workbench/phase/view——e2e 迁移锚）', () => {
    const markup = renderToStaticMarkup(<ForgeShellHost />)
    expect(markup).toContain('data-dswf-workbench')
    expect(markup).toContain('data-dswf-phase="settling"')
    expect(markup).toContain('data-dswf-view="session"')
  })

  it('usePanelInfo 在场（fix-33 ⑤ 后）：SSR 首帧仍会话视图缺省——activePanelId 经锚子件效应上抛（e2e 面），但渲染不炸、锚挂载在场', () => {
    const selectorHook = (state: unknown) => (sel: (s: never) => unknown) => sel(state as never)
    const markup = renderToStaticMarkup(
      <ForgeShellHost usePanelInfo={selectorHook({ activePanelId: 'dswf-knowledge' })} />,
    )
    expect(markup).toContain('data-dswf-view="session"') // 首帧缺省（效应驱动更新归 e2e）
    expect(markup).toContain('data-dswf-workbench') // 钩子在场不炸渲染（形制合规的本证）
  })

  it('useSessions 在场（4.1 概览锚定输入）：主视图会话锚子件挂载不炸渲染——上下文经效应写桥（e2e 面）', () => {
    const selectorHook = (state: unknown) => (sel: (s: never) => unknown) => sel(state as never)
    const markup = renderToStaticMarkup(
      <ForgeShellHost useSessions={selectorHook({ byId: { 's-1': { id: 's-1', retainedBy: { mainView: 1 } } } })} />,
    )
    expect(markup).toContain('data-dswf-workbench') // MainSessionAnchor 渲染 null——钩子形制不炸
  })

  it('bridge 在场（4.1 概览上下文写回缝 + m3.1 弹窗受控读面）：渲染不炸（写回/订阅归效应——e2e 面）', () => {
    const bridge = createWorkbenchBridge(noopNav)
    const markup = renderToStaticMarkup(<ForgeShellHost bridge={bridge} />)
    expect(markup).toContain('data-dswf-workbench')
  })
})

describe('任务详情弹窗宿主（m3.1 D21/D23：桥 drawerTaskId 受控——挂载独立于 dock）', () => {
  it('桥 drawerTaskId 在场（锚定写回后）= 弹窗壳挂载（data-dswf-td-drawer——装载在途骨架壳）', () => {
    const bridge = createWorkbenchBridge(noopNav)
    bridge.setOverviewContext({ projectId: 'p1', workspaceId: 'w-1' })
    bridge.openTaskDrawer('t-1')
    const markup = renderToStaticMarkup(createElement(ForgeShellHost, { bridge }))
    expect(markup).toContain('data-dswf-td-drawer')
    expect(markup).toContain('data-dswf-td-close')
    expect(markup).toContain('data-dswf-td-head')
  })

  it('桥 drawerTaskId 缺席 = 弹窗零挂载（关闭即卸载——几何不记忆的挂载面）', () => {
    const bridge = createWorkbenchBridge(noopNav)
    bridge.setOverviewContext({ projectId: 'p1', workspaceId: 'w-1' })
    const markup = renderToStaticMarkup(createElement(ForgeShellHost, { bridge }))
    expect(markup).not.toContain('data-dswf-td-drawer')
  })

  it('无锚（projectId null）即便 drawerTaskId 在场 = 弹窗零挂载（受控面诚实降级——不猜项目）', () => {
    const bridge = createWorkbenchBridge(noopNav)
    bridge.openTaskDrawer('t-1')
    const markup = renderToStaticMarkup(createElement(ForgeShellHost, { bridge }))
    expect(markup).not.toContain('data-dswf-td-drawer')
  })
})

describe('PanelInfoAnchor 官方面板信息锚子件（fix-33 ⑤ 钩子形制）', () => {
  it('SSR 渲染期执行钩子读取（选择器直连）且渲染为 null（效应上抛归 e2e）', () => {
    const seen: unknown[] = []
    const markup = renderToStaticMarkup(
      <PanelInfoAnchor
        hook={(sel) => {
          const value = sel({ activePanelId: 'dswf-knowledge' } as never)
          seen.push(value)
          return value
        }}
        onChange={() => {}}
      />,
    )
    expect(markup).toBe('')
    expect(seen).toEqual(['dswf-knowledge'])
  })

  it('readActivePanelId 纯函数：快照窄读 activePanelId；形状漂移/缺省 → null（会话面板缺省）', () => {
    const hook = (state: unknown) => (sel: (s: never) => unknown) => sel(state as never)
    expect(readActivePanelId(hook({ activePanelId: 'dswf-knowledge' }))).toBe('dswf-knowledge')
    expect(readActivePanelId(hook({ activePanelId: null }))).toBeNull()
    expect(readActivePanelId(hook(undefined))).toBeNull() // 非壳载体/形状漂移
    expect(readActivePanelId(hook({}))).toBeNull()
  })
})

describe('heroPanelDrive hero 面板驱动（纯函数：一次性守卫 + 边沿让位）', () => {
  it('相位 hero 且在官方会话面板且未驱动 → 进 hero 面板（boot 期零项目引导）', () => {
    expect(heroPanelDrive('hero', null, false)).toEqual({ panelId: HERO_PANEL_KEY })
  })

  it('已驱动/不在会话面板 → 不动（不与用户导航争用——knowledge 等面板不夺回）', () => {
    expect(heroPanelDrive('hero', null, true)).toBeNull()
    expect(heroPanelDrive('hero', 'dswf-knowledge', false)).toBeNull()
    expect(heroPanelDrive('hero', HERO_PANEL_KEY, false)).toBeNull()
  })

  it('相位离 hero 且在 hero 面板 → 回官方会话面板（首项目落地即让位）；其余不动', () => {
    expect(heroPanelDrive('session', HERO_PANEL_KEY, true)).toEqual({ panelId: null })
    expect(heroPanelDrive('settling', HERO_PANEL_KEY, true)).toEqual({ panelId: null })
    expect(heroPanelDrive('session', null, true)).toBeNull()
    expect(heroPanelDrive('settling', null, false)).toBeNull()
  })
})

// WorkspacesAnchor 归属锚子件测试随件迁至 anchored-projects.test.tsx（fix-36 收敛落点）
