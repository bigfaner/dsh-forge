// Vendored upstream desktop-host seam (skeleton).
//
// The actual upstream source projection lands with the vendor task
// (scripts/sync-upstream.mjs + vendor/upstream.lock.json, pinned SHA
// c36ba648). This module is the stable import surface the Electron shell
// programs against; it re-exports the vendored host adapter once projected.

export const VENDORED_UPSTREAM_SHA = 'c36ba648dc106d21fb32562793b3e3b9c8922bc4'

export interface DesktopHostVendorInfo {
  readonly pinnedSha: string
  readonly projected: boolean
}

export function describeVendor(): DesktopHostVendorInfo {
  return { pinnedSha: VENDORED_UPSTREAM_SHA, projected: false }
}
