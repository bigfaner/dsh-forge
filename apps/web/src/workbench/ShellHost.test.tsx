// ShellHost 单测 —— 常驻壳宿主（fix-25：shell.overlay 槽位件）。
// SSR 首帧 = 装配结构 + 相位锚（效应面零执行归 e2e）；hero 面板驱动 = 纯函数直测
// （一次性守卫 + 边沿让位）；workspace 归属锚 = SSR 钩子读取面（WorkbenchPanel 同形制迁入）。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ForgeShellHost, WorkspacesAnchor, heroPanelDrive } from './ShellHost.js'
import { HERO_PANEL_KEY } from './panel-model.js'

describe('ForgeShellHost SSR 首帧（效应面零执行——装配结构在场）', () => {
  it('无 kit/无 RPC（SSR 首帧）= 校平位相位 + 三锚齐备（workbench/phase/view——e2e 迁移锚）', () => {
    const markup = renderToStaticMarkup(<ForgeShellHost />)
    expect(markup).toContain('data-dswf-workbench')
    expect(markup).toContain('data-dswf-phase="settling"')
    expect(markup).toContain('data-dswf-view="session"')
  })

  it('usePanelInfo 在场：视图镜像随 activePanelId（knowledge 面板 → knowledge 视图）', () => {
    const selectorHook = (state: unknown) => (sel: (s: never) => unknown) => sel(state as never)
    const markup = renderToStaticMarkup(
      <ForgeShellHost usePanelInfo={selectorHook({ activePanelId: 'dswf-knowledge' })} />,
    )
    expect(markup).toContain('data-dswf-view="knowledge"')
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

describe('WorkspacesAnchor workspace 归属锚子件（SSR 渲染期钩子读取面）', () => {
  it('SSR 渲染期执行钩子读取（快照选择器直连）且渲染为 null（效应回调归 e2e）', () => {
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
