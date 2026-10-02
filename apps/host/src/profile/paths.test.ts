// 1.4 双形态解析 pin（dev / packaged；Implementation Notes：自本任务区分，供 4.1 消费）。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hostRoot, resolveHostPaths } from './paths.js'

describe('resolveHostPaths 双形态', () => {
  it('packaged 默认：profile = {userData}/profile，DSH_HOME 隔离到 {userData}/dsh-home', () => {
    const paths = resolveHostPaths({}, 'C:/app-data/dsh-forge')
    expect(paths.form).toBe('packaged')
    expect(paths.profileDir.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/profile')
    expect(paths.dshHome.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/dsh-home')
    // 4.2 装配期路径：状态库 + knowledge 绑定表（boot overlay 注入 / host 维护）
    expect(paths.stateDb.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/state.db')
    expect(paths.bindingsFile.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/knowledge-bindings.json')
  })

  it('dev 形态：DSH_FORGE_DEV_PROFILE 真值 → workspace 预组装 profile.dev 目录', () => {
    const paths = resolveHostPaths({ DSH_FORGE_DEV_PROFILE: 'dev' }, 'C:/irrelevant')
    expect(paths.form).toBe('dev')
    expect(paths.profileDir).toBe(join(hostRoot(), 'profile.dev'))
    expect(existsSync(join(paths.profileDir, 'package.json'))).toBe(true)
  })

  it('DSH_FORGE_PROFILE_DIR 显式覆盖（绝对路径直取；相对路径锚 host 根）', () => {
    const abs = resolveHostPaths({ DSH_FORGE_PROFILE_DIR: 'X:/tmp/prof' }, 'C:/ud')
    expect(abs.profileDir).toBe('X:/tmp/prof')
    const rel = resolveHostPaths({ DSH_FORGE_PROFILE_DIR: 'profile.dev' }, 'C:/ud')
    expect(rel.profileDir).toBe(join(hostRoot(), 'profile.dev'))
  })

  it('installAnchor：默认解析 @deepseek-ai/dsh/package.json（installAnchor 树在场），env 可覆盖', () => {
    const paths = resolveHostPaths({}, 'C:/ud')
    expect(paths.installAnchor.replaceAll('\\', '/')).toMatch(/@deepseek-ai[/\\]dsh[/\\]package\.json$/)
    expect(existsSync(paths.installAnchor)).toBe(true)
    const over = resolveHostPaths({ DSH_FORGE_INSTALL_ANCHOR: 'X:/anchor/pkg.json' }, 'C:/ud')
    expect(over.installAnchor).toBe('X:/anchor/pkg.json')
  })

  it('hostRoot 指向 apps/host 包根（src 与 dist 同深度锚定）', () => {
    expect(existsSync(join(hostRoot(), 'package.json'))).toBe(true)
    expect(hostRoot().replaceAll('\\', '/')).toMatch(/apps\/host$/)
  })
})

// 4.1 打包形态资源根：DSH_FORGE_RESOURCES_DIR 置位 → installAnchor = {resources}/runtime/package.json
// （合成 anchor 清单，assemble-installer-resources.mjs 物化；main 侧 app.isPackaged 注入）
describe('resolveHostPaths 打包资源根（DSH_FORGE_RESOURCES_DIR）', () => {
  it('置位 → anchor = {resources}/runtime/package.json + resourcesDir 透出', () => {
    const paths = resolveHostPaths({ DSH_FORGE_RESOURCES_DIR: 'X:/install/resources' }, 'C:/ud')
    expect(paths.resourcesDir).toBe('X:/install/resources')
    expect(paths.installAnchor.replaceAll('\\', '/')).toBe('X:/install/resources/runtime/package.json')
  })

  it('相对 resources 根锚 host 根（与 DSH_FORGE_PROFILE_DIR 同语义）', () => {
    const rel = resolveHostPaths({ DSH_FORGE_RESOURCES_DIR: 'rel/res' }, 'C:/ud')
    expect(rel.resourcesDir).toBe(join(hostRoot(), 'rel/res'))
    expect(rel.installAnchor).toBe(join(hostRoot(), 'rel/res', 'runtime', 'package.json'))
  })

  it('DSH_FORGE_INSTALL_ANCHOR 显式覆盖优先于 resources 推导（调试口径）', () => {
    const over = resolveHostPaths(
      { DSH_FORGE_RESOURCES_DIR: 'X:/install/resources', DSH_FORGE_INSTALL_ANCHOR: 'X:/other/pkg.json' },
      'C:/ud',
    )
    expect(over.installAnchor).toBe('X:/other/pkg.json')
    expect(over.resourcesDir).toBe('X:/install/resources')
  })

  it('未置位 → 无 resourcesDir，anchor 回退 workspace 解析（dev/调试形态）', () => {
    const paths = resolveHostPaths({}, 'C:/ud')
    expect(paths.resourcesDir).toBeUndefined()
    expect(existsSync(paths.installAnchor)).toBe(true)
  })
})
