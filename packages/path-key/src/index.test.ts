// fix-30 单测 —— 比对归一键口径 pin（core 注册链与 knowledge 绑定表的同源契约面）。
// 变体矩阵 = 两消费方共同承诺：同一拼写变体在 core 命中既有行 ⟺ 在 knowledge 命中绑定行。
import { describe, expect, it } from 'vitest'
import { normalizeFsPath } from './index.js'

describe('normalizeFsPath（比对归一键）', () => {
  it('反斜杠 → 正斜杠 + 去尾分隔符（含重复）——平台无关基线', () => {
    const expected = process.platform === 'win32' ? 'c:/ws/demo' : 'C:/ws/demo'
    expect(normalizeFsPath('C:\\ws\\demo\\')).toBe(expected)
    expect(normalizeFsPath('/ws/a//')).toBe('/ws/a')
    expect(normalizeFsPath('C:\\ws\\demo')).toBe(normalizeFsPath('C:/ws/demo/'))
  })

  it('win32 折叠大小写；posix 大小写敏感（平台条件 pin）', () => {
    if (process.platform === 'win32') {
      expect(normalizeFsPath('C:\\WS\\Demo')).toBe('c:/ws/demo')
      expect(normalizeFsPath('z:\\LEARN')).toBe(normalizeFsPath('Z:\\learn\\'))
    } else {
      expect(normalizeFsPath('/ws/Demo')).not.toBe(normalizeFsPath('/ws/demo'))
      expect(normalizeFsPath('/ws/Demo')).toBe('/ws/Demo')
    }
  })

  it('等价变体收敛同键（比对语义核心：变体 ⟺ 同键 ⟺ 同一工作区）', () => {
    expect(normalizeFsPath('Z:\\learn')).toBe(normalizeFsPath('z:\\learn\\'))
    expect(normalizeFsPath('Z:\\learn')).toBe(normalizeFsPath('Z:/LEARN/'))
  })
})
