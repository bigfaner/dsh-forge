// 隧道装配段 fake 契约测试（bug ebadf4ad）：装配 = 纯装配零副作用（不自动建隧道——
// 隧道只在用户打开远程控制界面经 toggle 按需建立）；toggle/fallback 语义走 TunnelManager
// 既有编排（此处只断言装配与触发接线）。外部依赖面全注入替身，不起真隧道。
import { describe, expect, it } from 'vitest'
import {
  CLOUDFLARED_SHA256,
  CLOUDFLARED_VERSION,
  cloudflaredDownloadUrl,
  type TunnelDeps,
} from '../tunnel/cloudflared.js'
import { assembleTunnel, type TunnelAssemblyHandle } from './tunnel-assembly.js'

const ASSET = 'cloudflared-windows-amd64.exe'
const CF_URL = 'https://random-words-here.trycloudflare.com'

interface FakeProcess {
  onLine(listener: (line: string) => void): unknown
  onExit(listener: (code: number | null) => void): unknown
  kill(): Promise<void>
  feed(line: string): void
}

function makeDeps(): {
  deps: TunnelDeps
  spawned: FakeProcess[]
  setBody(url: string, data: Uint8Array): void
} {
  const bodies = new Map<string, Uint8Array>()
  const files = new Map<string, Uint8Array>()
  const spawned: FakeProcess[] = []
  const deps: TunnelDeps = {
    fetch: async (url) => {
      const body = bodies.get(url)
      if (body === undefined) throw new Error(`404 ${url}`)
      return body
    },
    sha256: () => CLOUDFLARED_SHA256[ASSET] ?? 'a'.repeat(64),
    fs: {
      exists: (p) => files.has(p),
      readFile: async (p) => files.get(p) ?? new Uint8Array(),
      writeFile: async (p, d) => {
        files.set(p, d)
      },
      mkdir: async () => {},
      chmod: async () => {},
    },
    tmpDir: () => '/tmp-fake',
    spawn: (_cmd, _args) => {
      const lineListeners: Array<(line: string) => void> = []
      const exitListeners: Array<(code: number | null) => void> = []
      const proc: FakeProcess = {
        onLine: (l) => lineListeners.push(l),
        onExit: (l) => exitListeners.push(l),
        kill: async () => {
          for (const l of exitListeners) l(0)
        },
        feed: (line) => {
          for (const l of lineListeners) l(line)
        },
      }
      spawned.push(proc)
      return proc as never
    },
    now: () => 0,
    sleep: async () => {},
  }
  return { deps, spawned, setBody: (url, data) => bodies.set(url, data) }
}

function assemble(t: ReturnType<typeof makeDeps>): {
  h: TunnelAssemblyHandle
  pushed: Array<unknown>
} {
  const pushed: Array<unknown> = []
  const h = assembleTunnel({
    deps: t.deps,
    localPort: 43127,
    externalSeeds: [],
    diag: () => {},
    send: (message) => pushed.push(message),
    pairUrlOf: (url) => `${url}/pair?token=tok`,
  })
  return { h, pushed }
}

/** 让装配/启动链的微任务排空（装配本身必须零派生——不等待任何启动链） */
async function settle(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve))
}

async function untilSpawn(t: ReturnType<typeof makeDeps>, n = 1): Promise<FakeProcess> {
  for (let i = 0; i < 200 && t.spawned.length < n; i++) await new Promise((resolve) => setImmediate(resolve))
  const proc = t.spawned[n - 1]
  if (proc === undefined) throw new Error(`子进程 #${String(n)} 未派生`)
  return proc
}

describe('隧道装配段（bug ebadf4ad：装配零副作用——隧道按需建立）', () => {
  it('装配后不自动建隧道：零子进程派生、零 tunnel 推送（boot 自启回归必红）', async () => {
    const t = makeDeps()
    const { h, pushed } = assemble(t)
    await settle()
    expect(t.spawned).toHaveLength(0)
    expect(h.manager.state).toBeUndefined()
    expect(pushed).toHaveLength(0)
  })

  it('toggle 无活动链路 → 按需建立（cloudflared 首选）并推送激活态', async () => {
    const t = makeDeps()
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET), new Uint8Array([1]))
    const { h, pushed } = assemble(t)
    h.toggle()
    const proc = await untilSpawn(t, 1)
    proc.feed(`2026-01-01 INFO |  ${CF_URL}`)
    await settle()
    expect(h.manager.state?.url).toBe(CF_URL)
    expect(pushed.at(-1)).toMatchObject({ type: 'tunnel', tunnelUrl: `${CF_URL}/pair?token=tok`, tunnelProvider: 'cloudflared' })
  })

  it('toggle 链路在线 → 重推当前状态零新派生（读数刷新面）', async () => {
    const t = makeDeps()
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET), new Uint8Array([1]))
    const { h, pushed } = assemble(t)
    h.toggle()
    const proc = await untilSpawn(t, 1)
    proc.feed(`2026-01-01 INFO |  ${CF_URL}`)
    await settle()
    pushed.length = 0
    h.toggle()
    await settle()
    expect(t.spawned).toHaveLength(1)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]).toMatchObject({ type: 'tunnel', tunnelUrl: `${CF_URL}/pair?token=tok` })
  })
})
