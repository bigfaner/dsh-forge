// R5 发送拦截现查测试（plugin-project 1.13——RED 锚④，worktree-lifecycle J2 契约供料）：
// 临时 git 仓真机 fixture——拦截回调执行前删树（git worktree remove），发送仍被拒。
// 判据 = 现查：sealOf 回调执行时点经 service.seal → listPresent() 实时 git worktree list
// 判定在场性，不消费切换时点快照——TOCTOU 窗口不存在（快照式实现此用例即 RED）。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createWorktreeRpcService } from './service.js'
import { interceptSessionSends } from './send-guard.js'
import { SessionSealedError } from './seal-guard.js'

const root = mkdtempSync(join(tmpdir(), 'r5-present-fresh-'))
const wt = join(root, 'wt-a')

const git = (args: string[], cwd = root): void => {
  execFileSync('git', ['-c', 'user.name=r5', '-c', 'user.email=r5@test', ...args], { cwd, windowsHide: true })
}

git(['init', '--initial-branch', 'main'])
git(['commit', '--allow-empty', '-m', 'seed'])
git(['worktree', 'add', '-b', 'feat/r5', wt])

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('R5 · 发送拦截回调内 listPresent() 现查（临时 git 仓 fixture）', () => {
  it('回调执行前删树（git worktree remove）→ 发送仍被拒（SessionSealedError）', async () => {
    const service = createWorktreeRpcService({
      gitWorktree: {
        getExtensionPoints: () => ({
          resolveProject: async (cwd: string) =>
            cwd === root || cwd.startsWith(root)
              ? { projectId: 'p1', projectRoot: root, isGit: true }
              : null,
          getWorktreeDir: (r: string) => join(r, '.forge', 'worktrees'),
        }),
      },
    })
    const controller = {
      prompt: async (_request: unknown) => 'sent',
    }
    const revoke = interceptSessionSends(controller, (sessionId) => service.seal({ sessionId, cwd: wt }))
    try {
      // 回调执行前删树：盘上事实与 git worktree list 同时消失
      git(['worktree', 'remove', '--force', wt])
      await expect(controller.prompt({ sessionId: 's1' })).rejects.toBeInstanceOf(SessionSealedError)
    } finally {
      revoke()
    }
  })
})
