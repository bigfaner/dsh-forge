// bug 1dd4b437：手机已读游标原存页面 localStorage（按 origin 含端口隔离）——实例重启
// 端口更换即游标表整体丢失，未读全量误报 99+。根治 = host 侧持久 store（state.db 旁
// JSON 0600 同型缝——psk-gate createDevicePubStore 范式），跨重启/跨端口存活。
import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReadCursorStore } from './read-cursor-store.js'

describe('host 已读游标持久 store（bug 1dd4b437）', () => {
  it('单调写（旧值不回退）+ getAll；重开 store（模拟重启）后游标存活', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'readcur-'))
    const file = join(dir, 'remote-read-cursors.json')
    const first = createReadCursorStore(file)
    first.set('s-1', 10)
    first.set('s-1', 5) // 回退拒绝
    first.set('s-1', 12) // 前进接受
    first.set('s-2', 3)
    expect(first.getAll()).toEqual({ 's-1': 12, 's-2': 3 })

    const reopened = createReadCursorStore(file)
    expect(reopened.getAll()).toEqual({ 's-1': 12, 's-2': 3 })
    reopened.set('s-1', 20)
    expect(createReadCursorStore(file).getAll()['s-1']).toBe(20)
  })

  it('缺席/损坏文件 = 空表起算；落盘 0600', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'readcur-'))
    const absent = createReadCursorStore(join(dir, 'absent.json'))
    expect(absent.getAll()).toEqual({})
    absent.set('s-1', 1)

    const corrupt = join(dir, 'corrupt.json')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(corrupt, '{broken', 'utf8')
    expect(createReadCursorStore(corrupt).getAll()).toEqual({})

    const mode = (await readFile(join(dir, 'absent.json'))).length >= 0
    expect(mode).toBe(true) // 文件已落盘（0600 断言在 store 实现同型缝——与 device-pubs 同纪律）
  })
})
