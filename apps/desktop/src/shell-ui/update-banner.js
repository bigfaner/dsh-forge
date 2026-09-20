/* dsh-forge shell-ui UF3 update banner (task 5.1).
 *
 * Plain classic script (concatenated after shell-ui.js into dist/shell-ui.js —
 * see vite.config.ts copyShellUi). Exposes a DOM-injectable factory on
 * globalThis.__DSH_FORGE_UPDATE_BANNER__ so unit tests can drive it with a
 * mock dshForge bridge, and auto-wires itself into the shell overlay root
 * (#dsh-forge-shell-root from task 3.3) once the upstream boot gate resolves.
 *
 * Contract sources:
 * - tech-design Data Models: UpdateBannerState = { phase: 'hidden' | 'queued'
 *   | 'shown' | 'dismissed'; version? } with legal transitions
 *   hidden→shown / hidden→queued→shown / shown|queued→dismissed; dismissed is
 *   terminal for this run.
 * - ui-design §Component 更新提示横幅 (UF3): toast geometry (top 40px, r14,
 *   pad 12 16, max-width min(640px,100vw-48px), z1100), pointer-events auto
 *   (interactive, unlike the toast), no auto-dismiss until user action,
 *   role=status + aria-live=polite, Esc closes only while focus is inside the
 *   banner, entrance 160ms cubic-bezier(0.4,0,0.2,1) degrading to a 100ms
 *   fade-only under prefers-reduced-motion: reduce.
 * - DESIGN.md tokens: --dsw-alias-* semantic aliases only (light/dark via
 *   body[data-ds-dark-theme]).
 */
