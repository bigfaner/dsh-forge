// anchor-resolver 单测（bug 84acf85c 环3——归属裁决双径）：
// ① worktree.resolve（git 身份归并径——树会话）命中即短路；
// ② resolve 零行/抛错 → project.db 归属行径（forgeProjects.list wsPath canonical 匹配
//   ——非 git 注册项目主工作区，git 中心链恒 unattached 的补位径）；
// ③ 双径皆未命中 = undefined（不误归组）。
import { describe, expect, it } from 'vitest'
import { anchorProjectResolver, type ForgeRpcClient } from './anchor-resolver.js'

/** rpc 桩（worktree.resolve / projects.list 可注入） */
function rpcStub(opts: {
  resolved?: Array<{ projectId?: string; path?: string }>
  resolveThrows?: Error
  projects?: Array<{ id: string; wsPath: string; archived: boolean }>
}): ForgeRpcClient {
  return {
    worktree: {
      resolve: async (q: { paths: readonly string[] }) => {
        if (opts.resolveThrows !== undefined) throw opts.resolveThrows
        void q
        return { resolved: opts.resolved ?? [] }
      },
    },
    projects: {
      list: async () => opts.projects ?? [],
    },
  } as unknown as ForgeRpcClient
}

const GIT_WS = 'C:\\proj\\repo'
const PLAIN_WS = 'C:\\Users\\panda\\.forge\\fixture\\plain-project'

describe('anchorProjectResolver（环3 归属裁决——git 径 + ledger 径）', () => {
  it('git 径命中即短路（树会话归属——零 ledger 调用）', async () => {
    let listed = false
    const resolve = anchorProjectResolver(
      () =>
        ({
          worktree: { resolve: async () => ({ resolved: [{ projectId: 'p-git', path: GIT_WS }] }) },
          projects: { list: async () => { listed = true; return [] } },
        }) as unknown as ForgeRpcClient,
    )
    await expect(resolve(GIT_WS)).resolves.toBe('p-git')
    expect(listed, '命中短路——ledger 不调').toBe(false)
  })

  it('git 径零行（非 git 注册项目）→ ledger wsPath canonical 匹配补位', async () => {
    const resolve = anchorProjectResolver(() =>
      rpcStub({
        resolved: [],
        projects: [
          { id: 'p-plain', wsPath: PLAIN_WS, archived: false },
          { id: 'p-gone', wsPath: 'D:\\elsewhere', archived: true },
        ],
      }),
    )
    await expect(resolve(PLAIN_WS)).resolves.toBe('p-plain')
  })

  it('canonical 匹配：斜杠向/尾分隔符/大小写差异归一（Windows 路径双形态）', async () => {
    const resolve = anchorProjectResolver(() =>
      rpcStub({
        resolved: [],
        projects: [{ id: 'p-norm', wsPath: 'c:/users/panda/.forge/fixture/plain-project/', archived: false }],
      }),
    )
    await expect(resolve(PLAIN_WS)).resolves.toBe('p-norm')
  })

  it('resolve 抛错 → ledger 径兜底（fail-soft 不上抛）', async () => {
    const resolve = anchorProjectResolver(() =>
      rpcStub({ resolveThrows: new Error('boom'), projects: [{ id: 'p-fb', wsPath: PLAIN_WS, archived: false }] }),
    )
    await expect(resolve(PLAIN_WS)).resolves.toBe('p-fb')
  })

  it('双径皆未命中 = undefined（不误归组）', async () => {
    const resolve = anchorProjectResolver(() => rpcStub({ resolved: [], projects: [] }))
    await expect(resolve(PLAIN_WS)).resolves.toBeUndefined()
  })
})
