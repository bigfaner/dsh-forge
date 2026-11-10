// @dsh-forge/git-worktree —— git 在场性检测 + 扩展点默认实现单测。
// 契约来源：提案 worktree-branch-management「扩展点契约」节——
// ① `git --version` 探测；② resolveProject 默认 null；③ worktree 目录默认 ‹projectRoot›/.forge/worktrees/ 可覆写。
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { checkGitPresence, type GitCommandRunner } from './git-presence.js'
import { createDefaultExtensionPoints, type ProjectResolution } from './extension-points.js'
import gitWorktreePlugin from './index.js'
import type { GitWorktreePluginConfig } from './index.js'

describe('checkGitPresence', () => {
  it('git 命令成功（git --version 退出 0）→ 在场 true', async () => {
    const runner: GitCommandRunner = async () => ({ code: 0, stdout: 'git version 2.47.0', stderr: '' })
    await expect(checkGitPresence(runner)).resolves.toBe(true)
  })

  it('git 命令非零退出（PATH 无 git 的模拟）→ false，不抛', async () => {
    const runner: GitCommandRunner = async () => ({ code: 1, stdout: '', stderr: 'command not found' })
    await expect(checkGitPresence(runner)).resolves.toBe(false)
  })

  it('runner 抛错（ENOENT 形态）→ false，不抛', async () => {
    const runner: GitCommandRunner = async () => {
      throw new Error('spawn git ENOENT')
    }
    await expect(checkGitPresence(runner)).resolves.toBe(false)
  })

  it('真机探测：本机 PATH 应有 git（外部依赖取证门）', async () => {
    await expect(checkGitPresence()).resolves.toBe(true)
  })
})

describe('扩展点默认实现（createDefaultExtensionPoints）', () => {
  it('resolveProject 默认实现恒返回 null（独立 worktree 模式）', async () => {
    const xp = createDefaultExtensionPoints()
    await expect(xp.resolveProject('Z:/any/worktree/path')).resolves.toBeNull()
  })

  it('worktree 目录提供者默认返回 ‹projectRoot›/.forge/worktrees/', () => {
    const xp = createDefaultExtensionPoints()
    expect(xp.getWorktreeDir('Z:/proj')).toBe(join('Z:/proj', '.forge', 'worktrees'))
  })

  it('调用方可注入覆写：resolveProject 与 getWorktreeDir 均可设定', async () => {
    const customResolution: ProjectResolution = {
      projectId: 'main-proj',
      projectRoot: 'Z:/main',
      isGit: true,
    }
    const xp = createDefaultExtensionPoints({
      resolveProject: async () => customResolution,
      getWorktreeDir: (projectRoot) => join(projectRoot, 'custom', 'wt'),
    })
    await expect(xp.resolveProject('Z:/main/.forge/worktrees/a')).resolves.toEqual(customResolution)
    expect(xp.getWorktreeDir('Z:/main')).toBe(join('Z:/main', 'custom', 'wt'))
  })
})

describe('插件激活生命周期（fail-soft）', () => {
  const ctx = {} // 骨架期零注入：无宿主服务消费面

  it('git 不在场（模拟 PATH 无 git）→ 激活 fail-soft：不抛、零注入、返回 disposer', async () => {
    const config: GitWorktreePluginConfig = {
      checkGit: async () => false,
    }
    expect(() => gitWorktreePlugin(ctx, config)).not.toThrow()
  })

  it('git 在场（模拟）→ 激活成功，返回 disposer 可安全重复调用', async () => {
    const config: GitWorktreePluginConfig = {
      checkGit: async () => true,
    }
    const dispose = gitWorktreePlugin(ctx, config)
    expect(typeof dispose).toBe('function')
    expect(() => dispose()).not.toThrow()
    dispose()
  })

  it('扩展点默认值：未注入时走默认实现', async () => {
    const config: GitWorktreePluginConfig = { checkGit: async () => true }
    const dispose = gitWorktreePlugin(ctx, config)
    dispose()
  })
})
