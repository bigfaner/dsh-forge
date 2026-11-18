// M-3 五件裸包代际漂移探针自证——判据实现 generationDriftViolations
// （e2e/support/forge-combo.ts）正反双向验证（1.8 轮陈旧代际事故的反例路径固化）：
// - 正向：安装 manifest == 仓内源 + 服务面 bundle 含现行代际标记 → 零违例；
// - 反向（模拟陈旧代际 → 探针红）：①安装 manifest 陈旧 → manifest 违例；
//   ②服务面 bundle 缺现行代际标记（stale bundle 误测形态）→ service-face 违例；
//   ③服务面文件缺席 → service-face 违例；
//   ④装载闭包断裂（冷启动解析缺席）→ manifest 违例。
// bug a9404b5d 再锚自证（stale-anchor 三律：锚布局不锚行为——1.13 探针自身即反例判例）：
// - 正向⑤：pnpm v11 嵌套物化形态（五件兄弟依赖物化于 forge 条目自身 node_modules，
//   profile node_modules 零五件直挂物化）→ 冷启动解析命中 → 零违例；
// - 反向⑥：嵌套物化副本代际陈旧 → 探针红（解析基命中的是陈旧副本，不静默放行）。
// 环境封闭：源侧/安装侧均落在临时目录夹具（sourcePluginsRoot 注入），不依赖仓内
// 构建产物、不锁 pnpm 物化布局（判据 = 冷启动 Node 解析 + manifest exports["./client"]
// 声明的服务面入口）。
// bug b4c4d1d7 反例锚：夹具 exports["."] 取真实五件同形（types+import 双条件、无
// require/default——ESM-only），CJS require.resolve 打不通该形态
// （ERR_PACKAGE_PATH_NOT_EXPORTED），探针解析面必须双形态兼容（CJS 条件可达走
// require.resolve；ESM-only 走 exports["."] 声明物存在性回落）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BARE_BUNDLES, generationDriftViolations, generationMarker } from '../../../e2e/support/forge-combo.js'

const SOURCE_VERSION = '9.9.0'

/** 源侧五件包夹具：package.json（"." 入口 + exports 声明服务面入口）+ dist 件（含现行代际标记） */
const PKG_EXPORTS = {
  '.': { types: './dist/host.d.ts', import: './dist/host.js' },
  './client': { types: './dist/client.d.ts', default: './dist/client.js' },
}

function makeSourceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'gen-drift-src-'))
  for (const pkg of BARE_BUNDLES) {
    const short = pkg.slice('@dsh-forge/'.length)
    const dir = join(root, short)
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: pkg,
        version: SOURCE_VERSION,
        main: './dist/host.js',
        exports: PKG_EXPORTS,
      }),
    )
    writeFileSync(join(dir, 'dist', 'host.js'), 'host body\n')
    writeFileSync(join(dir, 'dist', 'client.js'), `/* ${generationMarker(pkg, SOURCE_VERSION)} */\nbundle body\n`)
  }
  return root
}

interface InstallOpts {
  version?: string
  face?: string
  faceFile?: boolean
  manifest?: boolean
  /** 缺席件（闭包断裂反例——该件零物化） */
  absent?: string
}

/** 安装侧夹具：node_modules/@dsh-forge/<short>/{package.json, dist/*}——写半侧 host 件保证 "." 入口可解析 */
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
        main: './dist/host.js',
        exports: PKG_EXPORTS,
      }),
    )
  }
  mkdirSync(join(dir, 'dist'), { recursive: true })
  writeFileSync(join(dir, 'dist', 'host.js'), 'host body\n')
  if (opts.faceFile !== false) {
    writeFileSync(join(dir, 'dist', 'client.js'), opts.face ?? `/* ${generationMarker(pkg, SOURCE_VERSION)} */\nbundle body\n`)
  }
}

function makeInstalled(opts: InstallOpts = {}): { nodeModules: string; sourceRoot: string } {
  const profileDir = mkdtempSync(join(tmpdir(), 'gen-drift-prof-'))
  const nodeModules = join(profileDir, 'node_modules')
  for (const pkg of BARE_BUNDLES) {
    if (pkg === opts.absent) continue
    installPkg(nodeModules, pkg, opts)
  }
  return { nodeModules, sourceRoot: makeSourceRoot() }
}

/** pnpm v11 嵌套物化夹具：forge 组合器直挂 + 五件物化于 forge 条目自身 node_modules（profile 侧零五件直挂） */
function makeNestedInstalled(opts: InstallOpts = {}): { nodeModules: string; sourceRoot: string } {
  const profileDir = mkdtempSync(join(tmpdir(), 'gen-drift-nest-'))
  const nodeModules = join(profileDir, 'node_modules')
  const nested = join(nodeModules, '@dsh-forge', 'forge', 'node_modules')
  installPkg(nested, '@dsh-forge/forge', opts)
  for (const pkg of BARE_BUNDLES) installPkg(nested, pkg, opts)
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

  it('反向④（a9404b5d 再锚新增）：装载闭包断裂（一件零物化，冷启动解析缺席）→ manifest 违例', () => {
    const { nodeModules, sourceRoot } = makeInstalled({ absent: '@dsh-forge/knowledge' })
    const violations = generationDriftViolations(nodeModules, { sourcePluginsRoot: sourceRoot })
    expect(violations.length).toBe(1)
    expect(violations[0]?.pkg).toBe('@dsh-forge/knowledge')
    expect(violations[0]?.kind).toBe('manifest')
    expect(violations[0]?.detail).toContain('冷启动解析缺席')
  })

  it('正向⑤（a9404b5d 再锚判例）：pnpm v11 嵌套物化形态（profile 侧零五件直挂）→ 冷启动解析命中 → 零违例', () => {
    const { nodeModules, sourceRoot } = makeNestedInstalled()
    const violations = generationDriftViolations(nodeModules, { sourcePluginsRoot: sourceRoot })
    expect(violations, JSON.stringify(violations)).toEqual([])
  })

  it('反向⑥（a9404b5d 再锚反例）：嵌套物化副本代际陈旧 → 探针红（不静默放行）', () => {
    const { nodeModules, sourceRoot } = makeNestedInstalled({ version: '0.0.1' })
    const violations = generationDriftViolations(nodeModules, { sourcePluginsRoot: sourceRoot })
    expect(violations.length).toBe(BARE_BUNDLES.length)
    for (const v of violations) {
      expect(v.kind).toBe('manifest')
      expect(v.detail).toContain('代际陈旧')
    }
  })

  it('逐件覆盖：探针遍历五件裸包全集（不收窄、不遗漏）', () => {
    const { nodeModules, sourceRoot } = makeInstalled({ version: '0.0.1' })
    const flagged = new Set(generationDriftViolations(nodeModules, { sourcePluginsRoot: sourceRoot }).map((v) => v.pkg))
    expect([...flagged].sort()).toEqual([...BARE_BUNDLES].sort())
  })
})
