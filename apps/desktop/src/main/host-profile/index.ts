// host-profile — application-owned host profile + payload projection (disc-2).
//
// The vendored upstream host entry boots with three filesystem inputs:
//   argv[2] runtimeDir — the dsh installation dir whose node_modules carries
//                        the install anchor (vendored apps/desktop-host).
//   argv[3] projectDir — the profile project: package.json `dsh.profile.bundles`
//                        manifest; the host materializes its own node_modules
//                        (link-mode fallback junctions) on first boot.
//   argv[4] source     — primary-runtime payload dir; its sibling
//                        `office-skills/` is a hard host-boot requirement
//                        (upstream office.ts). The interpreter bundle itself
//                        installs lazily on first tool use, so a stub dir is
//                        enough for the boot/handshake bar.
//
// This module projects both app-owned inputs under the shell's userData
// (<userData>/host-profile, <userData>/host-payload) — never inside the
// upstream $DSH_HOME (SC8 coexistence: `runProfile` with `resolvedProfile`
// writes only into the profile dir we hand it).

import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { shellLog } from '../log.ts'

/** Upstream web/desktop profile bundle list (apps/desktop WEB_PROFILE). */
export const HOST_PROFILE_BUNDLES: readonly string[] = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

export interface HostProfileDeps {
  /** Profile project dir (app-owned; default <userData>/host-profile). */
  readonly profileDir: string
  /** Vendored office-skills asset tree (packages/skill/skill-office/assets). */
  readonly officeSkillsSource: string
}

export interface HostProfileProjection {
  /** The profile project dir to pass as the host entry's projectDir (argv[3]). */
  readonly profileDir: string
  /** Primary-runtime payload source (argv[4]); undefined when the payload cannot be projected. */
  readonly primaryRuntimeSource: string | undefined
}

function linkTree(target: string, source: string): void {
  symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir')
}

/**
 * Project the host profile project and the office payload source.
 * Idempotent: existing manifests / links are left untouched, so a profile the
 * host already materialized (its link-mode node_modules) is never reset.
 */
export function projectHostProfile(deps: HostProfileDeps): HostProfileProjection {
  const { profileDir, officeSkillsSource } = deps

  mkdirSync(profileDir, { recursive: true })
  const profileManifestPath = join(profileDir, 'package.json')
  if (!existsSync(profileManifestPath)) {
    writeFileSync(profileManifestPath, `${JSON.stringify({
      name: 'dsh-forge-host-profile',
      private: true,
      dsh: { profile: { bundles: [...HOST_PROFILE_BUNDLES] } },
    }, undefined, 2)}\n`)
    shellLog.info({ code: 'HOST_PROFILE_INITIALIZED', message: 'host profile manifest written', data: { dir: profileDir } })
  }

  // Payload: <sibling-of-profileDir>/host-payload/{primary-runtime/, office-skills@link}.
  // The host's office plugin resolves assetRoot = dirname(source)/office-skills.
  const payloadDir = join(dirname(profileDir), 'host-payload')
  const officeSkillsLink = join(payloadDir, 'office-skills')
  const primaryRuntimeSource = join(payloadDir, 'primary-runtime')
  mkdirSync(primaryRuntimeSource, { recursive: true })
  if (!existsSync(officeSkillsSource)) {
    shellLog.warn({ code: 'WARN_HOST_OFFICE_ASSETS_MISSING', message: 'vendored office-skills assets not installed — host boot will fail at the office plugin', data: { expected: officeSkillsSource, remediation: 'node scripts/install-host-closure.mjs' } })
    return { profileDir, primaryRuntimeSource: undefined }
  }
  if (!existsSync(officeSkillsLink)) {
    linkTree(officeSkillsLink, officeSkillsSource)
    shellLog.info({ code: 'HOST_PAYLOAD_LINKED', message: 'office-skills payload linked', data: { target: officeSkillsSource } })
  }
  return { profileDir, primaryRuntimeSource }
}
