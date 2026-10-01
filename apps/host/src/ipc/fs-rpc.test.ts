// 2.8 集成层——forge:fs/listDir 通道：目录列举（仅子目录/名称序/canonical 化）+
// 起始口径（缺省 = 主目录）+ 不可达拦截（普通 Error 带路径——六错误码无 fs 码位，
// 经 Electron 拒绝面 fail-loud，web 侧收敛为浏览器态错误条）+ 经 ipc 机制注册端到端。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { FS_CHANNELS, FORGE_CHANNEL_ALLOWLIST } from '@dsh-forge/contracts'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { listDir, registerFsChannels } from './fs-rpc.js'

// ── ipc 替身（ipcMain.handle 语义：注册表存储，invoke 直调 handler）──

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

// ── 临时目录夹具（真实文件系统面——host 域 node 环境）──

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-forge-fs-'))
let seq = 0
function fixture(build: (dir: string) => void): string {
  const dir = join(ROOT, `c${++seq}`)
  mkdirSync(dir)
  build(dir)
  return dir
}
afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

describe('listDir 域语义（2.8 AC1：目录列举路径正确）', () => {
  it('仅子目录入列（文件排除）、名称序、条目路径 = canonical 绝对路径', async () => {
    const dir = fixture((d) => {
      mkdirSync(join(d, 'beta'))
      mkdirSync(join(d, 'alpha'))
      mkdirSync(join(d, '.hidden'))
      writeFileSync(join(d, 'readme.txt'), 'x')
    })
    const listing = await listDir({ dirPath: dir })
    expect(listing.path).toBe(resolve(dir))
    expect(listing.entries).toEqual([
      { name: '.hidden', path: resolve(dir, '.hidden') },
      { name: 'alpha', path: resolve(dir, 'alpha') },
      { name: 'beta', path: resolve(dir, 'beta') },
    ])
  })

  it('parentPath = 上一级（「上一级」判据）；空目录 → entries = []', async () => {
    const parent = fixture((d) => mkdirSync(join(d, 'leaf')))
    const listing = await listDir({ dirPath: join(parent, 'leaf') })
    expect(listing.parentPath).toBe(resolve(parent))
    expect(listing.entries).toEqual([])
    // 相对输入同样 canonical 化（对账基准 = host resolve 结果）
    expect((await listDir({ dirPath: join(parent, 'leaf', '..', 'leaf') })).path).toBe(
      resolve(join(parent, 'leaf')),
    )
    expect(dirname(listing.path)).toBe(listing.parentPath)
  })

  it('dirPath 缺省 = 用户主目录（浏览器起始态）', async () => {
    const listing = await listDir({})
    expect(listing.path).toBe(homedir())
  })
})

describe('不可达路径拦截（2.8 AC4：错误条相位数据源）', () => {
  it('不存在路径 → 带 canonical 路径的普通 Error（不捏造空列举）', async () => {
    const missing = join(ROOT, 'no-such-dir')
    const caught = await listDir({ dirPath: missing }).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('目录不可达')
    expect((caught as Error).message).toContain(resolve(missing))
  })

  it('文件路径（非目录）→ 同径拦截', async () => {
    const file = fixture((d) => writeFileSync(join(d, 'f.txt'), 'x'))
    const caught = await listDir({ dirPath: join(file, 'f.txt') }).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('目录不可达')
  })
})

describe('通道注册端到端（allowlist 机制面）', () => {
  it('forge:fs/listDir 在 allowlist（preload/main 两道守门放行）', () => {
    expect(FORGE_CHANNEL_ALLOWLIST).toContain(FS_CHANNELS.listDir)
  })

  it('经 createForgeIpc 注册 → invoke 直调得 RpcOk 信封（数据 = DirListing）', async () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    registerFsChannels(ipc)
    expect([...handlers.keys()]).toEqual([FS_CHANNELS.listDir])
    const dir = fixture((d) => mkdirSync(join(d, 'sub')))
    const envelope = (await handlers.get(FS_CHANNELS.listDir)?.(undefined, {
      dirPath: dir,
    })) as { ok: boolean; data: { path: string; entries: unknown[] } }
    expect(envelope.ok).toBe(true)
    expect(envelope.data.path).toBe(resolve(dir))
    expect(envelope.data.entries).toEqual([{ name: 'sub', path: resolve(dir, 'sub') }])
  })

  it('handler 抛错 → 信封外原样上抛（普通 Error 不降级为伪 typed——Electron 拒绝面）', async () => {
    const { ipcMain, handlers } = fakeIpcMain()
    registerFsChannels(createForgeIpc(ipcMain))
    const missing = join(ROOT, 'gone')
    await expect(
      handlers.get(FS_CHANNELS.listDir)?.(undefined, { dirPath: missing }),
    ).rejects.toThrow(/目录不可达/)
  })
})
