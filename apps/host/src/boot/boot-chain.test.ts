// fix-20 boot 链统一实例 pin：child 消费面与插件树消费面解析到同一 dsh-app-boot
// 物理拷贝（bootstrapIncludes 模块级 WeakMap——分裂即「profile reload requires the
// root Include entry」原生设置流程 P0）。真实 profile.dev 树 = 结构性防漂移 pin
// （依赖树漂移/半树即红）；adjacent 回退与 fail-loud 分支以临时树覆盖。
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { BootChainSplitError, loadBootChain } from './boot-chain.js'
import { hostRoot } from '../profile/paths.js'

const scratchDirs: string[] = []
afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
})

function makeScratchProfile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-boot-chain-'))
  scratchDirs.push(dir)
  return dir
}

/** 半树/标记件：仅 package.json 标记（够在场门，不要求可解析——半树分支先于 resolve） */
function writeTreeMarker(profileDir: string, name: string): void {
  const pkgDir = join(profileDir, 'node_modules', ...name.split('/'))
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name, version: '0.0.0' }), 'utf-8')
}

describe('loadBootChain（dev 真实树——fix-20 结构 pin）', () => {
  it('boot 链树内解析，与插件消费面（dsh-plugin-manager 位置）同一物理拷贝', async () => {
    const profileDir = join(hostRoot(), 'profile.dev')
    const treeBase = join(profileDir, 'node_modules')
    const chain = await loadBootChain(profileDir)
    expect(chain.source).toBe('profile-tree')
    // child 消费面：boot 链载入自 profile 树内
    expect(chain.appBootResolvedUrl).toContain(treeBase.replace(/\\/g, '/'))
    // 插件消费面（reconcile 调用方 dsh-plugin-manager 树内位置）→ 两面同一物理拷贝
    const pluginPosition = join(treeBase, '@deepseek-ai', 'dsh-plugin-manager', 'lib', 'index.js')
    const pluginResolved = createRequire(pluginPosition).resolve('@deepseek-ai/dsh-app-boot')
    expect(chain.appBootResolvedUrl).toBe(pathToFileURL(realpathSync(pluginResolved)).href)
    expect(typeof chain.dshAppBoot.loadProfileDirectory).toBe('function')
    expect(typeof chain.dshAppBoot.reconcileProfilePatches).toBe('function')
    expect(typeof chain.runProfile).toBe('function')
  })
})

describe('loadBootChain（adjacent 回退——打包形态拓扑）', () => {
  it('profile 树缺席：以本模块位置自然解析，不落在 profile 目录内', async () => {
    const chain = await loadBootChain(makeScratchProfile())
    expect(chain.source).toBe('adjacent')
    expect(chain.appBootResolvedUrl.startsWith('file:///')).toBe(true)
    expect(chain.appBootResolvedUrl).not.toContain('dsh-forge-boot-chain-')
    expect(typeof chain.dshAppBoot.loadProfileDirectory).toBe('function')
    expect(typeof chain.runProfile).toBe('function')
  })
})

describe('loadBootChain（fail-loud 防双实例裂缝）', () => {
  it('半树（仅 dsh-app-boot 在场）：拒绝——树服务插件而 boot 链不完整', async () => {
    const dir = makeScratchProfile()
    writeTreeMarker(dir, '@deepseek-ai/dsh-app-boot')
    await expect(loadBootChain(dir)).rejects.toThrow(/split risk.*@deepseek-ai\/dsh missing/)
  })

  it('半树（仅 dsh 在场）：拒绝', async () => {
    const dir = makeScratchProfile()
    writeTreeMarker(dir, '@deepseek-ai/dsh')
    await expect(loadBootChain(dir)).rejects.toThrow(/split risk.*@deepseek-ai\/dsh-app-boot missing/)
  })

  it('树内标记在场但解析逃逸出树（junction 指向树外真身）：BootChainSplitError', async () => {
    const dir = makeScratchProfile()
    // 可解析的树内 dsh-app-boot（main 面）
    const appBootDir = join(dir, 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    mkdirSync(join(appBootDir, 'lib'), { recursive: true })
    writeFileSync(
      join(appBootDir, 'package.json'),
      JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', main: 'lib/index.js' }),
      'utf-8',
    )
    writeFileSync(join(appBootDir, 'lib', 'index.js'), 'export const marker = "tree"\n', 'utf-8')
    // dsh = junction 指向 workspace 真身：标记在场，resolve 逃逸出树
    const workspaceDsh = dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'))
    symlinkSync(workspaceDsh, join(dir, 'node_modules', '@deepseek-ai', 'dsh'), 'junction')
    await expect(loadBootChain(dir)).rejects.toThrow(BootChainSplitError)
  })
})
