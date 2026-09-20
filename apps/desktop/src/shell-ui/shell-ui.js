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
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }

  // Interface 5 fallback toast (task 4.5): the main process has no
  // session-focus channel into the upstream SPA (spike-3), so a focus
  // request degrades to "front window + manual-switch toast". This renders
  // that toast inside the shell overlay root.
  var TOAST_DURATION_MS = 6000
  var toastTimer = null
  function showToast(message) {
    var root = document.getElementById(ROOT_ID)
    if (root === null) return
    var el = document.getElementById('dsh-forge-toast')
    if (el === null) {
      el = document.createElement('div')
      el.id = 'dsh-forge-toast'
      el.setAttribute('role', 'status')
      root.append(el)
    }
    el.textContent = message
    if (toastTimer !== null) clearTimeout(toastTimer)
    toastTimer = setTimeout(function () {
      el.remove()
      toastTimer = null
    }, TOAST_DURATION_MS)
  }
  var bridge = globalThis.__DSH_FORGE_SHELL__
  if (bridge !== undefined && typeof bridge.onToast === 'function') {
    bridge.onToast(showToast)
  }
})()
