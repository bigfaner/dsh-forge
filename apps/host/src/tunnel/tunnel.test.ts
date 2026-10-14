// 隧道层 fake 契约测试（不起真隧道）：外部依赖面（下载/子进程/stdout/文件系统/时钟）
// 全注入替身——AC 覆盖：pin 下载+sha256 拒用+缓存零重下；URL 捕获与退出触发兜底；
// Pinggy SSH 兜底与 TTL 读数；链路切换与停机清理（kill 断言、无孤儿）。
import { describe, expect, it } from 'vitest'
import {
  CLOUDFLARED_SHA256,
  CLOUDFLARED_VERSION,
  TunnelProcessExitError,
  cachedBinaryPath,
  cloudflaredDownloadUrl,
  ensureCloudflaredBinary,
  startCloudflaredTunnel,
  TRYCLOUDFLARE_URL_RE,
  type TunnelDeps,
} from './cloudflared.js'
import { PINGGY_TTL_MS, pinggyRemainingMs, startPinggyTunnel } from './pinggy.js'
import { TunnelManager } from './index.js'

const GOOD_SHA = 'a'.repeat(64)
const TMP = '/tmp-fake'
const CF_URL = 'https://random-words-here.trycloudflare.com'
const PG_URL = 'https://random-12-34.pinggy.link'

interface FakeProcess {
  pid: number
  onLine(listener: (line: string) => void): unknown
  onExit(listener: (code: number | null) => void): unknown
  kill(): Promise<void>
  feed(line: string): void
  exit(code: number | null): void
  wasKilled(): boolean
}

function fakeProcess(pid = 4242): FakeProcess {
  const lineListeners: Array<(line: string) => void> = []
  const exitListeners: Array<(code: number | null) => void> = []
  let killed = false
  return {
    pid,
    onLine: (l) => lineListeners.push(l),
    onExit: (l) => exitListeners.push(l),
    kill: async () => {
      killed = true
      for (const l of exitListeners) l(0)
    },
    feed: (line) => {
      for (const l of lineListeners) l(line)
    },
    exit: (code) => {
      for (const l of exitListeners) l(code)
    },
    wasKilled: () => killed,
  }
}

function makeDeps(): {
  deps: TunnelDeps
  spawned: FakeProcess[]
  fetchCalls: string[]
  files: Map<string, Uint8Array>
  spawnCalls: Array<{ cmd: string; args: readonly string[] }>
  setBody(url: string, data: Uint8Array): void
  tick(ms: number): void
} {
  const bodies = new Map<string, Uint8Array>()
  const files = new Map<string, Uint8Array>()
  const spawned: FakeProcess[] = []
  const spawnCalls: Array<{ cmd: string; args: readonly string[] }> = []
  const fetchCalls: string[] = []
  let clock = 0
  const deps: TunnelDeps = {
    fetch: async (url) => {
      fetchCalls.push(url)
      const body = bodies.get(url)
      if (body === undefined) throw new Error(`404 ${url}`)
      return body
    },
    // 缺省 = 校验通过（与 pin 清单一致）；拒用场景由用例覆写为错误摘要
    sha256: () => CLOUDFLARED_SHA256[ASSET] ?? GOOD_SHA,
    fs: {
      exists: (p) => files.has(p),
      writeFile: async (p, d) => {
        files.set(p, d)
      },
      chmod: async () => {},
    },
    tmpDir: () => TMP,
    spawn: (cmd, args) => {
      spawnCalls.push({ cmd, args })
      const proc = fakeProcess(1000 + spawned.length)
      spawned.push(proc)
      return proc
    },
    now: () => clock,
  }
  return {
    deps,
    spawned,
    fetchCalls,
    files,
    spawnCalls,
    setBody: (url, data) => bodies.set(url, data),
    tick: (ms) => {
      clock += ms
    },
  }
}

/** 同步取第 n 个已派生子进程（start* 工厂同步 spawn） */
function spawnOf(t: ReturnType<typeof makeDeps>, n = 0): FakeProcess {
  const proc = t.spawned[n]
  if (proc === undefined) throw new Error(`子进程 #${String(n + 1)} 未派生`)
  return proc
}

