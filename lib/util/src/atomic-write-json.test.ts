// atomicWriteJson 单测——同目录 tmp + rename 原子写（自 settings service 原子写段单源化）。
// 覆盖：文件形状（2 空格缩进 + 尾换行）/ 无 .tmp 残留 / 父目录自动递归建 / 失败面（rename
// 撞目录态 → 原异常上抛 + tmp 清理零残留；JSON 序列化失败 → 原异常上抛不落文件）。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { atomicWriteJson } from './atomic-write-json.js'

const TMP = mkdtempSync(join(tmpdir(), 'atomic-write-json-'))
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe('atomicWriteJson', () => {
  it('写入内容 = JSON.stringify(value, null, 2) + 尾换行（settings 文件形状逐字承袭）', () => {
    const file = join(TMP, 'shape', 'settings.json')
    atomicWriteJson(file, { worker: { model: 'm' } })
    expect(readFileSync(file, 'utf8')).toBe('{\n  "worker": {\n    "model": "m"\n  }\n}\n')
  })

  it('原子写：写后目录仅目标文件（同目录 tmp + rename 无 .tmp 残留）', () => {
    const dir = join(TMP, 'residue')
    atomicWriteJson(join(dir, 'f.json'), { a: 1 })
    expect(readdirSync(dir)).toEqual(['f.json'])
  })

  it('父目录缺席 → 递归建（settings set 原有 mkdirSync recursive 语义保持）', () => {
    const file = join(TMP, 'deep', 'a', 'b', 'f.json')
    atomicWriteJson(file, { ok: true })
    expect(existsSync(file)).toBe(true)
  })

  it('rename 失败（目标位被目录占据）→ 原异常上抛 + tmp 清理零残留', () => {
    const dir = join(TMP, 'blocked')
    mkdirSync(join(dir, 'f.json'), { recursive: true }) // 目标位是目录——renameSync 必败
    expect(() => atomicWriteJson(join(dir, 'f.json'), { a: 1 })).toThrow()
    expect(readdirSync(dir)).toEqual(['f.json']) // 仅残留占位目录，无 .tmp
  })

  it('JSON 序列化失败（循环引用）→ 原异常上抛，目标文件不落', () => {
    const dir = join(TMP, 'circular')
    const value: Record<string, unknown> = {}
    value.self = value
    expect(() => atomicWriteJson(join(dir, 'f.json'), value)).toThrow()
    expect(existsSync(join(dir, 'f.json'))).toBe(false)
  })
})
