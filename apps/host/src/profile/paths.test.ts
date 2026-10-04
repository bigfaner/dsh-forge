// 1.4 双形态解析 pin（dev / packaged；Implementation Notes：自本任务区分，供 4.1 消费）。
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hostRoot, resolveHostPaths } from './paths.js'

describe('resolveHostPaths 双形态', () => {
  it('packaged 默认：profile = {userData}/profile，dshHome 缺省隔离 {userData}/dsh-home（fix-26）', () => {
    const paths = resolveHostPaths({}, 'C:/app-data/dsh-forge')
    expect(paths.form).toBe('packaged')
    expect(paths.profileDir.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/profile')
    expect(paths.dshHome.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/dsh-home')
    // 4.2 装配期路径：状态库 + knowledge 绑定表（boot overlay 注入 / host 维护）——应用私有面不随 fix-26 变
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

// fix-26：DSH_HOME 两层解析（数据隔离缺省——收口 fix-18 全共享副作用：原生 dsh 工作区/会话
// 混入产品账本即 fix-24 选择器污染根源；fix-18 USER_DATA 分支值升为缺省，e2e 形态值不变零改动）
describe('resolveHostPaths DSH_HOME 两层解析（fix-26）', () => {
  it('缺省（人用 dev/打包形态）→ 隔离 {userData}/dsh-home（dev/打包同口径）', () => {
    const dev = resolveHostPaths({ DSH_FORGE_DEV_PROFILE: 'dev' }, 'C:/app-data/dsh-forge')
    expect(dev.dshHome.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/dsh-home')
    // 打包形态同口径：resources 根在场（app.isPackaged 注入）不改变隔离缺省
    const packaged = resolveHostPaths({ DSH_FORGE_RESOURCES_DIR: 'X:/install/resources' }, 'C:/app-data/dsh-forge')
    expect(packaged.form).toBe('packaged')
    expect(packaged.dshHome.replaceAll('\\', '/')).toBe('C:/app-data/dsh-forge/dsh-home')
  })

  it('DSH_FORGE_USER_DATA 在场（e2e）→ {userData}/dsh-home 同值（e2e 全套零改动）+ 私有面不动', () => {
    const paths = resolveHostPaths({ DSH_FORGE_USER_DATA: 'C:/e2e-ud' }, 'C:/e2e-ud')
    expect(paths.dshHome.replaceAll('\\', '/')).toBe('C:/e2e-ud/dsh-home')
    expect(paths.stateDb.replaceAll('\\', '/')).toBe('C:/e2e-ud/state.db')
    expect(paths.bindingsFile.replaceAll('\\', '/')).toBe('C:/e2e-ud/knowledge-bindings.json')
  })

  it('DSH_FORGE_DSH_HOME 显式 > 缺省（绝对路径直取；空串视为缺省）', () => {
    const abs = resolveHostPaths(
      { DSH_FORGE_DSH_HOME: 'X:/tmp/dsh-home', DSH_FORGE_USER_DATA: 'C:/e2e-ud' },
      'C:/e2e-ud',
    )
    expect(abs.dshHome).toBe('X:/tmp/dsh-home')
    const empty = resolveHostPaths({ DSH_FORGE_DSH_HOME: '', DSH_FORGE_USER_DATA: 'C:/e2e-ud' }, 'C:/e2e-ud')
    expect(empty.dshHome.replaceAll('\\', '/')).toBe('C:/e2e-ud/dsh-home')
  })

  it('DSH_FORGE_DSH_HOME 相对路径锚 host 根（与 PROFILE_DIR/RESOURCES_DIR 同语义）', () => {
    const rel = resolveHostPaths({ DSH_FORGE_DSH_HOME: 'tmp/dsh-home' }, 'C:/ud')
    expect(rel.dshHome).toBe(join(hostRoot(), 'tmp/dsh-home'))
  })
})

// fix-26 凭据桥生效门（与 fix-18 USER_DATA 隐式隔离门同构）：非 USER_DATA 隔离态 → 真 home
// 凭据文档路径（数据隔离而凭据共享不重配）；USER_DATA 在场（e2e/测试）→ undefined 不读真凭据
describe('resolveHostPaths 凭据桥生效门（fix-26）', () => {
  it('缺省（人用 dev/打包形态）→ {homedir}/.dsh/.credentials.yaml（真 home 凭据文档）', () => {
    const paths = resolveHostPaths({}, 'C:/app-data/dsh-forge')
    expect(paths.credentialsPath).toBe(join(homedir(), '.dsh', '.credentials.yaml'))
  })

  it('DSH_FORGE_USER_DATA 在场（e2e/测试）→ undefined 不桥（不读真凭据）', () => {
    const paths = resolveHostPaths({ DSH_FORGE_USER_DATA: 'C:/e2e-ud' }, 'C:/e2e-ud')
    expect(paths.credentialsPath).toBeUndefined()
    const emptyString = resolveHostPaths({ DSH_FORGE_USER_DATA: '' }, 'C:/ud') // 空串 = 未置位
    expect(emptyString.credentialsPath).toBe(join(homedir(), '.dsh', '.credentials.yaml'))
  })

  it('DSH_FORGE_DSH_HOME 调试口不关桥（门只认 USER_DATA——人用调试语义同缺省）', () => {
    const paths = resolveHostPaths({ DSH_FORGE_DSH_HOME: 'X:/tmp/dsh-home' }, 'C:/ud')
    expect(paths.credentialsPath).toBe(join(homedir(), '.dsh', '.credentials.yaml'))
  })
})