/** 等待第 n 个子进程派生完成并返回该进程（manager 路径 spawn 在异步下载链之后） */
async function untilSpawn(t: ReturnType<typeof makeDeps>, n = 1): Promise<FakeProcess> {
  while (t.spawned.length < n) await new Promise((resolve) => setImmediate(resolve))
  const proc = t.spawned[n - 1]
  if (proc === undefined) throw new Error(`子进程 #${String(n)} 未派生`)
  return proc
}

const ASSET = 'cloudflared-windows-amd64.exe'

describe('cloudflared 二进制下载（pin 版本 + sha256 + 缓存）', () => {
  it('按 pin 版本从 GitHub releases 下载并写缓存', async () => {
    const t = makeDeps()
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET), new Uint8Array([1, 2, 3]))
    const path = await ensureCloudflaredBinary(t.deps, 'win32', 'x64')
    expect(path).toBe(cachedBinaryPath(TMP, ASSET))
    expect(t.fetchCalls).toEqual([cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET)])
    expect(t.files.get(path)).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('sha256 校验不过即拒用——不落缓存不启用', async () => {
    const t = makeDeps()
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET), new Uint8Array([9]))
    t.deps.sha256 = () => 'b'.repeat(64)
    await expect(ensureCloudflaredBinary(t.deps, 'win32', 'x64')).rejects.toThrow(/sha256/)
    expect(t.files.size).toBe(0)
  })

  it('缓存命中二次启动零下载', async () => {
    const t = makeDeps()
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET), new Uint8Array([1]))
    await ensureCloudflaredBinary(t.deps, 'win32', 'x64')
    await ensureCloudflaredBinary(t.deps, 'win32', 'x64')
    expect(t.fetchCalls).toHaveLength(1)
  })
})

describe('cloudflared 进程 URL 捕获', () => {
  it('重试窗口内从 stdout 捕获 trycloudflare URL', async () => {
    const t = makeDeps()
    const pending = startCloudflaredTunnel('cf-bin', 43127, t.deps, 200)
    expect(t.spawnCalls[0]).toEqual({ cmd: 'cf-bin', args: ['tunnel', '--url', 'http://127.0.0.1:43127'] })
    spawnOf(t).feed('2024-01-01 INFO |  https://random-words-here.trycloudflare.com')
    expect((await pending).url).toBe(CF_URL)
    expect(TRYCLOUDFLARE_URL_RE.exec(CF_URL)?.[0]).toBe(CF_URL)
  })

  it('窗口内无 URL → 捕获超时拒绝', async () => {
    const t = makeDeps()
    await expect(startCloudflaredTunnel('cf-bin', 1, t.deps, 10)).rejects.toThrow(/超时/)
  })

  it('URL 捕获前进程退出 → TunnelProcessExitError（兜底信号）', async () => {
    const t = makeDeps()
    const pending = startCloudflaredTunnel('cf-bin', 1, t.deps, 5_000)
    spawnOf(t).exit(1)
    await expect(pending).rejects.toBeInstanceOf(TunnelProcessExitError)
  })
})

describe('Pinggy SSH 兜底与 TTL 读数', () => {
  it('起 ssh -p 22 free.pinggy.io 并捕获 pinggy URL', async () => {
    const t = makeDeps()
    const pending = startPinggyTunnel(43127, t.deps, 200)
    expect(t.spawnCalls[0]?.cmd).toBe('ssh')
    expect(t.spawnCalls[0]?.args).toContain('free.pinggy.io')
    expect(t.spawnCalls[0]?.args).toContain('22')
    expect(t.spawnCalls[0]?.args.join(' ')).toMatch(/-R 0:127\.0\.0\.1:43127/)
    spawnOf(t).feed(`Forwarding HTTP traffic from ${PG_URL}`)
    const tunnel = await pending
    expect(tunnel.url).toBe(PG_URL)
  })

  it('携带 60 分钟 TTL 读数（随时钟递减、下限 0）', async () => {
    const t = makeDeps()
    const pending = startPinggyTunnel(1, t.deps, 200)
    const proc = spawnOf(t)
    proc.feed(PG_URL)
    const { startedAt } = await pending
    expect(startedAt).toBe(0)
    expect(pinggyRemainingMs(startedAt, 0)).toBe(PINGGY_TTL_MS)
    t.tick(10 * 60 * 1_000)
    expect(pinggyRemainingMs(startedAt, t.deps.now())).toBe(50 * 60 * 1_000)
    t.tick(61 * 60 * 1_000)
    expect(pinggyRemainingMs(startedAt, t.deps.now())).toBe(0)
  })

  it('ssh 提前退出 → 兜底不可用错误', async () => {
    const t = makeDeps()
    const pending = startPinggyTunnel(1, t.deps, 5_000)
    const proc = spawnOf(t)
    proc.exit(255)
    await expect(pending).rejects.toThrow(/ssh 提前退出/)
  })
})

