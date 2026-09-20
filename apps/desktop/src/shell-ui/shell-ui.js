/* dsh-forge shell-ui overlay bootstrap (task 3.3 injection pipeline).
 *
 * Appended at the end of <body> by the dsh-app:// web-document transform —
 * strictly after the upstream injection sequence in document order. It waits
 * for the upstream boot gate (__DSH_BOOT_READY__, resolved by the upstream web
 * entry after Host boot injections are applied) and then mounts the shell-ui
 * overlay root at document.body end (tech-design Integration Specs insertion
 * point; UF3 banner / UF4 mask attach inside this root in later tasks).
 */
;(function () {
  'use strict'
  var ROOT_ID = 'dsh-forge-shell-root'
  function mount() {
    if (document.getElementById(ROOT_ID) !== null) return
    var el = document.createElement('div')
    el.id = ROOT_ID
    document.body.append(el)
  }
  var gate = globalThis.__DSH_BOOT_READY__
  if (gate !== undefined && gate.promise !== undefined && typeof gate.promise.then === 'function') {
    gate.promise.then(mount, mount)
    return
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
    return
  }
  mount()
})()
