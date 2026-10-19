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

// ── 编排缝抽出单测（A7 渲染兜底分离 + 1.27 必绑：主行 reuse 未绑定不作为发送目标）──
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

  it('主行 blank reuse 未绑定（binding null）→ 不复用：sessionCreate 直建绑定会话（1.27 必绑——无绑定 blank 不作发送目标）', async () => {
    const { deps: d, worktreeRpc, onNotice } = deps()
    const sessionId = await createWorktreeOrchestrator(d)(ROOT)
    expect(worktreeRpc.seal).toHaveBeenCalledWith({ sessionId: 's-blank' })
    expect(worktreeRpc.sessionCreate).toHaveBeenCalledWith({ worktreePath: ROOT })
    expect(d.worktree.openSession).toHaveBeenCalledWith('s-new')
    expect(sessionId).toBe('s-new')
    expect(onNotice).not.toHaveBeenCalled()
  })

  it('主行 blank reuse 已绑定（binding 在场）→ 打开原 blank 零新建（复用去重保留）', async () => {
    const { deps: d, worktreeRpc } = deps({
      rpc: { seal: vi.fn().mockResolvedValue({ isGit: true, sealed: false, binding: { worktreePath: ROOT, branch: 'main' } }) },
    })
    const sessionId = await createWorktreeOrchestrator(d)(ROOT)
    expect(worktreeRpc.sessionCreate).not.toHaveBeenCalled()
    expect(d.worktree.openSession).toHaveBeenCalledWith('s-blank')
    expect(sessionId).toBe('s-blank')
  })

  it('主行 seal 判读失败 → fail-closed 按未绑定降级 sessionCreate + 降级提示（A8——不返回无绑定 blank）', async () => {
    const { deps: d, worktreeRpc, onNotice } = deps({ rpc: { seal: vi.fn().mockRejectedValue(new Error('seal boom')) } })
    const sessionId = await createWorktreeOrchestrator(d)(ROOT)
    expect(sessionId).toBe('s-new')
    expect(worktreeRpc.sessionCreate).toHaveBeenCalledWith({ worktreePath: ROOT })
    expect(d.worktree.openSession).toHaveBeenCalledWith('s-new')
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('降级'))
  })

  it('树行 blank reuse 直接打开（零 seal——树行绑定由首条消息时点 host 必绑拦截保证）', async () => {
    const treePath = 'C:/repo/.worktrees/feat'
    const { deps: d, worktreeRpc } = deps()
    const sessionId = await createWorktreeOrchestrator(d)(treePath)
    expect(worktreeRpc.seal).not.toHaveBeenCalled()
    expect(worktreeRpc.sessionCreate).not.toHaveBeenCalled()
    expect(d.worktree.openSession).toHaveBeenCalledWith('s-blank')
    expect(sessionId).toBe('s-blank')
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
