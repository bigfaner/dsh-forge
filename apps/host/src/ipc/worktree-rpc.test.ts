// forge:worktree/* host wiring 单测（worktree-domain-migration 1.1——域用例已随迁
// packages/plugins/git-worktree/src/rpc-service.test.ts；此处残留纯 wiring 面）：
//   · registerWorktreeChannels——allowlist 注册（键键对应 contracts WORKTREE_CHANNELS）。
import { describe, expect, it } from 'vitest'
import { WORKTREE_CHANNELS } from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { createWorktreeRpcService, registerWorktreeChannels } from './worktree-rpc.js'

describe('registerWorktreeChannels（main 侧 ipc 注册）', () => {
  it('通道键键对应 contracts WORKTREE_CHANNELS 且全部注册', () => {
    const registered: string[] = []
    const ipc: ForgeIpc = {
      register: (channel) => {
        registered.push(channel)
      },
      registered: () => registered,
      unregisterAll: () => {},
    }
    const service = createWorktreeRpcService({})
    registerWorktreeChannels(ipc, service)
    // 建会话单门退役——session-create 通道键已自 contracts WORKTREE_CHANNELS 摘除
    // （bug 82e92933——web 残留消费即 not-found；host 会话创建中继收敛为
    // forge:proxy/session-create 一条腿，binding-derivation §2.3）
    expect(registered.sort()).toEqual(Object.values(WORKTREE_CHANNELS).sort())
    expect(registered).toHaveLength(10)
  })
})
