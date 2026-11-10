// fix-30 单测 —— 比对归一键口径 pin（core 注册链与 knowledge 绑定表的同源契约面）。
// plugin-project 1.6 随本体 git mv 迁入 lib/path（packages/path-key 退役待删）。
// 变体矩阵 = 两消费方共同承诺：同一拼写变体在 core 命中既有行 ⟺ 在 knowledge 命中绑定行。
import { describe, expect, it, vi } from 'vitest'
import { normalizeDirPath, normalizeDirSpelling, normalizeFsPath } from './path-key.js'

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

  it('浏览器捆包（无 process）经 navigator 探测 win32 折叠——web 侧键与 host 键同源', () => {
    const realProcess = globalThis.process
    try {
      // 模拟浏览器：process 缺席 + Windows UA
      ;(globalThis as { process?: unknown }).process = undefined
      vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
      expect(normalizeFsPath('C:\\WS\\Demo')).toBe('c:/ws/demo')
      expect(normalizeFsPath('Z:\\Learn\\Test-01')).toBe(normalizeFsPath('z:\\learn\\TEST-01\\'))
      // 非 Windows UA → 大小写敏感
      vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' })
      expect(normalizeFsPath('/WS/Demo')).toBe('/WS/Demo')
    } finally {
      vi.unstubAllGlobals()
      ;(globalThis as { process?: unknown }).process = realProcess
    }
  })
})

// ── normalize 单源（1.6 收敛：web normalizeDirPath 与 core normalizeDirSpelling 双实现归一） ──

describe('normalize 单源收敛（同则一份实现——web/core 两口径语义逐字承袭）', () => {
  it('normalizeDirSpelling（扁平化口径）：无条件 `/` → `\\` + 去尾分隔符', () => {
    expect(normalizeDirSpelling('Z:/project/dsh')).toBe('Z:\\project\\dsh')
    expect(normalizeDirSpelling('Z:\\project\\dsh\\')).toBe('Z:\\project\\dsh')
    expect(normalizeDirSpelling('/home/user')).toBe('\\home\\user') // 无条件改写——derive-dir flatten 依赖
  })

  it('normalizeDirPath（表单口径）：Windows 风格走同一单源；POSIX 保持 `/` 仅去尾', () => {
    expect(normalizeDirPath('Z:\\project\\dsh\\')).toBe('Z:\\project\\dsh')
    expect(normalizeDirPath('Z:/project//')).toBe('Z:\\project')
    expect(normalizeDirPath('/Users/panda/proj//')).toBe('/Users/panda/proj')
    expect(normalizeDirPath('/home/p/a\\b')).toBe('/home/p/a\\b') // POSIX 文件名可含 `\`，不重写
    // 两口径共享同一 Windows 面实现（单源自证）
    expect(normalizeDirPath('C:\\a\\b\\')).toBe(normalizeDirSpelling('C:\\a\\b\\'))
  })
})
