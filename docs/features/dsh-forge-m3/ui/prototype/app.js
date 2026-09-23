/* ============================================================
   共享交互(app.js)— 载入每个页面
   仅通用行为:主题切换 / toast / 对话框 / 菜单 / tab /
   segmented / 手风琴 / 原型状态切换器
   页面专属逻辑一律在各页 inline <script>(原型分层规则)
   ============================================================ */

/* ---------- 主题切换(body[data-ds-dark-theme]) ---------- */
function initTheme() {
  document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var dark = document.body.hasAttribute('data-ds-dark-theme');
      if (dark) document.body.removeAttribute('data-ds-dark-theme');
      else document.body.setAttribute('data-ds-dark-theme', '');
    });
  });
}

/* ---------- Toast(顶部居中,自动消失) ---------- */
var TOAST_TIMER = null;
function toast(message) {
  var el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  if (TOAST_TIMER) clearTimeout(TOAST_TIMER);
  TOAST_TIMER = setTimeout(function () { el.remove(); }, 3000);
}

/* ---------- 对话框(开/关:backdrop 点击 + Esc + 焦点陷阱) ---------- */
var LAST_FOCUS = null;
function openDialog(id) {
  var mask = document.getElementById(id);
  if (!mask) return;
  LAST_FOCUS = document.activeElement;
  mask.hidden = false;
  var focusables = mask.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
  if (focusables.length) focusables[0].focus();
}
function closeDialog(mask) {
  mask.hidden = true;
  if (LAST_FOCUS && LAST_FOCUS.focus) LAST_FOCUS.focus();
}
function initDialogs() {
  document.querySelectorAll('.dialog-mask').forEach(function (mask) {
    mask.addEventListener('click', function (e) { if (e.target === mask) onMaskRequestClose(mask); });
    mask.querySelectorAll('[data-dialog-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { onMaskRequestClose(mask); });
    });
    mask.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); onMaskRequestClose(mask); }
      if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(
          mask.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])'),
          function (el) { return !el.disabled && el.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  });
}
/* 关闭前钩子:页面覆写以插入确认 / 原子性拒绝关闭;默认直接关 */
function onMaskRequestClose(mask) {
  var guard = mask.getAttribute('data-close-guard');
  if (guard && window[guard]) { if (!window[guard]()) return; }
  closeDialog(mask);
}

/* ---------- 菜单(Menu 卡下拉 + 点击外部关闭) ---------- */
function initMenus() {
  document.querySelectorAll('[data-menu-trigger]').forEach(function (trigger) {
    var menu = trigger.parentElement.querySelector('.menu');
    if (!menu) return;
    menu.hidden = true;
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      document.querySelectorAll('.menu:not([hidden])').forEach(function (m) { if (m !== menu) m.hidden = true; });
      menu.hidden = !menu.hidden;
    });
    menu.addEventListener('click', function (e) { if (!e.target.closest('[data-menu-keep]')) menu.hidden = true; });
  });
  document.addEventListener('click', function () {
    document.querySelectorAll('.menu:not([hidden])').forEach(function (m) { m.hidden = true; });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('.menu:not([hidden])').forEach(function (m) { m.hidden = true; });
  });
}

/* ---------- Tab / segmented(通用:data-tab + data-tab-panel) ---------- */
function initTabs() {
  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var group = btn.closest('[data-tabs]');
      var key = btn.getAttribute('data-tab');
      group.querySelectorAll('[data-tab]').forEach(function (b) {
        var active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      var scope = document;
      document.querySelectorAll('[data-tab-panel]').forEach(function (panel) {
        if (group.getAttribute('data-tabs') === panel.getAttribute('data-tab-group') &&
            panel.getAttribute('data-tab-panel') === key) {
          panel.hidden = false;
          panel.classList.add('flow-highlight');
          setTimeout(function () { panel.classList.remove('flow-highlight'); }, 350);
        } else if (group.getAttribute('data-tabs') === panel.getAttribute('data-tab-group')) {
          panel.hidden = true;
        }
      });
    });
  });
}

/* ---------- 手风琴 ---------- */
function initAccordions() {
  document.querySelectorAll('.accordion-head').forEach(function (head) {
    head.addEventListener('click', function () {
      head.closest('.accordion').classList.toggle('collapsed');
    });
  });
}

/* ---------- 原型状态切换器(populated/loading/empty/error…) ----------
   radio[name="proto-state"] → [data-state-root] 的 data-state;
   子元素以 data-when="xxx" 声明仅在某状态可见(未声明 = 恒可见) */
function initProtoStates() {
  var root = document.querySelector('[data-state-root]');
  if (!root) return;
  function apply(state) {
    root.setAttribute('data-state', state);
    root.querySelectorAll('[data-when]').forEach(function (el) {
      el.hidden = el.getAttribute('data-when').split(' ').indexOf(state) === -1;
    });
  }
  var radios = document.querySelectorAll('input[name="proto-state"]');
  radios.forEach(function (r) {
    r.addEventListener('change', function () { if (r.checked) apply(r.value); });
  });
  var initial = root.getAttribute('data-state') || 'populated';
  radios.forEach(function (r) { if (r.value === initial) r.checked = true; });
  apply(initial);
}

/* ---------- 启动 ---------- */
document.addEventListener('DOMContentLoaded', function () {
  initTheme();
  initDialogs();
  initMenus();
  initTabs();
  initAccordions();
  initProtoStates();
});
