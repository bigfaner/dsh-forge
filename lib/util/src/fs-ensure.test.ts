// fs-ensure 单测 —— ensureDirReadable（定位：umask 免疫的目录落盘）。
// 覆盖：
// - bug：mkdir 后显式 chmod 0o755（umask 0077 环境下 mkdir mode 位仍会被削——chmod 才是确定性；
//   macOS 700 目录现场 = validator 读取被拒的根因）
// - chmod fail-soft：不支持位权限的文件系统/平台（Windows ACL 面）chmod 失败不得抛断调用方
// - 幂等：目录在场 no-op（recursive mkdir 语义保持）
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ensureDirReadable } from './fs-ensure.js'

const TMP = mkdtempSync(join(tmpdir(), 'fs-ensure-'))
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe('bug: mkdir 后显式 chmod 0o755（umask 免疫）', () => {
  it('新建目录 → chmod(dir, 0o755) 恰一调用（mkdir mode 位会被 umask 再削，chmod 确定性）', () => {
    const calls: Array<{ dir: string; mode: number }> = []
    const dir = join(TMP, 'ws', '.forge') // 递归多层（ws 不在场）——中间层同径
    ensureDirReadable(dir, { chmodSync: (d, m) => void calls.push({ dir: d, mode: m }) })
    expect(calls).toEqual([{ dir, mode: 0o755 }])
  })

  it('chmod 失败 fail-soft：不抛断调用方（Windows/特殊文件系统 no-op 面）', () => {
    const dir = join(TMP, 'soft', '.knowledge')
    expect(() =>
      ensureDirReadable(dir, {
        chmodSync: () => {
          throw new Error('EPERM: operation not permitted')
        },
      }),
    ).not.toThrow()
  })

  it('幂等：目录在场重复调用不抛（recursive mkdir 语义保持——chmod 对既有目录同样施加补正）', () => {
    const dir = join(TMP, 'idem', '.forge')
    ensureDirReadable(dir)
    expect(() => ensureDirReadable(dir)).not.toThrow()
  })
})
