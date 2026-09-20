/* dsh-forge shell-ui UF4 crash-recovery overlay (task 5.2).
 *
 * Plain classic script (concatenated after update-banner.js into
 * dist/shell-ui.js — see vite.config.ts copyShellUi). Exposes a DOM-injectable
 * factory on globalThis.__DSH_FORGE_CRASH_RECOVERY__ so unit tests can drive
 * it with a mock dshForge bridge, and auto-wires itself into the shell
 * overlay root once the upstream boot gate resolves.
 *
 * Contract sources:
 * - tech-design Interface 2: RecoveryState = 'idle' | 'restarting' |
 *   'restoring' | 'recovered' | 'failed'; failed is terminal and never
 *   regresses; the renderer only mirrors main-side state (main owns the
 *   machine; restart verb = dshForge.recovery.restartApp).
 * - ui-design §Component 宿主崩溃恢复覆盖层 (UF4): state-machine-driven
 *   presentation (crash prompt → restoring → recovered-close+toast / failed),
 *   full-screen mask (--dsw-alias-bg-mask-1 + blur 2px, z1200 above UF3
 *   banner/toast at z1100), dialog with upstream Modal geometry (r24,
 *   min(380px), pad 22 24 24, title 16/24 w500, bg-layer-2), focus trap
 *   (Tab/Shift+Tab locked inside the dialog; focus moves in on show,
 *   restored on close), role=alertdialog + aria-modal=true +
 *   aria-live=assertive, Esc and mask clicks do NOT close (recovery cannot
 *   be skipped), failed state = reason block (≤120 chars, max-height 96px
 *   inner scroll, label-secondary) + 「重启应用」 primary button (md h36 r18),
 *   recovered → overlay closes + toast 「已恢复最近会话」 (3s auto-dismiss).
 * - DESIGN.md tokens: --dsw-alias semantic aliases only.
 */
