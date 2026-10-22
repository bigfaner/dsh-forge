// 隧道层 fake 契约测试（不起真隧道）：外部依赖面（下载/子进程/stdout/文件系统/时钟）
// 全注入替身——AC 覆盖：pin 下载+sha256 拒用+缓存零重下；URL 捕获与退出触发兜底；
// Pinggy SSH 兜底与 TTL 读数；链路切换与停机清理（kill 断言、无孤儿）。
import { describe, expect, it } from 'vitest'
import {
  CLOUDFLARED_SHA256,
  CLOUDFLARED_VERSION,
  TunnelProcessExitError,
  cacheDirOf,
  cachedBinaryPath,
  cloudflaredAsset,
  cloudflaredDownloadUrl,
  ensureCloudflaredBinary,
  startCloudflaredTunnel,
  TRYCLOUDFLARE_URL_RE,
  type TunnelDeps,
} from './cloudflared.js'
import { PINGGY_TTL_MS, pinggyRemainingMs, startPinggyTunnel } from './pinggy.js'
import { TunnelManager, type TunnelState } from './index.js'

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
  mkdirs: string[]
  spawnCalls: Array<{ cmd: string; args: readonly string[] }>
  sleeps: number[]
  setBody(url: string, data: Uint8Array): void
  tick(ms: number): void
} {
  const bodies = new Map<string, Uint8Array>()
  const files = new Map<string, Uint8Array>()
  const mkdirs: string[] = []
  const spawned: FakeProcess[] = []
  const spawnCalls: Array<{ cmd: string; args: readonly string[] }> = []
  const sleeps: number[] = []
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
      readFile: async (p) => files.get(p) ?? new Uint8Array(),
      writeFile: async (p, d) => {
        files.set(p, d)
      },
      mkdir: async (p) => {
        mkdirs.push(p)
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
    // 退避退避缝：即时 resolve 但记录延迟——状态机用例断言 1s/4s 节奏，不真实等待
    sleep: async (ms) => {
      sleeps.push(ms)
    },
  }
  return {
    deps,
    spawned,
    fetchCalls,
    files,
    mkdirs,
    spawnCalls,
    sleeps,
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

// ── bug be04ce95：sha256 清单占位全零 → cloudflared 首选链路任何网络下必败（官方锚对齐） ──
describe('bug be04ce95：清单真值防回归（官方锚 = DSH Desktop 0.10.0 main.js:508-535）', () => {
  it('pin 版本 = 官方锚 2026.8.2（占位 2024.8.0 必红）', () => {
    expect(CLOUDFLARED_VERSION).toBe('2026.8.2')
  })

  it('五资产 sha256 真值：64 位 hex、非全零占位、互异（占位清单必红）', () => {
    const entries = Object.entries(CLOUDFLARED_SHA256)
    expect(entries.length).toBeGreaterThanOrEqual(5)
    const seen = new Set<string>()
    for (const [asset, digest] of entries) {
      expect(digest, `${asset} 摘要形状`).toMatch(/^[0-9a-f]{64}$/)
      expect(digest === '0'.repeat(64), `${asset} 占位全零——真实环境校验必败`).toBe(false)
      expect(seen.has(digest), `${asset} 摘要与前者重复`).toBe(false)
      seen.add(digest)
    }
  })

  it('win32-x64 真值钉官方 asar 锚（main.js:524 逐字）', () => {
    expect(CLOUDFLARED_SHA256['cloudflared-windows-amd64.exe']).toBe(
      'c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5',
    )
  })

  it('darwin 资产名 = 官方 .tgz 形态（main.js:512-519——无 .tgz 名 404 必红）', () => {
    expect(cloudflaredAsset('darwin', 'arm64')).toBe('cloudflared-darwin-arm64.tgz')
    expect(cloudflaredAsset('darwin', 'x64')).toBe('cloudflared-darwin-amd64.tgz')
  })

  it('darwin tgz 下载校验后经 tar 解包落缓存（官方 :601-603 同径）', async () => {
    const t = makeDeps()
    // fake sha256 缺省恒返 win 资产摘要——darwin 用例覆写为对应 tgz 摘要（模拟「内容与清单匹配」）
    t.deps.sha256 = () => CLOUDFLARED_SHA256['cloudflared-darwin-arm64.tgz'] ?? GOOD_SHA
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, 'cloudflared-darwin-arm64.tgz'), new Uint8Array([1]))
    const pending = ensureCloudflaredBinary(t.deps, 'darwin', 'arm64')
    await untilSpawn(t, 1) // tar 派生后喂成功退出码（fake 进程不自行退出）
    spawnOf(t).exit(0)
    const path = await pending
    expect(t.spawnCalls[0]?.cmd).toBe('tar')
    expect(t.spawnCalls[0]?.args[0]).toBe('-xzf')
    expect(path).toBe(cachedBinaryPath(TMP, 'cloudflared-darwin-arm64')) // 解包产物名（去 .tgz）
  })

  it('dsh-desktop 已下载的 cloudflared 作种子：sha256 对 pin 清单校验一致 → 拷贝进产品缓存（零下载、非运行期引用）', async () => {
    const t = makeDeps()
    const seed = 'C:/Users/x/AppData/Roaming/dsh-desktop/bin/cloudflared.exe'
    t.files.set(seed, new Uint8Array([1])) // dsh 缓存在盘；fake sha256 缺省返回清单值 = 校验一致
    const path = await ensureCloudflaredBinary(t.deps, 'win32', 'x64', [seed])
    expect(path).toBe(cachedBinaryPath(TMP, ASSET)) // 返回产品自身缓存路径
    expect(t.files.has(path)).toBe(true) // 字节已拷贝进产品缓存
    expect(t.files.get(path)).toEqual(new Uint8Array([1]))
    expect(t.fetchCalls).toHaveLength(0) // 不下载——GitHub 不可达环境也能就位
  })

  it('bug a98a4cda：落盘前必建缓存目录（mkdir 缓存目录——缺此步 writeFile ENOENT 必败，官方 :583 同径）', async () => {
    const t = makeDeps()
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET), new Uint8Array([1, 2]))
    await ensureCloudflaredBinary(t.deps, 'win32', 'x64')
    expect(t.mkdirs).toContain(cacheDirOf(TMP)) // 目录先于 writeFile 建立
  })

  it('种子校验不过（版本漂移）→ 跳过收编落回下载链', async () => {
    const t = makeDeps()
    const seed = 'C:/Users/x/AppData/Roaming/dsh-desktop/bin/cloudflared.exe'
    t.files.set(seed, new Uint8Array([1]))
    let calls = 0
    t.deps.sha256 = () => {
      calls += 1
      return calls === 1 ? 'b'.repeat(64) : (CLOUDFLARED_SHA256[ASSET] ?? GOOD_SHA) // 首次=种子（不符），二次=下载（过）
    }
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET), new Uint8Array([2, 3]))
    const path = await ensureCloudflaredBinary(t.deps, 'win32', 'x64', [seed])
    expect(path).toBe(cachedBinaryPath(TMP, ASSET))
    expect(t.fetchCalls).toHaveLength(1) // 落回下载
    expect(t.files.get(path)).toEqual(new Uint8Array([2, 3])) // 缓存 = 下载内容（非种子字节）
  })

  it('外部种子缺席 → 纯下载链自洽（用户未装 dsh 形态）', async () => {
    const t = makeDeps()
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET), new Uint8Array([1, 2, 3]))
    const path = await ensureCloudflaredBinary(t.deps, 'win32', 'x64', ['C:/不存在/cloudflared.exe'])
    expect(path).toBe(cachedBinaryPath(TMP, ASSET))
    expect(t.fetchCalls).toHaveLength(1)
  })
})

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

  it('ssh 提前退出 → 兜底不可用错误（stderr 首错误行随行）', async () => {
    const t = makeDeps()
    const pending = startPinggyTunnel(1, t.deps, 5_000)
    const proc = spawnOf(t)
    proc.feed('ssh: connect to host free.pinggy.io port 22: Connection refused')
    proc.exit(255)
    await expect(pending).rejects.toThrow(/ssh 提前退出（code=255）：ssh: connect to host free\.pinggy\.io/)
  })

  it('ssh 零输出提前退出 → 错误不带原因尾注', async () => {
    const t = makeDeps()
    const pending = startPinggyTunnel(1, t.deps, 5_000)
    spawnOf(t).exit(255)
    await expect(pending).rejects.toThrow(/^ssh 提前退出（code=255）——pinggy 兜底不可用$/)
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

  it('cloudflared 意外退出 → 同链路退避重试（1s/4s）仍败 → 自动兜底 Pinggy（换线）', async () => {
    const t = makeDeps()
    primeCloudflared(t)
    const manager = new TunnelManager(t.deps, { localPort: 43127, captureTimeoutMs: 200 })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.feed(CF_URL)
    await pending // 先建立成功——意外死亡语义属于 attach 后状态机（捕获窗死亡走 start() 既有兜底）
    cf.exit(1)
    // 重试 1（1s 退避后）：仍是 cloudflared，再败
    const cf2 = await untilSpawn(t, 2)
    expect(t.spawnCalls[1]?.cmd).not.toBe('ssh')
    expect(t.sleeps).toEqual([1_000])
    cf2.exit(1)
    // 重试 2（4s 退避后）：仍败 → 切 Pinggy
    const cf3 = await untilSpawn(t, 3)
    expect(t.sleeps).toEqual([1_000, 4_000])
    cf3.exit(1)
    const pg = await untilSpawn(t, 4)
    const pinggySeen = new Promise<TunnelState>((resolve) => {
      manager.onEvent((s) => {
        if (s.provider === 'pinggy') resolve(s)
      })
    })
    pg.feed(PG_URL)
    const state = await pinggySeen // pending = 首次 start 的 cloudflared 态；最终态走事件面
    expect(state.provider).toBe('pinggy')
    expect(state.remainingTtlMs).toBe(PINGGY_TTL_MS)
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
    // 重试链（1s/4s）全败后才切 Pinggy
    const cf2 = await untilSpawn(t, 2)
    cf2.exit(1)
    const cf3 = await untilSpawn(t, 3)
    cf3.exit(1)
    const pg = await untilSpawn(t, 4)
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

describe('隧道韧性：同链路退避重试 + 死亡/失败原因落诊断', () => {
  function primeCloudflared(t: ReturnType<typeof makeDeps>): void {
    t.setBody(cloudflaredDownloadUrl(CLOUDFLARED_VERSION, ASSET), new Uint8Array([1]))
  }

  it('cloudflared 闪断 → 同链路重试第 1 次成功：零 Pinggy 派生，状态维持 cloudflared', async () => {
    const t = makeDeps()
    primeCloudflared(t)
    const manager = new TunnelManager(t.deps, { localPort: 43127, captureTimeoutMs: 200 })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.feed(CF_URL)
    await pending
    cf.exit(1)
    const cf2 = await untilSpawn(t, 2)
    expect(t.spawnCalls[1]?.cmd).not.toBe('ssh')
    expect(t.sleeps).toEqual([1_000]) // 重试前 1s 退避
    cf2.feed(CF_URL)
    await new Promise((resolve) => setImmediate(resolve))
    expect(manager.state?.provider).toBe('cloudflared')
    expect(t.spawnCalls.some((c) => c.cmd === 'ssh')).toBe(false)
    expect(t.sleeps).toEqual([1_000]) // 成功即止——无第二次退避
  })

  it('重试期间 stop() → 状态机即弃：不再派生任何链路进程', async () => {
    const t = makeDeps()
    primeCloudflared(t)
    const manager = new TunnelManager(t.deps, { localPort: 43127, captureTimeoutMs: 200 })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.feed(CF_URL)
    await pending
    cf.exit(1)
    await untilSpawn(t, 2)
    t.spawned[1]?.exit(1) // 重试 1 败 → 进入 4s 退避窗
    await new Promise((resolve) => setImmediate(resolve)) // 失败结算微任务冲刷
    expect(t.sleeps).toContain(4_000)
    await manager.stop()
    const count = t.spawned.length
    await new Promise((resolve) => setImmediate(resolve))
    expect(t.spawned).toHaveLength(count) // 退避窗内停机 → 零复活
    expect(manager.state).toBeUndefined()
    expect(t.spawnCalls.some((c) => c.cmd === 'ssh')).toBe(false)
    void pending
  })

  it('Pinggy 死亡 → 同链路重试 ×2 败 → 切 cloudflared；撤面 diag 携带双链最后失败原因', async () => {
    const t = makeDeps() // cloudflared 链恒败（无下载体）
    const diagLines: string[] = []
    const manager = new TunnelManager(t.deps, {
      localPort: 43127,
      captureTimeoutMs: 200,
      diag: (line) => diagLines.push(line),
    })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.feed(PG_URL) // 下载链失败误喂无害——start 兜底起 Pinggy
    await pending
    const pg = t.spawned.find((_, i) => t.spawnCalls[i]?.cmd === 'ssh')
    expect(pg).toBeDefined()
    const dead = new Promise<TunnelState>((resolve) => {
      manager.onEvent((s) => {
        if (s.remainingTtlMs === 0) resolve(s)
      })
    })
    pg?.exit(255)
    const pg2 = await untilSpawn(t, 2)
    expect(t.spawnCalls[1]?.cmd).toBe('ssh')
    pg2.exit(255)
    const pg3 = await untilSpawn(t, 3)
    expect(t.sleeps).toEqual([1_000, 4_000])
    pg3.exit(255)
    const deadState = await dead // 双链路皆败 → 死亡撤面 emit
    expect(deadState.remainingTtlMs).toBe(0)
    const joined = diagLines.join('\n')
    expect(joined).toMatch(/pinggy.*code=255/)
    expect(joined).toMatch(/cloudflared/)
    expect(joined).toContain('双链路皆败')
  })

  it('cloudflared 死亡原因（exit code + 末行 stderr）落 diag；重试成功不撤面', async () => {
    const t = makeDeps()
    primeCloudflared(t)
    const diagLines: string[] = []
    const manager = new TunnelManager(t.deps, {
      localPort: 43127,
      captureTimeoutMs: 200,
      diag: (line) => diagLines.push(line),
    })
    const pending = manager.start()
    const cf = await untilSpawn(t)
    cf.feed(CF_URL)
    await pending
    cf.feed('ERR | connection closed unexpectedly')
    cf.exit(7)
    const cf2 = await untilSpawn(t, 2)
    cf2.feed(CF_URL)
    await new Promise((resolve) => setImmediate(resolve))
    expect(manager.state?.provider).toBe('cloudflared')
    expect(diagLines.join('\n')).toMatch(/cloudflared.*code=7.*connection closed unexpectedly/)
  })
})
