// M-3 五件裸包代际漂移探针自证——判据实现 generationDriftViolations
// （e2e/support/forge-combo.ts）正反双向验证（1.8 轮陈旧代际事故的反例路径固化）：
// - 正向：安装 manifest == 仓内源 + 服务面 bundle 含现行代际标记 → 零违例；
// - 反向（模拟陈旧代际 → 探针红）：①安装 manifest 陈旧 → manifest 违例；
//   ②服务面 bundle 缺现行代际标记（stale bundle 误测形态）→ service-face 违例；
//   ③服务面文件缺席 → service-face 违例。
// 环境封闭：源侧/安装侧均落在临时目录夹具（sourcePluginsRoot 注入），不依赖仓内
// 构建产物、不锁 pnpm 物化布局（装载面入口 = manifest exports["./client"] 声明）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BARE_BUNDLES, generationDriftViolations, generationMarker } from '../../../e2e/support/forge-combo.js'

const SOURCE_VERSION = '9.9.0'

/** 源侧五件包夹具：package.json（exports 声明服务面入口）+ dist/client.js（含现行代际标记） */
function makeSourceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'gen-drift-src-'))
  for (const pkg of BARE_BUNDLES) {
    const short = pkg.slice('@dsh-forge/'.length)
    const dir = join(root, short)
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: pkg, version: SOURCE_VERSION, exports: { './client': { default: './dist/client.js' } } }),
    )
    writeFileSync(join(dir, 'dist', 'client.js'), `/* ${generationMarker(pkg, SOURCE_VERSION)} */\nbundle body\n`)
  }
  return root
}

interface InstallOpts {
  version?: string
  face?: string
  faceFile?: boolean
  manifest?: boolean
}

/** 安装侧夹具：node_modules/@dsh-forge/<short>/{package.json, dist/client.js} */
function installPkg(nodeModules: string, pkg: string, opts: InstallOpts = {}): void {
  const short = pkg.slice('@dsh-forge/'.length)
  const dir = join(nodeModules, '@dsh-forge', short)
  mkdirSync(dir, { recursive: true })
  if (opts.manifest !== false) {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: pkg,
        version: opts.version ?? SOURCE_VERSION,
        exports: { './client': { default: './dist/client.js' } },
      }),
    )
  }
  if (opts.faceFile !== false) {
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'client.js'), opts.face ?? `/* ${generationMarker(pkg, SOURCE_VERSION)} */\nbundle body\n`)
  }
}

function makeInstalled(opts: InstallOpts = {}): { nodeModules: string; sourceRoot: string } {
  const nodeModules = mkdtempSync(join(tmpdir(), 'gen-drift-nm-'))
  for (const pkg of BARE_BUNDLES) installPkg(nodeModules, pkg, opts)
  return { nodeModules, sourceRoot: makeSourceRoot() }
}

describe('generationDriftViolations（M-3 代际漂移探针）', () => {
  it('正向：manifest == 仓内源 + 服务面含现行代际标记 → 五件零违例', () => {
    const { nodeModules, sourceRoot } = makeInstalled()
    expect(generationDriftViolations(nodeModules, { sourcePluginsRoot: sourceRoot })).toEqual([])
  })

  it('反向①：安装 manifest 陈旧（≠ 仓内源）→ manifest 违例（stale generation 判红）', () => {
    const { nodeModules, sourceRoot } = makeInstalled({ version: '0.0.1' })
    const violations = generationDriftViolations(nodeModules, { sourcePluginsRoot: sourceRoot })
    expect(violations.length).toBe(BARE_BUNDLES.length)
    for (const v of violations) {
      expect(v.kind).toBe('manifest')
      expect(v.detail).toContain('0.0.1')
    }
  })

  it('反向②（1.8 事故反例路径）：manifest 新而服务面为陈旧世代快照（缺现行标记）→ service-face 违例', () => {
    const { nodeModules, sourceRoot } = makeInstalled({ face: '/* @dsh-forge-generation:@dsh-forge/project@0.0.1 */\nstale bundle\n' })
    const violations = generationDriftViolations(nodeModules, { sourcePluginsRoot: sourceRoot })
    expect(violations.length).toBe(BARE_BUNDLES.length)
    for (const v of violations) {
      expect(v.kind).toBe('service-face')
      expect(v.detail).toContain('陈旧 bundle')
    }
  })

  it('反向③：服务面 bundle 文件缺席 → service-face 违例（fail-loud，不静默放行）', () => {
    const { nodeModules, sourceRoot } = makeInstalled({ faceFile: false })
    const violations = generationDriftViolations(nodeModules, { sourcePluginsRoot: sourceRoot })
    expect(violations.length).toBe(BARE_BUNDLES.length)
    for (const v of violations) expect(v.kind).toBe('service-face')
  })

  it('逐件覆盖：探针遍历五件裸包全集（不收窄、不遗漏）', () => {
    const { nodeModules, sourceRoot } = makeInstalled({ version: '0.0.1' })
    const flagged = new Set(generationDriftViolations(nodeModules, { sourcePluginsRoot: sourceRoot }).map((v) => v.pkg))
    expect([...flagged].sort()).toEqual([...BARE_BUNDLES].sort())
  })
})
