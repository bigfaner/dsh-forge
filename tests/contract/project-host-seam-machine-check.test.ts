// apps/host 三域边界机检（plugin-project 1.17——proposal 判据 2 实现面，B1 处方：
// 「机检命令与白名单清单任务拆解时定形，输出归档本提案 slug 单元」）。
//   ① 三域域符号 import 白名单扫描：worktree/projects/bugs 域符号（rpc-service / ops /
//     seal / register / identity / channels 等）在 apps/host 源码只允许出现在白名单文件
//     （域通道注册单点 + 域 rpc 装配面 + 装配段 child/run + identity 注入缝），白名单外
//     零命中——window/tunnel/telemetry/profile/boot 支撑面零域符号触达。
//   ② 通道注册白名单比对：worktree/bugs 通道注册逐键比对 contracts 通道常量全集
//     （注册面 = 白名单，键键对应，多注册/漏注册都判失败）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { BUGS_CHANNELS, PROJECTS_CHANNELS, WORKTREE_CHANNELS } from '../../lib/api/src/channels.js'
import { registerBugsChannels } from '../../apps/host/src/ipc/bugs-rpc.js'
import { registerWorktreeChannels } from '../../apps/host/src/ipc/worktree-rpc.js'
import type { ForgeIpc } from '../../apps/host/src/ipc/forge-channels.js'

const HOST_SRC = 'apps/host/src'

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsFiles(p))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p)
  }
  return out
}

/** 三域域符号词表（判据 2 处方示例：rpc-service/ops/seal/register 等——标识符级） */
const DOMAIN_SYMBOLS = [
  'createHostWorktreeRpc',
  'createWorktreeRpcService',
  'WorktreeRpcService',
  'interceptSessionSends',
  'invalidateResolveCaches',
  'GIT_WORKTREE_IDENTITY_SERVICE',
  'createWorktreeIdentity',
  'registerWorktreeChannels',
  'registerProjectsM2Channels',
  'registerBugsChannels',
  'WORKTREE_RPC_METHODS',
  'WorktreeServiceDeps',
] as const

/** 域符号白名单（装配缝下沉边界定形——proposal §三 220 行残留位清单的当前形态：
 *  域通道注册/装配面（ipc/{worktree-rpc,projects-rpc,bugs-rpc,worktree-identity,bindings}
 *  + m2-wiring 编排行）与装配段（boot/child.ts、boot/run.ts 白名单 import 行）。
 *  白名单收敛（git-worktree 包归并 + child.ts 装配段下沉）后本表逐行删除归零。 */
const SYMBOL_WHITELIST = new Set([
  'apps/host/src/ipc/worktree-rpc.ts',
  'apps/host/src/ipc/worktree-identity.ts',
  'apps/host/src/ipc/bindings.ts',
  'apps/host/src/ipc/projects-rpc.ts',
  'apps/host/src/ipc/bugs-rpc.ts',
  'apps/host/src/ipc/m2-wiring.ts',
  'apps/host/src/boot/child.ts',
  'apps/host/src/boot/run.ts',
])

describe('机检 ①：apps/host 三域域符号 import 白名单扫描', () => {
  it('域符号只出现在白名单装配面；白名单外（支撑面）零命中', () => {
    const violations: string[] = []
    for (const f of tsFiles(HOST_SRC)) {
      const short = f.replaceAll('\\', '/')
      const src = readFileSync(f, 'utf8')
      for (const symbol of DOMAIN_SYMBOLS) {
        if (new RegExp(`\\b${symbol}\\b`).test(src) && !SYMBOL_WHITELIST.has(short)) {
          violations.push(`${short}: ${symbol}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('三域包 import（@dsh-forge/git-worktree、@dsh-forge/project）只落在域注册面', () => {
    const violations: string[] = []
    for (const f of tsFiles(HOST_SRC)) {
      const short = f.replaceAll('\\', '/')
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/from '(@dsh-forge\/(?:git-worktree|project)[^']*)'/g)) {
        // `import type {}` 空载荷类型面（declare module 扩充——零运行期 import）豁免
        const lineStart = src.lastIndexOf('\n', m.index ?? 0) + 1
        const line = src.slice(lineStart, m.index ?? 0)
        if (/import\s+type\s*\{\}\s*$/.test(line)) continue
        if (short !== 'apps/host/src/ipc/worktree-rpc.ts') violations.push(`${short} -> ${m[1]}`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('机检 ②：通道注册白名单比对', () => {
  /** 通道注册记录桩（ipc.register 键收账—— ForgeIpc 窄面） */
  function recordingIpc(): { ipc: ForgeIpc; channels: string[] } {
    const channels: string[] = []
    const ipc = {
      register: (name: string): void => {
        channels.push(name)
      },
    } as unknown as ForgeIpc
    return { ipc, channels }
  }

  it('worktree 通道注册 = contracts WORKTREE_CHANNELS 全集（多/漏都失败）', () => {
    const { ipc, channels } = recordingIpc()
    registerWorktreeChannels(ipc, {} as never)
    expect([...channels].sort()).toEqual(Object.values(WORKTREE_CHANNELS).slice().sort())
  })

  it('bugs 通道注册 = contracts BUGS_CHANNELS 全集（写动词不上 RPC——面分治白名单）', () => {
    const { ipc, channels } = recordingIpc()
    registerBugsChannels(ipc, {
      listBugs: vi.fn(),
      commitFiles: vi.fn(),
      fileDiff: vi.fn(),
    })
    expect([...channels].sort()).toEqual(Object.values(BUGS_CHANNELS).slice().sort())
  })

  it('projects M2 通道注册面键集 ⊆ contracts PROJECTS_CHANNELS（源码级比对）', () => {
    const src = readFileSync('apps/host/src/ipc/projects-rpc.ts', 'utf8')
    const registered = [...src.matchAll(/PROJECTS_CHANNELS\.(\w+)/g)].map((m) => m[1])
    const declared = Object.keys(PROJECTS_CHANNELS)
    for (const key of registered) expect(declared).toContain(key)
    expect(registered.length).toBeGreaterThan(0)
  })
})
