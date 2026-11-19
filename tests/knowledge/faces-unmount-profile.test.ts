// 卸载态 junction 农场 profile × fix-20 boot 链守卫相容回归（bug 76620a5a）。
// 契约：faces-journey-harness makeUninstalledProfile 制备的卸载态 profile 会被
// launchHost 真机启动——宿主 boot 走 loadBootChain（apps/host/src/boot/boot-chain.ts）：
// 农场树在场两件 boot 链包时，守卫按 realpath containment 判树内解析。
// 夹具若对 boot 链件做 junction（指向 profile.dev 真身——树外），守卫判逃逸即
// BootChainSplitError fatal → unmount journey launch 级必败。本测试钉住：农场形态
// 必须让 boot 链件物理在树内（复制而非 junction），守卫判定 profile-tree 通过。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadBootChain } from '../../apps/host/src/boot/boot-chain.js'
import { makeUninstalledProfile, removeProfileFarm } from './faces-journey-harness.js'

describe('卸载态农场 profile × boot 链守卫相容', () => {
  it('makeUninstalledProfile 农场通过 loadBootChain（source=profile-tree，零 BootChainSplitError）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-kn-farm-guard-'))
    const farm = makeUninstalledProfile(root)
    try {
      const chain = await loadBootChain(farm)
      expect(chain.source).toBe('profile-tree')
    } finally {
      removeProfileFarm(farm)
      await import('node:fs').then((fs) => fs.rmSync(root, { recursive: true, force: true }))
    }
  })
})
