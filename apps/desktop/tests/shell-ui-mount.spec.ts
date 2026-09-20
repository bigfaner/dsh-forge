// @vitest-environment jsdom
// disc-1: the shell fallback document ships its own #dsh-forge-shell-root
// mount point and resolves the boot gate immediately — the bootstrap must
// adopt the pre-existing root and run the mount callbacks (UF3/UF4 attach).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// jsdom rewrites import.meta.url to an http URL — resolve from the workspace
// root instead (vitest always runs with cwd at the config root).
const SHELL_UI_SRC = await readFile(
  join(process.cwd(), 'apps', 'desktop', 'src', 'shell-ui', 'shell-ui.js'),
  'utf8',
)

type ShellUi = { __DSH_FORGE_SHELL_UI__?: { onMount: (cb: () => void) => void } }

describe('shell-ui bootstrap mount (fallback path)', () => {
  it('adopts a pre-existing #dsh-forge-shell-root and fires onMount callbacks', async () => {
    document.body.innerHTML = '<div id="dsh-forge-shell-root"></div>'
    // Resolved gate (fallback document contract): mount must not hang.
    const gate = Promise.withResolvers<void>()
    ;(globalThis as { __DSH_BOOT_READY__?: typeof gate }).__DSH_BOOT_READY__ = gate
    gate.resolve()

    const mounted: string[] = []
    const before = (0, eval)(SHELL_UI_SRC) // eslint-disable-line no-eval
    void before
    const shell = (globalThis as ShellUi).__DSH_FORGE_SHELL_UI__
    expect(shell).toBeDefined()
    shell!.onMount(() => mounted.push('late'))
    await gate.promise
    await new Promise(resolve => setTimeout(resolve, 0))

    const roots = document.querySelectorAll('#dsh-forge-shell-root')
    expect(roots).toHaveLength(1) // adopted, not duplicated
    expect(mounted).toEqual(['late']) // callbacks ran
  })
})