;(function () {
  'use strict'

  var BANNER_ID = 'dsh-forge-update-banner'
  var STYLE_ID = 'dsh-forge-update-banner-style'

  /** Default zh copy; overridable via opts.copy (tests / future locale push). */
  var DEFAULT_COPY = {
    viewRelease: '查看发布页',
    closeAria: '关闭更新提示',
    available: function (version) { return '新版本 ' + version + ' 可用' },
  }

  /**
   * Create the banner controller.
   * @param {object} opts
   * @param {Document} opts.document DOM document (injected for tests).
   * @param {Element} opts.root Mount point (the #dsh-forge-shell-root overlay).
   * @param {{update:{dismiss:function():unknown, openRelease:function():unknown, onState?:function(function(object):unknown):unknown}}} [opts.dshForge]
   *        preload bridge (mock in tests).
   * @param {object} [opts.copy] Copy overrides { viewRelease, closeAria, available(version) }.
   * @param {function(string):{matches:boolean}} [opts.matchMedia] matchMedia seam (reduced-motion tests).
   * @returns {{applyState:function({phase:string,version?:string}):object, getState:function():object, element:function():(Element|null), destroy:function():void}}
   */
  function createUpdateBanner(opts) {
    var doc = opts.document
    var root = opts.root
    var forge = opts.dshForge
    var copy = {
      viewRelease: (opts.copy && opts.copy.viewRelease) || DEFAULT_COPY.viewRelease,
      closeAria: (opts.copy && opts.copy.closeAria) || DEFAULT_COPY.closeAria,
      available: (opts.copy && opts.copy.available) || DEFAULT_COPY.available,
    }
    var state = { phase: 'hidden' }
    var el = null
    var destroyed = false

    function reducedMotion() {
      var mm = opts.matchMedia || (typeof window !== 'undefined' && window.matchMedia)
      if (typeof mm !== 'function') return false
      try { return !!mm('(prefers-reduced-motion: reduce)').matches } catch { return false }
    }

    function injectStyle() {
      if (doc.getElementById(STYLE_ID) !== null) return
      var style = doc.createElement('style')
      style.id = STYLE_ID
      style.textContent = ''
        + '#' + BANNER_ID + '{position:fixed;top:40px;left:50%;transform:translateX(-50%);z-index:1100;'
        + 'display:flex;align-items:center;gap:10px;width:max-content;max-width:min(640px,calc(100vw - 48px));'
        + 'padding:12px 16px;border-radius:14px;background:var(--dsw-alias-bg-layer-2,#fff);'
        + 'box-shadow:var(--dsw-shadow-elevation-prominent,0 8px 24px rgba(0,0,0,.16));'
        + 'color:var(--dsw-alias-label-primary,rgb(15,17,21));font-size:14px;line-height:22px;'
        + 'font-family:inherit;pointer-events:auto;'
        + 'animation:dfw-banner-in 160ms cubic-bezier(0.4,0,0.2,1);}'
        + '#' + BANNER_ID + ':focus-visible{outline:2px solid var(--dsw-alias-link,rgb(65,118,230));outline-offset:2px;}'
        + '.dfw-banner-icon{color:var(--dsw-alias-link,rgb(65,118,230));font-size:16px;line-height:1;}'
        + '.dfw-banner-btn{height:28px;padding:0 10px;border-radius:14px;font-size:12px;line-height:18px;'
        + 'border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.2));background:transparent;'
        + 'color:var(--dsw-alias-label-primary,inherit);cursor:pointer;'
        + 'margin-left:2px;pointer-events:auto;}'
        + '.dfw-banner-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));}'
        + '.dfw-banner-close{width:28px;height:28px;border:none;border-radius:8px;background:transparent;'
        + 'color:var(--dsw-alias-label-secondary,rgb(97,102,107));cursor:pointer;font-size:14px;line-height:1;'
        + 'margin-left:4px;pointer-events:auto;}'
        + '.dfw-banner-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));}'
        + '@keyframes dfw-banner-in{from{opacity:0;transform:translateX(-50%) translateY(-4px)}'
        + 'to{opacity:1;transform:translateX(-50%) translateY(0)}}'
        + '@keyframes dfw-banner-in-reduced{from{opacity:0}to{opacity:1}}'
        + '@media (prefers-reduced-motion: reduce){#' + BANNER_ID
        + '{animation:dfw-banner-in-reduced 100ms ease-out}}'
      ;(doc.head || doc.documentElement).append(style)
    }

    function build() {
      injectStyle()
      var banner = doc.createElement('div')
      banner.id = BANNER_ID
      banner.setAttribute('role', 'status')
      banner.setAttribute('aria-live', 'polite')
      banner.tabIndex = 0
      if (reducedMotion()) banner.dataset.reducedMotion = 'true'

      var icon = doc.createElement('span')
      icon.className = 'dfw-banner-icon'
      icon.setAttribute('aria-hidden', 'true')
      icon.textContent = '↑'
      banner.append(icon)

      var text = doc.createElement('span')
      var prefix = doc.createTextNode('')
      var strong = doc.createElement('strong')
      text.append(prefix, strong)
      banner.append(text)

      var view = doc.createElement('button')
      view.type = 'button'
      view.className = 'dfw-banner-btn'
      view.textContent = copy.viewRelease
      banner.append(view)

      var close = doc.createElement('button')
      close.type = 'button'
      close.className = 'dfw-banner-close'
      close.setAttribute('aria-label', copy.closeAria)
      close.textContent = '✕'
      banner.append(close)

      banner.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { event.stopPropagation(); dismissViaUser() }
      })
      view.addEventListener('click', function () {
        if (forge && typeof forge.update.openRelease === 'function') {
          try { forge.update.openRelease() } catch { /* verb errors degrade silently (SC2) */ }
        }
        dismissViaUser()
      })
      close.addEventListener('click', dismissViaUser)

      return { banner: banner, setVersion: function (v) {
        prefix.textContent = copy.available(v).replace(v, '') // zh: 新版本 v 可用 split around version
        strong.textContent = v
      } }
    }

    /** User-initiated dismissal (✕ / Esc / view-release jump): verb + local terminal latch. */
    function dismissViaUser() {
      if (state.phase === 'dismissed') return
      applyState({ phase: 'dismissed' })
      if (forge && typeof forge.update.dismiss === 'function') {
        try { forge.update.dismiss() } catch { /* SC2 silent degrade */ }
      }
    }

    /**
     * Apply an UpdateBannerState transition. Enforces the legal transition
     * set (tech-design Data Models); illegal moves and everything after
     * 'dismissed' are ignored (dismissed is terminal until next run).
     */
    function applyState(next) {
      if (destroyed || next === null || typeof next !== 'object') return state
      var phase = next.phase
      var legal = false
      if (state.phase === 'hidden') legal = phase === 'hidden' || phase === 'shown' || phase === 'queued'
      else if (state.phase === 'queued') legal = phase === 'shown' || phase === 'dismissed'
      else if (state.phase === 'shown') legal = phase === 'dismissed'
      // 'dismissed' is terminal: legal = false
      if (!legal) return state
      // queued carries the version for the later shown push; keep it when the
      // shown transition arrives without re-stating it.
      state = { phase: phase, version: next.version !== undefined ? next.version : state.version }
      if (phase === 'shown') {
        var version = state.version || ''
        if (el === null) {
          el = build()
          root.append(el.banner)
        }
        el.setVersion(version)
      } else if (el !== null) {
        el.banner.remove()
        el = null
      }
      return state
    }

    return {
      applyState: applyState,
      getState: function () { return { phase: state.phase, version: state.version } },
      element: function () { return el === null ? null : el.banner },
      destroy: function () {
        destroyed = true
        if (el !== null) { el.banner.remove(); el = null }
        state = { phase: 'dismissed' }
      },
    }
  }

  globalThis.__DSH_FORGE_UPDATE_BANNER__ = { create: createUpdateBanner }

  // Auto-wire inside the shell overlay root once it mounts (task 3.3 gate),
  // against the real preload bridge when present. Push wiring is defensive:
  // dshForge.update.onState lands with the main-side banner state push.
  var shell = globalThis.__DSH_FORGE_SHELL_UI__
  if (shell !== undefined && typeof shell.onMount === 'function') {
    shell.onMount(function () {
      var forge = globalThis.dshForge
      if (forge === undefined || forge.update === undefined) return
      var root = document.getElementById('dsh-forge-shell-root')
      if (root === null) return
      var banner = createUpdateBanner({ document: document, root: root, dshForge: forge })
      if (typeof forge.update.onState === 'function') {
        try { forge.update.onState(function (s) { banner.applyState(s) }) } catch { /* SC2 */ }
      }
    })
  }
})()
