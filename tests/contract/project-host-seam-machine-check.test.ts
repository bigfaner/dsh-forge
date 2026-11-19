// apps/host 三域边界机检（plugin-project 1.17——proposal 判据 2 实现面，B1 处方：
// 「机检命令与白名单清单任务拆解时定形，输出归档本提案 slug 单元」）。
//   ① 三域域符号 import 白名单扫描：worktree/projects/bugs 域**本体符号**在 apps/host
//     源码零命中（1.17 批二卸旧装新收口：域本体已全部下沉 @dsh-forge/project，装配段
//     只留注册行——SYMBOL_WHITELIST 逐行删除归零，空集 + 全零命中即绿）。
//     包出口符号（WorktreeRpcService / WORKTREE_RPC_METHODS / registerWorktreeChannels /
//     registerProjectsM2Channels / registerBugsChannels / invalidateResolveCaches）不再
//     入本词表——它们是宿主注册/接线面的合法 import 名，由 ②的包 import 门与 ③的通道
//     注册比对覆盖。
//   ② 通道注册白名单比对：worktree/bugs 通道注册逐键比对 contracts 通道常量全集
//     （注册面 = 白名单，键键对应，多注册/漏注册都判失败）。
//   ③ 三域包 import 门：@dsh-forge/project import 只落在宿主接线面（注册行/编排行）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { BUGS_CHANNELS, PROJECTS_CHANNELS, WORKTREE_CHANNELS } from '../../lib/api/src/channels.js'
import { registerBugsChannels } from '../../apps/host/src/ipc/bugs-rpc.js'
import { registerWorktreeChannels } from '../../plugins/project/host/assembly/channels.js'
import { rpcEnvelope } from '../../apps/host/src/ipc/rpc-envelope.js'
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

/** 三域域符号词表（域本体符号——1.17 批二后全部下沉 @dsh-forge/project，宿主零命中） */
const DOMAIN_SYMBOLS = [
  'createHostWorktreeRpc',
  'createWorktreeRpcService',
  'createWorktreeIdentity',
  'GIT_WORKTREE_IDENTITY_SERVICE',
  'interceptSessionSends',
  'WorktreeServiceDeps',
] as const

/** 域符号白名单（1.17 批二收口归零：child.ts 装配段下沉 + run/m2-wiring/bindings 重挂 +
 *  identity 随迁——宿主源码域本体符号全零命中，空集即绿；新域符号入宿主即红）。 */
const SYMBOL_WHITELIST = new Set<string>([])

/** @dsh-forge/project import 允许面（宿主接线面——注册行/编排行；新消费面入列须指名） */
const PROJECT_IMPORT_FACES = new Set([
  'apps/host/src/ipc/m2-wiring.ts',
  'apps/host/src/ipc/bindings.ts',
  'apps/host/src/boot/child.ts',
  'apps/host/src/boot/run.ts',
])

describe('机检 ①：apps/host 三域域符号白名单扫描（白名单归零）', () => {
  it('域本体符号在 apps/host 全零命中（白名单空集——下沉收口后零残留）', () => {
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

  it('白名单恒空集（归零收口——回填白名单行即红，域符号下沉为唯一正道）', () => {
    expect([...SYMBOL_WHITELIST]).toEqual([])
  })
})

describe('机检 ③：三域包 import 门（@dsh-forge/project 只落宿主接线面）', () => {
  it('包 import 只出现在注册行/编排行接线面', () => {
    const violations: string[] = []
    for (const f of tsFiles(HOST_SRC)) {
      const short = f.replaceAll('\\', '/')
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/from '(@dsh-forge\/project[^']*)'/g)) {
        // `import type {}` 空载荷类型面（declare module 扩充——零运行期 import）豁免
        const lineStart = src.lastIndexOf('\n', m.index ?? 0) + 1
        const line = src.slice(lineStart, m.index ?? 0)
        if (/import\s+type\s*\{\}\s*$/.test(line)) continue
        if (!PROJECT_IMPORT_FACES.has(short)) violations.push(`${short} -> ${m[1]}`)
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
    registerWorktreeChannels(ipc as never, {} as never, rpcEnvelope as never)
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
