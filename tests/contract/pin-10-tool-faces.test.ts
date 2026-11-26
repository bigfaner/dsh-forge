// G1 pin（forge-dirs-unification 3.7 改写）：旧包（packages/plugin-forge /
// plugin-forge-spec）已从根 tsconfig references 与 vitest 配置摘出——本 pin 改钉
// 新包（plugins/project）的 tool 注册面：forge_dirs / forge_resolve_path 双只读
// 查询工具的常量面与装配面代码审计。
// Hard Rule：pin = 机械断言（代码审计/枚举）——本文件扫描源码文本与常量面，不做行为装配
// （行为面在 plugins/project 的单测临时 runtime 装配——两池互不替代）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from './pins.js'

const FORGE_PATHS_FILE = join(ROOT, 'plugins/project/host/tools/forge-paths.ts')
const PROJECT_INDEX_FILE = join(ROOT, 'plugins/project/host/index.ts')

describe('pin：project 包 tool 面（forge_dirs / forge_resolve_path 双只读查询工具）', () => {
  const forgePaths = readFileSync(FORGE_PATHS_FILE, 'utf8')

  it('常量面 = 两员：forge_dirs 与 forge_resolve_path（`const *_TOOL = <名>` 单源）', () => {
    expect(forgePaths).toContain('const DIRS_TOOL = "forge_dirs"')
    expect(forgePaths).toContain('const RESOLVE_TOOL = "forge_resolve_path"')
  })

  it('缺席面（旧包退役名）：tool 常量与注册面均不含旧名', () => {
    const absent = ['claimTask', 'spawnWorker', 'transitionTask', 'setProposalMode'] as const
    for (const name of absent) {
      expect(forgePaths, `forge-paths.ts 不应含旧名 ${name}`).not.toContain(`'${name}'`)
    }
  })

  it('装配面：host/index.ts 经 registerForgePathsTools 注册（forge-dirs-unification §2.3 双工具挂载缝）', () => {
    const index = readFileSync(PROJECT_INDEX_FILE, 'utf8')
    expect(index).toContain('registerForgePathsTools(')
  })
})
