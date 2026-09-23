// @feature dsh-forge-m2 | @web-e2e | @journey plugin-management
// e2e/plugin-management/helpers — the plugin-management journey's shared fixture
// half (gen-test-scripts): the 测试 profile 清单变体 (contract step-1
// state_requirements:插件行集唯一来源 = 清单文件,listPlugins 行集 = manifest.map,
// FT-048) = 产品 3 必备 + 2 第三方样例:
//
//   - @dsh-forge/plugin-hello-world — the repo demo plugin via tarball (sc6
//     recipe);
//   - @dsh-forge/plugin-hello-world-sample-b — a REPACKED hello-world clone:
//     distinct package name + patched lib/client.js slot/locale ids, so it
//     registers its OWN ids ('hello-world-sample-b', 'hello-world-sample-b
//     .panel') in the same consumed parent list slot — a genuine SECOND
//     third-party row (the「仅该插件」收敛 needs the对照 to be falsifiable),
//     coexisting with the original instead of colliding.
//
// Also shared: the two-tier DOM census (sc6's rowControlCensus discipline) and
// the overlay-file read/write channels (plugin-runtime.json 归旅程控制).
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, HELLO_WORLD, HELLO_WORLD_DIR,
  forgeWorkbenchTarball, helloWorldTarball, packPlugin,
} from '../helpers/plugins.ts'
import type { BundleEntry } from '../helpers/plugins.ts'

/** The second third-party sample (the repacked hello-world clone's identity). */
export const HELLO_WORLD_SAMPLE_B = '@dsh-forge/plugin-hello-world-sample-b'
/** hello-world's staged tarball channel (sc6 convention, journey-local). */
export const HELLO_WORLD_STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
/** The clone's staged tarball channel (pnpm pack derives this name from the patched identity). */
export const HELLO_WORLD_SAMPLE_B_STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-sample-b-0.1.0.tgz'

/** 测试 profile 的必备名单(与产品清单 plugin-bundles.json 同语义的三条,FT-048)。 */
export const MANDATORY_NAMES: readonly string[] = [...BASE_BUNDLES.map(entry => entry.name), FORGE_WORKBENCH]
/** The two third-party samples (target + 对照 —「仅该插件」收敛的可证伪装置). */
export const THIRD_PARTY_NAMES: readonly string[] = [HELLO_WORLD, HELLO_WORLD_SAMPLE_B]
/** 全量 profile 顺序(配置序 = 3 必备 + 2 第三方)。 */
export const PROFILE_ALL: readonly string[] = [...MANDATORY_NAMES, ...THIRD_PARTY_NAMES]

/** Build the clone once per worker: patching is deterministic, packing is slow. */
let sampleBCache: { tarball: string; stagedAt: string } | undefined

/**
 * Pack the hello-world clone: copy HELLO_WORLD_DIR to a scratch dir (excluding
 * node_modules/.tsbuildinfo), rewrite package.json name (keep version), patch
 * lib/client.js — replaceAll('hello-world', 'hello-world-sample-b') FIRST,
 * THEN replaceAll('helloworld', 'helloworld-sample-b') (the dash form first;
 * the second pass hits the locale NS literal 'helloworld' only — it has no
 * dash; code identifiers use caps HelloWorld and stay untouched; lib/index.js
 * is a no-op apply() and needs no patch). packPlugin then packs + caches by
 * dir (helpers/plugins.ts).
 */
export function packHelloWorldSampleB(): { tarball: string; stagedAt: string } {
  sampleBCache ??= buildHelloWorldSampleB()
  return sampleBCache
}

