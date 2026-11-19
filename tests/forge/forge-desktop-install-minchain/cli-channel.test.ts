// bug 643a40df/e65b24c8 修复面单测：desktop 通道 CLI = 官方 packaged invocation 通道
// （desktopCliChannel 发现面 + desktopCliChannelEnv 注入面 + sanitizedCliEnv 显式注入
// 对冲语义）——纯 fs 夹具自证，判据正反双向。
// 定谳锚（039 轮实锚 + DSH Desktop resources 官方源核销）：
// - GUI 二进制直跑 = no-op 假成功（643a40df）；DSH_DESKTOP_PNPM_ENTRY/RUNNER 直置 CLI
//   进程不被采纳（e65b24c8）——官方采纳点 = harness-node-entry.mjs（desktop main
//   HarnessRuntime 同参形态）。
// - 官方 packaged invocation 全形 = electron exe + ELECTRON_RUN_AS_NODE=1 +
//   harness-node-entry.mjs + app.asar 内 CLI entry + 打包 pnpm entry/runner 注入。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { desktopCliChannel, desktopCliChannelEnv, sanitizedCliEnv } from '../../../e2e/support/forge-combo.js'

const tmpRoots: string[] = []
function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge-combo-f29-'))
  tmpRoots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true })
})

/** 造 desktop 宿主安装树夹具（exe + resources/harness-node-entry.mjs + resources/app.asar） */
function makeDesktopInstall(): { installRoot: string; exe: string } {
  const installRoot = tmpDir()
  const exe = join(installRoot, 'DSH Desktop.exe')
  writeFileSync(exe, 'stub')
  mkdirSync(join(installRoot, 'resources'), { recursive: true })
  writeFileSync(join(installRoot, 'resources', 'harness-node-entry.mjs'), 'export {}')
  writeFileSync(join(installRoot, 'resources', 'app.asar'), 'stub')
  return { installRoot, exe }
}

describe('desktopCliChannel（官方 packaged invocation 发现面——643a40df/e65b24c8）', () => {
  it('正锚：exe + nodeEntry + app.asar 在场 → 全参派生（electronBin/nodeEntry/cliEntry/pnpmEntry/pnpmRunner）', () => {
    const { installRoot, exe } = makeDesktopInstall()
    const ch = desktopCliChannel(exe)
    expect(ch.electronBin).toBe(exe)
    expect(ch.nodeEntry).toBe(join(installRoot, 'resources', 'harness-node-entry.mjs'))
    expect(ch.cliEntry).toBe(join(installRoot, 'resources', 'app.asar', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
    expect(ch.pnpmEntry).toBe(join(installRoot, 'resources', 'app.asar', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'))
    expect(ch.pnpmRunner).toBe(join(installRoot, 'resources', 'app.asar', 'node_modules', 'dsh-desktop-market-installer', 'pnpm-runner.mjs'))
  })

  it('反例：exe 缺席 → fail-loud（错锚不产通道）', () => {
    expect(() => desktopCliChannel(join(tmpDir(), 'absent.exe'))).toThrow(/desktop 宿主 exe 缺席/)
  })

  it('反例：harness-node-entry.mjs 缺席（非 desktop 宿主安装树）→ fail-loud', () => {
    const installRoot = tmpDir()
    const exe = join(installRoot, 'DSH Desktop.exe')
    writeFileSync(exe, 'stub')
    expect(() => desktopCliChannel(exe)).toThrow(/harness-node-entry\.mjs 缺席/)
  })

  it('反例：app.asar 缺席（CLI entry 承载面缺席）→ fail-loud', () => {
    const installRoot = tmpDir()
    const exe = join(installRoot, 'DSH Desktop.exe')
    writeFileSync(exe, 'stub')
    mkdirSync(join(installRoot, 'resources'), { recursive: true })
    writeFileSync(join(installRoot, 'resources', 'harness-node-entry.mjs'), 'export {}')
    expect(() => desktopCliChannel(exe)).toThrow(/app\.asar 缺席/)
  })
})

describe('desktopCliChannelEnv（注入面）', () => {
  it('ELECTRON_RUN_AS_NODE=1 + DSH_DESKTOP_PNPM_ENTRY/RUNNER 全注入（官方 packaged invocation 语义）', () => {
    const { exe } = makeDesktopInstall()
    const env = desktopCliChannelEnv(desktopCliChannel(exe))
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(env.DSH_DESKTOP_PNPM_ENTRY).toContain(join('app.asar', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'))
    expect(env.DSH_DESKTOP_PNPM_RUNNER).toContain('pnpm-runner.mjs')
  })
})

describe('sanitizedCliEnv（显式注入对冲消毒语义——extraEnv 消毒后合并）', () => {
  it('缺省形态：ELECTRON_RUN_AS_NODE/DSH_PROFILE/DSH_PROFILE_DIR 全剥离（fix-17/fix-20 回归面）', () => {
    const env = sanitizedCliEnv('X:\\home')
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.DSH_PROFILE).toBeUndefined()
    expect(env.DSH_PROFILE_DIR).toBeUndefined()
    expect(env.NODE_PATH).toBeUndefined()
    expect(env.DSH_HOME).toBe('X:\\home')
  })

  it('显式注入：ELECTRON_RUN_AS_NODE=1 经 extraEnv 复注入存活（desktop 通道官方缝）', () => {
    const env = sanitizedCliEnv('X:\\home', { ELECTRON_RUN_AS_NODE: '1', DSH_DESKTOP_PNPM_ENTRY: 'X:\\pnpm.cjs' })
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(env.DSH_DESKTOP_PNPM_ENTRY).toBe('X:\\pnpm.cjs')
    expect(env.DSH_PROFILE).toBeUndefined()
  })
})
