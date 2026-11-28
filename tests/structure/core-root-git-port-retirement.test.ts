// plugins-remediation-m1 阶段 C 结构钉（spec §2.3 / Goal 3 AC 4）：git 身份探针面已迁
// @dsh-forge/lib-git（lib/git）——core 根出口不再再导出 createGitIdentityPort 与
// GitIdentityPort，消费点直取公共库。源文本级断言（读 packages/core/src/index.ts）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..')
const CORE_INDEX = join(ROOT, 'packages', 'core', 'src', 'index.ts')

describe('core 根出口退役 git 身份探针面（迁 @dsh-forge/lib-git）', () => {
  it('packages/core/src/index.ts 源文本不含 createGitIdentityPort 与 GitIdentityPort', () => {
    const src = readFileSync(CORE_INDEX, 'utf8')
    expect(src.includes('createGitIdentityPort'), 'core 根出口仍含 createGitIdentityPort').toBe(false)
    expect(src.includes('GitIdentityPort'), 'core 根出口仍含 GitIdentityPort').toBe(false)
  })
})
