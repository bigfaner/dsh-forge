/* ==========================================================================
   dsh-forge M4 原型共享交互(app.js)
   跨页共享:侧栏(v2.9 dsh 行语言:品牌行/新会话独占行/区头三图标/分组×
   排序/会话行状态点+相对时间+hover ⋯/溢出折叠/56 rail)· toast / 浮层 /
   手风琴 / 主题 / 原型工具状态切换;单页逻辑在各自 HTML 内联脚本。
   ========================================================================== */
(function () {
  'use strict';

  var HAS_FORGE = !!window.FORGE;

  /* ---- 工具 ---- */
  window.escHtml = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function $(sel, root) { return (root || document).querySelector(sel); }

  /* ---- aria-live 播报区 ---- */
  var live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.className = 'sr-only';
  document.body.appendChild(live);

  /* ---- Toast ---- */
  window.protoToast = function (msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    live.textContent = msg;
    setTimeout(function () {
      t.classList.add('is-leaving');
      setTimeout(function () { t.remove(); }, 1000);
    }, 3000);
  };

  /* ---- 状态切换(原型工具 + 页面可编程调用;每次现查 DOM,容忍重渲染) ---- */
  function applyState(scope, name) {
    scope.setAttribute('data-current', name);
    Array.prototype.forEach.call(scope.children, function (child) {
      var s = child.getAttribute('data-state');
      if (s === null) return; /* 非状态子节点(区头/页头等)不受状态切换影响 */
      child.classList.toggle('is-hidden', s !== name);
    });
  }
  window.protoSetState = function (key, name) {
    var sc = document.querySelector('[data-state-scope="' + key + '"]');
    if (!sc) return;
    applyState(sc, name);
    document.querySelectorAll('[data-proto-key="' + key + '"] .proto-btn').forEach(function (b) {
      b.classList.toggle('active', b.textContent === name);
    });
  };

  /* ---- 浮层(Dialog / 抽屉):开关 + 焦点圈闭 + Esc ---- */
  var overlayStack = [];
  var lastFocus = null;

  function focusables(el) {
    return Array.prototype.filter.call(
      el.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])'),
      function (n) { return n.offsetParent !== null; }
    );
  }
  function openOverlay(sel) {
    var el = $(sel);
    if (!el || el.classList.contains('is-open')) return;
    lastFocus = document.activeElement;
    el.classList.add('is-open');
    overlayStack.push(el);
    var f = focusables(el);
    if (f.length) f[0].focus();
  }
  function closeOverlay(el) {
    if (!el) return;
    el.classList.remove('is-open');
    overlayStack = overlayStack.filter(function (o) { return o !== el; });
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-overlay-open]');
    if (opener) { openOverlay(opener.getAttribute('data-overlay-open')); return; }
    var closer = e.target.closest('[data-overlay-close]');
    if (closer) { closeOverlay(closer.closest('.overlay')); return; }
  });
  window.protoOpenOverlay = openOverlay;
  window.protoCloseOverlay = closeOverlay;

  /* ---- 键盘激活:role="button" 的非原生按钮元素 ---- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' && overlayStack.length) {
      var el = overlayStack[overlayStack.length - 1];
      var f = focusables(el);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.key === 'Escape') {
      if (overlayStack.length) { closeOverlay(overlayStack[overlayStack.length - 1]); return; }
      closePopupMenu();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target.closest ? e.target.closest('[role="button"]:not(button):not(a)') : null;
    if (el) { e.preventDefault(); el.click(); }
  });

  /* ---- Accordion(通用;同步 aria-expanded) ---- */
  document.addEventListener('click', function (e) {
    var head = e.target.closest('[data-accordion]');
    if (!head) return;
    var acc = head.closest('.accordion');
    if (!acc) return;
    var open = acc.classList.toggle('is-expanded');
    head.setAttribute('aria-expanded', open);
  });

  /* ---- 弹出菜单(⋯ / 视图选项 / ＋;锚定触发钮,点击外部关闭) ---- */
  var popupMenu = null;
  function closePopupMenu() {
    if (popupMenu) { popupMenu.remove(); popupMenu = null; }
  }
  function openPopupMenu(anchor, html, cls) {
    closePopupMenu();
    popupMenu = document.createElement('div');
    popupMenu.className = 'menu is-open ' + (cls || '');
    popupMenu.innerHTML = html;
    document.body.appendChild(popupMenu);
    var r = anchor.getBoundingClientRect();
    var mw = popupMenu.offsetWidth, mh = popupMenu.offsetHeight;
    var left = Math.min(r.left, window.scrollX + document.documentElement.clientWidth - mw - 8);
    var top = r.bottom + 4;
    if (top + mh > window.innerHeight + window.scrollY) top = Math.max(8, r.top - mh - 4);
    popupMenu.style.left = left + 'px';
    popupMenu.style.top = top + 'px';
    setTimeout(function () {
      document.addEventListener('click', popupOutside, true);
    }, 0);
  }
  function popupOutside(e) {
    if (popupMenu && !popupMenu.contains(e.target)) closePopupMenu();
  }
  window.protoMenu = openPopupMenu;      /* 页面级菜单(Shell 选择等) */
  window.protoMenuClose = closePopupMenu;

  /* ---- 侧栏(v2.9):品牌行 / 新会话独占行 / 区头三图标 / 分组×排序 ---- */
  var ICONS = {
    search: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    viewopts: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88v.01a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1z"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>',
    /* 项目行文件夹(dsh 同构:闭/开态,hover 换三角 caret)与「添加项目」folder-plus */
    foldClose: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    foldOpen: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1.5"/><path d="M3.4 18.5 6 10.5h17.2l-2.6 8z"/>',
    folderPlus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/></svg>'
  };

  /* 视图选项状态(分组方式 × 排序方式;dsh 键同构,localStorage 持久化) */
  var sbView = { group: 'tree', sort: 'updated' };
  try {
    var savedView = JSON.parse(localStorage.getItem('proto-sb-view') || 'null');
    if (savedView && savedView.group) sbView = savedView;
  } catch (err) { /* 忽略 */ }
  function saveSbView() {
    try { localStorage.setItem('proto-sb-view', JSON.stringify(sbView)); } catch (err) { /* 忽略 */ }
  }

  var expandedSessions = {}; /* 会话后代展开记忆(重渲染不丢) */
  var overflowOpen = {};     /* 每组溢出展开记忆(按项目) */
  var projExpanded = {};     /* 项目行展开记忆(当前项目默认展开) */
  var sbSearching = false;   /* 区头搜索原地展开态 */

  /* 状态点优先级:待交互 > 运行中 > subagent 运行中;空闲无点(无计数徽标) */
  function dotHtml(s) {
    var cls = '', label = '';
    if (s.status === 'draft') { cls = 'warn'; label = '待输入'; }
    else if (s.status === 'running') { cls = 'ok breathing'; label = '运行中'; }
    else if (FORGE.counts(s.id).running) { cls = 'ok'; label = 'subagent 运行中'; }
    else return '<span class="sb-dot" aria-hidden="true"></span>';
    return '<span class="sb-dot"><span class="state-dot ' + cls + '" role="img" aria-label="' + label + '"></span></span>';
  }
  function hoverCard(s) {
    var c = FORGE.counts(s.id);
    return c.running ? ' · ' + c.running + ' 个子代理运行中' : '';
  }

  function sortSessions(list) {
    var rows = list.slice().sort(function (a, b) {
      if (sbView.sort === 'manual') return 0; /* 手动:数据序(原型以注册序示意) */
      return (b.ts || 0) - (a.ts || 0);       /* 最近更新:新 → 旧 */
    });
    /* 空白会话(未发首条消息)置顶 */
    return rows.sort(function (a, b) {
      var da = a.status === 'draft' ? 0 : 1, db = b.status === 'draft' ? 0 : 1;
      return da - db;
    });
  }

  /* ⋯ 菜单(重命名 / 分叉会话 / 归档会话;源码三项逐字一致) */
  function sessionMoreMenu(anchor, id) {
    openPopupMenu(anchor,
      '<button class="menu-item" data-sm-act="rename">✎ 重命名</button>'
      + '<button class="menu-item" data-sm-act="fork">⑂ 分叉会话</button>'
      + '<button class="menu-item" data-sm-act="archive">🗄 归档会话</button>');
    popupMenu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sm-act]');
      if (!b) return;
      var act = b.getAttribute('data-sm-act');
      var s = FORGE.findSession(id);
      if (!s) return;
      if (act === 'rename') {
        var name = prompt('重命名会话:', s.title);
        if (name && name !== s.title) { FORGE.renameSession(id, name); protoToast('已重命名'); }
      } else if (act === 'fork') {
        var f = FORGE.forkSession(id);
        protoToast('已分叉 → ' + f.title + '(顶层会话,血缘独立)');
        if (window.__openSession) window.__openSession(f.id);
      } else {
        FORGE.archiveSession(id, true);
        protoToast('已归档会话(行已移除);恢复经 设置 → 已归档会话');
      }
      closePopupMenu();
    });
  }

  /* 项目行 ⋯ 菜单(重命名 / 删除项目) */
  function projectMoreMenu(anchor, pid) {
    openPopupMenu(anchor,
      '<button class="menu-item" data-pm-act="rename">✎ 重命名</button>'
      + '<button class="menu-item" data-pm-act="del">🗑 删除项目</button>');
    popupMenu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pm-act]');
      if (!b) return;
      var p = FORGE.project(pid);
      if (!p) return;
      if (b.getAttribute('data-pm-act') === 'rename') {
        var name = prompt('重命名项目:', p.name);
        if (name && name !== p.name) { FORGE.renameProject(pid, name); protoToast('已改名(投影同步中)'); }
      } else if (confirm('删除项目 ' + p.name + '?投影移除,会话按 dsh 语义退未分组(历史不删除)。')) {
        FORGE.deleteProject(pid);
        protoToast('已删除项目');
        if (pid === FORGE.currentProjectId()) {
          setTimeout(function () { location.href = 'index.html'; }, 400);
        }
        return;
      }
      closePopupMenu();
    });
  }

  /* ＋ 添加项目:确认卡(裁决 #24 / decisions/project-storage-and-knowledge.md §5.4)
     形态 = 文档位置预览行 + 证据三档门控(命中forge树沿用仓内 / 有git仓内新建 / 无git应用管理);
     零 git 强制;三选 radio 与场景 chips 出卡(场景移原型工具);ERR_FORGE_NOT_DETECTED 废止 */
  function regDetect(path) {
    var raw = String(path || '').trim().replace(/^["]+|["]+$/g, '');
    if (!raw) return { st: 'idle' };
    var norm = raw.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
    var dup = FORGE.projects().some(function (p) {
      return p.path.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '') === norm;
    });
    if (dup) return { st: 'registered' };
    if (/new-repo/i.test(raw)) return { st: 'missing' };
    if (norm === 'z:/project/dsh') return { st: 'parent', kids: ['demo-app', 'legacy-repo', 'plain-demo'] };
    /* norm 内部斜杠已统一为正斜杠,上面比较两侧一致 */
    if (/legacy-repo/i.test(raw)) return { st: 'git', forge: true };
    if (/plain-demo/i.test(raw)) return { st: 'nogit' };
    return { st: 'git', forge: false };
  }
  window.PROTO_REG = { detect: regDetect };

  /* 共享绑定器:添加项目确认卡(工作台左栏 ＋ 原位对话框,全应用唯一注册入口)。
     root 内查询 data-reg-* 元素;onCreate(info) 回调收 {name, path, modeLabel} */
  window.protoBindRegisterCard = function (root, onCreate) {
    var q = function (s) { return root.querySelector(s); };
    var code = q('[data-reg-code]'), detectEl = q('[data-reg-detect]'), nameEl = q('[data-reg-name]'),
        prevEl = q('[data-reg-preview]'), editBtn = q('[data-reg-edit]'), panel = q('[data-reg-panel]'),
        docPath = q('[data-reg-docpath]'), custom = q('[data-reg-custom]'), customFb = q('[data-reg-customfb]'),
        createBtn = q('[data-reg-create]');
    var modes = Array.prototype.slice.call(root.querySelectorAll('[data-reg-mode]'));
    var nameTouched = false, docTouched = false, authorized = false, manual = false, mode = null;

    function fb(cls, dotCls, text) {
      return '<div class="form-feedback ' + cls + '"><span class="state-dot ' + dotCls + '" aria-hidden="true"></span>' + text + '</div>';
    }
    function strip(v) { return String(v || '').trim().replace(/^["]+|["]+$/g, ''); }
    function lastSeg(p) { var seg = strip(p).split(/[\\/]/).filter(Boolean); return seg.length ? seg[seg.length - 1] : ''; }
    function radio(v) { for (var i = 0; i < modes.length; i++) if (modes[i].value === v) return modes[i]; return null; }

    function update() {
      var raw = strip(code.value);
      var det = window.PROTO_REG.detect(raw);
      var registered = det.st === 'registered';
      var exists = det.st === 'git' || det.st === 'nogit' || det.st === 'parent';
      if (!manual) {
        mode = (det.st === 'git' && det.forge) ? 'reuse' : det.st === 'git' ? 'inrepo'
             : (det.st === 'nogit' || det.st === 'parent') ? 'app' : null;
      }
      /* 侦测反馈(信息陈述,非错误码;ERR_FORGE_NOT_DETECTED 已废止) */
      var html = '';
      if (det.st === 'idle') html = '';
      else if (registered) html = fb('ok-text', 'ok', '已注册项目 — 同一代码根仅一个项目(打开现有项目即可)');
      else if (det.st === 'missing') html = fb('error-text', 'error', '路径不存在 — 代码区必须是已存在的目录(存在 · 可读为注册校验;可写性在运行时复检,不作为注册门槛)');
      else if (det.st === 'parent') {
        html = fb('warn-text', 'warn', '该目录下含多个 git 仓库 — 可能想选择其中一个:')
          + '<div class="ap-suggest">' + det.kids.map(function (k) {
              return '<button type="button" class="chip" data-reg-kid="Z:\\project\\dsh\\' + k + '">' + k + '</button>';
            }).join('') + '</div>';
      }
      else if (det.st === 'git') html = fb('ok-text', 'ok', det.forge ? '✓ git 仓库 · 检出 forge 文档树' : '✓ git 仓库');
      else if (det.st === 'nogit') html = fb('info-text', 'ok', '未检测到 git — 无需 git,文档将由应用管理(不写入本目录)');
      detectEl.innerHTML = html;

      var reuseR = radio('reuse');
      if (reuseR) reuseR.hidden = !(det.st === 'git' && det.forge);
      if (!docTouched) docPath.value = raw ? raw.replace(/[\\/]+$/, '') + '\\docs' : '';

      /* 高级:自定义文档路径;仓外(不在代码根内)需显式授权(BIZ-001/003 收窄至此) */
      var customV = strip(custom.value);
      var customOutside = customV && raw && customV.toLowerCase().indexOf(raw.toLowerCase()) !== 0;
      if (customOutside && customV.toLowerCase() === raw.toLowerCase()) customOutside = false;
      if (customV && customOutside) {
        customFb.innerHTML = authorized
          ? '<div class="auth-row"><span class="state-dot ok" aria-hidden="true"></span><span class="grow">已授权(登记持久化);复检通过</span></div>'
          : '<div class="auth-row"><span class="state-dot warn" aria-hidden="true"></span><span class="grow">仓外位置,需显式授权后方可使用(BIZ-001/003,仅高级自定义)</span>'
            + '<button type="button" class="btn btn-ghost btn-sm" data-reg-auth>授权使用此位置</button></div>';
      } else customFb.innerHTML = '';

      /* 预览行(读承诺,非选择);预选只由本仓证据决定 — 换路径即重估,不做跨项目黏性 */
      var pv;
      if (customV) pv = { path: customV, note: '自定义文档位置' + (customOutside && !authorized ? ' · 待授权' : '') };
      else if (mode === 'reuse') pv = { path: docPath.value, note: '已检出 forge 文档 · 沿用仓内(随 git)' };
      else if (mode === 'inrepo') pv = { path: docPath.value, note: '随 git 提交 · 可 PR 评审' };
      else pv = { path: '', note: '应用数据目录(本机)· 应用管理 + 内部版本历史,不进 git' };
      prevEl.innerHTML = (pv.path
        ? '<span class="ap-preview__path">' + escHtml(pv.path) + '</span>'
        : '') + '<span class="ap-preview__note">' + pv.note + '</span>';
      modes.forEach(function (r) { r.checked = customV ? false : (r.value === mode); });

      if (!nameTouched) nameEl.value = exists ? lastSeg(raw) : '';
      var customOk = !customV || !customOutside || authorized;
      createBtn.disabled = !(exists && !registered && nameEl.value.trim() && customOk);
    }

    code.addEventListener('input', function () {
      manual = false; authorized = false; docTouched = false;
      if (custom) custom.value = '';
      update();
    });
    nameEl.addEventListener('input', function () { nameTouched = true; update(); });
    docPath.addEventListener('input', function () { docTouched = true; manual = true; mode = 'inrepo'; update(); });
    custom.addEventListener('input', function () { authorized = false; update(); });
    if (editBtn) editBtn.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      editBtn.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    });
    modes.forEach(function (r) { r.addEventListener('change', function () { manual = true; mode = r.value; custom.value = ''; authorized = false; update(); }); });
    root.addEventListener('click', function (e) {
      var kid = e.target.closest('[data-reg-kid]');
      if (kid) { code.value = kid.getAttribute('data-reg-kid'); code.dispatchEvent(new Event('input', { bubbles: true })); return; }
      if (e.target.closest('[data-reg-auth]')) { authorized = true; update(); protoToast('仓外位置已显式授权'); }
    });
    createBtn.addEventListener('click', function () {
      var raw = strip(code.value);
      var customV = strip(custom.value);
      var modeLabel = customV ? '自定义' : (mode === 'reuse' ? '沿用仓内' : mode === 'inrepo' ? '仓内(' + docPath.value + ')' : '应用管理');
      onCreate({ name: nameEl.value.trim(), path: raw, modeLabel: modeLabel });
    });
    var api = {
      fill: function (path) {
        code.value = path;
        nameTouched = false; docTouched = false; manual = false; authorized = false;
        if (custom) custom.value = '';
        code.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    code.__regFill = api.fill;
    update();
    return api;
  };

  function addProjectDialog() {
    var old = document.getElementById('add-project-overlay');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'add-project-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'ap-title');
    ov.innerHTML =
      '<div class="overlay__mask" data-overlay-close></div>'
      + '<div class="dialog">'
      + '<div class="dialog-header"><div style="flex:1">'
      + '<h2 class="t-title" id="ap-title">添加项目</h2>'
      + '<div class="t-aux">给代码区文件夹即可 — 文档位置由侦测预选,✎ 可改</div></div>'
      + '<button class="icon-btn" data-overlay-close aria-label="关闭">'
      + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
      + '<div class="dialog-body">'
      + '<div class="form-row"><label class="form-label" for="ap-code">代码区 <span class="required" aria-hidden="true">*</span></label>'
      + '<div class="path-input-line"><input class="path-input" id="ap-code" data-reg-code value="Z:\\project\\dsh\\demo-app" placeholder="拖拽 / 粘贴 / 浏览代码区文件夹">'
      + '<button class="btn btn-ghost btn-sm" onclick="protoToast(\'浏览选择目录(原型示意)\')">浏览…</button></div>'
      + '<div id="ap-detect" data-reg-detect aria-live="polite"></div></div>'
      + '<div class="form-row"><label class="form-label" for="ap-name">项目名</label>'
      + '<div class="path-input-line"><input class="path-input" id="ap-name" data-reg-name placeholder="自动取文件夹名,可改" style="font-family:var(--font-ui)"></div></div>'
      + '<div class="form-row"><span class="form-label">文档位置</span>'
      + '<div class="ap-preview"><span class="grow" id="ap-doc-preview" data-reg-preview></span>'
      + '<button type="button" class="btn btn-ghost btn-sm" data-reg-edit aria-expanded="false">✎</button></div>'
      + '<div class="ap-editpanel" data-reg-panel hidden>'
      + '<label class="ap-radio"><input type="radio" name="ap-mode" value="app" data-reg-mode checked> 应用管理(应用数据目录 + 内部版本历史)</label>'
      + '<label class="ap-radio"><input type="radio" name="ap-mode" value="inrepo" data-reg-mode> 仓内(随 git 提交,可 PR 评审)</label>'
      + '<div class="path-input-line"><input class="path-input" id="ap-doc-path" data-reg-docpath placeholder="<代码区>\\docs"></div>'
      + '<label class="ap-radio" hidden><input type="radio" name="ap-mode" value="reuse" data-reg-mode> 沿用仓内已检出的 forge 文档</label>'
      + '</div></div>'
      + '<div class="ap-greyrow">过程留痕 · 应用数据目录(本机,不进 git)</div>'
      + '<details class="ap-advanced"><summary>高级:自定义文档路径(仓外需授权)</summary>'
      + '<div class="path-input-line" style="margin-top:8px"><input class="path-input" id="ap-custom" data-reg-custom placeholder="自定义文档位置绝对路径"></div>'
      + '<div id="ap-custom-fb" data-reg-customfb></div></details>'
      + '</div>'
      + '<div class="dialog-footer">'
      + '<button class="btn btn-ghost btn-md" data-overlay-close>取消(Esc)</button>'
      + '<button class="btn btn-primary btn-md" id="ap-create" data-reg-create disabled>添加项目</button>'
      + '</div></div>';
    document.body.appendChild(ov);

    protoBindRegisterCard(ov, function (info) {
      var p = FORGE.addProject({ name: info.name, path: info.path });
      protoCloseOverlay(ov);
      protoToast('项目 ' + p.name + ' 已添加:探测缓存建立 · 投影同步 · 快照就绪(文档位置:' + info.modeLabel + ')');
    });
    openOverlay('#add-project-overlay');
    setTimeout(function () { code_focus(); }, 0);
    function code_focus() { var c = ov.querySelector('#ap-code'); if (c) c.focus(); }
    update_reg();
    function update_reg() { var c = ov.querySelector('#ap-code'); if (c) c.dispatchEvent(new Event('input', { bubbles: true })); }
  }

  /* 原型工具·注册场景(评审辅助;原对话框场景 chips 移此,裁决 #24) */
  window.protoFillRegisterScene = function (path) {
    var ap = document.getElementById('ap-code');
    if (ap) {
      var ov = document.getElementById('add-project-overlay');
      if (!ov || !ov.classList.contains('is-open')) addProjectDialog();
      var el = document.getElementById('ap-code');
      if (el && el.__regFill) el.__regFill(path);
      return;
    }
    var w = document.getElementById('w-code');
    if (w) {
      var wov = document.getElementById('wizard');
      if (wov && !wov.classList.contains('is-open')) protoOpenOverlay('#wizard');
      if (w.__regFill) w.__regFill(path);
    }
  };

  /* 视图选项 popover(分组方式 + 排序方式) */
  function viewOptionsMenu(anchor) {
    function radio(sec, key, val, label) {
      var on = sbView[key] === val;
      return '<button class="menu-item' + (on ? ' is-on' : '') + '" data-vk="' + key + '" data-vv="' + val + '">'
        + label + '<span class="ck">✓</span></button>';
    }
    openPopupMenu(anchor,
      '<div class="sb-viewmenu">'
      + '<h5>分组方式</h5>'
      + radio('g', 'group', 'tree', '按项目树')
      + radio('g', 'group', 'byproj', '按项目')
      + radio('g', 'group', 'flat', '单列表')
      + '<hr>'
      + '<h5>排序方式</h5>'
      + radio('s', 'sort', 'manual', '手动排序')
      + radio('s', 'sort', 'updated', '最近更新')
      + '</div>', 'sb-viewmenu');
    popupMenu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-vk]');
      if (!b) return;
      var changed = sbView[b.getAttribute('data-vk')] !== b.getAttribute('data-vv');
      sbView[b.getAttribute('data-vk')] = b.getAttribute('data-vv');
      saveSbView();
      closePopupMenu();
      if (changed && sbView.sort === 'manual') protoToast('手动排序:拖拽重排(原型以注册序示意)');
      renderSidebar();
    });
  }

  /* ---- 会话行 / subagent 行 ---- */
  function sessRow(s, depth, opts) {
    opts = opts || {};
    var kids = opts.noKids ? [] : FORGE.childrenOf(s.id);
    var active = window.__activeSessionId === s.id ? ' active' : '';
    var blank = s.status === 'draft' && !s.msgs.length ? ' is-blank' : '';
    var caret = '';
    if (kids.length && !opts.noKids) {
      var open = !!expandedSessions[s.id];
      caret = '<span class="sb-caret" data-sb-caret="' + s.id + '" role="button" tabindex="0" aria-label="' + (open ? '收起' : '展开') + '后代">' + (open ? '▾' : '▸') + '</span>';
    }
    var indent = 'style="padding-left:' + (8 + depth * 12) + 'px"';
    return '<div class="sb-sess' + active + blank + '" ' + indent
      + ' data-session-link="' + s.id + '" data-sb-search="' + escHtml((s.title || '').toLowerCase()) + '" role="button" tabindex="0" title="' + escHtml(s.title) + hoverCard(s) + '">'
      + dotHtml(s)
      + '<span class="sb-sess-title ellipsis">' + escHtml(s.title) + '</span>'
      + caret
      + '<span class="sb-time">' + escHtml(s.updated) + '</span>'
      + '<span class="sb-more" data-sb-more="' + s.id + '" role="button" tabindex="0" aria-label="会话菜单" title="重命名 / 分叉 / 归档">⋯</span>'
      + '</div>';
  }
  function subTree(s, depth) {
    var html = sessRow(s, depth);
    if (expandedSessions[s.id]) {
      FORGE.childrenOf(s.id).forEach(function (k) { html += subTree(k, depth + 1); });
    }
    return html;
  }

  /* ---- 当前项目会话区(C3 状态作用域:normal / degraded / empty) ---- */
  function projSessionsHtml(p, prevCur) {
    var tops = sortSessions(FORGE.sessionsOf(p.id));
    var limit = 5;
    var shown = overflowOpen[p.id] ? tops : tops.slice(0, limit);
    var rest = tops.length - Math.min(tops.length, limit);

    var normal = shown.map(function (s) { return subTree(s, 1); }).join('')
      + (rest > 0 && !overflowOpen[p.id]
        ? '<button class="sb-overflow" data-sb-overflow="' + p.id + '">⋯ 展开其余 ' + rest + ' 个会话</button>' : '')
      + (rest > 0 && overflowOpen[p.id]
        ? '<button class="sb-overflow" data-sb-overflow="' + p.id + '">收起</button>' : '');

    var degraded = '<p class="sb-note">血缘推断不可用(>100ms 降级)——仅顶层会话行;恢复后自动回完整模式。</p>'
      + tops.map(function (s) { return sessRow(s, 1, { noKids: true }); }).join('');

    var empty = '<div class="sb-note" style="text-align:center;padding:14px 6px">暂无会话<br>'
      + '<button class="btn btn-ghost btn-sm" data-new-session="' + p.id + '" style="margin-top:6px">+ 新会话</button></div>';

    return '<div data-state-scope="c3" data-scope-label="C3 会话列表状态" data-states="normal,degraded,empty" data-current="' + (prevCur || 'normal') + '">'
      + '<div data-state="normal">' + normal + '</div>'
      + '<div data-state="degraded" class="is-hidden">' + degraded + '</div>'
      + '<div data-state="empty" class="is-hidden">' + empty + '</div>'
      + '</div>';
  }

  /* ---- 分组渲染:按项目树(默认)/ 按项目 / 单列表 ---- */
  function listHtml(cur, prevCur) {
    var html = '';

    if (sbView.group === 'flat') {
      FORGE.flatSessions().forEach(function (s) {
        var isSub = !!s.parentId;
        var active = window.__activeSessionId === s.id ? ' active' : '';
        var p = FORGE.project(s.project);
        html += '<div class="sb-sess sb-flat-row' + active + (isSub ? ' sb-sub is-arrow' : '') + '"'
          + ' data-session-link="' + s.id + '" data-sb-search="' + escHtml((s.title + ' ' + (p ? p.name : '')).toLowerCase()) + '"'
          + ' role="button" tabindex="0" title="' + escHtml((p ? p.name + ' / ' : '') + s.title) + '">'
          + (isSub ? '' : dotHtml(s))
          + '<span class="sb-sess-title ellipsis">' + escHtml(s.title) + '</span>'
          + '<span class="sb-time">' + escHtml(s.updated) + '</span>'
          + '<span class="sb-more" data-sb-more="' + s.id + '" role="button" tabindex="0" aria-label="会话菜单">⋯</span>'
          + '</div>';
      });
      if (!html) html = '<div class="sb-note">暂无会话</div>';
      return html;
    }

    var groups = FORGE.projects().slice().sort(function (a, b) {
      return (a.archived ? 1 : 0) - (b.archived ? 1 : 0);
    });
    groups.forEach(function (p) {
      var isCur = p.id === cur.id && !p.archived;
      var open = isCur ? (projExpanded[p.id] !== false) : !!projExpanded[p.id];
      /* 图标位(dsh 同构):文件夹开/闭;hover 换三角 caret,点击 = 展开收起 */
      var ic = '<span class="sb-proj-ic" data-sb-proj-toggle="' + p.id + '" role="button" tabindex="0"'
        + ' aria-expanded="' + open + '" title="' + (open ? '收起' : '展开') + '">'
        + '<svg class="i-fold" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6">' + (open ? ICONS.foldOpen : ICONS.foldClose) + '</svg>'
        + '<svg class="i-chev" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9 6l6 6-6 6z"/></svg>'
        + '</span>';
      html += '<div class="sb-proj' + (isCur ? ' current' : '') + (open ? ' is-open' : '') + (p.archived ? ' is-archived' : '') + '"'
        + ' data-sb-proj="' + p.id + '" data-sb-search="' + escHtml(p.name.toLowerCase()) + '"'
        + ' role="button" tabindex="0" title="' + escHtml(p.name) + (p.archived ? ' · 已归档(只读)' : '') + '">'
        + ic
        + '<span class="sb-proj-name ellipsis">' + escHtml(p.name) + '</span>'
        + (p.archived ? '<span class="sb-time sb-proj-warn" title="已归档(只读)">⚠</span>' : '')
        + '<span class="sb-hoveracts">'
        + (p.archived ? '' : '<span class="sb-mini" data-proj-new="' + p.id + '" role="button" tabindex="0" title="在此新建会话">＋</span>')
        + '<span class="sb-mini" data-proj-more="' + p.id + '" role="button" tabindex="0" title="重命名 / 删除项目">⋯</span>'
        + '</span>'
        + '</div>';
      if (open) {
        if (isCur) html += projSessionsHtml(p, prevCur);
        else html += sortSessions(FORGE.sessionsOf(p.id)).slice(0, 5).map(function (s) { return subTree(s, 1); }).join('');
      }
    });
    return html;
  }

  /* ---- 侧栏整体渲染(全页同构) ---- */
  function renderSidebar() {
    var sidebar = $('.app-sidebar');
    var host = $('[data-sidebar]', sidebar);
    if (!sidebar || !host || !HAS_FORGE) return;

    /* 各页静态旧结构(品牌/脚注)让位于 JS 渲染的 v2.9 侧栏 */
    ['.app-brand', '.sidebar-foot'].forEach(function (sel) {
      var el = sidebar.querySelector(':scope > ' + sel);
      if (el) el.remove();
    });

    var prevScope = host.querySelector('[data-state-scope="c3"]');
    var prevCur = prevScope ? prevScope.getAttribute('data-current') : 'normal';
    var prevInput = host.querySelector('.sb-searchbox input');
    var prevQ = sbSearching && prevInput ? prevInput.value : '';

    var cur = FORGE.project(FORGE.currentProjectId());

    /* 激活会话的祖先链默认展开 */
    if (window.__activeSessionId) {
      FORGE.chainOf(window.__activeSessionId).slice(0, -1).forEach(function (a) {
        if (expandedSessions[a.id] === undefined) expandedSessions[a.id] = true;
      });
    }

    host.innerHTML =
      '<div class="sb-main">'
      + '<div class="sb-brand" data-new-session="' + cur.id + '" title="新建会话(品牌行快捷)" role="button" tabindex="0">'
      + '<span class="app-brand-mark">F</span><span class="sb-wordmark">dsh-forge</span>'
      + '<button type="button" class="icon-btn sb-collapse" data-sidebar-collapse aria-label="收起侧栏" title="收起侧栏">' + ICONS.collapse + '</button>'
      + '</div>'
      + '<div class="sb-new"><button class="sb-new-btn" data-new-session="' + cur.id + '">'
      + '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> 新会话</button></div>'
      + '<div class="sb-head' + (sbSearching ? ' is-searching' : '') + '">'
      + '<span class="sb-label">项目</span>'
      + '<div class="sb-head-search">'
      + '<input type="search" placeholder="搜索项目与会话…" aria-label="搜索项目与会话">'
      + '<button type="button" class="icon-btn" data-sb-search-exit aria-label="退出搜索">✕</button>'
      + '</div>'
      + '<span class="sb-actions">'
      + '<button type="button" class="icon-btn" data-sb-search-btn aria-label="搜索" title="搜索(项目名 + 会话标题)">' + ICONS.search + '</button>'
      + '<button type="button" class="icon-btn" data-sb-view-btn aria-label="视图选项" title="视图选项(分组 / 排序)">' + ICONS.viewopts + '</button>'
      + '<button type="button" class="icon-btn" data-sb-add-btn aria-label="添加项目" title="添加项目…">' + ICONS.folderPlus + '</button>'
      + '</span>'
      + '</div>'
      + '<div class="sb-searchbox is-hidden"><input type="search" placeholder="搜索项目与会话…" aria-label="搜索项目与会话"></div>'
      + '<div class="sb-list">' + listHtml(cur, prevCur) + '</div>'
      + '<div class="sb-foot" data-sb-settings role="button" tabindex="0">'
      + ICONS.gear.replace('<svg', '<svg width="15" height="15"') + ' <span>设置</span>'
      + '<span class="sb-conn"><span class="state-dot ok breathing" aria-label="已连接"></span>已连接</span>'
      + '</div>'
      + '</div>'
      + '<div class="sb-rail">'
      + '<button type="button" class="sb-mini sb-rail-mark" data-sidebar-expand aria-label="展开侧栏" title="展开侧栏">' + ICONS.collapse + '</button>'
      + '<button type="button" class="sb-mini" data-new-session="' + cur.id + '" aria-label="新会话" title="新会话">⊕</button>'
      + '<button type="button" class="sb-mini" data-rail-search aria-label="搜索" title="搜索">🔍</button>'
      + '<button type="button" class="sb-mini" data-sb-add-btn aria-label="添加项目" title="添加项目…">' + ICONS.folderPlus + '</button>'
      + '<span class="sb-rail-spacer"></span>'
      + '<button type="button" class="sb-mini" data-sb-settings-rail aria-label="设置" title="设置">' + ICONS.gear.replace('<svg', '<svg width="15" height="15"') + '</button>'
      + '</div>'
      + '<div class="sb-resize" role="separator" aria-orientation="vertical" aria-label="侧栏宽度(264–420)" tabindex="0"></div>';

    if (prevCur !== 'normal') protoSetState('c3', prevCur); else protoSetState('c3', 'normal');
    if (prevQ) {
      var input = host.querySelector(sbSearching ? '.sb-head-search input' : '.sb-searchbox input');
      if (input) { input.value = prevQ; filterSidebar(input.value); }
    }
  }

  /* ---- 搜索过滤(项目名 + 会话标题;无匹配行隐藏) ---- */
  function filterSidebar(q) {
    q = q.trim().toLowerCase();
    document.querySelectorAll('.sb-list [data-sb-search]').forEach(function (row) {
      row.classList.toggle('is-hidden', !!q && row.getAttribute('data-sb-search').indexOf(q) === -1);
    });
  }

  /* ---- 侧栏事件(代理;渲染后仍有效) ---- */
  document.addEventListener('click', function (e) {
    /* 会话行打开 / ⋯ 菜单 / 后代展开 */
    var more = e.target.closest('[data-sb-more]');
    if (more) { e.stopPropagation(); sessionMoreMenu(more, more.getAttribute('data-sb-more')); return; }
    var caret = e.target.closest('[data-sb-caret]');
    if (caret) {
      e.stopPropagation();
      var cid = caret.getAttribute('data-sb-caret');
      expandedSessions[cid] = !expandedSessions[cid];
      renderSidebar();
      return;
    }
    var link = e.target.closest('[data-session-link]');
    if (link && !e.target.closest('[data-sb-more]')) {
      var id = link.getAttribute('data-session-link');
      if (window.__openSession) { e.preventDefault(); window.__openSession(id); return; }
      var s = FORGE.findSession(id);
      location.href = 'project-home.html?p=' + (s ? s.project : FORGE.currentProjectId()) + '&s=' + id;
      return;
    }
    /* 项目行:切换 / 在此新建 / ⋯ / 图标位展开收起 */
    var projTgl = e.target.closest('[data-sb-proj-toggle]');
    if (projTgl) {
      e.stopPropagation();
      var tpid = projTgl.getAttribute('data-sb-proj-toggle');
      var nowOpen = FORGE.currentProjectId() === tpid ? projExpanded[tpid] !== false : !!projExpanded[tpid];
      projExpanded[tpid] = !nowOpen;
      renderSidebar();
      return;
    }
    var projNew = e.target.closest('[data-proj-new]');
    if (projNew) { e.stopPropagation(); location.href = 'project-home.html?p=' + projNew.getAttribute('data-proj-new') + '&new=1'; return; }
    var projMore = e.target.closest('[data-proj-more]');
    if (projMore) { e.stopPropagation(); projectMoreMenu(projMore, projMore.getAttribute('data-proj-more')); return; }
    /* 项目行(2026-09-28 修正):工作台内原位换台(同项目零动作;异项目一次性过渡动画);
       非工作台页兜底 = 同项目无操作、异项目跳转 */
    var proj = e.target.closest('[data-sb-proj]');
    if (proj) {
      var pjid = proj.getAttribute('data-sb-proj');
      if (window.__switchProject) { window.__switchProject(pjid); return; }
      if (pjid === FORGE.currentProjectId()) return;
      location.href = 'project-home.html?p=' + pjid;
      return;
    }
    /* 溢出折叠 */
    var ov = e.target.closest('[data-sb-overflow]');
    if (ov) {
      var pid = ov.getAttribute('data-sb-overflow');
      overflowOpen[pid] = !overflowOpen[pid];
      renderSidebar();
      return;
    }
    /* 区头三图标 */
    if (e.target.closest('[data-sb-view-btn]')) { viewOptionsMenu(e.target.closest('[data-sb-view-btn]')); return; }
    if (e.target.closest('[data-sb-add-btn]')) { e.stopPropagation(); addProjectDialog(); return; }
    var searchBtn = e.target.closest('[data-sb-search-btn]');
    if (searchBtn) {
      sbSearching = true;
      renderSidebar();
      var inp = document.querySelector('.sb-head-search input');
      if (inp) inp.focus();
      return;
    }
    if (e.target.closest('[data-sb-search-exit]')) { exitSearch(); return; }
    if (e.target.closest('[data-rail-search]')) {
      toggleSidebar(false);
      sbSearching = true;
      renderSidebar();
      var ri = document.querySelector('.sb-head-search input');
      if (ri) ri.focus();
      return;
    }
    /* 设置行(独立设置页已裁撤 #25:入口位保留,各项随 GUI 逐项归宿) */
    if (e.target.closest('[data-sb-settings], [data-sb-settings-rail]')) {
      protoToast('设置:原型未含独立页(保持简洁,各项随 GUI 逐项归宿)');
      return;
    }
    /* 收起 / 展开 */
    if (e.target.closest('[data-sidebar-collapse]')) {
      e.stopPropagation();
      toggleSidebar(true);
      return;
    }
    if (e.target.closest('[data-sidebar-expand]')) { toggleSidebar(false); return; }
  });
  document.addEventListener('input', function (e) {
    var input = e.target.closest ? e.target.closest('.sb-searchbox input, .sb-head-search input') : null;
    if (input) filterSidebar(input.value);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!sbSearching) return;
    var active = document.activeElement;
    if (active && /input/i.test(active.tagName)) return; /* 输入框自身 Esc 先清空(浏览器行为) */
    exitSearch();
  });
  function exitSearch() {
    sbSearching = false;
    renderSidebar();
  }

  /* 会话行点击钩子(工作台页内开 tab;其余页深链回工作台)已在 data-session-link 代理中处理 */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-new-session]');
    if (!btn) return;
    e.stopPropagation();
    var pid = btn.getAttribute('data-new-session');
    if (window.__newSession) { e.preventDefault(); window.__newSession(pid); return; }
    location.href = 'project-home.html?p=' + pid + '&new=1';
  });

  /* ---- 侧栏收起 / 展开(56px rail) ---- */
  function toggleSidebar(collapse) {
    var shell = $('.app-shell');
    if (!shell) return;
    shell.classList.toggle('is-sidebar-collapsed', collapse);
    var btns = document.querySelectorAll('[data-sidebar-collapse]');
    btns.forEach(function (b) {
      b.setAttribute('aria-label', collapse ? '展开侧栏' : '收起侧栏');
      b.title = collapse ? '展开侧栏' : '收起侧栏';
    });
  }

  /* ---- 侧栏宽度拖拽(264–420) ---- */
  (function () {
    var shell = $('.app-shell');
    if (!shell) return;
    var dragging = false, startX = 0, startW = 0;
    document.addEventListener('pointerdown', function (e) {
      var handle = e.target.closest('.sb-resize');
      if (!handle) return;
      dragging = true; startX = e.clientX;
      startW = parseInt(getComputedStyle($('.app-sidebar')).width, 10) || 280;
      e.preventDefault();
    });
    document.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var w = Math.max(264, Math.min(420, startW + e.clientX - startX));
      document.documentElement.style.setProperty('--sidebar-w', w + 'px');
    });
    document.addEventListener('pointerup', function () {
      if (!dragging) return;
      dragging = false;
      var w = parseInt(getComputedStyle($('.app-sidebar')).width, 10) || 280;
      protoToast('侧栏宽度已记忆(' + w + 'px)');
    });
  })();

  /* ---- 主题切换(亮/暗,body[data-ds-dark-theme]) ---- */
  function setTheme(dark) {
    if (dark) document.body.setAttribute('data-ds-dark-theme', '');
    else document.body.removeAttribute('data-ds-dark-theme');
    try { localStorage.setItem('proto-theme', dark ? 'dark' : 'light'); } catch (err) { /* 忽略 */ }
  }
  try { if (localStorage.getItem('proto-theme') === 'dark') setTheme(true); } catch (err) { /* 忽略 */ }

  /* ---- 原型工具(评审用,非产品 UI) ---- */
  var toolbar = document.createElement('div');
  toolbar.className = 'proto-toolbar';
  var head = document.createElement('div');
  head.className = 'proto-toolbar__head';
  head.innerHTML = '<strong>原型工具</strong><span>(评审用)</span>';

  var themeBtn = document.createElement('button');
  themeBtn.className = 'proto-btn';
  themeBtn.textContent = '切换亮/暗主题';
  themeBtn.addEventListener('click', function () {
    setTheme(!document.body.hasAttribute('data-ds-dark-theme'));
  });

  var themeScope = document.createElement('div');
  themeScope.className = 'proto-scope';
  themeScope.appendChild(themeBtn);
  toolbar.appendChild(head);
  toolbar.appendChild(themeScope);

  /* 侧栏先渲染(动态 c3 作用域要在工具扫描前就位) */
  renderSidebar();
  if (HAS_FORGE) FORGE.on(renderSidebar);

  document.querySelectorAll('[data-state-scope]').forEach(function (scope) {
    var states = (scope.getAttribute('data-states') || '').split(',').filter(Boolean);
    if (!states.length) return;
    var key = scope.getAttribute('data-state-scope');
    var label = scope.getAttribute('data-scope-label') || '状态';

    var group = document.createElement('div');
    group.className = 'proto-scope';
    group.setAttribute('data-proto-key', key);
    var lab = document.createElement('span');
    lab.className = 'proto-scope__label';
    lab.textContent = label;
    group.appendChild(lab);

    states.forEach(function (name) {
      var b = document.createElement('button');
      b.className = 'proto-btn';
      b.textContent = name;
      b.addEventListener('click', function () { protoSetState(key, name); });
      if (name === scope.getAttribute('data-current')) b.classList.add('active');
      group.appendChild(b);
    });
    toolbar.appendChild(group);

    applyState(scope, scope.getAttribute('data-current') || states[0]);
  });

  /* 注册场景组(原对话框场景 chips 移此,裁决 #24:证据三档 + 边缘态) */
  var regScenes = [
    ['git 仓 → 仓内新建', 'Z:\\project\\dsh\\demo-app'],
    ['无 git → 应用管理', 'Z:\\project\\dsh\\plain-demo'],
    ['forge 树 → 沿用仓内', 'Z:\\project\\dsh\\legacy-repo'],
    ['已注册', 'Z:\\project\\dsh\\dsh-forge'],
    ['父目录 → 子仓提示', 'Z:\\project\\dsh'],
    ['路径不存在', 'Z:\\project\\dsh\\new-repo']
  ];
  var regGroup = document.createElement('div');
  regGroup.className = 'proto-scope';
  regGroup.setAttribute('data-proto-register', '');
  var regLab = document.createElement('span');
  regLab.className = 'proto-scope__label';
  regLab.textContent = '注册场景';
  regGroup.appendChild(regLab);
  regScenes.forEach(function (sc) {
    var b = document.createElement('button');
    b.className = 'proto-btn';
    b.textContent = sc[0];
    b.addEventListener('click', function () { window.protoFillRegisterScene(sc[1]); });
    regGroup.appendChild(b);
  });
  toolbar.appendChild(regGroup);

  document.body.appendChild(toolbar);
})();