;(function () {
  'use strict'

  var OVERLAY_ID = 'dsh-forge-crash-recovery'
  var STYLE_ID = 'dsh-forge-crash-recovery-style'
  var REASON_MAX = 120

  /** Default zh copy (ui-design §UF4 wording); overridable via opts.copy. */
  var DEFAULT_COPY = {
    title: '连接已中断',
    restarting: '正在重启运行时…',
    restoring: '正在恢复会话…',
    failed: '恢复失败',
    restartApp: '重启应用',
    recoveredToast: '已恢复最近会话',
  }

  /**
   * Create the crash-recovery overlay controller.
   * @param {object} opts
   * @param {Document} opts.document DOM document (injected for tests).
   * @param {Element} opts.root Mount point (the #dsh-forge-shell-root overlay).
   * @param {{recovery:{restartApp:function():unknown, getState?:function():Promise<string>}}} [opts.dshForge]
   *        preload bridge (mock in tests).
   * @param {object} [opts.copy] Copy overrides { title, restarting, restoring, failed, restartApp, recoveredToast }.
   * @param {function(function():void,number):unknown} [opts.setTimeout] timer seam (toast tests).
   * @returns {{applyState:function({state:string,reason?:string}):object, getState:function():object, element:function():(Element|null), destroy:function():void}}
   */
  function createCrashRecoveryOverlay(opts) {
    var doc = opts.document
    var root = opts.root
    var forge = opts.dshForge
    var setTimer = opts.setTimeout || function (fn, ms) { return setTimeout(fn, ms) }
    var copy = {}
    for (var key in DEFAULT_COPY) {
      copy[key] = (opts.copy && opts.copy[key]) || DEFAULT_COPY[key]
    }
    var state = { state: 'idle' }
    var el = null
    var refs = null
    var lastFocus = null
    var toastTimer = null
    var destroyed = false
    var keydownBound = null

    function injectStyle() {
      if (doc.getElementById(STYLE_ID) !== null) return
      var style = doc.createElement('style')
      style.id = STYLE_ID
      style.textContent = ''
        + '#' + OVERLAY_ID + '{position:fixed;inset:0;z-index:1200;display:flex;'
        + 'align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-1,rgba(15,17,21,.4));'
        + '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);}'
        + '#' + OVERLAY_ID + ' .dfw-crash-dialog{width:min(380px,calc(100vw - 48px));border-radius:24px;'
        + 'background:var(--dsw-alias-bg-layer-2,#fff);'
        + 'box-shadow:var(--dsw-shadow-elevation-prominent,0 8px 24px rgba(0,0,0,.16));'
        + 'padding:22px 24px 24px;font-family:inherit;}'
        + '.dfw-crash-title{margin:0;padding:0 0 0 0;font-size:16px;line-height:24px;font-weight:500;'
        + 'color:var(--dsw-alias-label-primary,rgb(15,17,21));}'
        + '.dfw-crash-status{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:14px;'
        + 'line-height:22px;color:var(--dsw-alias-label-primary,rgb(15,17,21));}'
        + '.dfw-crash-dot{width:8px;height:8px;border-radius:50%;flex:none;'
        + 'background:var(--dsw-alias-state-error-primary,rgb(220,62,76));}'
        + '.dfw-crash-spinner{width:16px;height:16px;border-radius:50%;flex:none;'
        + 'border:2px solid var(--dsw-alias-link,rgb(65,118,230));'
        + 'border-top-color:transparent;animation:dfw-crash-spin 1s linear infinite;}'
        + '.dfw-crash-reason{margin-top:8px;max-height:96px;overflow-y:auto;font-size:14px;line-height:22px;'
        + 'color:var(--dsw-alias-label-secondary,rgb(97,102,107));}'
        + '.dfw-crash-restart{height:36px;padding:0 18px;margin-top:16px;border-radius:18px;'
        + 'border:none;background:var(--dsw-alias-fill-primary,rgb(15,17,21));'
        + 'color:var(--dsw-alias-label-on-fill,#fff);font-size:14px;line-height:20px;font-family:inherit;'
        + 'cursor:pointer;align-self:flex-end;}'
        + '.dfw-crash-restart:hover{background:var(--dsw-alias-fill-primary-hover,rgb(38,49,72));}'
        + '.dfw-crash-restart:focus-visible{outline:2px solid var(--dsw-alias-link,rgb(65,118,230));outline-offset:2px;}'
        + '.dfw-crash-failed{display:flex;flex-direction:column;}'
        + '.dfw-crash-toast{position:fixed;top:40px;left:50%;transform:translateX(-50%);z-index:1100;'
        + 'max-width:min(640px,calc(100vw - 48px));padding:12px 16px;border-radius:14px;'
        + 'background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,rgb(15,17,21));'
        + 'font-size:14px;line-height:22px;font-family:inherit;}'
        + '@keyframes dfw-crash-spin{to{transform:rotate(360deg)}}'
        + '@media (prefers-reduced-motion: reduce){.dfw-crash-spinner{animation:none;'
        + 'border-top-color:var(--dsw-alias-link,rgb(65,118,230));}}'
      ;(doc.head || doc.documentElement).append(style)
    }

    function build() {
      injectStyle()
      var overlay = doc.createElement('div')
      overlay.id = OVERLAY_ID

      var dialog = doc.createElement('div')
      dialog.className = 'dfw-crash-dialog'
      dialog.setAttribute('role', 'alertdialog')
      dialog.setAttribute('aria-modal', 'true')
      dialog.setAttribute('aria-live', 'assertive')
      dialog.tabIndex = -1
      overlay.append(dialog)

      var title = doc.createElement('h2')
      title.id = 'dfw-crash-title'
      title.className = 'dfw-crash-title'
      title.textContent = copy.title
      dialog.setAttribute('aria-labelledby', title.id)
      dialog.append(title)

      var status = doc.createElement('div')
      status.className = 'dfw-crash-status'
      var indicator = doc.createElement('span')
      indicator.className = 'dfw-crash-dot'
      indicator.setAttribute('aria-hidden', 'true')
      var statusText = doc.createElement('span')
      statusText.className = 'dfw-crash-status-text'
      status.append(indicator, statusText)
      dialog.append(status)

      var failBlock = doc.createElement('div')
      failBlock.className = 'dfw-crash-failed'
      failBlock.style.display = 'none'
      var reason = doc.createElement('div')
      reason.className = 'dfw-crash-reason'
      failBlock.append(reason)
      var restart = doc.createElement('button')
      restart.type = 'button'
      restart.className = 'dfw-crash-restart'
      restart.textContent = copy.restartApp
      restart.addEventListener('click', function () {
        if (forge && forge.recovery && typeof forge.recovery.restartApp === 'function') {
          try { forge.recovery.restartApp() } catch { /* SC2 silent degrade */ }
        }
      })
      failBlock.append(restart)
      dialog.append(failBlock)

      // Esc / mask click: no close handlers by design (recovery cannot be
      // skipped — ui-design §UF4 Interactions). Focus trap below is the only
      // key handling.
      return {
        overlay: overlay,
        dialog: dialog,
        indicator: indicator,
        statusText: statusText,
        failBlock: failBlock,
        reason: reason,
        restart: restart,
      }
    }

    /** Mirror the main-side RecoveryState presentation (Interface 2). */
    function applyState(next) {
      if (destroyed || next === null || typeof next !== 'object') return state
      var value = next.state
      // failed is terminal: never regress to any other state.
      if (state.state === 'failed') return state
      if (value === 'idle') { state = { state: 'idle' }; return state }
      if (value === 'recovered') { state = { state: 'recovered' }; closeAndToast(); return state }
      if (value !== 'restarting' && value !== 'restoring' && value !== 'failed') return state
      if (el === null) {
        el = build()
        refs = el
        lastFocus = doc.activeElement
        root.append(refs.overlay)
        keydownBound = function (event) { onKeydown(event) }
        doc.addEventListener('keydown', keydownBound, true)
        refs.dialog.focus()
      }
      if (value === 'restarting') {
        refs.indicator.className = 'dfw-crash-dot'
        refs.statusText.textContent = copy.restarting
        refs.failBlock.style.display = 'none'
      } else if (value === 'restoring') {
        refs.indicator.className = 'dfw-crash-spinner'
        refs.statusText.textContent = copy.restoring
        refs.failBlock.style.display = 'none'
      } else {
        refs.indicator.className = 'dfw-crash-dot'
        refs.statusText.textContent = copy.failed
        refs.reason.textContent = truncate(next.reason)
        refs.failBlock.style.display = 'flex'
        refs.restart.focus()
      }
      state = { state: value }
      return state
    }

    function truncate(text) {
      var value = text === undefined || text === null || text === '' ? 'no detail' : String(text)
      return value.length <= REASON_MAX ? value : value.slice(0, REASON_MAX)
    }

    function teardown() {
      if (el !== null) {
        if (keydownBound !== null) {
          doc.removeEventListener('keydown', keydownBound, true)
          keydownBound = null
        }
        refs.overlay.remove()
        el = null
        refs = null
      }
    }

    /** recovered: overlay 160ms fade-out semantics → remove + toast + focus return. */
    function closeAndToast() {
      teardown()
      if (lastFocus !== null && typeof lastFocus.focus === 'function') {
        try { lastFocus.focus() } catch { /* element may be gone */ }
      }
      lastFocus = null
      var toast = doc.createElement('div')
      toast.className = 'dfw-crash-toast'
      toast.setAttribute('role', 'status')
      toast.textContent = copy.recoveredToast
      root.append(toast)
      if (toastTimer !== null) clearTimeout(toastTimer)
      toastTimer = setTimer(function () {
        toast.remove()
        toastTimer = null
      }, 3000)
    }

    /** Focus trap: Tab / Shift+Tab stay locked inside the dialog. */
    function onKeydown(event) {
      if (event.key !== 'Tab' || el === null) return
      // Detached overlay (root torn down externally): the trap no longer applies.
      if (!refs.overlay.isConnected) return
      var dialog = refs.dialog
      var focusables = dialog.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')
      if (focusables.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      var first = focusables[0]
      var last = focusables[focusables.length - 1]
      var active = doc.activeElement
      event.preventDefault()
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) last.focus()
        else if (doc.activeElement instanceof HTMLElement) {
          // move one step back within the dialog
          var index = Array.prototype.indexOf.call(focusables, active)
          if (index > 0) focusables[index - 1].focus()
          else last.focus()
        }
      } else {
        if (active === last || !dialog.contains(active)) first.focus()
        else if (doc.activeElement instanceof HTMLElement) {
          var i = Array.prototype.indexOf.call(focusables, active)
          if (i >= 0 && i < focusables.length - 1) focusables[i + 1].focus()
          else first.focus()
        } else {
          first.focus()
        }
      }
    }

    return {
      applyState: applyState,
      getState: function () { return { state: state.state } },
      element: function () { return el === null ? null : refs.overlay },
      destroy: function () {
        destroyed = true
        teardown()
        state = { state: 'idle' }
      },
    }
  }

  globalThis.__DSH_FORGE_CRASH_RECOVERY__ = { create: createCrashRecoveryOverlay }

  // Auto-wire inside the shell overlay root once it mounts (task 3.3 gate)
  // against the real preload bridge. The main process owns the recovery
  // state machine; the renderer mirrors it through getState (Interface 6)
  // whenever the host grants it — the probe is defensive and cheap.
  var shell = globalThis.__DSH_FORGE_SHELL_UI__
  if (shell !== undefined && typeof shell.onMount === 'function') {
    shell.onMount(function () {
      var forge = globalThis.dshForge
      if (forge === undefined || forge.recovery === undefined) return
      var root = document.getElementById('dsh-forge-shell-root')
      if (root === null) return
      var overlay = createCrashRecoveryOverlay({ document: document, root: root, dshForge: forge })
      if (typeof forge.recovery.getState === 'function') {
        try {
          forge.recovery.getState().then(function (s) { overlay.applyState({ state: s }) }, function () { /* SC2 */ })
        } catch { /* SC2 silent degrade */ }
      }
    })
  }
})()