describe('TunnelManager 链路编排（首选/兜底/换线/停机）', () => {
  function primeCloudflared(t: ReturnType<typeof makeDeps>): void {
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET), new Uint8Array([1]))
  }

  it('首选链路成功：cloudflared 起进程并捕获 URL', async () => {
    const t = makeDeps()
    primeCloudflared(t)
    const manager = new TunnelManager(t.deps, { localPort: 43127, captureTimeoutMs: 200 })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.feed(CF_URL)
    const state = await pending
    expect(state).toEqual({ provider: 'cloudflared', url: CF_URL })
    expect(manager.state?.url).toBe(CF_URL)
  })

  it('cloudflared 提前退出 → 自动兜底 Pinggy（换线）', async () => {
    const t = makeDeps()
    primeCloudflared(t)
    const manager = new TunnelManager(t.deps, { localPort: 43127, captureTimeoutMs: 200 })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.exit(1)
    const pg = await untilSpawn(t, 2)
    pg.feed(PG_URL)
    const state = await pending
    expect(state.provider).toBe('pinggy')
    expect(state.remainingTtlMs).toBe(PINGGY_TTL_MS)
    await untilSpawn(t, 2)
    expect(t.spawnCalls.at(-1)?.cmd).toBe('ssh')
  })

  it('URL 捕获后链路意外退出 → 自动兜底，事件推送换线', async () => {
    const t = makeDeps()
    primeCloudflared(t)
    const manager = new TunnelManager(t.deps, { localPort: 43127, captureTimeoutMs: 200 })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.feed(CF_URL)
    await pending
    const events: string[] = []
    manager.onEvent((s) => events.push(s.provider))
    const pinggySeen = new Promise<void>((resolve) => {
      manager.onEvent((s) => {
        if (s.provider === 'pinggy') resolve()
      })
    })
    cf.exit(0)
    const pg = await untilSpawn(t, 2)
    pg.feed(PG_URL)
    await pinggySeen
    expect(events).toContain('pinggy')
  })

  it('fallback() 显式换线：停旧句柄（kill 断言）→ 起新链路', async () => {
    const t = makeDeps()
    primeCloudflared(t)
    const manager = new TunnelManager(t.deps, { localPort: 43127, captureTimeoutMs: 200 })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.feed(CF_URL)
    await pending
    const fallback = manager.fallback()
    const pg = await untilSpawn(t, 2)
    pg.feed(PG_URL)
    const state = await fallback
    expect(state.provider).toBe('pinggy')
    expect(cf.wasKilled()).toBe(true)
    expect(manager.state?.provider).toBe('pinggy')
  })

  it('stop() 清理进程句柄无孤儿：kill 调用 + 退出不再触发兜底', async () => {
    const t = makeDeps()
    primeCloudflared(t)
    const manager = new TunnelManager(t.deps, { localPort: 43127, captureTimeoutMs: 200 })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.feed(CF_URL)
    await pending
    await manager.stop()
    expect(cf.wasKilled()).toBe(true)
    const spawnCount = t.spawned.length
    cf.exit(0)
    expect(t.spawned).toHaveLength(spawnCount)
    expect(manager.state).toBeUndefined()
    await expect(manager.start()).rejects.toThrow(/停机/)
  })

  it('下载失败 → 直接兜底 Pinggy（不残留未校验二进制）', async () => {
    const t = makeDeps() // 无 setBody → fetch 404
    const manager = new TunnelManager(t.deps, { localPort: 43127, captureTimeoutMs: 200 })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.feed(PG_URL)
    const state = await pending
    expect(state.provider).toBe('pinggy')
    expect(t.files.size).toBe(0)
  })
})
