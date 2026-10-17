// HeroWorkspacePicker 单测（fix-24 ①）——影子占用者接线层静态面。
// 官方 Menu 门户面（open 弹层经 createPortal(document.body)）静态渲染不可达（node 无 DOM，
// 官方 Modal 壳同口径——AddProjectFlow.test 头注惯例）：开弹层行面/添加项/选中高亮 =
// hero-picker-model.test（行集/映射/空集纯函数）+ e2e hero-control spec（真浏览器面）承载。
// 本文件覆盖：闭态零弹层（owner 开合透传）+ owner 契约零本地持有。
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ForgeRpcClient } from '../../rpc/client.js'
import { ForgeHeroWorkspacePicker, createWorktreeOrchestrator } from './HeroWorkspacePicker.js'
import type { HeroWorktreeFace } from './hero-picker-model.js'

function renderPicker(props: Partial<Parameters<typeof ForgeHeroWorkspacePicker>[0]> = {}): string {
  return renderToStaticMarkup(
    <ForgeHeroWorkspacePicker open onPick={() => {}} onClose={() => {}} {...props} />,
  )
}

describe('ForgeHeroWorkspacePicker（conversation.hero.workspace 影子占用者）', () => {
  it('open=false → 弹层不呈现（owner 开合态透传——chip 点击翻转；门户面静态不可达的对照锚）', () => {
    const markup = renderPicker({ open: false })
    expect(markup).not.toContain('role="menu"')
    expect(markup).not.toContain('dswf-hero-picker-list')
    expect(markup).not.toContain('添加项目')
  })

  it('owner 契约零持有：onPick/onClose 经 props 递达（无本地态副本——官方 selectWorkspace 链直通）', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    renderPicker({ open: false, onPick, onClose })
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('anchorRef 缺席不炸（闭态渲染零锚依赖——getAnchorRect 短路 null）', () => {
    const markup = renderPicker({ open: false, anchorRef: undefined })
    expect(markup).not.toContain('role="menu"')
  })
})

// ── 编排缝抽出单测（A7 渲染兜底分离 + bug e678ca5f 主行 reuse 零补绑定）──
describe('createWorktreeOrchestrator（挂靠编排缝——React 解耦的可单测面）', () => {
  const ROOT = 'C:/repo'
  const face = (over: Partial<HeroWorktreeFace> = {}): HeroWorktreeFace => ({
    openSession: vi.fn(),
    blankSessionByCwd: () => 's-blank',
    ...over,
  })
  const deps = (over: {
    worktree?: HeroWorktreeFace | undefined
    rpc?: Partial<ForgeRpcClient['worktree']>
    orchestrateRoot?: string | null
    onNotice?: (text: string) => void
  } = {}) => {
    const onNotice = over.onNotice ?? vi.fn()
    const worktreeRpc = {
      seal: vi.fn().mockResolvedValue({ isGit: true, sealed: false, binding: null }),
      sessionCreate: vi.fn().mockResolvedValue({ sessionId: 's-new' }),
      ...over.rpc,
    }
    return {
      deps: {
        worktree: over.worktree ?? face(),
        makeRpc: () => ({ worktree: worktreeRpc }) as unknown as ForgeRpcClient,
        orchestrateRoot: over.orchestrateRoot !== undefined ? over.orchestrateRoot : ROOT,
        onNotice,
      },
      worktreeRpc,
      onNotice,
    }
  }

  it('bug e678ca5f——主行 blank reuse 零补绑定（活跃会话写句柄被官方持有，attach 结构性必败；绑定由 host 必绑拦截单点保证）→ 直接打开原 blank', async () => {
    const { deps: d, worktreeRpc, onNotice } = deps()
    const sessionId = await createWorktreeOrchestrator(d)(ROOT)
    expect(sessionId).toBe('s-blank')
    expect(worktreeRpc.seal).not.toHaveBeenCalled()
    expect(worktreeRpc.sessionCreate).not.toHaveBeenCalled()
    expect(d.worktree.openSession).toHaveBeenCalledWith('s-blank')
    expect(onNotice).not.toHaveBeenCalled()
  })

  it('树行 blank reuse 同径零编排（预铸自带绑定）→ 打开原 blank', async () => {
    const treePath = 'C:/repo/.worktrees/feat'
    const { deps: d, worktreeRpc } = deps()
    const sessionId = await createWorktreeOrchestrator(d)(treePath)
    expect(sessionId).toBe('s-blank')
    expect(worktreeRpc.sessionCreate).not.toHaveBeenCalled()
    expect(d.worktree.openSession).toHaveBeenCalledWith('s-blank')
  })

  it('A7——orchestrateRoot null（selectedId 无命中，渲染兜底不进编排）→ null + 提示呈现，零 RPC 零编排', async () => {
    const { deps: d, worktreeRpc, onNotice } = deps({ orchestrateRoot: null })
    const openSession = d.worktree.openSession as ReturnType<typeof vi.fn>
    const sessionId = await createWorktreeOrchestrator(d)(ROOT)
    expect(sessionId).toBeNull()
    expect(worktreeRpc.seal).not.toHaveBeenCalled()
    expect(worktreeRpc.sessionCreate).not.toHaveBeenCalled()
    expect(openSession).not.toHaveBeenCalled()
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('未选中'))
  })
})