function buildHelloWorldSampleB(): { tarball: string; stagedAt: string } {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-forge-hello-sample-b-'))
  cpSync(HELLO_WORLD_DIR, scratch, {
    recursive: true,
    filter: src => !src.split(sep).includes('node_modules') && !src.endsWith('.tsbuildinfo'),
  })
  const manifestPath = join(scratch, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name: string }
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, name: HELLO_WORLD_SAMPLE_B }, undefined, 2)}\n`)
  const clientPath = join(scratch, 'lib', 'client.js')
  // Order matters: the dash form FIRST (loader/slot/panel ids), then the bare
  // locale NS literal 'helloworld' (no dash — untouched by pass one). Code
  // identifiers use caps HelloWorld and are untouched by both passes.
  const client = readFileSync(clientPath, 'utf8')
    .replaceAll('hello-world', 'hello-world-sample-b')
    .replaceAll('helloworld', 'helloworld-sample-b')
  writeFileSync(clientPath, client)
  // The profile-layer patch manifest rides along verbatim otherwise: its
  // insert row would remount the ORIGINAL hello-world under the clone's
  // layer (patch rows compose verbatim) — re-id it the same way.
  const patchPath = join(scratch, 'cordis.patch.yml')
  writeFileSync(patchPath, readFileSync(patchPath, 'utf8').replaceAll('hello-world', 'hello-world-sample-b'))
  const { tarball } = packPlugin(scratch)
  rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  return { tarball, stagedAt: HELLO_WORLD_SAMPLE_B_STAGED_AT }
}

/** 测试 profile:产品两条必备 + 必备 forge 核心 + 两个第三方样例(不标 mandatory)。 */
export function journeyBundles(): readonly BundleEntry[] {
  return [
    ...BASE_BUNDLES.map((entry): BundleEntry => ({ name: entry.name, mandatory: true })),
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true },
    { name: HELLO_WORLD, source: `tarball:${HELLO_WORLD_STAGED_AT}` },
    { name: HELLO_WORLD_SAMPLE_B, source: `tarball:${HELLO_WORLD_SAMPLE_B_STAGED_AT}` },
  ]
}

/** The staged tarballs every boot of this journey needs (one shared scratch). */
export function journeyStageTarballs(): ReadonlyArray<{ at: string; from: string }> {
  return [
    { at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() },
    { at: HELLO_WORLD_STAGED_AT, from: helloWorldTarball() },
    { at: HELLO_WORLD_SAMPLE_B_STAGED_AT, from: packHelloWorldSampleB().tarball },
  ]
}

/** Serialize overlay content exactly like the main-process single write path. */
export function overlayBytes(content: { disabled: readonly string[] }): string {
  return `${JSON.stringify({ disabled: [...content.disabled] }, undefined, 2)}\n`
}

/** Preset the overlay BEFORE a boot (the journey owns plugin-runtime.json). */
export function writeOverlayFile(overlayPath: string, content: { disabled: readonly string[] }): string {
  mkdirSync(dirname(overlayPath), { recursive: true })
  const bytes = overlayBytes(content)
  writeFileSync(overlayPath, bytes)
  return bytes
}

/** Parsed overlay content, when the file exists (undefined = absent overlay). */
export function readOverlay(overlayPath: string): { disabled: string[] } | undefined {
  if (!existsSync(overlayPath)) return undefined
  return JSON.parse(readFileSync(overlayPath, 'utf8')) as { disabled: string[] }
}

/** The writable-element family a mandatory row must render ZERO of (SC6-1 DOM discipline). */
const WRITABLE_FAMILY = 'button, select, input, textarea, a[href], [role="button"], [role="switch"], [role="checkbox"]'

/** One plugin row's control census (-1 row = row absent). */
export async function rowControlCensus(page: Page, name: string): Promise<{ writable: number; actions: number }> {
  return await page.evaluate((input: { name: string; family: string }) => {
    const row = document.querySelector(`[data-dsh-forge-plugin-row="${input.name}"]`)
    if (row === null) return { writable: -1, actions: -1 }
    return {
      writable: row.querySelectorAll(input.family).length,
      actions: row.querySelectorAll('[data-dsh-forge-plugin-action]').length,
    }
  }, { name, family: WRITABLE_FAMILY })
}

/**
 * The section's ready shape: skeleton gone, every mandatory row present +
 * tier/mandatory badge/enabled + ZERO writable controls (不渲染,非 rendered
 * -disabled), every third-party row present with exactly one toggle action.
 * Third-party enabled states vary per leg — asserted by the caller.
 */
export async function expectTwoTierSectionCensus(page: Page, thirdPartyEnabled: readonly string[]): Promise<void> {
  const section = page.locator('[data-dsh-forge-plugins-section]')
  await expect(section).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-dsh-forge-plugins-skeleton]')).toHaveCount(0)
  await expect(page.locator('[data-dsh-forge-plugins-error]'), 'no load-error card on a healthy boot').toHaveCount(0)
  for (const name of MANDATORY_NAMES) {
    const row = page.locator(`[data-dsh-forge-plugin-row="${name}"]`)
    await expect(row, `row of ${name}`).toBeVisible({ timeout: 30_000 })
    await expect(row).toHaveAttribute('data-tier', 'mandatory')
    await expect(row).toHaveAttribute('data-enabled', 'true')
    await expect(row.locator('[data-dsh-forge-plugin-mandatory-badge]'), `必备徽标 on ${name}`).toBeVisible()
    const census = await rowControlCensus(page, name)
    expect(census.writable, `${name} 行可写控件家族计数(结构守卫:不渲染,非 rendered-disabled)`).toBe(0)
    expect(census.actions, `${name} 行启停动作计数`).toBe(0)
  }
  for (const name of THIRD_PARTY_NAMES) {
    const row = page.locator(`[data-dsh-forge-plugin-row="${name}"]`)
    await expect(row, `row of ${name}`).toBeVisible({ timeout: 30_000 })
    await expect(row).toHaveAttribute('data-tier', 'third-party')
    await expect(row).toHaveAttribute('data-enabled', thirdPartyEnabled.includes(name) ? 'true' : 'false')
    const census = await rowControlCensus(page, name)
    expect(census.writable, `${name} 行恰一个可写控件(对照组:查询有效 + 两级分化真实渲染)`).toBe(1)
    expect(census.actions, `${name} 行启停动作计数`).toBe(1)
  }
}
