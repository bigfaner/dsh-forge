// 1.7 扩展点注入装配（插件侧）：注入缝解析（config 覆写 → ctx 注入服务 → 默认独立模式）
// + git 缺席 fail-soft 零注入。真机 git 链取证见文件尾「真机在场性」节（checkGitPresence
// 默认 runner 打真 PATH——CI/本机无 git 时该节自动跳过语义见用例内 guard）。
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import gitWorktreePlugin, {
  checkGitPresence,
  createDefaultExtensionPoints,
  defaultGetWorktreeDir,
  defaultResolveProject,
  GIT_WORKTREE_IDENTITY_SERVICE,
  GIT_WORKTREE_SERVICE,
  resolveExtensionPoints,
} from './index.js'

/** reflect 桩：provide 记录 + get 可编程 */
function ctxStub(opts: { injected?: unknown; provideFail?: boolean } = {}) {
  const provided: { name: string; value: unknown }[] = []
  const ctx = {
    reflect: {
      get: (name: string) => {
        if (name !== GIT_WORKTREE_IDENTITY_SERVICE) return undefined
        if (opts.injected === 'throw') throw new Error('boom')
        return opts.injected
      },
      provide: (name: string, value: unknown) => {
        if (opts.provideFail) throw new Error('provide boom')
        provided.push({ name, value })
        return () => provided.pop()
      },
    },
  }
  return { ctx, provided }
}

const mergeImpl = async (cwd: string) => ({ projectId: 'p-main', projectRoot: cwd, isGit: true })

describe('resolveExtensionPoints（注入缝解析）', () => {
  it('无注入 → 默认实现 = 独立 worktree 模式（resolveProject 恒 null；目录 <root>/.forge/worktrees）', () => {
    const { ctx } = ctxStub()
    const xp = resolveExtensionPoints(ctx, {})
    expect(xp.resolveProject).toBe(defaultResolveProject)
    expect(xp.getWorktreeDir).toBe(defaultGetWorktreeDir)
    void xp.resolveProject('Z:/any').then((r) => expect(r).toBeNull())
    expect(xp.getWorktreeDir('Z:/repo')).toBe(join('Z:/repo', '.forge', 'worktrees'))
  })

  it('ctx 注入缝服务在场 → 集成层实现生效（归并 resolveProject + worktree_dir 列值）', () => {
    const { ctx } = ctxStub({ injected: { resolveProject: mergeImpl, getWorktreeDir: () => 'Z:/wt-custom' } })
    const xp = resolveExtensionPoints(ctx, {})
    expect(xp.resolveProject).toBe(mergeImpl)
    expect(xp.getWorktreeDir('Z:/repo')).toBe('Z:/wt-custom')
  })

  it('config 覆写优先于注入缝服务（嵌入方直配面）', () => {
    const { ctx } = ctxStub({ injected: { resolveProject: mergeImpl } })
    const xp = resolveExtensionPoints(ctx, { getWorktreeDir: () => 'Z:/from-config' })
    expect(xp.resolveProject).toBe(mergeImpl)
    expect(xp.getWorktreeDir('Z:/repo')).toBe('Z:/from-config')
  })

  it('注入面形状残缺（null/非对象/缺法）/get 抛异常 → 逐面降级默认（不抛）', () => {
    for (const injected of [undefined, null, 42, {}, { resolveProject: 42 }, 'throw']) {
      const { ctx } = ctxStub({ injected })
      const xp = resolveExtensionPoints(ctx, {})
      expect(xp.resolveProject).toBe(defaultResolveProject)
      expect(xp.getWorktreeDir).toBe(defaultGetWorktreeDir)
    }
  })

  it('注入单面（仅 getWorktreeDir）→ 该面注入、另一面退默认', () => {
    const { ctx } = ctxStub({ injected: { getWorktreeDir: () => 'Z:/only-dir' } })
    const xp = resolveExtensionPoints(ctx, {})
    expect(xp.getWorktreeDir('Z:/r')).toBe('Z:/only-dir')
    expect(xp.resolveProject).toBe(defaultResolveProject)
  })
})

describe('插件激活（git 在场性门 + 能力服务 provide）', () => {
  it('git 在场（stub）→ provide gitWorktree 能力服务；getExtensionPoints 惰性取到晚注入的集成层实现', async () => {
    const { ctx, provided } = ctxStub()
    const dispose = gitWorktreePlugin(ctx, { checkGit: async () => true })
    await vi.waitFor(() => expect(provided).toHaveLength(1))
    expect(provided[0]!.name).toBe(GIT_WORKTREE_SERVICE)
    // 激活时注入缝还空（host 装配方晚于 runProfile provide）——调用期先取先得
    const svc = provided[0]!.value as { getExtensionPoints: () => ReturnType<typeof createDefaultExtensionPoints> }
    expect(svc.getExtensionPoints().resolveProject).toBe(defaultResolveProject)
    ;(ctx.reflect as { get: (n: string) => unknown }).get = () => ({ resolveProject: mergeImpl })
    expect(svc.getExtensionPoints().resolveProject).toBe(mergeImpl)
    dispose() // 幂等注销
    dispose()
  })

  it('git 缺席（stub）→ 零注入（provide 不被调用）——fail-soft 不生效', async () => {
    const { ctx, provided } = ctxStub()
    gitWorktreePlugin(ctx, { checkGit: async () => false })
    await new Promise((r) => setTimeout(r, 20))
    expect(provided).toHaveLength(0)
  })

  it('git 检测异常（注入缝实现带异常上浮）→ 兜底零注入不抛', async () => {
    const { ctx, provided } = ctxStub()
    gitWorktreePlugin(ctx, { checkGit: async () => { throw new Error('runner boom') } })
    await new Promise((r) => setTimeout(r, 20))
    expect(provided).toHaveLength(0)
  })

  it('provide 抛异常 → 能力面降级，激活不抛、disposer 安全', async () => {
    const { ctx } = ctxStub({ provideFail: true })
    const dispose = gitWorktreePlugin(ctx, { checkGit: async () => true })
    await new Promise((r) => setTimeout(r, 20))
    expect(() => dispose()).not.toThrow()
  })

  it('ctx 无 reflect 面（非 cordis 嵌入）→ 激活/disposer 均不抛', async () => {
    const dispose = gitWorktreePlugin({}, { checkGit: async () => true })
    await new Promise((r) => setTimeout(r, 20))
    expect(() => dispose()).not.toThrow()
  })
})

describe('真机在场性（外部依赖装配面——默认 runner 打真 PATH）', () => {
  it('真机 git --version 探测：本机在场 → true（缺席环境 skip）', async () => {
    const present = await checkGitPresence()
    if (!present) {
      console.warn('[git-worktree] 本机无 git——真机在场用例按缺席环境降级通过（缺席分支由 stub 用例覆盖）')
      return
    }
    expect(present).toBe(true)
    // 真机端到端：真探测在场 → 插件生效（provide 能力服务）
    const { ctx, provided } = ctxStub()
    gitWorktreePlugin(ctx) // 默认 checkGit = 真 git --version
    await vi.waitFor(() => expect(provided).toHaveLength(1))
    expect(provided[0]!.name).toBe(GIT_WORKTREE_SERVICE)
  })
})
