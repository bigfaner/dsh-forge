import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Task 6 Hard Rule (proposal SC1 / product-architecture TECH-product-arch-001):
// 壳内装配零新硬编码 — any plugin identity must derive from the product-level
// plugin-bundles config, never from a shell-code constant. Machine face: a
// static scan over the shell source tree (apps/desktop/src, everything that is
// bundled into the shipped app) asserting no @dsh-forge/plugin-* identity
// literal appears. The acceptance probes / e2e helpers under scripts/ and
// apps/desktop/e2e are evidence tooling, not shell code — out of scope.

const SHELL_SRC_ROOT = join(import.meta.dirname, '..', 'src')
const PLUGIN_IDENTITY_PATTERN = /@dsh-forge\/plugin-[a-z0-9-._~]*/u

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') ? [path] : []
  })
}

describe('shell-code plugin-identity scan (task 6 Hard Rule)', () => {
  it('no plugin identity literal appears anywhere in apps/desktop/src', () => {
    expect(statSync(SHELL_SRC_ROOT).isDirectory()).toBe(true)
    const offenders: string[] = []
    for (const file of listSourceFiles(SHELL_SRC_ROOT)) {
      if (PLUGIN_IDENTITY_PATTERN.test(readFileSync(file, 'utf8'))) offenders.push(file)
    }
    expect(offenders, `plugin identity constants leaked into shell code: ${offenders.join(', ')}`).toEqual([])
  })
})
