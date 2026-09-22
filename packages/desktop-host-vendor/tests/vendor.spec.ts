import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  HOST_ENTRY_PATH,
  VENDORED_ROOT,
  VENDORED_UPSTREAM_SHA,
  builtinRuntimeDir,
  describeVendor,
  listBuiltinRuntimes,
  resolveBuiltinNode,
} from '../src/index'
import lock from '../../../vendor/upstream.lock.json'

describe('desktop-host-vendor projection', () => {
  it('pins the upstream SHA', () => {
    expect(VENDORED_UPSTREAM_SHA).toBe('c36ba648dc106d21fb32562793b3e3b9c8922bc4')
    expect(lock.pinnedSha).toBe(VENDORED_UPSTREAM_SHA)
  })

  it('has the vendored tree materialized (scripts/vendor-project.mjs output)', () => {
    expect(describeVendor()).toEqual({
      pinnedSha: VENDORED_UPSTREAM_SHA,
      projected: true,
      vendoredFileCount: lock.vendoredFiles.length,
    })
  })

  it('exposes the upstream desktop-host entry inside the projection', () => {
    expect(HOST_ENTRY_PATH.startsWith(VENDORED_ROOT)).toBe(true)
    expect(HOST_ENTRY_PATH.replace(/\\/g, '/').endsWith('apps/desktop-host/src/index.ts')).toBe(true)
    expect(existsSync(HOST_ENTRY_PATH)).toBe(true)
  })
})

describe('builtin Node runtime seam', () => {
  it('lists only manifest-validated runtimes with resolvable dirs', () => {
    for (const runtime of listBuiltinRuntimes()) {
      expect(runtime.nodeVersion).toMatch(/^\d+\.\d+\.\d+$/)
      expect(builtinRuntimeDir(runtime.runtimeId)).not.toBeNull()
    }
  })

  it('resolveBuiltinNode resolves an executable or fails with a remediation hint', () => {
    const runtimes = listBuiltinRuntimes()
    if (runtimes.length === 0) {
      // No runtime acquired in this environment (build-time artifact, gitignored).
      expect(() => resolveBuiltinNode()).toThrow(/prepare-host-runtime/)
      return
    }
    const resolved = resolveBuiltinNode(runtimes.length === 1 ? undefined : runtimes[0]!.runtimeId)
    expect(existsSync(resolved.nodeExecutable)).toBe(true)
  })

  it('rejects unknown runtime ids', () => {
    expect(() => resolveBuiltinNode('node-0.0.0-does-not-exist')).toThrow(/unknown builtin runtime id/)
  })
})
