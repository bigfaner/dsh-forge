// S1 实测约束 2 机械守卫：apps/host 依赖树（installAnchor 树）必须精确供应运行时包集合
//（官方组合 peer 闭包 ∪ boot/API 面）。漂移即红——升级须走 S1 重验。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_PLUGIN_PACKAGES, RUNTIME_PACKAGES } from './runtime-packages.js'

const hostPkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}

describe('运行时包集合（S1 闭包）', () => {
  it('清单全部精确 pin 于 apps/host dependencies（版本逐项一致）', () => {
    for (const [name, version] of Object.entries(RUNTIME_PACKAGES)) {
      expect(hostPkg.dependencies[name], `${name} 缺席 apps/host dependencies`).toBe(version)
    }
  })

  it('闭包要角在场（peer 闭包代表 + boot 面 + Cordis Loader 四件）', () => {
    for (const name of [
      '@deepseek-ai/dsh-sandbox',
      '@deepseek-ai/dsh-session-persistence',
      '@deepseek-ai/dsh-output-retention',
      '@deepseek-ai/dsh-app-boot',
      '@deepseek-ai/dsh',
      '@deepseek-ai/cordis-plugin-loader',
    ]) {
      expect(RUNTIME_PACKAGES[name]).toBeDefined()
    }
  })

  it('全部精确版本（无 ^/~ 范围——P1 期不开升级窗口）', () => {
    for (const version of Object.values(RUNTIME_PACKAGES)) {
      expect(version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
    }
  })
})

// 3.4 产品插件闭包：@dsh-forge/plugin-forge 入运行时闭包——dev 锚树经 apps/host deps
// workspace 链接供应（真实版本在包 manifest；打包形态 = assemble 自 packages/ 真实拷贝，
// profile.install 禁声明 @dsh-forge/*——installer-pipeline pin）。
describe('产品插件闭包（3.4 M2）', () => {
  it('闭包成员全部以 workspace 链接入 apps/host dependencies（锚树供应）', () => {
    expect(PRODUCT_PLUGIN_PACKAGES).toContain('@dsh-forge/plugin-forge')
    for (const name of PRODUCT_PLUGIN_PACKAGES) {
      expect(hostPkg.dependencies[name], `${name} 缺席 apps/host dependencies（锚树供应断裂）`).toBe('workspace:*')
      // 不混入 npm 精确 pin 池（profile.install 消费——无 npm 分发形态）
      expect(RUNTIME_PACKAGES[name], `${name} 不得入 RUNTIME_PACKAGES`).toBeUndefined()
    }
  })

  it('dev profile 树链接在场（loader 行 import 锚——materialize dev 同步 pin 姊妹面）', () => {
    const devPkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', '..', 'profile.dev', 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> }
    for (const name of PRODUCT_PLUGIN_PACKAGES) {
      expect(devPkg.dependencies[name], `profile.dev 缺链接行 ${name}`).toBe(`link:../../../packages/${name.slice('@dsh-forge/'.length)}`)
    }
  })
})
