// S1 实测约束 2 机械守卫：apps/host 依赖树（installAnchor 树）必须精确供应运行时包集合
//（官方组合 peer 闭包 ∪ boot/API 面）。漂移即红——升级须走 S1 重验。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RUNTIME_PACKAGES } from './runtime-packages.js'

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
