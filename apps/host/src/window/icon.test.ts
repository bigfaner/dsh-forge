// window/icon 单测 —— 窗口图标路径解析 pin（fix-45：resolveWebDistDir 同构双形态）。
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveWindowIconPath } from './icon.js'
import { hostRoot } from '../profile/paths.js'

describe('resolveWindowIconPath（fix-45 窗口图标双形态）', () => {
  it('dev 缺省 = hostRoot 上溯仓库根 build/icon.png（生成器 --emit icon 入仓位）', () => {
    expect(resolveWindowIconPath({})).toBe(join(hostRoot(), '..', '..', 'build', 'icon.png'))
  })

  it('4.1 打包形态：DSH_FORGE_RESOURCES_DIR 置位 → {resources}/icon.png（extraResources 物化位）', () => {
    // 绝对 resources 根直取（win32 join 拼接绝对路径会产出废路径——实测坑，同 web-document）
    const abs = resolveWindowIconPath({ DSH_FORGE_RESOURCES_DIR: 'X:/install/resources' })
    expect(abs.replace(/\\/g, '/')).toBe('X:/install/resources/icon.png')
    // 相对锚 hostRoot（与 profile/paths resolveFromHost 同语义）
    expect(resolveWindowIconPath({ DSH_FORGE_RESOURCES_DIR: 'rel/res' }).replace(/\\/g, '/')).toMatch(
      /apps\/host\/rel\/res\/icon\.png$/,
    )
  })
})
