/**
 * electron-builder configuration — task 6.2 three-platform packaging
 * (nsis / dmg / AppImage).
 *
 * Structure follows the upstream deepseek-harness factory
 * (apps/desktop/scripts/electron-builder-config.mjs, pinned SHA c36ba648 —
 * sole authority for the packaging approach), reduced to dsh-forge M1 scope:
 * no code signing, no auto-update publish, no notarization (M1 delivers
 * unsigned installers; update-* is detection-only by design).
 *
 * The vendored upstream tree and the builtin Node runtime are staged by
 * scripts/assemble-app-resources.mjs into release/staging/ and embedded as
 * extraResources — zero network downloads at install time (SC2 install side).
 *
 * Upstream packages mac/win only; the Linux/AppImage assembly is dsh-forge
 * new work (spike 1: node-pty linux prebuilds + koffi verified usable).
 */

import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..', '..')

/**
 * Create the electron-builder configuration for one packaging environment.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform (default target).
 * @param {string} hostArch - Build-host architecture.
 */
export function createElectronBuilderConfig(env = process.env, hostPlatform = process.platform, hostArch = process.arch) {
  const targetPlatform = env.DSH_FORGE_TARGET_PLATFORM ?? hostPlatform
  const targetArch = env.DSH_FORGE_TARGET_ARCH ?? hostArch
  const staging = join(ROOT, 'apps', 'desktop', 'release', 'staging')
  return {
    appId: 'app.dshforge.desktop',
    productName: 'dsh-forge',
    artifactName: 'dsh-forge-${version}-${os}-${arch}.${ext}',
    directories: { output: 'release' },
    asar: true,
    // Spawned host subprocess + builtin Node runtime must stay real files
    // (upstream asarUnpack approach for executables/native modules).
    asarUnpack: ['**/*.{node,dylib,dll,so,exe}'],
    // The workspace vendor package is bundled into dist/main.cjs by vite and
    // staged under extraResources — keep its workspace node_modules copy (incl.
    // the 85MB builtin runtime) out of the asar.
    files: ['dist/**', '!node_modules/@dsh-forge/desktop-host-vendor/**'],
    extraResources: [
      { from: staging, to: '.', filter: ['runtime/**', 'vendor/**', 'staging-manifest.json'] },
    ],
    win: {
      target: ['nsis'],
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      // Offline install (SC2): NSIS itself never downloads; the differential
      // web package stays disabled until an update channel exists.
      differentialPackage: false,
    },
    mac: {
      category: 'public.app-category.developer-tools',
      identity: null, // M1: unsigned installers (no signing identity required)
      target: ['dmg'],
    },
    dmg: {
      writeUpdateInfo: false,
    },
    linux: {
      category: 'Development',
      // The scoped package name is not a valid executable name.
      executableName: 'dsh-forge',
      // dsh-forge new work (spike 1): upstream has no Linux packaging target.
      target: ['AppImage'],
    },
    publish: null,
    // Environment passthrough for platform/arch selection in CI (task 6.3).
    extraMetadata: { dshForgeTarget: `${targetPlatform}-${targetArch}` },
  }
}

export default createElectronBuilderConfig()
