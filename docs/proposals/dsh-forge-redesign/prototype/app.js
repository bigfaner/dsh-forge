/* ==========================================================================
   dsh-forge 重构总纲原型 — 交互引擎(app.js)
   三区渲染:左栏(知识库面板 + 项目树/会话列表)/ 中区(会话面板)/ 右栏(dock)。
   事件:全文档委托(data-act);浮层:菜单/气泡/对话框/Toast。
   核心链路:知识卡片/详情(frontmatter)· 置信度构成 · 审核工作台 ·
   召回控制台(四动词+域过滤+阈值+预算)· 抽取(去重→合并队列)· 晋升/移动 ·
   工作区对账 · 任务状态层(tool 半身写入模拟)。
   ========================================================================== */
(function () {
  'use strict';
  var F = window.FORGE;

  /* ───────── 工具 ───────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function heatIcon() { return '<span aria-hidden="true" style="font-size:10px;line-height:1">🔥</span>'; }

  /* 极简 Markdown(标题/加粗/代码/列表/表格/引用) */
  function md(src) {
    var lines = esc(src || '').split('\n');
    var out = [], inUl = false, inTbl = false, tblRows = [];
    function flushUl() { if (inUl) { out.push('</ul>'); inUl = false; } }
    function flushTbl() {
      if (inTbl) {
        var head = tblRows[0], body = tblRows.slice(tblRows[1][0] === '---' || /^-+$/.test(tblRows[1].join('')) ? 2 : 1);
        var h = '<table><thead><tr>' + head.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
        body.forEach(function (r) { h += '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; });
        out.push(h + '</tbody></table>');
        inTbl = false; tblRows = [];
      }
    }
    lines.forEach(function (raw) {
      var line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
      if (/^\|/.test(line)) {
        flushUl();
        inTbl = true;
        tblRows.push(line.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }));
        return;
      }
      flushTbl();
      if (/^###\s/.test(line)) { flushUl(); out.push('<h3>' + line.slice(4) + '</h3>'); }
      else if (/^##\s/.test(line)) { flushUl(); out.push('<h2>' + line.slice(3) + '</h2>'); }
      else if (/^#\s/.test(line)) { flushUl(); out.push('<h1>' + line.slice(2) + '</h1>'); }
      else if (/^>\s?/.test(line)) { flushUl(); out.push('<p style="color:var(--dsw-alias-label-tertiary);border-left:2px solid var(--dsw-alias-border-l3);padding-left:8px">' + line.replace(/^>\s?/, '') + '</p>'); }
      else if (/^[-*]\s/.test(line)) { if (!inUl) { out.push('<ul>'); inUl = true; } out.push('<li>' + line.slice(2) + '</li>'); }
      else if (/^```/.test(line)) { /* 代码块标记忽略(行内已转) */ }
      else if (line.trim() === '') { flushUl(); }
      else { flushUl(); out.push('<p>' + line + '</p>'); }
    });
    flushUl(); flushTbl();
    return out.join('');
  }

  /* ───────── UI 状态(不持久化) ───────── */
  var S = {
    projectId: 'p1',
    sessionId: 's1',            /* null = hero 新会话 */
    view: 'conv',
    centerView: 'conv',         /* 中区一等公民视图:conv(会话)| kn(知识库) */
    sbCollapsed: false,
    kb: { scope: 'all', domain: null, status: 'all', q: '', domCollapsed: false, recallOnly: false, openDom: {} },
    knTab: 'browse',            /* 知识库内部页签:browse(浏览)| stats(统计分析)| rlog(召回日志) */
    knRlog: { verb: 'all', q: '', open: null },
    knStat: { domain: null, time: 0, range: null, drill: [], custom: { dim: 'domain', metrics: ['recalls'], chart: 'bar' } },
    knDrawer: null,             /* 知识详情抽屉(右侧;点卡片打开) */
    pj: { q: '', searching: false },
    dock: { open: false, tabs: [], active: null, fullscreen: false },
    ov: { subtab: 'feature', taskFeat: null, taskView: 'list' },
    rv: { qtab: 'pending' },
    trajCollapsed: false
  };
  var prevHeat = {};   /* 热度变化动画追踪 */

  function project() { return F.db.projects.find(function (p) { return p.id === S.projectId; }); }
  function session() { return S.sessionId ? F.sessionGet(S.sessionId) : null; }

  /* ───────── 浮层:菜单 / 气泡 / 对话框 / Toast ───────── */
  var layerRoot;
  function closeLayers() { layerRoot.innerHTML = ''; }
  function withinViewport(node, rect) {
    var w = node.offsetWidth, h = node.offsetHeight;
    var left = clampN(rect.left, 8, window.innerWidth - w - 8);
    var top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 6);
    node.style.left = left + 'px'; node.style.top = top + 'px';
  }
  function openMenu(anchor, items, headLabel) {
    closeLayers();
    var m = document.createElement('div');
    m.className = 'menu'; m.setAttribute('role', 'menu');
    var html = '';
    if (headLabel) html += '<div class="menu-label">' + esc(headLabel) + '</div>';
    items.forEach(function (it) {
      if (it === '-') { html += '<div class="menu-sep"></div>'; return; }
      html += '<button class="menu-item' + (it.danger ? ' is-danger' : '') + '" data-menu-id="' + esc(it.id) + '" role="menuitem">' +
        (it.icon || '') + '<span class="ellipsis" style="flex:1">' + esc(it.label) + '</span>' +
        (it.tail ? '<span class="t-aux" style="font-size:11px">' + esc(it.tail) + '</span>' : '') + '</button>';
    });
    m.innerHTML = html;
    layerRoot.appendChild(m);
    withinViewport(m, anchor.getBoundingClientRect());
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-menu-id]');
      if (!b) return;
      var it = items.find(function (x) { return x && x.id === b.getAttribute('data-menu-id'); });
      closeLayers();
      if (it && it.onClick) it.onClick();
    });
  }
  function openPop(anchor, html) {
    closeLayers();
    var p = document.createElement('div');
    p.className = 'pop';
    p.innerHTML = html;
    layerRoot.appendChild(p);
    withinViewport(p, anchor.getBoundingClientRect());
    return p;
  }
  function openDialog(opts) {
    if (!opts.stacked) closeLayers();   /* stacked = 叠加层(如浏览目录悬于表单上,不关下层) */
    var mask = document.createElement('div');
    mask.className = 'dialog-mask';
    mask.innerHTML =
      '<div class="dialog" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
        '<div class="dialog-head"><div class="dialog-title">' + esc(opts.title) + '</div>' +
        '<button class="icon-btn" data-dlg-close aria-label="关闭"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="dialog-body">' + opts.body + '</div>' +
        '<div class="dialog-foot">' +
          '<button class="btn btn-ghost" data-dlg-close>取消</button>' +
          (opts.ok ? '<button class="btn btn-primary" data-dlg-ok>' + esc(opts.okLabel || '确定') + '</button>' : '') +
        '</div>' +
      '</div>';
    layerRoot.appendChild(mask);
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.closest('[data-dlg-close]')) {
        if (opts.stacked) mask.remove(); else closeLayers();
      }
    });
    var okBtn = mask.querySelector('[data-dlg-ok]');
    if (okBtn) okBtn.addEventListener('click', function () { opts.onOk && opts.onOk(mask); });
    return mask;
  }
  function toast(msg) {
    var wrap = $('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.classList.add('is-out'); }, 2600);
    setTimeout(function () { t.remove(); }, 3000);
  }

  /* ───────── dock 页签模型(页签跟随所属项目:项目切换 → 可见页签集切换) ───────── */
  function tabId(kind, ref, proj) { return kind + (ref ? ':' + ref : '') + (proj ? '@' + proj : ''); }
  function openTab(kind, ref, title, opts) {
    opts = opts || {};
    /* start = 全局门页(不挂项目);其余页签记录打开时的所属项目 */
    var proj = kind === 'start' ? null : (opts.project !== undefined ? opts.project : S.projectId);
    var id = tabId(kind, ref, proj);
    var existing = S.dock.tabs.find(function (t) { return t.id === id; });
    if (!existing) {
      var t = { id: id, kind: kind, ref: ref || null, title: title, project: proj, isGlobal: !proj };
      /* 开始页语义:门页 —— 从开始卡片打开时原位替换 */
      var startIdx = S.dock.tabs.findIndex(function (x) { return x.kind === 'start'; });
      if (opts.fromStart && startIdx >= 0) S.dock.tabs[startIdx] = t;
      else S.dock.tabs.push(t);
    }
    S.dock.active = id;
    S.dock.open = true;
    renderAll();
  }
  function closeTab(id) {
    S.dock.tabs = S.dock.tabs.filter(function (t) { return t.id !== id; });
    if (S.dock.active === id) {
      var vis = dockVisibleTabs();
      S.dock.active = vis.length ? vis[vis.length - 1].id : null;
    }
    renderAll();
  }
  function ensureDockOpen() { S.dock.open = true; renderAll(); }

  /* ───────── 渲染:左栏(只放菜单与导航;知识面板在右栏) ───────── */
  function renderSidebar() {
    var sb = $('#app-sidebar');
    sb.classList.toggle('is-collapsed', !!S.sbCollapsed);
    $('#sb-rail').hidden = !S.sbCollapsed;
    /* 知识库入口:激活态 = 中区知识视图;徽标 = 待审核数 */
    var knBtn = $('#sb-kn-btn');
    knBtn.classList.toggle('active', S.centerView === 'kn');
    var badge = $('#kn-pending-badge');
    var pend = F.kn.pendingCount(S.projectId);
    badge.hidden = pend <= 0;
    badge.textContent = pend > 99 ? '99+' : String(pend);
    renderProjects();
  }

  /* 知识库面板 */
  function confBadge(id, size) {
    var c = F.kn.confidence(id);
    if (!c) return '';
    return '<span class="badge badge-conf badge-conf-' + c.level + '" data-act="conf-pop" data-kn="' + esc(id) + '" ' +
      'title="置信度 ' + (c.total * 100).toFixed(0) + '%(' + c.levelLabel + ')· 点击看四信号构成" role="button" tabindex="0">' +
      '置信 ' + (c.total * 100).toFixed(0) + '% · ' + c.levelLabel + '</span>';
  }
  function statusBadge(st) {
    var map = { approved: ['approved', '已审核'], pending: ['pending', '待审核'], rejected: ['rejected', '已拒绝'] };
    var m = map[st] || ['pending', st];
    return '<span class="badge badge-' + m[0] + '">' + m[1] + '</span>';
  }
  function heatBadge(id) {
    var h = F.kn.heat(id);
    var bump = prevHeat[id] !== undefined && h > prevHeat[id] ? ' heat-bump' : '';
    prevHeat[id] = h;
    return '<span class="badge badge-heat' + bump + '" title="热度 = 被引用(召回使用)次数">' + heatIcon() + '<span class="heat-num">' + h + '</span></span>';
  }
  /* —— 范围(统一页面:默认全部知识,可下钻项目/会话)—— */
  function parseScope() {
    var s = S.kb.scope;
    if (s === 'all' || s === 'global') return { type: s };
    if (s.indexOf('project:') === 0) return { type: 'project', id: s.slice(8) };
    if (s.indexOf('session:') === 0) return { type: 'session', id: s.slice(8) };
    return { type: 'all' };
  }
  function scopeListOpts() {
    var sc = parseScope();
    if (sc.type === 'project') return { scope: 'project', project: sc.id };
    if (sc.type === 'global') return { scope: 'global' };
    return { scope: 'all' };
  }
  function scopeLabel() {
    var sc = parseScope();
    if (sc.type === 'all') return '全部知识';
    if (sc.type === 'global') return '全局库';
    if (sc.type === 'project') {
      var p = F.db.projects.find(function (x) { return x.id === sc.id; });
      return '项目 · ' + (p ? p.name : sc.id);
    }
    var s = F.sessionGet(sc.id);
    return '会话 · ' + (s ? s.title : sc.id);
  }
  function projectOfSession(sid) {
    var s = F.sessionGet(sid);
    if (!s) return null;
    return F.db.projects.find(function (p) { return p.workspaceId === s.ws; });
  }
  function setKbScope(scope) {
    S.kb.scope = scope;
    S.kb.domain = null; S.kb.status = 'all';
    S.knStat.domain = null;
    S.knStat.drill = [];
    renderAll();
  }

  function renderKb() {
    if (S.centerView !== 'kn') return;
    var sc = parseScope();
    var opts = scopeListOpts();
    /* 内部页签(浏览 | 统计分析)激活态与视图切换(CSS data-tab 驱动) */
    var knview = $('#knview');
    knview.setAttribute('data-tab', S.knTab);
    document.querySelectorAll('.knview-tab').forEach(function (t) {
      var on = t.getAttribute('data-t') === S.knTab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
    });
    $('#kb-scope-label').textContent = scopeLabel();
    $('#kb-back').hidden = sc.type !== 'session';
    var q = $('#kb-q'); if (q && document.activeElement !== q) q.value = S.kb.q;
    $('#kb-clear').hidden = !S.kb.q;

    /* 搜索命中提示条 */
    var hitinfo = $('#kb-hitinfo');
    if (S.kb.q && sc.type !== 'session') {
      var n = F.kn.list(Object.assign({}, opts, { domain: S.kb.domain, q: S.kb.q, includeRedirects: false })).length;
      hitinfo.hidden = false;
      hitinfo.innerHTML = '<span>“<b>' + esc(S.kb.q) + '</b>” 命中 <b>' + n + '</b> 条' +
        (S.kb.domain ? '(域 ' + esc(S.kb.domain) + ')' : '') + '</span>' +
        '<span class="hit-clear" data-act="kb-clear-search" role="button" tabindex="0">清除搜索</span>';
    } else hitinfo.hidden = true;

    /* 状态过滤 + 仅可召回(置信阈值)chips */
    var counts = { all: 0, pending: 0, approved: 0 };
    F.kn.list(Object.assign({}, opts, { domain: S.kb.domain, q: S.kb.q, includeRedirects: false }))
      .forEach(function (k) { counts.all++; if (counts[k.status] != null) counts[k.status]++; });
    $('#kb-filters').innerHTML = [['all', '全部'], ['pending', '待审核'], ['approved', '已审核']].map(function (p2) {
      return '<button class="kb-filter-chip' + (S.kb.status === p2[0] ? ' active' : '') + '" data-act="kb-status" data-st="' + p2[0] + '">' +
        p2[1] + ' ' + counts[p2[0]] + '</button>';
    }).join('') +
      '<button class="kb-filter-chip' + (S.kb.recallOnly ? ' active' : '') + '" data-act="kb-recall-only" ' +
      'title="agent 召回阈值示意:低于 40% 的知识不参与召回(排序与置信解耦)">仅可召回 ≥40%</button>' +
      /* 抽取入口(模态对话框,不占右栏;原 ⋯ 菜单入口随整体切换移除) */
      '<button class="kb-filter-chip" data-act="kb-extract" style="margin-left:auto" title="从会话沉淀知识(frontmatter 契约校验 + 近似去重)">✎ 从会话抽取</button>';

    /* 对账 banner(外部修改 → 索引重建) */
    var banner = $('#kb-banner');
    var un = F.kn.unindexedCount(sc.type === 'project' ? sc.id : null);
    if (un > 0) {
      banner.hidden = false;
      banner.innerHTML = '<span class="state-dot warn" aria-hidden="true"></span><span style="flex:1">对账:检测到 ' + un +
        ' 个未入索引文件(外部编辑器直改)</span><button class="btn btn-ghost btn-sm" data-act="kb-reconcile">重建索引</button>';
    } else banner.hidden = true;

    /* 目录(域):会话范围隐藏;搜索时计数只统计命中条目 */
    $('#kb-dom-wrap').hidden = sc.type === 'session';
    $('#kb-dom-wrap').classList.toggle('is-collapsed', !!S.kb.domCollapsed);
    if (sc.type !== 'session') {
      var filtered = F.kn.list(Object.assign({}, opts, { q: S.kb.q, includeRedirects: false }));
      $('#kb-dom-hint').textContent = S.kb.q ? '按命中过滤' : (sc.type === 'all' ? '目录即域 · ≤3 层' : sc.type === 'project' ? '本项目域' : '全局库域');
      renderKbDom(filtered);
    }

    /* 按会话下钻(项目范围) */
    renderKbDrill();

    renderKbCards();
    if (S.knTab === 'stats') renderKnStats();
    if (S.knTab === 'rlog') renderKnRlog();

    $('#kb-foot').innerHTML = sc.type === 'session'
      ? '会话知识 = 召回记录 + 沉淀条目(状态层事件;数据源同「知识召回」tab)'
      : sc.type === 'project'
        ? (function () { var p = F.db.projects.find(function (x) { return x.id === sc.id; });
            return '项目知识目录 <span class="t-code" title="' + esc(p ? p.knowledgeDir : '') + '">' + esc(p ? p.knowledgeDir : '—') + '</span> · 经宿主能力面写入'; })()
        : sc.type === 'global'
          ? '全局知识库(独立 · 多项目共享)· 应用 profile 专用目录'
          : '全部 = 各项目知识目录 + 全局库 · 点范围可下钻到项目 / 会话';
  }
  function renderKbDrill() {
    var sc = parseScope();
    var box = $('#kb-drill');    if (sc.type !== 'project') { box.hidden = true; box.innerHTML = ''; return; }
    var p = F.db.projects.find(function (x) { return x.id === sc.id; });
    if (!p) { box.hidden = true; return; }
    var rows = F.sessionsOf(p.workspaceId).map(function (s) {
      var rc = F.kn.recallCountOf(s.id), ec = F.kn.extractCountOf(s.id);
      return '<div class="kb-drill-row" data-act="kb-session-drill" data-s="' + esc(s.id) + '" ' +
        'title="下钻:本会话召回 / 沉淀的知识">' +
        '<span class="state-dot ' + (s.status === 'running' ? 'ok breathing' : 'idle') + '"></span>' +
        '<span class="drill-title ellipsis">' + esc(s.title) + '</span>' +
        '<span class="drill-counts">召回 <b>' + rc + '</b> · 沉淀 <b>' + ec + '</b></span></div>';
    }).join('');
    box.hidden = false;
    box.innerHTML = '<div class="kb-drill-label"><span>按会话下钻</span><span style="flex:1"></span><span>' + F.sessionsOf(p.workspaceId).length + ' 个会话</span></div>' +
      (rows || '<div class="kb-empty" style="padding:6px">项目暂无会话</div>');
  }
  /* ───────── 统计分析页签:多维下钻(范围跟随浏览;域 = 主下钻维度) ───────── */
  function knScopeItems() {
    var sc = parseScope();
    var list;
    if (sc.type === 'session') {
      var os = F.kn.ofSession(sc.id);
      var seen = {};
      list = os.recalled.map(function (r) { seen[r.knId] = 1; return F.kn.get(r.knId); }).filter(Boolean)
        .concat(os.extracted.filter(function (k) { return !seen[k.id]; }));
    } else {
      list = F.kn.list(Object.assign({}, scopeListOpts(), { includeRedirects: false }));
    }
    if (S.knStat.domain) {
      list = list.filter(function (k) {
        var d = F.kn.domainOf(k.path);
        return d === S.knStat.domain || (d + '/').startsWith(S.knStat.domain + '/');
      });
    }
    return list;
  }
  /* 统计分析(召回中心):时间过滤为条件 · 召回按 项目→feature→会话 逐级下钻 · 自由分析报表
     目的 = 持续迭代提升召回率 */
  var RECALL_VERBS_APP = { search: 1, 'read-abstract': 1, 'read-full': 1 };
  function knStatFilteredEvents(items) {
    var itemIds = {};
    items.forEach(function (k) { itemIds[k.id] = 1; });
    /* 时间 = 过滤条件:预设天数窗口,或自定义起止日期(含当日) */
    var from = 0, to = Infinity;
    if (S.knStat.range) {
      from = Date.parse(S.knStat.range.from + 'T00:00:00') || 0;
      to = Date.parse(S.knStat.range.to + 'T23:59:59') || Infinity;
    } else if (S.knStat.time) {
      from = F.now() - S.knStat.time * 864e5;
    }
    return F.db.events.filter(function (e) {
      if (!itemIds[e.knId]) return false;
      if (e.ts < from || e.ts > to) return false;
      return true;
    });
  }
  function sessProject(s) { return F.db.projects.find(function (p) { return p.workspaceId === s.ws; }) || null; }
  function sessFeature(s) { var t = s.taskKey && F.db.tasks[s.taskKey]; return t ? t.feature : null; }
  /* ── 自定义时间范围(气泡选择器):跨度上限 90 天,起止过远自动收窄 ── */
  function fmtDay(ts) {
    var dt = new Date(ts);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }
  function fmtDayShort(iso) { var p = String(iso).split('-'); return parseInt(p[1], 10) + '.' + parseInt(p[2], 10); }
  var STAT_SPAN_MAX = 90;   /* 天 */
  function clampStatRange(changed) {
    var r = S.knStat.range;
    if (!r) return;
    var f = Date.parse(r.from + 'T00:00:00'), t = Date.parse(r.to + 'T00:00:00');
    if (isNaN(f) || isNaN(t)) return;
    if (f > t) {   /* 起晚于止:对齐到改动一侧 */
      if (changed === 'from') r.to = r.from; else r.from = r.to;
      return;
    }
    if (t - f > STAT_SPAN_MAX * 864e5) {   /* 跨度过远:收窄到改动一侧 ± 90 天 */
      if (changed === 'from') r.to = fmtDay(f + STAT_SPAN_MAX * 864e5);
      else r.from = fmtDay(t - STAT_SPAN_MAX * 864e5);
      toast('时间跨度上限 ' + STAT_SPAN_MAX + ' 天 —— 已自动收窄(自定义仅作过滤条件)');
    }
  }
  function syncCustomTimePop() {
    var pop = layerRoot.querySelector('.pop');
    if (!pop || !S.knStat.range) return;
    var f = pop.querySelector('[data-act-sel="tfrom"]'), t = pop.querySelector('[data-act-sel="tto"]');
    if (f) f.value = S.knStat.range.from;
    if (t) t.value = S.knStat.range.to;
    var days = Math.round((Date.parse(S.knStat.range.to + 'T00:00:00') - Date.parse(S.knStat.range.from + 'T00:00:00')) / 864e5) + 1;
    var badge = pop.querySelector('#ctp-span-badge');
    if (badge) badge.textContent = '跨度 ' + days + ' 天 · 上限 ' + STAT_SPAN_MAX;
  }
  function openCustomTimePop(anchor) {
    var spans = [7, 14, 30, 90];
    var r = S.knStat.range;
    openPop(anchor,
      '<div class="pop-title">自定义时间范围</div>' +
      '<div class="ctp-row"><span class="ctp-k">快捷跨度</span><span class="ctp-spans">' + spans.map(function (n) {
        return '<button class="kb-filter-chip" data-act="stat-span" data-n="' + n + '">近 ' + n + ' 天</button>';
      }).join('') + '</span></div>' +
      '<div class="ctp-row"><span class="ctp-k">起止</span>' +
      '<input type="date" class="stat-date" data-act-sel="tfrom" value="' + esc(r.from) + '" aria-label="起始日期">' +
      '<span class="ctp-sep">→</span>' +
      '<input type="date" class="stat-date" data-act-sel="tto" value="' + esc(r.to) + '" aria-label="截止日期">' +
      '<span class="ctp-span" id="ctp-span-badge"></span></div>' +
      '<div class="pop-note">起止过远自动收窄(上限 ' + STAT_SPAN_MAX + ' 天);修改即生效,点击外部或 Esc 关闭。</div>' +
      '<div class="ctp-foot"><button class="btn btn-ghost btn-sm" data-act="stat-time-clear">↺ 清除 · 回预设</button></div>');
    syncCustomTimePop();
  }
  function knStatGroupRows(evs, levelFn) {
    var g = {};
    evs.forEach(function (e) {
      var row = levelFn(e);
      if (!row) return;
      g[row.key] = g[row.key] || { key: row.key, label: row.label, drill: row.drill, jump: row.jump || null, n: 0, kns: {} };
      g[row.key].n++;
      g[row.key].kns[e.knId] = 1;
    });
    return Object.keys(g).map(function (k) { return g[k]; })
      .map(function (r) { r.m = Object.keys(r.kns).length; return r; })
      .sort(function (a, b) { return b.n - a.n; });
  }
  function renderKnStats() {
    var items = knScopeItems();
    var box = $('#knstats');
    if (!items.length) {
      box.innerHTML = '<div class="stat-empty">当前范围暂无知识</div>';
      return;
    }
    var evsAll = knStatFilteredEvents(items);
    var evs = evsAll.filter(function (e) { return RECALL_VERBS_APP[e.verb]; });
    var fbEv = evsAll.filter(function (e) { return e.verb.indexOf('feedback') === 0; });

    /* KPI(时间窗内) */
    var totalRecalls = evs.length;
    var knHit = {}, sessHit = {};
    evs.forEach(function (e) { knHit[e.knId] = 1; if (e.sessionId) sessHit[e.sessionId] = 1; });
    var covered = Object.keys(knHit).length;
    var coverPct = items.length ? Math.round(covered / items.length * 100) : 0;
    var adopted = fbEv.filter(function (e) { return e.verb === 'feedback-adopted'; }).length;
    var ignored = fbEv.filter(function (e) { return e.verb === 'feedback-ignored'; }).length;
    var adoptRate = (adopted + ignored) ? Math.round(adopted / (adopted + ignored) * 100) + '%' : '—';
    var zero = items.filter(function (k) { return !knHit[k.id]; });

    /* 时间 = 过滤条件:预设 chips(近1/3/7/30/90 天)+ 自定义气泡选择器 */
    var inCustom = !!S.knStat.range;
    var timeChips = [[0, '全部时间'], [1, '近1天'], [3, '近3天'], [7, '近7天'], [30, '近30天'], [90, '近90天']].map(function (t) {
      return '<button class="kb-filter-chip' + (!inCustom && S.knStat.time === t[0] ? ' active' : '') + '" data-act="stat-time" data-d="' + t[0] + '">' + t[1] + '</button>';
    }).join('') +
      '<button class="kb-filter-chip' + (inCustom ? ' active' : '') + '" data-act="stat-time-custom" ' +
      'title="自定义起止日期(气泡选择器;跨度上限 ' + STAT_SPAN_MAX + ' 天;时间仅为过滤条件)">自定义' +
      (inCustom ? ' · ' + fmtDayShort(S.knStat.range.from) + '–' + fmtDayShort(S.knStat.range.to) : '') + '</button>';

    var kpiHtml = [
      [totalRecalls + ' 次', '召回使用事件(时间窗内)'],
      [covered + ' / ' + items.length, '被召回知识 · 覆盖率 ' + coverPct + '%'],
      [Object.keys(sessHit).length + ' 个', '参与召回的会话'],
      [adoptRate, '反馈采纳率(采纳 ' + adopted + ' · 忽略 ' + ignored + ')'],
      [zero.length + ' 条', '时间窗内零召回(盲区)']
    ].map(function (k) {
      return '<div class="stat-kpi"><div class="stat-kpi-num">' + k[0] + '</div><div class="stat-kpi-label">' + esc(k[1]) + '</div></div>';
    }).join('');

    /* M1 召回分布:项目 → feature → 会话 逐级下钻 */
    var drill = S.knStat.drill || [];
    function evMatchDrill(e, arr) {
      var s = e.sessionId ? F.sessionGet(e.sessionId) : null;
      for (var i = 0; i < arr.length; i++) {
        if (!s) return false;
        if (i === 0) { var p = sessProject(s); if (!p || p.id !== arr[0]) return false; }
        if (i === 1 && sessFeature(s) !== arr[1]) return false;
        if (i === 2 && s.id !== arr[2]) return false;
      }
      return true;
    }
    var scoped = evs.filter(function (e) { return evMatchDrill(e, drill); });
    var rows1;
    if (drill.length === 0) {
      rows1 = knStatGroupRows(scoped, function (e) {
        var s = e.sessionId ? F.sessionGet(e.sessionId) : null;
        if (!s) return { key: '_none', label: '无会话记录' };
        var p = sessProject(s);
        return { key: p ? p.id : s.ws, label: p ? '📁 ' + p.name : s.ws, drill: (p ? p.id : null) };
      });
    } else if (drill.length === 1) {
      rows1 = knStatGroupRows(scoped, function (e) {
        var s = e.sessionId ? F.sessionGet(e.sessionId) : null;
        if (!s) return null;
        var f = sessFeature(s);
        return { key: f || '_none', label: f ? '🗃 ' + f : '未关联 feature', drill: f || null };
      });
    } else {
      rows1 = knStatGroupRows(scoped, function (e) {
        var s = e.sessionId ? F.sessionGet(e.sessionId) : null;
        if (!s) return null;
        return { key: s.id, label: '💬 ' + s.title, jump: s.id };
      });
    }
    var r1Max = rows1.length ? rows1[0].n : 1;
    var crumb = '<span class="crumb-seg' + (drill.length ? '' : ' current') + '" data-act="stat-dd" data-d="">全部</span>';
    if (drill.length >= 1) {
      var pj = F.db.projects.find(function (p) { return p.id === drill[0]; });
      crumb += '<span class="crumb-sep">›</span><span class="crumb-seg' + (drill.length === 1 ? ' current' : '') + '" data-act="stat-dd" data-d="' + esc(pj ? pj.id : drill[0]) + '">' + esc(pj ? pj.name : drill[0]) + '</span>';
    }
    if (drill.length >= 2) {
      crumb += '<span class="crumb-sep">›</span><span class="crumb-seg current">' + esc(drill[1]) + '</span>';
    }
    var m1 = '<div class="stat-mod"><div class="stat-mod-title">🧭 召回分布<span class="mod-note">项目 → feature → 会话 逐级下钻</span></div>' +
      '<div class="stat-crumb">' + crumb + '</div>' +
      (rows1.map(function (r) {
        var act = r.jump ? ' data-act="stat-sess" data-s="' + esc(r.jump) + '" title="下钻:该会话召回/沉淀的知识"'
          : r.drill ? ' data-act="stat-dd" data-d="' + esc(drill.concat([r.drill]).join('|')) + '" title="下钻"' : '';
        return '<div class="stat-row' + (act ? ' is-click' : '') + '"' + act + '>' +
          '<span class="sr-label" title="' + esc(r.label) + '">' + esc(r.label) + '</span>' +
          '<span class="sr-track"><span class="sr-fill" style="width:' + Math.max(4, Math.round(r.n / r1Max * 100)) + '%"></span></span>' +
          '<span class="sr-val">' + r.n + ' 次 · ' + r.m + ' 条</span></div>';
      }).join('') || '<div class="stat-empty" style="padding:8px 0">本层暂无召回(盲区信号)</div>') + '</div>';

    /* M2 知识召回 Top(时间窗内) */
    var heatWin = {};
    evs.forEach(function (e) { heatWin[e.knId] = (heatWin[e.knId] || 0) + 1; });
    var top = items.filter(function (k) { return heatWin[k.id] > 0; })
      .sort(function (a, b) { return heatWin[b.id] - heatWin[a.id]; }).slice(0, 8);
    var topMax = top.length ? heatWin[top[0].id] : 1;
    var m2 = '<div class="stat-mod"><div class="stat-mod-title">📖 知识召回 Top ' + top.length + '<span class="mod-note">召回了哪些知识(时间窗内)· 点击开详情</span></div>' +
      (top.map(function (k, i) {
        return '<div class="stat-top-row" data-act="stat-kn" data-kn="' + esc(k.id) + '">' +
          '<span class="rank">' + (i + 1) + '</span>' +
          '<span class="t-title ellipsis" title="' + esc(k.title) + '">' + esc(k.title) + '</span>' +
          confBadge(k.id) +
          '<span class="t-track"><span class="t-fill" style="width:' + Math.max(4, Math.round(heatWin[k.id] / topMax * 100)) + '%"></span></span>' +
          '<span class="t-num">' + heatWin[k.id] + '</span></div>';
      }).join('') || '<div class="stat-empty" style="padding:8px 0">时间窗内暂无召回</div>') + '</div>';

    /* M3 召回盲区(时间窗内零召回 / 低置信) */
    var zeroTop = zero.slice().sort(function (a, b) { return a.created - b.created; }).slice(0, 5);
    var lowConf = items.filter(function (k) { var c = F.kn.confidence(k.id); return c && c.total < 0.40; });
    var m3 = '<div class="stat-mod"><div class="stat-mod-title">🕳 召回盲区 · 提升机会<span class="mod-note">时间窗内零召回 · 点击开详情</span></div>' +
      (zeroTop.map(function (k) {
        return '<div class="stat-top-row" data-act="stat-kn" data-kn="' + esc(k.id) + '">' +
          '<span class="rank">·</span>' +
          '<span class="t-title ellipsis" title="' + esc(k.title) + '">' + esc(k.title) + '</span>' +
          '<span class="t-num" title="创建于 ' + F.fmtDate(k.created) + '">' + F.relative(k.created) + '</span></div>';
      }).join('') || '<div class="stat-empty" style="padding:6px 0">时间窗内无零召回库存 ✓</div>') +
      '<div class="t-aux" style="margin-top:6px;font-size:11px;line-height:16px">' +
      '低置信(<40%,不可召回)' + lowConf.length + ' 条 · 待审核 ' + items.filter(function (k) { return k.status === 'pending'; }).length + ' 条<br>' +
      '迭代动作:提炼摘要/关键词 → 审核提升置信 → 合并近似 → 晋升曝光 → 归档淘汰。</div></div>';

    /* M4 反馈质量 */
    var fbMax = Math.max(adopted, ignored, 1);
    var m4 = '<div class="stat-mod"><div class="stat-mod-title">✅ 反馈质量<span class="mod-note">agent 采纳/忽略 = 置信度第四信号(时间窗内)</span></div>' +
      [['✓ 采纳', adopted, 'fill-ok'], ['✕ 忽略', ignored, 'fill-mute']].map(function (s) {
        return '<div class="stat-row"><span class="sr-label">' + s[0] + '</span>' +
          '<span class="sr-track"><span class="sr-fill ' + s[2] + '" style="width:' + Math.max(3, Math.round(s[1] / fbMax * 100)) + '%"></span></span>' +
          '<span class="sr-val">' + s[1] + '</span></div>';
      }).join('') +
      '<div class="t-aux" style="margin-top:6px;font-size:11px">采纳率 ' + adoptRate + ' —— 忽略多的知识优先复核(过时/失真信号)。</div></div>';

    /* M4b 召回动词分布(分层阅读动词:检索 → 摘要 → 正文;总纲 §召回动词集) */
    var VERBS = [['search', '🔍 search · 检索命中'], ['read-abstract', '📄 read-abstract · 读摘要'], ['read-full', '📖 read-full · 读正文'], ['browse', '◐ browse · 浏览域']];
    var verbN = VERBS.map(function (v) {
      return { label: v[1], n: evs.filter(function (e) { return e.verb === v[0]; }).length };
    });
    var verbMax = Math.max.apply(null, verbN.map(function (v) { return v.n; }).concat([1]));
    var convFull = verbN[0].n ? Math.round(verbN[2].n / verbN[0].n * 100) + '%' : '—';
    var convAbs = verbN[0].n ? Math.round(verbN[1].n / verbN[0].n * 100) + '%' : '—';
    var m4b = '<div class="stat-mod"><div class="stat-mod-title">🪜 召回动词分布<span class="mod-note">分层阅读动词(时间窗内)· 每次召回记使用事件</span></div>' +
      verbN.map(function (v) {
        return '<div class="stat-row"><span class="sr-label" title="' + esc(v.label) + '">' + esc(v.label) + '</span>' +
          '<span class="sr-track"><span class="sr-fill" style="width:' + Math.max(3, Math.round(v.n / verbMax * 100)) + '%"></span></span>' +
          '<span class="sr-val">' + v.n + '</span></div>';
      }).join('') +
      '<div class="t-aux" style="margin-top:6px;font-size:11px;line-height:16px">读摘要转化 ' + convAbs + ' · 读正文转化 ' + convFull +
      ' —— 命中多而深读少 = 标题/摘要吸引力问题(迭代方向)。</div></div>';

    /* M5 自由统计分析(最下方通栏):维度 × 指标(最多 3 个)自由组合 · 图表类型可切换(右端) */
    var DIMS = [['domain', '域(一级)'], ['project', '项目'], ['feature', 'feature'], ['session', '来源会话'], ['status', '状态'], ['conf', '置信度档'], ['author', '作者类型']];
    var METRICS = [['recalls', '召回次数'], ['count', '知识条数'], ['cover', '覆盖率'], ['adopted', '采纳数'], ['ignored', '忽略数']];
    var metricName = {};
    METRICS.forEach(function (m) { metricName[m[0]] = m[1]; });
    function dimKeyOf(k) {
      var d = S.knStat.custom.dim;
      if (d === 'domain') return F.kn.domainOf(k.path).split('/')[0] || '(根)';
      if (d === 'project') {
        if (k.scope === 'global') return '全局库';
        var pp = F.db.projects.find(function (x) { return x.id === k.project; });
        return pp ? pp.name : k.project;
      }
      if (d === 'feature') {
        var sid = k.srcSession || ((k.author || '').indexOf('agent:') === 0 ? k.author.slice(6) : null);
        var ss = sid && F.sessionGet(sid);
        return (ss && sessFeature(ss)) || '未关联';
      }
      if (d === 'session') {
        var sid2 = k.srcSession || ((k.author || '').indexOf('agent:') === 0 ? k.author.slice(6) : null);
        var ss2 = sid2 && F.sessionGet(sid2);
        return ss2 ? ss2.title : '非会话沉淀';
      }
      if (d === 'status') return { pending: '待审核', approved: '已审核', rejected: '已拒绝' }[k.status] || k.status;
      if (d === 'conf') { var c = F.kn.confidence(k.id); return c ? c.levelLabel : '—'; }
      if (d === 'author') return (k.author || '').indexOf('agent:') === 0 ? 'agent' : '人工';
      return '—';
    }
    var groups = {};
    items.forEach(function (k) {
      var key = dimKeyOf(k);
      groups[key] = groups[key] || { items: 0, recalls: 0, hit: {}, adopted: 0, ignored: 0 };
      groups[key].items++;
    });
    evs.forEach(function (e) {
      var k = F.kn.get(e.knId); if (!k) return;
      var g = groups[dimKeyOf(k)];
      if (!g) return;
      g.recalls++; g.hit[e.knId] = 1;
    });
    fbEv.forEach(function (e) {
      var k = F.kn.get(e.knId); if (!k) return;
      var g = groups[dimKeyOf(k)];
      if (!g) return;
      if (e.verb === 'feedback-adopted') g.adopted++;
      if (e.verb === 'feedback-ignored') g.ignored++;
    });
    function metricOf(g, mk) {
      if (mk === 'count') return g.items;
      if (mk === 'cover') return g.items ? Math.round(Object.keys(g.hit).length / g.items * 100) : 0;
      if (mk === 'adopted') return g.adopted;
      if (mk === 'ignored') return g.ignored;
      return g.recalls;
    }
    /* 共享坐标系:类别 = 各指标共用(x 一致 · y 同一刻度);按跨指标最大值排序取 Top 10 */
    function catRowsOf(mks) {
      return Object.keys(groups).map(function (key) {
        var vals = {}, mx = 0;
        mks.forEach(function (mk) { var v = metricOf(groups[key], mk); vals[mk] = v; if (v > mx) mx = v; });
        return { key: key, vals: vals, mx: mx };
      }).sort(function (a, b) { return b.mx - a.mx; }).slice(0, 10);
    }
    /* 同组内按指标深浅区分(类别色相不变:x 取值一色的要求保留) */
    function shadeOf(base, i) {
      return i === 0 ? base
        : i === 1 ? 'color-mix(in srgb, ' + base + ' 64%, transparent)'
        : 'color-mix(in srgb, ' + base + ' 36%, transparent)';
    }
    /* 图表:x 轴刻度置于下侧,数值随点/柱顶;多指标共享同一坐标系 */
    function chartOf(rows, mks) {
      if (!rows.length) return '<div class="stat-empty" style="padding:8px 0">无数据</div>';
      var gmax = 1;
      rows.forEach(function (r) { mks.forEach(function (mk) { if (r.vals[mk] > gmax) gmax = r.vals[mk]; }); });
      function colorOf(i) { return 'var(--dsw-chart-c' + (i % 10) + ')'; }
      function valStr(r, mk) { return r.vals[mk] + (mk === 'cover' ? '%' : ''); }
      /* 多指标图例(柱形 = 同组由深到浅;折线 = 每线一色) */
      var legend = mks.length > 1
        ? '<div class="sc-legend">' + mks.map(function (mk, i) {
            var sw = S.knStat.custom.chart === 'line'
              ? 'background:' + colorOf(i)
              : 'background:' + shadeOf('var(--dsw-alias-label-secondary)', i);
            return '<span class="sc-legend-item"><i class="sc-sw" style="' + sw + '"></i>' + esc(metricName[mk] || mk) + '</span>';
          }).join('') +
          '<span class="t-aux" style="font-size:10.5px;margin-left:auto">' + (S.knStat.custom.chart === 'line' ? '每线一指标' : '同组由深到浅') + ' · 共享坐标轴</span></div>'
        : '';
      var body;
      if (S.knStat.custom.chart === 'line') {
        var n = rows.length;
        function xfOf(i) { return n === 1 ? 0.5 : i / (n - 1); }
        function yVbOf(v) { return 280 - Math.round(v / gmax * 240); }
        var segs = '', dots = '';
        if (mks.length === 1) {
          /* 单指标折线:逐点着色(x 取值一色) */
          var mk0 = mks[0];
          for (var si = 1; si < n; si++) {
            segs += '<line x1="' + (xfOf(si - 1) * 1000).toFixed(1) + '" y1="' + yVbOf(rows[si - 1].vals[mk0]) + '"' +
              ' x2="' + (xfOf(si) * 1000).toFixed(1) + '" y2="' + yVbOf(rows[si].vals[mk0]) + '"' +
              ' stroke="' + colorOf(si) + '" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
          }
          rows.forEach(function (r, i) {
            var left = (xfOf(i) * 100).toFixed(2);
            var bot = ((300 - yVbOf(r.vals[mk0])) / 3).toFixed(2);
            dots += '<i class="sc-dot" style="left:' + left + '%;bottom:' + bot + '%;background:' + colorOf(i) + '" title="' + esc(r.key) + ' · ' + valStr(r, mk0) + '"></i>' +
              '<span class="sc-val" style="left:' + left + '%;bottom:calc(' + bot + '% + 15px)">' + valStr(r, mk0) + '</span>';
          });
        } else {
          /* 多指标折线:每指标一条线(按指标取色),共享 x/y 轴 */
          mks.forEach(function (mk, mi) {
            var lc = colorOf(mi);
            for (var sj = 1; sj < n; sj++) {
              segs += '<line x1="' + (xfOf(sj - 1) * 1000).toFixed(1) + '" y1="' + yVbOf(rows[sj - 1].vals[mk]) + '"' +
                ' x2="' + (xfOf(sj) * 1000).toFixed(1) + '" y2="' + yVbOf(rows[sj].vals[mk]) + '"' +
                ' stroke="' + lc + '" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
            }
            rows.forEach(function (r, i) {
              var left = (xfOf(i) * 100).toFixed(2);
              var bot = ((300 - yVbOf(r.vals[mk])) / 3).toFixed(2);
              dots += '<i class="sc-dot" style="left:' + left + '%;bottom:' + bot + '%;background:' + lc + '" title="' + esc(r.key) + ' · ' + esc(metricName[mk] || mk) + ': ' + valStr(r, mk) + '"></i>' +
                '<span class="sc-val" style="left:' + left + '%;bottom:calc(' + bot + '% + 15px)">' + valStr(r, mk) + '</span>';
            });
          });
        }
        body = '<div class="stat-colchart stat-linechart"><div class="sc-line">' +
          '<svg class="sc-svg" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">' + segs + '</svg>' + dots +
          '</div><div class="sc-axis abs">' + rows.map(function (r, i) {
            return '<span class="sc-label" style="left:' + (xfOf(i) * 100).toFixed(2) + '%" title="' + esc(r.key) + '">' + esc(r.key) + '</span>';
          }).join('') + '</div></div>';
      } else {
        /* 柱形图:逐组着色(类别色相),组内按指标深浅;共享 y 轴 */
        body = '<div class="stat-colchart"><div class="sc-bars">' + rows.map(function (r, ci) {
          return '<div class="sc-group">' + mks.map(function (mk, mi) {
            return '<div class="sc-cell" title="' + esc(r.key) + ' · ' + esc(metricName[mk] || mk) + ': ' + valStr(r, mk) + '">' +
              '<span class="sc-val">' + valStr(r, mk) + '</span>' +
              '<i class="sc-bar" style="height:' + Math.max(3, Math.round(r.vals[mk] / gmax * 100)) + '%;background:' + shadeOf(colorOf(ci), mi) + '"></i></div>';
          }).join('') + '</div>';
        }).join('') + '</div>' +
          '<div class="sc-axis">' + rows.map(function (r) {
            return '<span class="sc-label" title="' + esc(r.key) + '">' + esc(r.key) + '</span>';
          }).join('') + '</div></div>';
      }
      return legend + body;
    }
    var selMetrics = S.knStat.custom.metrics;
    var dimLabel = (DIMS.filter(function (d) { return d[0] === S.knStat.custom.dim; })[0] || [, '—'])[1];
    var m5 = '<div class="stat-mod stat-mod-wide"><div class="stat-mod-title">🧪 自由统计分析<span class="mod-note">维度 × 指标(最多 3 个)自由组合(受范围与时间过滤)</span></div>' +
      '<div class="stat-custom">' +
      '<label>维度 <select data-act-sel="dim">' + DIMS.map(function (d) {
        return '<option value="' + d[0] + '"' + (S.knStat.custom.dim === d[0] ? ' selected' : '') + '>' + d[1] + '</option>';
      }).join('') + '</select></label>' +
      /* 指标 = 多选 chips(最多 3 个,至少 1 个) */
      '<span class="sc-types">指标' + METRICS.map(function (m) {
        var on = selMetrics.indexOf(m[0]) >= 0;
        return '<button class="kb-filter-chip' + (on ? ' active' : '') + '" data-act="stat-metric" data-v="' + m[0] + '" title="' + (on ? '点击移除该指标' : '点击叠加该指标') + '">' + m[1] + '</button>';
      }).join('') + '<span class="t-aux" style="font-size:10.5px">' + selMetrics.length + '/3</span></span>' +
      /* 图表类型切换:置于行右端 */
      '<span class="sc-types sc-right">图表' +
      '<button class="kb-filter-chip' + (S.knStat.custom.chart !== 'line' ? ' active' : '') + '" data-act="stat-chart" data-v="bar">柱形图</button>' +
      '<button class="kb-filter-chip' + (S.knStat.custom.chart === 'line' ? ' active' : '') + '" data-act="stat-chart" data-v="line">折线图</button>' +
      '</span>' +
      '</div>' +
      '<div class="sc-chart">' + chartOf(catRowsOf(selMetrics), selMetrics) + '</div>' +
      '<div class="stat-summary">维度:' + esc(dimLabel) + ' · 指标 ' + selMetrics.length + ' 个(≤3)· 共享坐标系 · Top 10 组</div></div>';

    box.innerHTML =
      '<div class="stat-topline"><span class="t-aux">统计范围:' + esc(scopeLabel()) + ' · 目的 = 持续迭代提升召回率</span>' +
      '<span class="stat-times">' + timeChips + '</span></div>' +
      '<div class="stat-kpis">' + kpiHtml + '</div>' +
      /* 首行:召回分布 + 知识召回 Top;次行:盲区 + 反馈质量 + 召回动词分布;最下方:自由分析(通栏) */
      '<div class="stat-grid">' + m1 + m2 + m3 + m4 + m4b + m5 + '</div>' +
      '<p class="stat-note">召回即记使用事件(状态层)→ 本页与热度/知识召回 tab 同源;时间仅为过滤条件(预设或自定义起止),分布按 项目→feature→会话 逐级下钻;自由分析可任选维度 × 指标(最多 3 个,多指标共享同一坐标系)。</p>';
  }
  /* ───────── 召回日志(轨迹级:时间 / trace_id / 项目 / 会话 / 参数 / 命中 / 耗时;事后分析) ───────── */
  var RL_VERBS = [['all', '全部'], ['search', '检索 search'], ['read-abstract', '读摘要'], ['read-full', '读正文'], ['browse', '浏览域']];
  var RL_VERB_LABEL = { search: '检索 search', 'read-abstract': '读摘要', 'read-full': '读正文', browse: '浏览域' };
  function rlProjectName(pid) {
    if (!pid) return '未挂项目';
    var p = F.db.projects.find(function (x) { return x.id === pid; });
    return p ? '📁 ' + p.name : pid;
  }
  function rlScopeFilter(L, sc) {
    if (sc.type === 'project' && L.projectId !== sc.id) return false;
    if (sc.type === 'session' && L.sessionId !== sc.id) return false;
    return true;
  }
  function renderKnRlog() {
    var box = $('#knrlog');
    if (!box) return;
    var sc = parseScope();
    var scoped = (F.db.recallLogs || []).filter(function (L) { return rlScopeFilter(L, sc); });
    var verbN = { all: scoped.length };
    scoped.forEach(function (L) { verbN[L.verb] = (verbN[L.verb] || 0) + 1; });
    box.innerHTML =
      '<div class="rl-top">' +
      '<span class="t-aux">召回日志 · dsh-forge 内核于召回执行时记录(轨迹级 · 事后分析):' + scoped.length + ' 条轨迹 · 空结果 ' +
      scoped.filter(function (L) { return L.status === 'empty'; }).length + ' · 会话 ' +
      Object.keys(scoped.reduce(function (a, L) { if (L.sessionId) a[L.sessionId] = 1; return a; }, {})).length +
      ' 个 · 受头部范围过滤</span>' +
      '<span class="rl-chips">' + RL_VERBS.map(function (v) {
        return '<button class="kb-filter-chip' + (S.knRlog.verb === v[0] ? ' active' : '') + '" data-act="rl-verb" data-v="' + v[0] + '">' +
          v[1] + ' ' + (verbN[v[0]] || 0) + '</button>';
      }).join('') + '</span>' +
      '<div class="kb-searchrow rl-search">' +
      '<svg class="kb-search-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input id="rl-q" type="text" placeholder="搜 trace_id / 关键词 / 知识 / 会话…" aria-label="召回日志检索" value="' + esc(S.knRlog.q) + '">' +
      '</div></div>' +
      '<div id="rl-list"></div>';
    renderRlList();
  }
  function renderRlList() {
    var listEl = $('#rl-list');
    if (!listEl) return;
    var sc = parseScope();
    var logs = (F.db.recallLogs || []).filter(function (L) { return rlScopeFilter(L, sc); })
      .filter(function (L) { return S.knRlog.verb === 'all' || L.verb === S.knRlog.verb; })
      .filter(function (L) {
        if (!S.knRlog.q) return true;
        var s = L.sessionId && F.sessionGet(L.sessionId);
        var hay = (L.traceId + ' ' + ((L.args && L.args.keywords) || []).join(' ') + ' ' +
          L.hits.map(function (id) { var k = F.kn.get(id); return k ? k.title : ''; }).join(' ') + ' ' +
          (s ? s.title : '')).toLowerCase();
        return hay.indexOf(S.knRlog.q.toLowerCase()) >= 0;
      })
      .sort(function (a, b) { return b.ts - a.ts; });
    var rowsHtml = logs.slice(0, 60).map(function (L) {
      var open = S.knRlog.open === L.id;
      var s = L.sessionId && F.sessionGet(L.sessionId);
      return '<div class="rl-row' + (open ? ' is-open' : '') + '" data-act="rl-toggle" data-id="' + esc(L.id) + '">' +
        '<div class="rl-head">' +
        '<span class="rl-verb v-' + esc(L.verb) + '">' + esc(RL_VERB_LABEL[L.verb] || L.verb) + '</span>' +
        '<span class="state-dot ' + (L.status === 'ok' ? 'ok' : 'warn') + '" title="' + (L.status === 'ok' ? '有命中' : '空结果(盲区信号)') + '"></span>' +
        '<span class="rl-time" title="轨迹时间">' + esc(F.fmtDate(L.ts) + ' ' + F.fmtTime(L.ts)) + '<span class="t-aux"> · ' + esc(F.relative(L.ts)) + '</span></span>' +
        '<span class="t-code rl-trace" title="trace_id:整链可追溯">' + esc(L.traceId) + '</span>' +
        '<span class="rl-proj" title="所属项目">' + esc(rlProjectName(L.projectId)) + '</span>' +
        (s ? '<span class="rl-sess" data-act="sess-open" data-s="' + esc(L.sessionId) + '" title="打开所属会话">💬 ' + esc(s.title) + '</span>'
          : '<span class="rl-sess t-aux">无会话记录</span>') +
        '<span class="rl-nums">' + (L.verb === 'browse' ? L.hitCount + ' 条在域' : '命中 ' + L.hits.length + ' 条') +
        (L.below ? ' · 阈值滤除 ' + L.below : '') +
        (L.truncated ? ' · 预算截断 ' + L.truncated : '') + ' · ' + L.latencyMs + 'ms · ' + L.tokens + ' tok' +
        (L.feedback ? (L.feedback.kind === 'adopted' ? ' · ✓ 已采纳' : ' · ✕ 已忽略') : '') + '</span>' +
        '<span class="rl-caret">' + (open ? '▾' : '▸') + '</span>' +
        '</div>' + (open ? rlDetail(L) : '') + '</div>';
    }).join('') || '<div class="stat-empty">无匹配轨迹(调整动词过滤或检索词)</div>';
    listEl.innerHTML = rowsHtml +
      (logs.length > 60 ? '<div class="t-aux" style="text-align:center;padding:8px 0">… 其余 ' + (logs.length - 60) + ' 条(原型折叠)</div>' : '');
  }
  function rlKv(k, v) {
    return '<div class="rl-kv"><span class="rl-k">' + k + '</span><span class="rl-v">' + v + '</span></div>';
  }
  function rlDetail(L) {
    var argRows = '';
    if (L.verb === 'search') {
      argRows = rlKv('域过滤', L.args.domain ? '<span class="t-code">' + esc(L.args.domain) + '</span>' : '(全部域)') +
        rlKv('关键词', (L.args.keywords || []).map(function (kw) { return '<span class="chip is-key">#' + esc(kw) + '</span>'; }).join(' ') || '—') +
        rlKv('置信阈值', '<span class="t-code">' + esc(L.args.threshold) + '</span>(过滤用;排序与置信解耦)') +
        rlKv('token 预算', '<span class="t-code">' + esc(L.args.budget) + '</span>' +
          (L.truncated ? ' —— 超预算截断 ' + L.truncated + ' 条降载' : ''));
    } else if (L.verb === 'browse') {
      argRows = rlKv('域', L.args.domain ? '<span class="t-code">' + esc(L.args.domain) + '</span>' : '(全部域)') +
        rlKv('在域条目', L.hitCount + ' 条');
    } else {
      argRows = rlKv('知识 ID', '<span class="t-code">' + esc(L.args.id) + '</span>');
    }
    var hits = L.hits.length
      ? L.hits.map(function (id) {
        var k = F.kn.get(id);
        if (!k) return '';
        return '<span class="rl-hit" data-act="stat-kn" data-kn="' + esc(id) + '" title="打开知识详情">' +
          '<span class="rl-hit-t ellipsis">' + esc(k.title) + '</span>' + confBadge(id) + '</span>';
      }).join('')
      : '<span class="t-aux">空结果 —— ' + (L.below
        ? '有匹配但 ' + L.below + ' 条均低于置信阈值 ' + esc(L.args.threshold || '') + '(盲区信号:复核置信构成或调整阈值)'
        : '关键词/域无匹配(盲区信号:迭代摘要与关键词,或沉淀新知识)') + '</span>';
    var fb = L.feedback ? rlKv('反馈', (L.feedback.kind === 'adopted' ? '✓ 已采纳(置信第四信号 +)' : '✕ 已忽略(过时/失真复核信号)') +
      ' · <span class="t-code">' + esc(L.feedback.knId) + '</span>') : '';
    return '<div class="rl-detail">' +
      '<div class="rl-kvs">' + argRows + '</div>' +
      rlKv('命中(' + L.hits.length + ')', '<span class="rl-hits">' + hits + '</span>') +
      fb +
      '<div class="rl-note">trace = 一次召回调用,由 dsh-forge 内核在召回执行时记录(非 dsh 会话日志):参数 → 域前缀过滤 → 置信阈值 → 相关度排序 → token 预算截断 → 记使用事件;行内元数据(时间 / trace_id / 所属项目 / 所属会话)供事后分析。</div>' +
      '</div>';
  }

  function renderKbDom(list) {
    /* 域树由目录路径派生(≤3 层);list 传入时按其计数(搜索联动) */
    var root = { name: '', children: {}, count: 0 };
    (list || F.kn.list(Object.assign({}, scopeListOpts(), { includeRedirects: false }))).forEach(function (k) {
      var parts = F.kn.domainOf(k.path).split('/').filter(Boolean);
      var node = root;
      node.count++;
      parts.forEach(function (seg) {
        node.children[seg] = node.children[seg] || { name: seg, children: {}, count: 0 };
        node = node.children[seg];
        node.count++;
      });
    });
    function nodeRows(node, depth, prefix) {
      var html = '';
      Object.keys(node.children).sort().forEach(function (name) {
        var c = node.children[name];
        var path = prefix ? prefix + '/' + name : name;
        var open = S.kb.openDom[path] !== false;
        var active = S.kb.domain === path;
        html += '<div class="kb-dom-row' + (open ? ' is-open' : '') + (active ? ' active' : '') + '" style="padding-left:' + (4 + depth * 13) + 'px" ' +
          'data-act="kb-dom-toggle" data-dom="' + esc(path) + '" role="treeitem" aria-expanded="' + open + '">' +
          '<span class="dom-caret">▶</span><span class="ellipsis" style="flex:1">' + esc(name) + '</span>' +
          '<span class="kb-dom-count">' + c.count + '</span></div>';
        if (open) html += nodeRows(c, depth + 1, path);
      });
      return html;
    }
    var rootHtml = '<div class="kb-dom-row' + (!S.kb.domain ? ' active' : '') + '" data-act="kb-dom-all">' +
      '<span class="dom-caret" style="visibility:hidden">▶</span><span style="flex:1">全部域</span><span class="kb-dom-count">' + root.count + '</span></div>';
    $('#kb-dom').innerHTML = rootHtml + nodeRows(root, 0, '');
  }
  function knOriginChip(k) {
    /* 全部范围下标注来源(项目 / 全局库) */
    if (parseScope().type !== 'all') return '';
    if (k.scope === 'global') return '<span class="chip">全局库</span>';
    var p = F.db.projects.find(function (x) { return x.id === k.project; });
    return '<span class="chip" title="' + esc(p ? p.canonicalPath : '') + '">' + esc(p ? p.name : k.project) + '</span>';
  }
  function knCardHtml(k, extra) {
    if (k.redirect) {
      return '<div class="kn-card is-redirect" data-act="kn-open" data-kn="' + esc(k.targetId) + '" data-swap-scope="global" ' +
        'title="已晋升至全局库 · 点击查看全局条目">' +
        '<div class="kn-card-top"><span class="kn-card-title ellipsis">↪ ' + esc(k.title) + '</span>' +
        '<span class="chip">重定向</span></div>' +
        '<div class="kn-card-foot"><span>晋升于 ' + F.fmtDate(k.modified) + '</span><span style="flex:1"></span><span>见全局库 · ' + esc(k.targetId) + '</span></div></div>';
    }
    var dom = F.kn.domainOf(k.path);
    return '<div class="kn-card' + (k.isNew ? ' is-new' : '') + '" data-act="kn-open" data-kn="' + esc(k.id) + '">' +
      '<div class="kn-card-top"><span class="kn-card-title ellipsis" title="' + esc(k.title) + '">' + esc(k.title) + '</span>' +
      statusBadge(k.status) + confBadge(k.id) + heatBadge(k.id) + knOriginChip(k) +
      '<button class="icon-btn" style="width:20px;height:20px" data-act="kn-menu" data-kn="' + esc(k.id) + '" aria-label="知识动作" title="动作(移动/晋升/审核)">' +
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button></div>' +
      '<div class="kn-card-abs">' + esc(k.abstract) + '</div>' +
      '<div class="kn-card-keys">' + (k.keywords || []).slice(0, 4).map(function (kw) { return '<span class="chip is-key">#' + esc(kw) + '</span>'; }).join('') + '</div>' +
      (extra || '') +
      '<div class="kn-card-foot"><span class="t-code">' + esc(dom || '根') + '</span><span style="flex:1"></span>' +
      '<span>' + F.relative(k.modified) + '</span></div></div>';
  }
  function renderKbCards() {
    var sc = parseScope();
    var box = $('#kb-cards');
    /* 会话范围:召回记录 + 会话沉淀 分组网格(明细并入卡片;既召回又沉淀的条目在召回卡标注) */
    if (sc.type === 'session') {
      var os = F.kn.ofSession(sc.id);
      var html = '';
      if (os.recalled.length) {
        html += '<div class="kb-group"><div class="kb-group-label">召回的知识 · ' + os.recalled.length + '</div><div class="kb-grid">' +
          os.recalled.map(function (r) {
            var k = F.kn.get(r.knId);
            if (!k) return '';
            var verbs = Object.keys(r.verbs).map(function (v) { return '<span class="knrec-verb">' + esc(v) + ' ×' + r.verbs[v] + '</span>'; }).join('');
            var fb = r.adopted || r.ignored
              ? '<span class="' + (r.adopted ? 'fb-adopted' : 'fb-ignored') + '">' + (r.adopted ? '✓ 已采纳' : '✕ 已忽略') + '</span>'
              : '';
            var alsoExt = (k.srcSession === sc.id || k.author === 'agent:' + sc.id) ? '<span class="chip">本会话沉淀</span>' : '';
            return knCardHtml(k, '<div class="kn-card-recall">' + verbs + '<span>最近 ' + F.relative(r.last) + '</span>' + fb + alsoExt + '</div>');
          }).join('') + '</div></div>';
      }
      if (os.extracted.length) {
        html += '<div class="kb-group"><div class="kb-group-label">会话沉淀 · ' + os.extracted.length + '</div><div class="kb-grid">' +
          os.extracted.map(function (k) {
            return knCardHtml(k, '<div class="kn-card-recall"><span>抽取于本会话 · ' + F.relative(k.created) + '</span><span class="chip">抽取稿</span></div>');
          }).join('') + '</div></div>';
      }
      box.classList.add('is-grouped');
      box.innerHTML = html || '<div class="kb-empty">本会话暂无召回 / 沉淀记录</div>';
      return;
    }
    box.classList.remove('is-grouped');
    /* 标准网格(全部 / 全局库 / 项目);重定向卡仅项目范围显示 */
    var opts = scopeListOpts();
    var list = F.kn.list(Object.assign({}, opts, { domain: S.kb.domain, q: S.kb.q }));
    if (sc.type !== 'project' || S.kb.status !== 'all' || S.kb.q) list = list.filter(function (k) { return !k.redirect; });
    if (S.kb.status !== 'all') list = list.filter(function (k) { return k.status === S.kb.status; });
    if (S.kb.recallOnly) list = list.filter(function (k) {
      var c = F.kn.confidence(k.id);
      return c && c.total >= 0.40;
    });
    list.sort(function (a, b) { return b.modified - a.modified; });
    box.innerHTML = list.map(function (k) { return knCardHtml(k); }).join('') ||
      '<div class="kb-empty">无匹配知识' + (S.kb.domain ? '(域 ' + esc(S.kb.domain) + ')' : '') + (S.kb.recallOnly ? ' · 低于召回阈值已隐藏' : '') + '</div>';
  }

  /* 项目树 + 会话列表 */
  function renderProjects() {
    $('#pj-searchrow').hidden = !S.pj.searching;
    if (!S.pj.searching) S.pj.q = '';
    var q = $('#pj-q'); if (q && document.activeElement !== q) q.value = S.pj.q;
    var ql = S.pj.q.toLowerCase();

    var html = F.db.projects.map(function (p) {
      var projMatch = !ql || p.name.toLowerCase().indexOf(ql) >= 0;
      var sessions = F.sessionsOf(p.workspaceId);
      if (ql) sessions = sessions.filter(function (s) { return s.title.toLowerCase().indexOf(ql) >= 0; });
      if (!projMatch && !sessions.length) return '';
      var isCur = p.id === S.projectId;
      var expanded = p.expanded || isCur;
      var rows = '';
      if (expanded && !p.archived) {
        sessions.slice(0, 5).forEach(function (s) {
          var sub = s.parentId != null;
          var dot = s.status === 'running'
            ? '<span class="state-dot ok breathing" title="运行中"></span>'
            : '<span class="state-dot idle" title="已结束"></span>';
          rows += '<div class="sess-row' + (sub ? ' sub' : '') + (S.sessionId === s.id ? ' active' : '') + '" data-act="sess-open" data-s="' + esc(s.id) + '">' +
            dot + '<span class="sess-title ellipsis" title="' + esc(s.title) + '">' + (sub ? '· ' : '') + esc(s.title) + '</span>' +
            '<span class="sess-time">' + F.relative(s.ts) + '</span>' +
            '<button class="sess-more" data-act="sess-menu" data-s="' + esc(s.id) + '" aria-label="会话动作">⋯</button></div>';
        });
        var rest = sessions.length - 5;
        if (rest > 0) rows += '<div class="sess-empty-note">⋯ 其余 ' + rest + ' 个会话(原型折叠)</div>';
        if (!sessions.length) rows += '<div class="sess-empty-note">' + (ql ? '无匹配会话' : '暂无会话') + '</div>';
      }
      return '<div class="sess-group">' +
        '<div class="pj-row' + (isCur ? ' active' : '') + (p.archived ? ' is-archived' : '') + '" data-act="pj-open" data-p="' + p.id + '">' +
        '<span class="pj-caret' + (expanded ? ' is-open' : '') + '" data-act="pj-toggle" data-p="' + p.id + '">▶</span>' +
        '<span class="pj-icon" aria-hidden="true">' + (p.archived ? '🗄️' : (expanded ? '📂' : '📁')) + '</span>' +
        '<span class="pj-name ellipsis" title="' + esc(p.canonicalPath) + '">' + esc(p.name) + '</span>' +
        (p.archived ? '<span class="state-dot warn" title="已归档(只读)"></span>' : (isCur ? '<span class="state-dot ok breathing" title="有运行中会话"></span>' : '')) +
        '</div>' + rows + '</div>';
    }).join('');
    $('#pj-list').innerHTML = html || '<div class="kb-empty">无匹配</div>';
  }

  /* ───────── 渲染:中区 ───────── */
  function renderConv() {
    var root = $('#conv-root');
    var s = session();
    root.setAttribute('data-phase', s ? 'active' : 'hero');
    root.setAttribute('data-view', S.view);
    var p = project();
    /* 视图 tab 激活态(对话 / 轨迹 / 知识召回) */
    document.querySelectorAll('.conv-tabs .conv-tab').forEach(function (t) {
      var on = t.getAttribute('data-view') === S.view;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
    });
    /* 面包屑 */
    var crumbs = '<span class="crumb" data-act="pj-open" data-p="' + p.id + '">' + esc(p.name) + '</span>';
    if (s) {
      if (s.parentId) {
        var par = F.sessionGet(s.parentId);
        if (par) crumbs += '<span class="crumb-sep">/</span><span class="crumb" data-act="sess-open" data-s="' + par.id + '">' + esc(par.title) + '</span>';
      }
      crumbs += '<span class="crumb-sep">/</span><span class="crumb current">' + esc(s.title) + '</span>';
    }
    $('#conv-crumbs').innerHTML = crumbs;
    /* 动作簇:任务挂接 pill + 运行态 */
    var act = '';
    if (s && s.taskKey) {
      var t = F.db.tasks[s.taskKey];
      act += '<button class="pill is-button" data-act="task-goto" data-key="' + esc(s.taskKey) + '" title="任务 ↔ 会话挂接(应用侧关联记录)">⟞ ' + esc(s.taskKey) +
        (t ? ' · ' + esc(t.status) : '') + '</button>';
    }
    if (s && s.status === 'running') act += '<span class="pill"><span class="state-dot ok breathing"></span>运行中</span>';
    $('#conv-actions').innerHTML = act;
    $('#hp-proj-name').textContent = p.name;

    renderTranscript();
    renderTraj();
    renderKnRec();
    var st = $('#composer-status');
    st.innerHTML = s
      ? '<span class="pill">' + Math.max(1, Math.ceil(s.msgs.length / 2)) + ' 轮 · 知识库 ' + (F.kn.list({ scope: 'project', project: p.id, includeRedirects: false }).length + F.kn.list({ scope: 'global', includeRedirects: false }).length) + ' 条可召回</span>'
      : '<span class="pill">dsh ' + esc(p.workspaceId.slice(0, 10)) + ' · 会话账本实时读</span>';
  }
  /* 知识召回 tab:当前会话召回了哪些知识(状态层使用事件驱动) */
  function renderKnRec() {
    var box = $('#knrec-panel');
    var s = session();
    if (!box) return;
    if (!s) { box.innerHTML = '<div class="knrec-wrap"><div class="kb-empty">新会话暂无召回记录</div></div>'; return; }
    var os = F.kn.ofSession(s.id);
    var total = os.recalled.reduce(function (a, r) { return a + r.count; }, 0);
    var fb = os.recalled.filter(function (r) { return r.adopted || r.ignored; }).length;
    var html = '<div class="knrec-wrap">' +
      '<div class="t-title" style="margin-bottom:2px">知识召回</div>' +
      '<p class="t-aux" style="margin-bottom:10px">会话「' + esc(s.title) + '」召回使用的知识 —— 数据源 = 状态层使用事件(每次召回记一次)</p>' +
      '<div class="knrec-stats">' +
      '<span class="pill">召回 <b>' + total + '</b> 次</span>' +
      '<span class="pill">覆盖 <b>' + os.recalled.length + '</b> 条知识</span>' +
      '<span class="pill">显式反馈 <b>' + fb + '</b> 条</span>' +
      '<span class="pill">会话沉淀 <b>' + os.extracted.length + '</b> 条</span>' +
      '</div>';
    if (os.recalled.length) {
      html += '<div class="knrec-group-label"><span>召回的知识</span><span style="flex:1"></span></div>';
      html += os.recalled.map(function (r) {
        var k = F.kn.get(r.knId);
        if (!k) return '';
        var verbs = Object.keys(r.verbs).map(function (v) {
          return '<span class="knrec-verb">' + esc(v) + ' ×' + r.verbs[v] + '</span>';
        }).join('');
        var fbHtml = r.adopted || r.ignored
          ? '<span class="' + (r.adopted ? 'fb-adopted' : 'fb-ignored') + '">' + (r.adopted ? '✓ 已采纳' + (r.adopted > 1 ? ' ×' + r.adopted : '') : '✕ 已忽略' + (r.ignored > 1 ? ' ×' + r.ignored : '')) + '</span>'
          : '<button class="btn btn-ghost btn-sm" data-act="knrec-fb" data-kn="' + esc(k.id) + '" data-kind="adopted">采纳</button>' +
            '<button class="btn btn-ghost btn-sm btn-danger-text" data-act="knrec-fb" data-kn="' + esc(k.id) + '" data-kind="ignored">忽略</button>';
        return '<div class="knrec-row">' +
          '<div class="knrec-top" data-act="kn-open" data-kn="' + esc(k.id) + '" style="cursor:pointer">' +
          '<span class="knrec-title ellipsis" title="' + esc(k.title) + '">' + esc(k.title) + '</span>' +
          statusBadge(k.status) + confBadge(k.id) + heatBadge(k.id) + '</div>' +
          '<div class="knrec-dom">' + esc(F.kn.domainOf(k.path) || '(根)') + ' · ' + esc(k.id) + '</div>' +
          '<div class="knrec-detail">' + verbs +
          '<span>最近 ' + F.relative(r.last) + '</span>' + fbHtml +
          '<span style="flex:1"></span>' +
          '<button class="btn btn-ghost btn-sm" data-act="kn-open" data-kn="' + esc(k.id) + '">详情</button>' +
          '</div></div>';
      }).join('');
    }
    if (os.extracted.length) {
      html += '<div class="knrec-group-label"><span>会话沉淀(抽取稿)</span><span style="flex:1"></span></div>';
      html += os.extracted.map(function (k) {
        return '<div class="knrec-row">' +
          '<div class="knrec-top" data-act="kn-open" data-kn="' + esc(k.id) + '" style="cursor:pointer">' +
          '<span class="knrec-title ellipsis" title="' + esc(k.title) + '">' + esc(k.title) + '</span>' +
          statusBadge(k.status) + confBadge(k.id) + '</div>' +
          '<div class="knrec-dom">' + esc(F.kn.domainOf(k.path) || '(根)') + ' · ' + esc(k.id) + '</div>' +
          '<div class="knrec-detail"><span>抽取于本会话 · ' + F.relative(k.created) + '</span>' +
          '<span style="flex:1"></span>' +
          '<button class="btn btn-ghost btn-sm" data-act="kn-open" data-kn="' + esc(k.id) + '">详情</button></div></div>';
      }).join('');
    }
    if (!os.recalled.length && !os.extracted.length) {
      html += '<div class="kb-empty" style="padding:30px 0">本会话暂无召回 / 沉淀记录<br><span class="t-aux" style="font-size:11px">发送消息或等待 agent 调用知识检索</span></div>';
    }
    html += '<p class="knrec-note">召回即记使用事件 → 热度 / 近期性 → 置信度闭环;采纳 / 忽略 = 置信度第四信号。此视图即「知识使用监控」的最简形态(与使用事件同源)。</p>';
    box.innerHTML = html + '</div>';
  }
  function hitCard(h, ctxSessionId) {
    var k = h.kn, c = h.conf;
    var fb = h.fbKind;
    return '<div class="hit-card">' +
      '<div class="hit-top"><span class="hit-title ellipsis" title="' + esc(k.title) + '">' + esc(k.title) + '</span>' +
      confBadge(k.id) + (h.within === false ? '<span class="chip" title="超出 token 预算,降载">超预算</span>' : '') + '</div>' +
      '<div class="hit-dom">' + esc(F.kn.domainOf(k.path)) + ' · ' + h.tokens + ' tok</div>' +
      '<div class="hit-abs">' + esc(k.abstract) + '</div>' +
      '<div class="hit-reason"><b>命中理由</b>:域 ' + esc(F.kn.domainOf(k.path)) +
      (h.matched && h.matched.length ? ' · 关键词 ' + h.matched.map(esc).join('、') : '') +
      ' · 置信 ' + (c.total * 100).toFixed(0) + '%(' + c.levelLabel + ')</div>' +
      '<div class="hit-actions">' +
        '<button class="btn btn-ghost btn-sm" data-act="hit-full" data-kn="' + esc(k.id) + '">读正文</button>' +
        '<span class="spacer"></span>' +
        (fb ? '<span class="' + (fb === 'adopted' ? 'fb-adopted' : 'fb-ignored') + '">' + (fb === 'adopted' ? '✓ 已采纳' : '✕ 已忽略') + '</span>'
          : '<button class="btn btn-ghost btn-sm" data-act="hit-fb" data-kn="' + esc(k.id) + '" data-kind="adopted" data-sid="' + esc(ctxSessionId || '') + '">采纳</button>' +
            '<button class="btn btn-ghost btn-sm btn-danger-text" data-act="hit-fb" data-kn="' + esc(k.id) + '" data-kind="ignored" data-sid="' + esc(ctxSessionId || '') + '">忽略</button>') +
      '</div>' +
      (h.full ? '<div class="hit-full">' + esc(h.full.content) + '<div class="t-aux" style="margin-top:4px">' + h.full.tokens + ' tok · read-full 已记使用事件</div></div>' : '') +
      '</div>';
  }
  function renderTranscript() {
    var s = session();
    var box = $('#conv-transcript');
    if (!s) { box.innerHTML = ''; box.scrollTop = 0; return; }
    var html = '<div class="msg-sysline"><span class="t-code">系统</span><span>dsh 引擎 · 系统提示词知识段已注入(知识插件 · 内核绑定)</span></div>';
    s.msgs.forEach(function (m) {
      if (m.role === 'user') {
        html += '<div class="msg-user"><div class="bubble">' + esc(m.text) + '</div><div class="msg-meta">' + F.fmtTime(m.ts) + '</div></div>';
      } else if (m.role === 'assistant') {
        html += '<div class="msg-assistant"><div>' + md(m.text) + '</div><div class="msg-meta">' + F.fmtTime(m.ts) + '</div></div>';
      } else if (m.role === 'tool') {
        var t = m.tool || {};
        var open = !!t.open;
        var hitsHtml = '';
        if (t.hits && t.hits.length) {
          t.hits.forEach(function (id) {
            var k = F.kn.get(id);
            if (!k) return;
            var conf = F.kn.confidence(id);
            hitsHtml += hitCard({ kn: k, conf: conf, matched: null, tokens: F.estTokens(k.abstract), within: true, fbKind: t.fb && t.fb[id], full: t.full && t.full[id] }, s.id);
          });
        } else if (t.output) {
          hitsHtml = '<div class="io-val">' + esc(t.output) + '</div>';
        }
        html += '<div class="toolrow' + (open ? ' is-open' : '') + '">' +
          '<div class="toolrow-head" data-act="tool-toggle">' +
          '<span class="toolrow-icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.7 6.3a4.5 4.5 0 0 0-6.4 6.4L3 18v3h3l5.3-5.3a4.5 4.5 0 0 0 6.4-6.4z"/></svg></span>' +
          '<span class="toolrow-name">' + esc(t.name || 'tool') + '</span>' +
          '<span class="toolrow-sum ellipsis">' + (m.running ? '<span class="shimmer">检索中…</span>' : esc(t.summary || '')) + '</span>' +
          '<span class="toolrow-chev"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></span></div>' +
          (open || m.running ? '<div class="toolrow-body"><div class="toolrow-io"><div class="io-col"><div class="io-label">输入</div><div class="io-val">' + esc(t.args || '') + '</div></div>' +
          '<div class="io-col"><div class="io-label">输出</div><div style="font-size:11.5px;color:var(--dsw-alias-label-secondary)">' +
          (m.running ? '…' : (t.summary || '')) + '</div></div></div>' +
          (hitsHtml ? '<div style="margin-top:10px">' + hitsHtml + '</div>' : '') + '</div>' : '') +
          '</div>';
      }
    });
    var stick = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = html;
    if (stick) box.scrollTop = box.scrollHeight;
  }
  function renderTraj() {
    var s = session();
    var box = $('#traj-ledger');
    if (!s) { box.innerHTML = '<div class="kb-empty">新会话无轨迹</div>'; return; }
    var rows = [];
    rows.push({ kind: 'sys', text: 'dsh 引擎 · 会话 ' + s.id + ' · 工作区 ' + s.ws });
    var round = 0;
    s.msgs.forEach(function (m) {
      if (m.role === 'user') { round++; rows.push({ kind: 'round', text: '第 ' + round + ' 轮', ts: m.ts }); rows.push({ kind: 'user', text: m.text, ts: m.ts }); }
      else if (m.role === 'tool') rows.push({ kind: 'tool', text: (m.tool && m.tool.name) + ' — ' + (m.running ? '运行中' : (m.tool && m.tool.summary || '')), ts: m.ts });
      else if (m.role === 'assistant') rows.push({ kind: 'asst', text: m.text.slice(0, 80) + (m.text.length > 80 ? '…' : ''), ts: m.ts });
    });
    box.innerHTML = rows.map(function (r) {
      var label = { sys: '系统', user: '用户', tool: '工具', round: '轮次', asst: '助手' }[r.kind];
      var cls = r.kind === 'round' ? 'kind-round' : r.kind === 'tool' ? 'kind-tool' : '';
      var hidden = S.trajCollapsed && (r.kind === 'tool' || r.kind === 'user' || r.kind === 'asst');
      if (hidden) return '';
      return '<div class="traj-row ' + cls + '" data-act="traj-row">' +
        '<span class="traj-kind">' + label + '</span><span class="traj-text ellipsis" title="' + esc(r.text) + '">' + esc(r.text) + '</span></div>';
    }).join('');
  }

  /* ───────── 渲染:右栏 dock(知识库已升为中区一等公民视图,不再占 dock 页签) ───────── */
  var TAB_LABEL = { start: '开始', overview: '项目概览', review: '审核工作台' };
  function dockVisibleTabs() {
    return S.dock.tabs.filter(function (t) { return t.isGlobal || t.project === S.projectId; });
  }
  function renderDock() {
    var wrap = $('#rb-wrap');
    /* 知识模式 = 整体切换:右栏让位(隐藏;状态保留,切回会话视图即恢复) */
    var knMode = S.centerView === 'kn';
    wrap.classList.toggle('is-collapsed', !S.dock.open || knMode);
    $('#split-root').classList.toggle('rb-full', S.dock.open && S.dock.fullscreen && !knMode);
    /* chips:可见集 = 当前项目页签 + 全局页签(开始页) */
    var vis = dockVisibleTabs();
    var chips = vis.map(function (t) {
      var label = t.kind === 'kndoc' ? ((F.kn.get(t.ref) || {}).title || '知识文档')
        : t.kind === 'doc' ? t.ref.split('/').slice(-2).join('/')
        : TAB_LABEL[t.kind];
      return '<div class="rb-chip' + (S.dock.active === t.id ? ' active' : '') + '" data-act="dock-tab" data-id="' + esc(t.id) + '" ' +
        'title="' + esc(t.kind === 'doc' ? t.ref : label) + '" role="tab" aria-selected="' + (S.dock.active === t.id) + '">' +
        '<span class="ellipsis">' + esc(label || '') + '</span>' +
        '<span class="chip-x" data-act="dock-close" data-id="' + esc(t.id) + '" role="button" aria-label="关闭">' +
        '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6L6 18"/></svg></span></div>';
    }).join('');
    /* ＋ 常驻:空 dock 也能打开开始页(避免死面板) */
    var plus = '<button class="icon-btn rb-plus" data-act="dock-plus" aria-label="打开开始页" title="开始页">＋</button>';
    $('#rb-chips').innerHTML = chips + plus;
    var body = $('#rb-body');
    var active = vis.find(function (t) { return t.id === S.dock.active; });
    if (!S.dock.open || knMode) { body.innerHTML = ''; return; }   /* 知识模式:右栏内容一并让位 */
    if (!active) { body.innerHTML = renderStartBody(); return; }   /* chipless 开始页底板 */
    switch (active.kind) {
      case 'start': body.innerHTML = renderStartBody(); break;
      case 'overview': body.innerHTML = renderOverview(); break;
      case 'review': body.innerHTML = renderReview(); break;
      case 'doc': body.innerHTML = renderDoc(active.ref); break;
      case 'kndoc': body.innerHTML = renderKnDoc(active.ref); break;
      default: body.innerHTML = '';
    }
  }
  function renderStartBody() {
    var pending = F.kn.pendingCount(S.projectId);
    return '<div class="rb-start"><div class="rb-start-compass" aria-hidden="true">🧭</div>' +
      '<div class="rb-start-cards">' +
      startCard('overview', '📁', '项目概览', '提案 / feature / 任务 · 状态直读(应用数据库)') +
      '<div class="rb-start-card" data-act="open-kb-panel"><span class="sc-title"><span aria-hidden="true">📚</span>知识库' +
      (pending ? ' <span class="badge badge-pending">' + pending + '</span>' : '') + '</span>' +
      '<span class="sc-desc">一等公民视图 · 检索 / 下钻项目·会话 / 阈值过滤(中区打开)</span></div>' +
      '<div class="rb-start-card" data-act="open-review"><span class="sc-title"><span aria-hidden="true">🛂</span>审核工作台' +
      (pending ? ' <span class="badge badge-pending">' + pending + '</span>' : '') + '</span>' +
      '<span class="sc-desc">待审核队列 + 合并队列(抽取去重 / 晋升冲突共用)</span></div>' +
      '</div></div>';
  }
  function startCard(kind, icon, title, desc, ref) {
    return '<div class="rb-start-card" data-act="start-card" data-kind="' + kind + '" data-ref="' + esc(ref || '') + '">' +
      '<span class="sc-title"><span aria-hidden="true">' + icon + '</span>' + title + '</span><span class="sc-desc">' + desc + '</span></div>';
  }

  /* 项目概览 */
  function renderOverview() {
    var p = project();
    if (!p) return '';
    var feats = F.featuresOf(p.id);
    var running = F.sessionsOf(p.workspaceId).filter(function (s) { return s.status === 'running'; }).length;
    var activeFeat = feats.find(function (f) { return f.status !== 'completed' && f.slug.indexOf('legacy') < 0; }) || feats[0];
    var align = F.ws.checkAlignment(p.id);
    var alignHtml;
    if (align.state === 'ok') {
      alignHtml = '<div class="ov-align"><div class="ov-align-row"><span class="k">对账状态</span>' +
        '<span class="v" style="font-family:var(--font-ui)"><span class="state-dot ok"></span> 已对齐 —— registry.get(' + esc(p.workspaceId) + ').path === 项目记录</span></div>' +
        '<div class="ov-align-row"><span class="k">registry 路径</span><span class="v ellipsis">' + esc(F.ws.get(p.workspaceId).canonicalPath) + '</span></div>' +
        (p.id === 'p1' ? '<div class="ov-align-row"><button class="btn btn-ghost btn-sm" data-act="ws-move">模拟目录整体移动</button>' +
        '<span class="t-aux" style="font-size:11px">演示失配 → 按 canonical path 找回</span></div>' : '') + '</div>';
    } else {
      alignHtml = '<div class="ov-align" style="border-color:var(--dsw-alias-state-warn-primary)">' +
        '<div class="ov-align-row"><span class="k">对账状态</span><span class="v" style="font-family:var(--font-ui)"><span class="state-dot warn"></span> 失配 —— 目录已移动</span></div>' +
        '<div class="ov-align-row"><span class="k">应用记录</span><span class="v ellipsis">' + esc(p.canonicalPath) + '</span></div>' +
        '<div class="ov-align-row"><span class="k">registry</span><span class="v ellipsis">' + esc(align.ws.canonicalPath) + '</span></div>' +
        '<div class="ov-align-row"><button class="btn btn-primary btn-sm" data-act="ws-realign">按 canonical path 找回</button>' +
        '<span class="t-aux" style="font-size:11px">找不到则 create() 幂等重建(显式动作,不自动迁移)</span></div></div>';
    }
    var info =
      '<div class="ov-head"><div class="ov-name">' + esc(p.name) + (p.archived ? ' <span class="badge badge-rejected">已归档</span>' : '') + '</div>' +
      '<div class="ov-info">' +
      '<div class="ov-info-row"><span class="ov-info-k">工作区</span><span class="ov-info-v ellipsis" title="workspaceId 外键 · 会话账本归 dsh">' + esc(p.workspaceId) + '</span></div>' +
      '<div class="ov-info-row"><span class="ov-info-k">代码区</span><span class="ov-info-v ellipsis">' + esc(p.canonicalPath) + '</span></div>' +
      '<div class="ov-info-row"><span class="ov-info-k">文档位置 · forge</span><span class="ov-info-v ellipsis">' + esc(p.forgeDir || p.canonicalPath + '\\.forge') + ' · ' + (p.docMode === 'repo' ? '仓内 · 只读引用' : '仓外 · 应用管理') + '</span></div>' +
      '<div class="ov-info-row"><span class="ov-info-k">知识目录</span><span class="ov-info-v ellipsis">' + esc(p.knowledgeDir) + '</span></div>' +
      '<div class="ov-info-row"><span class="ov-info-k">任务清单与记录</span><span class="ov-info-v ellipsis" title="统一存放于 {dsh-forge-home}/{canonical-path 扁平化}-{hash8 消歧后缀},注册时自动派生">' + esc(deriveTaskStore(p.canonicalPath)) + '</span></div>' +
      '<div class="ov-info-row"><span class="ov-info-k">状态</span><span class="ov-info-v plain">' + esc(activeFeat ? activeFeat.slug + ' · ' + activeFeat.done + '/' + activeFeat.total : '—') + ' · 运行中会话 ' + running + '</span></div>' +
      '</div>' + alignHtml +
      '<div class="ov-subtabs">' +
      ['proposals', 'feature', 'tasks'].map(function (k) {
        var lab = { proposals: '提案', feature: 'feature', tasks: '任务' }[k];
        return '<button class="ov-subtab' + (S.ov.subtab === k ? ' active' : '') + '" data-act="ov-subtab" data-st="' + k + '">' + lab + '</button>';
      }).join('') + '</div><div class="ov-content">';
    if (S.ov.subtab === 'proposals') {
      info += F.proposalsOf(p.id).map(function (pr) {
        return '<div class="tree-row dir" data-act="tree-toggle">▾ <span class="ellipsis">' + esc(pr.slug) + '/</span>' +
          '<span class="tree-status"><span class="chip">' + esc(pr.status) + '</span></span></div>' +
          pr.files.map(function (f) {
            return '<div class="tree-row file" data-act="doc-open" data-path="proposals/' + pr.slug + '/' + f + '">' +
              '<span aria-hidden="true">📄</span><span class="ellipsis">' + esc(f) + '</span><span class="tree-status t-aux">⟶开tab</span></div>';
          }).join('');
      }).join('');
      info += '<p class="t-aux" style="margin-top:8px">docs/proposals/ · 仓内只读(应用零写入)</p>';
    } else if (S.ov.subtab === 'feature') {
      info += feats.map(function (f) {
        var files = ['manifest.md', 'prd/prd-spec.md'];
        return '<div class="tree-row dir" data-act="tree-toggle">▾ <span class="ellipsis">' + esc(f.slug) + '/</span>' +
          '<span class="tree-status"><span class="chip">' + esc(f.status) + ' ' + f.done + '/' + f.total + '</span></span></div>' +
          files.map(function (fl) {
            return '<div class="tree-row file" data-act="doc-open" data-path="features/' + f.slug + '/' + fl + '">' +
              '<span aria-hidden="true">📄</span><span class="ellipsis">' + esc(fl) + '</span><span class="tree-status t-aux">⟶开tab</span></div>';
          }).join('');
      }).join('');
      info += '<p class="t-aux" style="margin-top:8px">docs/features/ · 仓内只读;状态/进度 = 应用数据库直读(SC2)</p>';
    } else {
      info += renderTasksView(p);
    }
    return info + '</div>';
  }

  /* ───────── 任务三视图:列表 / DAG / 泳道(一律 feature 绑定,无全局汇总) ───────── */
  var TASK_ST = { completed: 'st-completed', in_progress: 'st-in_progress', pending: 'st-pending', blocked: 'st-blocked', suspended: 'st-pending', skipped: 'st-pending', rejected: 'st-blocked' };
  var SWIM_DOTS = { pending: 'idle', in_progress: 'ok', completed: 'ok', blocked: 'err', suspended: 'warn', skipped: 'idle', rejected: 'err' };
  function pickTaskFeat(p) {
    var feats = F.featuresOf(p.id);
    if (!feats.length) return null;
    if (feats.some(function (f) { return f.slug === S.ov.taskFeat; })) {
      return feats.find(function (f) { return f.slug === S.ov.taskFeat; });
    }
    return feats.find(function (f) { return f.status !== 'completed'; }) || feats[0];
  }
  function renderTasksView(p) {
    var feat = pickTaskFeat(p);
    if (!feat) return '<div class="kb-empty">当前项目暂无 feature</div>';
    S.ov.taskFeat = feat.slug;
    var ts = F.tasks.ofFeature(feat.slug);
    var done = ts.filter(function (t) { return t.status === 'completed'; }).length;
    var html = '<div class="ov-taskbar">' +
      '<button class="pill is-button task-feat-pill" data-act="ov-task-feat" aria-haspopup="menu" title="选择 feature(任务视图 feature 绑定)">' +
      '<span class="fp-name ellipsis">' + esc(feat.slug) + '</span>' +
      '<span class="chip">' + esc(feat.status) + ' ' + done + '/' + ts.length + '</span><span aria-hidden="true">▾</span></button>' +
      '<span class="task-count-note">' + ts.length + ' 条 · 状态直读(应用数据库)</span>' +
      '<span class="spacer"></span>' +
      '<div class="seg task-viewseg">' +
      [['list', '列表'], ['dag', 'DAG'], ['swim', '泳道图']].map(function (v) {
        return '<button class="seg-btn' + (S.ov.taskView === v[0] ? ' active' : '') + '" data-act="ov-task-view" data-v="' + v[0] + '">' + v[1] + '</button>';
      }).join('') + '</div></div>';
    if (!ts.length) {
      return html + '<div class="kb-empty">feature「' + esc(feat.slug) + '」暂无任务种子(原型)—— 任务清单/执行记录 = 应用运行时资产,经 forge 插件 tool 半身写入</div>';
    }
    if (S.ov.taskView === 'dag') html += renderTaskDag(feat, ts);
    else if (S.ov.taskView === 'swim') html += renderTaskSwim(ts);
    else html += renderTaskList(ts);
    html += '<p class="t-aux" style="margin-top:8px">任务视图 feature 绑定(无全局汇总);应用不发起编排(只看不管);⚡ 模拟 tool 提交:pending → in_progress → completed。</p>';
    return html;
  }
  function renderTaskList(ts) {
    var running = ts.filter(function (t) { return t.status === 'in_progress' || t.status === 'blocked'; });
    var row = function (t) {
      return '<div class="task-row"><span class="task-id">' + esc(t.key) + '</span>' +
        '<span class="task-title ellipsis" title="' + esc(t.title) + '">' + esc(t.title) + '</span>' +
        ((t.deps || []).length ? '<span class="task-deps" title="前置:' + esc((t.deps || []).join(', ')) + '">←' + (t.deps || []).length + '</span>' : '') +
        (t.sessions.length ? '<button class="task-links" data-act="task-session" data-s="' + esc(t.sessions[0]) + '" title="挂接会话(应用侧关联记录)">⟞ ' + t.sessions.length + '</button>' : '') +
        '<button class="btn btn-ghost btn-sm task-toolbtn" data-act="task-tool" data-key="' + esc(t.key) + '" title="模拟 forge 插件 tool 半身提交(消费宿主能力面)">⚡ tool</button>' +
        '<span class="status-tag ' + (TASK_ST[t.status] || 'st-pending') + '">' + esc(t.status) + '</span></div>';
    };
    var html = '';
    if (running.length) html += '<div class="task-group-label" style="color:var(--dsw-alias-label-secondary)">执行中(' + running.length + ')</div>' + running.map(row).join('');
    html += ts.filter(function (t) { return running.indexOf(t) < 0; }).map(row).join('');
    return html;
  }
  /* DAG:自上而下(前置在上,同层横向展开)—— 方便鼠标滚动;层级 = 最长路径;
     固定网格 + SVG 贝塞尔连线(上下向);节点点击 = 气泡 */
  function renderTaskDag(feat, ts) {
    var W = 190, H = 72, GX = 16, GY = 42, PAD = 8;
    var byKey = {};
    ts.forEach(function (t) { byKey[t.key] = t; });
    var level = {};
    function lvl(k) {
      if (level[k] != null) return level[k];
      var t = byKey[k]; if (!t) return 0;
      var ds = (t.deps || []).filter(function (d) { return byKey[d]; });
      level[k] = ds.length ? Math.max.apply(null, ds.map(lvl)) + 1 : 0;
      return level[k];
    }
    ts.forEach(function (t) { lvl(t.key); });
    var cols = [];
    ts.forEach(function (t) {
      var l = level[t.key];
      cols[l] = cols[l] || [];
      cols[l].push(t);
    });
    cols.forEach(function (c) { c.sort(function (a, b) { return a.key < b.key ? -1 : 1; }); });
    /* 层级 → 纵向(y);同层 → 横向(x) */
    var pos = {};
    var maxPerLevel = 0;
    cols.forEach(function (c, li) {
      maxPerLevel = Math.max(maxPerLevel, c.length);
      c.forEach(function (t, ri) {
        pos[t.key] = { x: PAD + ri * (W + GX), y: PAD + li * (H + GY) };
      });
    });
    var cw = PAD * 2 + maxPerLevel * (W + GX) - GX;
    var ch = PAD * 2 + cols.length * (H + GY) - GY;
    var edges = '';
    ts.forEach(function (t) {
      (t.deps || []).forEach(function (d) {
        if (!byKey[d] || !pos[d]) return;
        var a = pos[d], b = pos[t.key];
        var x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y;
        var my = Math.max(14, (y2 - y1) / 2);
        edges += '<path class="' + (byKey[d].status === 'completed' ? 'is-done' : '') + '" d="M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + (y1 + my) + ',' + x2 + ' ' + (y2 - my) + ',' + x2 + ' ' + y2 + '"/>';
      });
    });
    var nodes = ts.map(function (t) {
      var p2 = pos[t.key];
      var dot = t.status === 'in_progress' ? 'ok breathing' : t.status === 'completed' ? 'ok' : t.status === 'blocked' ? 'err' : 'idle';
      return '<div class="dag-node' + (t.status === 'completed' ? ' is-completed' : '') + '" style="left:' + p2.x + 'px;top:' + p2.y + 'px;height:' + H + 'px" ' +
        'data-act="task-pop" data-key="' + esc(t.key) + '" title="' + esc(t.title) + '">' +
        '<div class="dag-node-top"><span class="state-dot ' + dot + '"></span><span class="dag-node-key">' + esc(t.key) + '</span>' +
        (t.sessions.length ? '<span class="task-links" style="font-size:10px" title="挂接会话">⟞' + t.sessions.length + '</span>' : '') + '</div>' +
        '<div class="dag-node-title">' + esc(t.title) + '</div></div>';
    }).join('');
    return '<div class="dag-wrap"><div class="dag-canvas" style="width:' + cw + 'px;height:' + ch + 'px">' +
      '<svg class="dag-svg" viewBox="0 0 ' + cw + ' ' + ch + '" preserveAspectRatio="none" aria-hidden="true">' + edges + '</svg>' +
      nodes + '</div></div>' +
      '<div class="dag-legend"><span>自上而下 · 前置在上</span><span><span class="state-dot ok breathing"></span> 执行中</span><span><span class="state-dot ok"></span> 已完成(边绿 = 上游完成)</span><span><span class="state-dot err"></span> 阻塞</span><span>节点点击 = 任务详情</span></div>';
  }
  /* 泳道图:状态分组七态横向列(列头 = 状态点 + 名称 + 计数;空列占位) */
  function renderTaskSwim(ts) {
    var STATUSES = ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected'];
    var LABELS = { pending: '待办', in_progress: '执行中', completed: '已完成', blocked: '阻塞', suspended: '挂起', skipped: '跳过', rejected: '已拒绝' };
    return '<div class="swim-wrap">' + STATUSES.map(function (st) {
      var cards = ts.filter(function (t) { return t.status === st; });
      var dot = SWIM_DOTS[st] || 'idle';
      var body = cards.length ? cards.map(function (t) {
        return '<div class="swim-card" data-act="task-pop" data-key="' + esc(t.key) + '" title="' + esc(t.title) + '">' +
          '<div class="sc-key">' + esc(t.key) + '</div>' +
          '<div class="sc-title">' + esc(t.title) + '</div>' +
          '<div class="sc-foot">' +
          ((t.deps || []).length ? '<span class="t-aux" style="font-size:10px" title="前置:' + esc((t.deps || []).join(', ')) + '">←' + (t.deps || []).length + '</span>' : '') +
          (t.sessions.length ? '<span class="task-links" style="font-size:10px" title="挂接会话">⟞' + t.sessions.length + '</span>' : '') +
          '</div></div>';
      }).join('') : '<div class="swim-empty">无此状态任务</div>';
      return '<div class="swim-col"><div class="swim-col-head"><span class="state-dot ' + dot + '"></span><span>' + LABELS[st] + '</span>' +
        '<span class="cnt">' + cards.length + '</span></div>' + body + '</div>';
    }).join('') + '</div>';
  }
  /* 任务节点气泡(列表行外:DAG/泳道节点点击) */
  function openTaskPop(key, anchorEl) {
    var t = F.db.tasks[key];
    if (!t) return;
    var nextMap = { pending: 'in_progress', in_progress: 'completed' };
    var rows = '';
    function r(k, v) { rows += '<div class="task-pop-row"><span class="k">' + k + '</span><span style="flex:1;min-width:0">' + v + '</span></div>'; }
    r('任务', '<span class="t-code">' + esc(t.key) + '</span>');
    r('标题', esc(t.title));
    r('状态', '<span class="status-tag ' + (TASK_ST[t.status] || 'st-pending') + '">' + esc(t.status) + '</span>');
    r('前置', (t.deps || []).length ? esc((t.deps || []).join('、')) : '—');
    var sessNames = (t.sessions || []).map(function (sid) { var s = F.sessionGet(sid); return s ? s.title : sid; });
    r('挂接会话', sessNames.length ? sessNames.map(esc).join('、') : '—');
    var actions = '';
    if (nextMap[t.status]) {
      actions += '<button class="btn btn-primary btn-sm" data-act="task-tool" data-key="' + esc(t.key) + '">⚡ 模拟 tool 提交 → ' + nextMap[t.status] + '</button>';
    }
    (t.sessions || []).slice(0, 1).forEach(function (sid) {
      actions += '<button class="btn btn-soft btn-sm" data-act="sess-open" data-s="' + esc(sid) + '">打开挂接会话 ⟞</button>';
    });
    openPop(anchorEl,
      '<div class="pop-title">任务详情<span style="margin-left:auto;font-size:11px;font-weight:400" class="t-aux">' + esc(t.feature) + '</span></div>' +
      '<div style="margin-top:8px">' + rows + '</div>' +
      (actions ? '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">' + actions + '</div>' : '') +
      '<div class="pop-note">任务清单/执行记录 = 应用运行时资产;状态变更经 forge 插件 tool 半身消费宿主能力面写入(应用零编排)。</div>');
  }

  /* (原「项目知识」dock 视图已由中区知识库一等公民视图取代) */

  /* 知识详情 */
  function renderDetail(id) {
    var k = F.kn.get(id);
    if (!k) return '<div class="kb-empty">条目不存在(可能已合并移除)</div>';
    var c = F.kn.confidence(id);
    var st = F.kn.usageStats(id);
    var dom = F.kn.domainOf(k.path);
    var actions = '';
    if (k.status === 'pending') {
      actions += '<button class="btn btn-primary btn-sm" data-act="kn-approve" data-kn="' + esc(id) + '">审核通过</button>' +
        '<button class="btn btn-ghost btn-sm btn-danger-text" data-act="kn-reject" data-kn="' + esc(id) + '">拒绝</button>';
    }
    actions += '<button class="btn btn-soft btn-sm" data-act="kn-move" data-kn="' + esc(id) + '">移动(换域)</button>';
    if (k.scope === 'project') actions += '<button class="btn btn-soft btn-sm" data-act="kn-promote" data-kn="' + esc(id) + '">晋升到全局库</button>';
    actions += '<button class="btn btn-primary btn-sm" data-act="kn-ask" data-kn="' + esc(id) + '" title="跳到当前会话并自动 @ 本知识文档">当前会话引用</button>';
    actions += '<button class="btn btn-soft btn-sm" data-act="kn-ask-new" data-kn="' + esc(id) + '" title="开新会话并自动 @ 本知识文档">新会话引用</button>';
    actions += '<button class="btn btn-soft btn-sm" data-act="kn-dock" data-kn="' + esc(id) + '" title="在右栏 dock 以页签深读(中区浏览、右栏深读;页签跟随所属项目)">在 dock 打开</button>';
    actions += '<button class="btn btn-ghost btn-sm" data-act="kn-edit-meta" data-kn="' + esc(id) + '">编辑元数据</button>';
    /* 摘要(如有):正文前的醒目展示 */
    var absHtml = k.abstract
      ? '<div class="kd-section"><div class="kd-section-label">摘要</div><div class="kd-abs">' + esc(k.abstract) + '</div></div>'
      : '';
    /* 来源会话(如有) */
    var srcSess = k.srcSession || ((k.author || '').indexOf('agent:') === 0 ? k.author.slice(6) : null);
    var srcSessRow = '';
    if (srcSess) {
      var ss = F.sessionGet(srcSess);
      srcSessRow = kdRow('来源会话', ss ? '<span class="task-links" data-act="sess-open" data-s="' + esc(srcSess) + '" title="打开会话">⟞ ' + esc(ss.title) + '</span>' : esc(srcSess), false);
    }
    /* 基础信息:两列网格(长值字段独占一行) */
    return '<div class="kd-head"><div class="kd-title">' + esc(k.title) + '</div>' +
      '<div class="kd-badges">' + statusBadge(k.status) + confBadge(id) + heatBadge(id) + '</div></div>' +
      '<div class="kd-section"><div class="kd-section-label">基础信息(frontmatter · 只读;编辑经「编辑元数据」)</div>' +
      '<div class="kd-meta-table">' +
      kdRow('状态', statusBadge(k.status), false) +
      kdRow('作者', esc(k.author || '—'), false) +
      kdRow('创建时间', esc(F.fmtDate(k.created) + ' ' + F.fmtTime(k.created)), false) +
      kdRow('修改时间', esc(F.fmtDate(k.modified) + ' ' + F.fmtTime(k.modified)), false) +
      kdRow('热度', heatIcon() + ' ' + F.kn.heat(id), false) +
      kdRow('反馈', '采纳 ' + st.adopted + ' · 忽略 ' + st.ignored, false) +
      kdRow('稳定 ID', '<span class="t-code">' + esc(k.id) + '</span>(随文件移动不变)', true) +
      kdRow('域路径', '<span class="t-code">' + esc(dom || '(根)') + '</span>(目录即域 · ≤3 层)', true) +
      kdRow('关键词', (k.keywords || []).map(function (kw) { return '<span class="chip is-key">#' + esc(kw) + '</span>'; }).join(' ') || '—', true) +
      srcSessRow +
      kdRow('文件', '<span class="t-code">' + esc((k.scope === 'project' ? project().knowledgeDir : '全局库') + '\\' + k.path) + '</span>', true) +
      '</div></div>' +
      '<div class="kd-section"><div class="kd-section-label">动作<span style="flex:1"></span><span class="t-aux">写入经宿主能力面(UI 管理面 / 知识插件写入 tool)</span></div>' +
      '<div class="kd-actions">' + actions + '</div></div>' +
      /* 摘要(如有):基础信息与正文之间 */
      absHtml +
      '<div class="kd-section"><div class="kd-section-label">正文(仅 Markdown 正文 · frontmatter 不混入)</div>' +
      '<div class="kd-body">' + md(k.body) + '</div></div>' +
      '<div class="kd-note">置信度读取时动态计算(审核/使用/近期性/反馈/衰减),存储中无置信度字段;排序与置信解耦。</div>';
  }
  function kdRow(k, v, span2) {
    return '<div class="kd-meta-row' + (span2 ? ' span2' : '') + '"><span class="kd-meta-k">' + k + '</span><span class="kd-meta-v">' + v + '</span></div>';
  }
  /* 元数据编辑对话框(frontmatter 字段;与知识插件写入 tool 同一能力面 API) */
  function openEditMetaDialog(id) {
    var k = F.kn.get(id);
    if (!k || k.redirect) return;
    openDialog({ title: '编辑元数据(frontmatter)', ok: true, okLabel: '保存', body:
      '<div class="form-row"><label>标题 *</label><input type="text" id="em-title" value="' + esc(k.title) + '"></div>' +
      '<div class="form-row"><label>摘要 *</label><textarea id="em-abs">' + esc(k.abstract || '') + '</textarea></div>' +
      '<div class="form-row"><label>关键词(域内细分,逗号分隔)*</label><input type="text" id="em-kw" value="' + esc((k.keywords || []).join(', ')) + '"></div>' +
      '<div class="form-row"><label>状态</label><select id="em-status">' +
      [['pending', '待审核'], ['approved', '已审核'], ['rejected', '已拒绝']].map(function (s) {
        return '<option value="' + s[0] + '"' + (k.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
      }).join('') + '</select></div>' +
      '<p class="form-hint">经宿主能力面写入:frontmatter 与索引同步、文件名随标题更新(稳定 ID 不变);换域请用「移动(换域)」。</p>',
      onOk: function (mask) {
        var res = F.kn.updateMeta(id, {
          title: $('#em-title', mask).value,
          abstract: $('#em-abs', mask).value,
          keywords: $('#em-kw', mask).value.split(/[,，、\s]+/).filter(Boolean),
          status: $('#em-status', mask).value
        });
        if (!res.ok) { toast(res.error); return; }
        renderAll();
        toast('元数据已更新 —— frontmatter 与索引同步(经宿主能力面;稳定 ID 不变)');
      } });
  }

  /* 审核工作台 */
  function renderReview() {
    var pend = F.kn.list({ includeRedirects: false }).filter(function (k) { return k.status === 'pending'; })
      .sort(function (a, b) { return b.modified - a.modified; });
    var mq = F.db.mergeQueue;
    var html = '<div class="ov-head"><div class="ov-name">审核工作台</div>' +
      '<p class="t-aux" style="margin-top:4px">待审核队列 + 合并队列(抽取去重 / 晋升冲突共用)</p></div>' +
      '<div class="rv-qtabs">' +
      '<button class="rv-qtab' + (S.rv.qtab === 'pending' ? ' active' : '') + '" data-act="rv-qtab" data-qt="pending">待审核 ' + pend.length + '</button>' +
      '<button class="rv-qtab' + (S.rv.qtab === 'merge' ? ' active' : '') + '" data-act="rv-qtab" data-qt="merge">合并队列 ' + mq.length + '</button></div>';
    if (S.rv.qtab === 'pending') {
      html += '<div class="rv-list">' + (pend.map(function (k) {
        return '<div class="rv-card"><div class="rv-card-top"><span class="rv-card-title ellipsis" title="' + esc(k.title) + '">' + esc(k.title) + '</span>' +
          (k.scope === 'global' ? '<span class="chip">全局</span>' : '<span class="chip">项目</span>') + confBadge(k.id) + '</div>' +
          '<div class="kn-card-abs">' + esc(k.abstract) + '</div>' +
          '<div class="kn-card-keys" style="margin-top:5px">' + (k.keywords || []).map(function (kw) { return '<span class="chip is-key">#' + esc(kw) + '</span>'; }).join('') + '</div>' +
          '<div class="rv-src">来源:' + esc(k.author) + ' · ' + F.relative(k.modified) + ' · 域 <span class="t-code">' + esc(F.kn.domainOf(k.path) || '(根)') + '</span></div>' +
          '<div class="rv-actions">' +
          '<button class="btn btn-primary btn-sm" data-act="kn-approve" data-kn="' + esc(k.id) + '">通过(+0.18)</button>' +
          '<button class="btn btn-ghost btn-sm btn-danger-text" data-act="kn-reject" data-kn="' + esc(k.id) + '">拒绝</button>' +
          '<span style="flex:1"></span><button class="btn btn-ghost btn-sm" data-act="kn-open" data-kn="' + esc(k.id) + '">详情</button></div></div>';
      }).join('') || '<div class="kb-empty">队列为空</div>') + '</div>';
    } else {
      html += '<div class="rv-list">' + (mq.map(function (m) {
        var a = F.kn.get(m.aId), b = F.kn.get(m.bId);
        if (!a || !b) return '';
        function mini(x, side) {
          return '<div class="rv-mini" data-act="kn-open" data-kn="' + esc(x.id) + '" title="查看详情">' +
            '<div class="m-title"><span class="ellipsis">' + esc(x.title) + '</span>' + statusBadge(x.status) + '</div>' +
            '<div class="m-abs">' + esc(x.abstract) + '</div></div>';
        }
        return '<div class="rv-card"><div class="rv-card-top"><span class="rv-card-title">疑似重复</span>' +
          '<span class="chip">' + (m.origin === 'extract-dedup' ? '抽取去重' : '晋升冲突') + '</span></div>' +
          '<div class="rv-pair">' + mini(a) + '<span class="vs">≈</span>' + mini(b) + '</div>' +
          '<div class="rv-reason">' + esc(m.reason) + '</div>' +
          '<div class="rv-actions">' +
          '<button class="btn btn-primary btn-sm" data-act="rv-merge" data-mq="' + esc(m.id) + '" data-keep="a">保留左侧合并</button>' +
          '<button class="btn btn-soft btn-sm" data-act="rv-merge" data-mq="' + esc(m.id) + '" data-keep="b">保留右侧合并</button>' +
          '<span style="flex:1"></span><button class="btn btn-ghost btn-sm" data-act="rv-dismiss" data-mq="' + esc(m.id) + '">不合并</button></div></div>';
      }).join('') || '<div class="kb-empty">队列为空</div>') + '</div>';
    }
    return html;
  }

  /* (原「召回控制台」已并入知识库面板统一页面 —— 检索 = 面板搜索栏 + 域/范围过滤 + 仅可召回阈值) */

  /* (原「召回控制台」已并入知识库面板统一页面 —— 检索 = 面板搜索栏 + 域/范围过滤 + 仅可召回阈值) */

  /* 文档 tab(只读) */
  function renderDoc(path) {
    var content = F.db.docs[path] || '# ' + path.split('/').pop() + '\n\n(占位内容 — 原型只读渲染示意)';
    return '<div class="doc-head"><span aria-hidden="true">📄</span><span class="doc-title ellipsis">' + esc(path.split('/').pop()) + '</span>' +
      '<span class="chip" title="应用对代码仓与文档位置零写入(SC3 只读纪律)">只读</span></div>' +
      '<div class="doc-pathbar"><span class="ellipsis" style="flex:1" title="' + esc(project().canonicalPath + '\\docs\\' + path) + '">' +
      esc(project().canonicalPath + '\\docs\\' + path) + '</span>' +
      '<button class="icon-btn" data-act="doc-reread" style="width:22px;height:22px" title="重新读取(只读)">↻</button></div>' +
      '<div class="doc-body">' + md(content) + '</div>';
  }

  /* ───────── dock 知识文档页签(中区浏览、右栏深读;卡片 ⋯ / 抽屉「在 dock 打开」) ───────── */
  function renderKnDoc(id) {
    var k = F.kn.get(id);
    if (!k) return '<div class="kb-empty">条目不存在(可能已合并移除)</div>';
    var proj = k.project ? F.db.projects.find(function (p) { return p.id === k.project; }) : null;
    var dir = k.scope === 'project' ? (proj ? proj.knowledgeDir : '(未知项目)') : '全局库';
    return '<div class="doc-head"><span aria-hidden="true">📄</span><span class="doc-title ellipsis" title="' + esc(k.title) + '">' + esc(k.title) + '</span>' +
      '<span class="chip" title="应用对代码仓与文档位置零写入(SC3 只读纪律)">只读</span></div>' +
      '<div class="doc-pathbar"><span class="ellipsis" style="flex:1" title="' + esc(dir + '\\' + k.path) + '">' +
      esc(dir + '\\' + k.path) + '</span>' +
      '<button class="icon-btn" data-act="kndoc-to-drawer" data-kn="' + esc(id) + '" style="width:22px;height:22px" title="在抽屉打开(编辑元数据 / 动作)">⤢</button></div>' +
      '<div class="kndoc-badges">' + statusBadge(k.status) + confBadge(id) + heatBadge(id) +
      '<span class="t-aux" style="font-size:10.5px;margin-left:auto">页签跟随所属项目</span></div>' +
      (k.abstract ? '<div class="kd-abs kndoc-abs">' + esc(k.abstract) + '</div>' : '') +
      '<div class="doc-body">' + md(k.body) + '</div>';
  }
  function openKnDocTab(id) {
    var k = F.kn.get(id);
    if (!k) return;
    /* 知识模式不含右栏:打开 dock = 整体切回会话视图(右栏状态随之恢复) */
    S.centerView = 'conv';
    /* 全局知识在打开它的项目上下文中挂靠(所属项目 = 打开时项目) */
    openTab('kndoc', id, k.title, { project: k.project || S.projectId });
    S.knDrawer = null;   /* dock 接管深读,抽屉收起 */
    renderAll();
    toast('已切回会话视图并在 dock 打开《' + k.title + '》—— 知识库为整体模式(不占右栏),打开 dock 即整体切换');
  }

  /* ───────── 置信度构成气泡 ───────── */
  function showConfPop(anchor, id) {
    var c = F.kn.confidence(id);
    if (!c) return;
    var rows = c.parts.map(function (p) {
      var cls = p.delta > 0 ? 'up' : p.delta < 0 ? 'down' : '';
      var sign = p.delta > 0 ? '+' : '';
      return '<div class="pop-row"><span class="pk">' + esc(p.key) + '</span><span style="flex:1;color:var(--dsw-alias-label-tertiary);font-size:11px">' + esc(p.note) + '</span>' +
        '<span class="pop-delta ' + cls + '">' + sign + p.delta.toFixed(2) + '</span></div>';
    }).join('');
    openPop(anchor,
      '<div class="pop-title">置信度 ' + (c.total * 100).toFixed(0) + '% · ' + c.levelLabel +
      ' <span style="margin-left:auto;font-size:11px;font-weight:400" class="t-aux">' + esc(id) + '</span></div>' +
      '<div style="margin-top:8px">' + rows + '</div>' +
      '<div class="pop-row" style="border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:6px;margin-top:4px"><span class="pk">基线</span><span style="flex:1"></span><span class="t-code">0.45</span></div>' +
      '<div class="pop-note">读取时动态计算(审核/使用/近期性/反馈/衰减),存储中无置信度字段 —— 杜绝存储值与信号漂移。阈值过滤参与召回,排序与置信解耦。</div>');
  }

  /* ───────── 动作分发 ───────── */
  var actions = {
    /* 知识库面板 */
    'kb-scope-menu': function (d, e) {
      var anchor = e.target.closest('button');
      var sc = parseScope();
      var items = [];
      items.push({ id: 'all', label: '全部知识', icon: '🌐 ', tail: sc.type === 'all' ? '✓' : F.kn.list({ scope: 'all', includeRedirects: false }).length + ' 条', onClick: function () { setKbScope('all'); } });
      items.push({ id: 'global', label: '全局库', icon: '📚 ', tail: sc.type === 'global' ? '✓' : F.kn.list({ scope: 'global', includeRedirects: false }).length + ' 条', onClick: function () { setKbScope('global'); } });
      items.push('-');
      F.db.projects.filter(function (p) { return !p.archived; }).forEach(function (p) {
        var n = F.kn.list({ scope: 'project', project: p.id, includeRedirects: false }).length;
        items.push({ id: p.id, label: '项目 · ' + p.name, icon: '📁 ', tail: sc.type === 'project' && sc.id === p.id ? '✓' : n + ' 条', onClick: function () { setKbScope('project:' + p.id); } });
      });
      openMenu(anchor, items, '范围(可下钻)');
    },
    'kb-session-drill': function (d) {
      S.kb.scope = 'session:' + d.s;
      S.kb.domain = null; S.kb.status = 'all'; S.kb.q = '';
      S.knStat.domain = null;
      S.knStat.drill = [];
      renderAll();
    },
    'kb-exit-session': function () {
      var sc = parseScope();
      var p = projectOfSession(sc.id);
      setKbScope(p ? 'project:' + p.id : 'all');
    },
    'kb-recall-only': function () { S.kb.recallOnly = !S.kb.recallOnly; renderAll(); },
    'knrec-fb': function (d) {
      var s = session();
      F.recall.feedback(d.kn, d.kind, s ? s.id : null);
      renderAll();
      toast('已记录显式反馈(' + (d.kind === 'adopted' ? '采纳 +0.04' : '忽略 -0.06') + ')—— 置信度第四信号');
    },
    'kb-clear-search': function () {
      S.kb.q = '';
      renderAll();
      var q = $('#kb-q'); if (q) { q.value = ''; q.focus(); }
    },
    'kb-status': function (d) { S.kb.status = d.st; renderAll(); },
    'kb-dom-collapse': function () { S.kb.domCollapsed = !S.kb.domCollapsed; renderAll(); },
    'kb-dom-toggle': function (d, e) {
      var path = d.dom;
      if (S.kb.domain === path) { S.kb.openDom[path] = S.kb.openDom[path] === false; }
      else { S.kb.domain = path; S.kb.openDom[path] = true; }
      renderAll();
    },
    'kb-dom-all': function () { S.kb.domain = null; renderAll(); },
    'kb-reconcile': function () { var n = F.kn.reconcile(); toast('索引已重建(' + n + ' 条挂载);索引 = 可重建派生缓存,SoT = 知识文件 + 应用状态层'); },
    'kb-extract': function () { openExtractDialog(); },
    'kn-tab': function (d) { S.knTab = d.t; renderAll(); },
    'rl-verb': function (d) { S.knRlog.verb = d.v; renderKnRlog(); },
    'rl-toggle': function (d) { S.knRlog.open = S.knRlog.open === d.id ? null : d.id; renderKnRlog(); },
    'stat-time': function (d) { S.knStat.time = parseInt(d.d, 10) || 0; S.knStat.range = null; renderAll(); },
    'stat-time-custom': function () {
      if (!S.knStat.range) S.knStat.range = { from: fmtDay(F.now() - 29 * 864e5), to: fmtDay(F.now()) };   /* 默认近 30 天,可改 */
      renderAll();   /* chip 激活 + 范围摘要(重建 DOM,锚点须重取渲染后的按钮) */
      openCustomTimePop($('[data-act="stat-time-custom"]'));
    },
    'stat-span': function (d) {
      var n = parseInt(d.n, 10) || 30;
      S.knStat.range = { from: fmtDay(F.now() - (n - 1) * 864e5), to: fmtDay(F.now()) };
      renderAll();
      syncCustomTimePop();
    },
    'stat-time-clear': function () { S.knStat.range = null; closeLayers(); renderAll(); },
    'stat-metric': function (d) {
      var arr = S.knStat.custom.metrics;
      var i = arr.indexOf(d.v);
      if (i >= 0) {
        if (arr.length > 1) arr.splice(i, 1);
        else toast('至少保留一个指标');
      } else if (arr.length >= 3) {
        toast('最多同时选 3 个指标 —— 先移除一个再叠加');
      } else {
        arr.push(d.v);
      }
      renderAll();
    },
    'stat-chart': function (d) {
      S.knStat.custom.chart = d.v === 'line' ? 'line' : 'bar';
      renderAll();
    },
    'stat-dd': function (d) {
      S.knStat.drill = d.d ? String(d.d).split('|') : [];
      renderAll();
    },
    'stat-kn': function (d) { openKnDrawer(d.kn); },
    'stat-sess': function (d) {
      S.kb.scope = 'session:' + d.s;
      S.kb.domain = null; S.kb.status = 'all';
      S.knStat.domain = null;
      S.knStat.drill = [];
      S.knTab = 'browse';
      renderAll();
    },
    'kn-open': function (d) {
      if (d.swapScope) S.kb.scope = 'global';
      openKnDrawer(d.kn);
    },
    'kn-drawer-close': function () { S.knDrawer = null; renderAll(); },
    /* 从知识跳到对话:自动 @ 对应知识文档,便于让 agent 修改(当前对话 / 新对话两路) */
    'kn-ask': function (d) { askInConv(d.kn, false); },
    'kn-ask-new': function (d) { askInConv(d.kn, true); },
    'kn-dock': function (d) { openKnDocTab(d.kn); },
    'kndoc-to-drawer': function (d) { S.knDrawer = d.kn; renderAll(); },
    'kn-menu': function (d, e) {
      e.stopPropagation();
      var k = F.kn.get(d.kn);
      var items = [];
      if (k.status === 'pending') items.push({ id: 'ap', label: '审核通过(+0.18)', icon: '✓ ', onClick: function () { F.kn.approve(d.kn); toast('已通过审核 —— 置信度信号 +0.18(读取时重算)'); } });
      items.push({ id: 'mv', label: '移动(换域)…', icon: '⇄ ', onClick: function () { openMoveDialog(d.kn); } });
      if (k.scope === 'project') items.push({ id: 'pm', label: '晋升到全局库', icon: '↑ ', onClick: function () { promoteKn(d.kn); } });
      items.push({ id: 'ask', label: '当前会话引用', icon: '💬 ', onClick: function () { askInConv(d.kn, false); } });
      items.push({ id: 'asknew', label: '新会话引用', icon: '✦ ', onClick: function () { askInConv(d.kn, true); } });
      items.push({ id: 'dock', label: '在 dock 打开文档', icon: '🪟 ', onClick: function () { openKnDocTab(d.kn); } });
      items.push({ id: 'rf', label: '刷新读取(frontmatter)', icon: '↻ ', onClick: function () { toast('已按 frontmatter id 重新挂载索引(对账)'); } });
      openMenu(e.target.closest('button'), items, k.title);
    },
    'kn-approve': function (d) { F.kn.approve(d.kn); toast('审核通过 —— 置信度信号 +0.18(读取时动态重算)'); },
    'kn-reject': function (d) { F.kn.reject(d.kn); toast('已拒绝(低置信,不再参与召回)'); },
    'kn-promote': function (d) { promoteKn(d.kn); },
    'kn-move': function (d) { openMoveDialog(d.kn); },
    'kn-edit-meta': function (d) { openEditMetaDialog(d.kn); },
    'conf-pop': function (d, e) { showConfPop(e.target.closest('[data-act="conf-pop"]') || e.target, d.kn); },

    /* 侧栏/项目/会话 */
    'open-kb-panel': function () {
      S.centerView = 'kn';
      renderAll();
      setTimeout(function () { var q = $('#kb-q'); if (q) q.focus(); }, 30);
    },
    'sb-collapse': function () { S.sbCollapsed = true; renderAll(); },
    'sb-expand': function () { S.sbCollapsed = false; renderAll(); },
    'sb-expand-search': function () { S.sbCollapsed = false; S.pj.searching = true; renderAll(); setTimeout(function () { $('#pj-q').focus(); }, 30); },
    'pj-open': function (d) {
      if (d.p === S.projectId) return;   /* 同项目零动作 */
      S.projectId = d.p;
      F.projects.switchTo(d.p);
      S.sessionId = F.sessionsOf(project().workspaceId)[0] ? F.sessionsOf(project().workspaceId)[0].id : null;
      S.view = 'conv';
      /* dock 跟随所属项目:不清空 —— 可见页签集切到新项目(全局页签保留,旧项目页签记忆待切回) */
      var dvis = S.dock.tabs.filter(function (t) { return t.isGlobal || t.project === S.projectId; });
      S.dock.active = dvis.length ? dvis[dvis.length - 1].id : null;
      S.ov.taskFeat = null;  /* 任务视图 feature 跟随项目重选 */
      /* 知识范围跟随:旧项目/会话范围回到全部 */
      var sc = parseScope();
      if (sc.type === 'project' || sc.type === 'session') S.kb.scope = 'all';
      S.kb.domain = null;
      renderAll();
      toast('已切换到 ' + project().name + '(原位换台 · dock 页签跟随所属项目)');
    },
    'pj-toggle': function (d, e) { e.stopPropagation(); F.projects.toggleExpand(d.p); },
    'pj-search-toggle': function () { S.pj.searching = !S.pj.searching; renderAll(); if (S.pj.searching) setTimeout(function () { $('#pj-q').focus(); }, 30); },
    'pj-view-menu': function (d, e) {
      openMenu(e.target.closest('button'), [
        { id: 'tree', label: '按项目树', tail: '✓', onClick: function () {} },
        { id: 'flat', label: '按项目(原型未实装)', onClick: function () { toast('分组方式(原型仅「按项目树」)'); } },
        { id: 'list', label: '单列表(原型未实装)', onClick: function () { toast('分组方式(原型仅「按项目树」)'); } }
      ], '视图选项');
    },
    'sess-open': function (d) { closeLayers(); S.sessionId = d.s; S.view = 'conv'; S.centerView = 'conv'; renderAll(); },
    'sess-menu': function (d, e) {
      e.stopPropagation();
      var s = F.sessionGet(d.s);
      openMenu(e.target.closest('button'), [
        { id: 'rn', label: '重命名', icon: '✎ ', onClick: function () {
          openDialog({ title: '重命名会话', ok: true, okLabel: '保存',
            body: '<div class="form-row"><label>标题</label><input type="text" id="rn-input" value="' + esc(s.title) + '"></div>',
            onOk: function (mask) { var v = $('#rn-input', mask).value.trim(); if (v) { s.title = v; s.ts = F.now(); F.notify(); toast('已重命名(dsh 侧账本)'); } } });
        } },
        { id: 'fk', label: '分叉会话', icon: '⑂ ', onClick: function () {
          var ns = F.newSessionIn(s.ws, s.title + ' · 分叉');
          ns.msgs = s.msgs.slice(); ns.taskKey = s.taskKey; ns.status = 'ended';
          S.sessionId = ns.id; renderAll(); toast('已分叉为顶层会话(血缘独立)');
        } },
        { id: 'ar', label: '归档会话', icon: '🗄 ', onClick: function () {
          s.archived = true; if (S.sessionId === s.id) S.sessionId = null;
          F.notify(); toast('已归档(行消失;恢复走设置 — 原型占位)');
        } }
      ]);
    },
    'new-session': function () { S.sessionId = null; S.view = 'conv'; S.centerView = 'conv'; renderAll(); },
    'add-project': openAddProjectDialog,
    'settings-toast': function () { toast('设置(原型占位):主题经原型工具切换;各项随 GUI 逐项归宿'); },
    'hero-mode-toast': function () { toast('模式(原型示意):标准 / PTC / 极简 / 创建'); },
    'hero-project-menu': function (d, e) {
      var items = F.db.projects.filter(function (p) { return !p.archived; }).map(function (p) {
        return { id: p.id, label: p.name + (p.id === S.projectId ? ' ✓' : ''), onClick: function () { actions['pj-open']({ p: p.id }); } };
      });
      items.push('-');
      items.push({ id: 'new', label: '新会话(当前项目)', onClick: function () { S.sessionId = null; renderAll(); } });
      openMenu(e.target.closest('button'), items, '项目');
    },
    'composer-slash': function () { toast('/ 斜杠命令 · @ 引用(原型示意)'); },
    'composer-mode-toast': function () { toast('模式(原型示意):标准 / PTC / 极简 / 创建'); },
    'composer-model-toast': function () { toast('模型选择(上游 ui-model-selection;原型示意)'); },
    'open-in-editor': function (d, e) {
      openMenu(e.target.closest('button'), [
        { id: 'exp', label: '文件资源管理器', icon: '🗂 ', onClick: function () { toast('在文件资源管理器中打开(原型示意)'); } },
        { id: 'vscode', label: 'VS Code', icon: '⌨ ', onClick: function () { toast('在 VS Code 中打开(原型示意)'); } },
        { id: 'idea', label: 'IntelliJ IDEA', icon: '☕ ', onClick: function () { toast('在 IntelliJ IDEA 中打开(原型示意)'); } },
        { id: 'pycharm', label: 'PyCharm', icon: '🐍 ', onClick: function () { toast('在 PyCharm 中打开(原型示意)'); } }
      ], '在编辑器中打开工作区');
    },

    /* 会话视图 */
    'conv-view': function (d) { S.view = d.view; renderAll(); },
    'tool-toggle': function (d, e) {
      var s = session(); if (!s) return;
      var head = e.target.closest('.toolrow-head');
      if (!head) return;
      var idx = Array.prototype.indexOf.call($('#conv-transcript').querySelectorAll('.toolrow-head'), head);
      var cnt = -1;
      for (var j = 0; j < s.msgs.length; j++) {
        if (s.msgs[j].role === 'tool') {
          cnt++;
          if (cnt === idx) { s.msgs[j].tool.open = !s.msgs[j].tool.open; break; }
        }
      }
      renderAll();
    },
    'hit-fb': function (d) {
      var s = session();
      F.recall.feedback(d.kn, d.kind, d.sid || (s && s.id));
      if (s) {
        for (var i = s.msgs.length - 1; i >= 0; i--) {
          var m = s.msgs[i];
          if (m.role === 'tool' && m.tool && m.tool.hits && m.tool.hits.indexOf(d.kn) >= 0) {
            m.tool.fb = m.tool.fb || {}; m.tool.fb[d.kn] = d.kind; break;
          }
        }
      }
      renderAll();
      toast('已记录显式反馈(' + (d.kind === 'adopted' ? '采纳 +0.04' : '忽略 -0.06') + ')—— 置信度第四信号');
    },
    'hit-full': function (d, e) {
      var inConsole = !!(e.target.closest && e.target.closest('#rc-result'));
      var res = F.recall.readFull(d.kn, session() ? session().id : null);
      if (inConsole && S.rc.result && S.rc.result.kind === 'search') {
        var hit = S.rc.result.hits.find(function (h) { return h.kn.id === d.kn; });
        if (hit) { if (hit.full) delete hit.full; else hit.full = res; renderAll(); return; }
      }
      var s = session(); if (!s) return;
      for (var i = 0; i < s.msgs.length; i++) {
        var m = s.msgs[i];
        if (m.role === 'tool' && m.tool && m.tool.hits && m.tool.hits.indexOf(d.kn) >= 0) {
          m.tool.full = m.tool.full || {};
          if (m.tool.full[d.kn]) delete m.tool.full[d.kn]; else m.tool.full[d.kn] = res;
          m.tool.open = true;
          break;
        }
      }
      renderAll();
    },
    'composer-send': doSend,
    'traj-toast': function (d) { toast(d.msg || '(原型示意)'); },
    'traj-collapse-rounds': function (d, e) {
      S.trajCollapsed = !S.trajCollapsed;
      var btn = e.target.closest('.traj-tb');
      if (btn) btn.setAttribute('aria-pressed', S.trajCollapsed);
      renderTraj();
    },
    'traj-row': function (d, e) {
      openPop(e.target.closest('.traj-row'), '<div class="pop-title">轨迹事件</div><div class="traj-detail-pop">' + esc(e.target.closest('.traj-row').querySelector('.traj-text').textContent) + '</div><div class="pop-note">详情面板(原型简化)—— 轨迹 tab 为罐头台账。</div>');
    },
    'task-goto': function (d) { S.ov.subtab = 'tasks'; openTab('overview', null, '项目概览'); toast('任务 ↔ 会话挂接:应用侧关联记录,会话头与看板均可见'); },

    /* dock */
    'dock-toggle': function () { S.dock.open = !S.dock.open; renderAll(); },
    'dock-fullscreen': function () { S.dock.fullscreen = !S.dock.fullscreen; renderAll(); },
    'dock-tab': function (d) { S.dock.active = d.id; renderAll(); },
    'dock-close': function (d, e) { e.stopPropagation(); closeTab(d.id); },
    'dock-plus': function () { openTab('start', null, '开始'); },
    'start-card': function (d) { openTab(d.kind, d.ref || null, null, { fromStart: true }); },
    'open-review': function () { openTab('review', null, '审核工作台', { fromStart: true }); },
    'ov-subtab': function (d) { S.ov.subtab = d.st; renderAll(); },
    'tree-toggle': function () { toast('目录树展开/收起(原型示意)'); },
    'doc-open': function (d) { openTab('doc', d.path, '文档'); },
    'doc-reread': function () { toast('已重新读取(只读)—— 应用对仓内文档零写入'); },

    /* 概览:对账与任务 */
    'ws-move': function () { F.ws.simulateMove(S.projectId); toast('已模拟目录整体移动 —— 对账失配;会话历史不丢(dsh 侧)'); },
    'ws-realign': function () { var ok = F.ws.realign(S.projectId); toast(ok ? '已按 canonical path 找回 —— 单向修引用,无数据复制' : '找回失败 → create() 幂等重建(原型恒成功路径)'); },
    'ov-task-feat': function (d, e) {
      var p = project();
      var feats = F.featuresOf(p.id);
      var items = feats.map(function (f) {
        var n = F.tasks.ofFeature(f.slug).length;
        var done = F.tasks.ofFeature(f.slug).filter(function (t) { return t.status === 'completed'; }).length;
        return { id: f.slug, label: f.slug, icon: f.status === 'completed' ? '🗄 ' : '📁 ',
          tail: S.ov.taskFeat === f.slug ? '✓ ' + f.status + ' ' + done + '/' + n : f.status + ' ' + done + '/' + n,
          onClick: function () { S.ov.taskFeat = f.slug; renderAll(); } };
      });
      openMenu(e.target.closest('button'), items, '选择 feature(任务视图绑定)');
    },
    'ov-task-view': function (d) { S.ov.taskView = d.v; renderAll(); },
    'task-pop': function (d, e) {
      openTaskPop(d.key, e.target.closest('[data-act="task-pop"]') || e.target);
    },
    'task-tool': function (d) {
      closeLayers();
      var before = F.db.tasks[d.key].status;
      var t = F.tasks.simulateToolSubmit(d.key);
      if (!t) { toast('任务已终态(completed)'); return; }
      toast('forge 插件 tool 半身 → 宿主能力面 → 状态层:' + d.key + ' ' + before + ' → ' + t.status + '(看板即时反映,应用零编排)');
    },
    'task-session': function (d) { actions['sess-open']({ s: d.s }); },

    /* 审核 */
    'rv-qtab': function (d) { S.rv.qtab = d.qt; renderAll(); },
    'rv-merge': function (d) {
      F.kn.merge(d.mq, d.keep === 'a');
      toast('已合并(正文并入 + 关键词并集;另一条目移除)—— 合并审核闭环');
    },
    'rv-dismiss': function (d) { F.kn.dismissDup(d.mq); toast('已标记不合并(保留两条)'); },

    /* 原型工具 */
    'proto-tools-toggle': function (d, e) { $('#proto-tools').classList.toggle('is-collapsed'); },
    'theme-toggle': function () {
      var dark = document.body.hasAttribute('data-ds-dark-theme');
      if (dark) { document.body.removeAttribute('data-ds-dark-theme'); localStorage.setItem('proto-dfr-theme', 'light'); }
      else { document.body.setAttribute('data-ds-dark-theme', ''); localStorage.setItem('proto-dfr-theme', 'dark'); }
    },
    'sim-time': function (d, e) {
      F.setSimDays(parseInt(d.days, 10));
      document.querySelectorAll('#sim-time-seg .seg-btn').forEach(function (b) { b.classList.toggle('active', b === e.target.closest('.seg-btn')); });
      F.notify();
      toast(d.days === '0' ? '回到当前时间' : '模拟时间 +' + d.days + ' 天 —— 闲置知识置信度衰减,相对时间同步(读取时重算)');
    },
    'demo-external': function () { F.kn.simulateExternal(); toast('已模拟外部编辑器直写知识目录 —— 进入知识面板将提示对账'); },
    'reset-data': function () { F.reset(); prevHeat = {}; S.rc.result = null; F.notify(); toast('种子数据已还原'); }
  };

  /* ───────── 对话框:抽取 / 移动 / 添加项目 ───────── */
  function promoteKn(id) {
    F.kn.promote(id);
    toast('已晋升至全局库(移动);项目侧留重定向记录,同名近似将进合并队列');
    renderAll();
  }
  function openExtractDialog() {
    var p = project();
    var sess = F.sessionsOf(p.workspaceId);
    var cur = session();
    var sugg = [];
    if (cur) {
      var lastAsst = (cur.msgs.filter(function (m) { return m.role === 'assistant'; }).pop() || {}).text || cur.title;
      sugg.push({ title: cur.title + ' · 沉淀', abstract: lastAsst.slice(0, 70), keywords: F.guessKeywords(cur.title + ' ' + lastAsst).slice(0, 3), domain: p.defaultRecallDomain || '' });
    }
    sugg.push({ title: '', abstract: '', keywords: [], domain: p.defaultRecallDomain || '' });
    var sel = 0;
    var domains = [''].concat(F.kn.allDomains('project', p.id));
    var body =
      '<div class="form-row"><label>来源会话</label><select id="ex-src">' +
      sess.map(function (s) { return '<option value="' + s.id + '"' + (cur && cur.id === s.id ? ' selected' : '') + '>' + esc(s.title) + '(' + F.relative(s.ts) + ')</option>'; }).join('') +
      '</select><span class="form-hint">触发双路之一:用户主动(本对话框)/ agent 自动(会话内 knowledge.extract)</span></div>' +
      '<div class="form-row"><label>建议条目(点选)</label>' +
      sugg.map(function (s, i) {
        return '<div class="form-suggest' + (i === 0 ? ' active' : '') + '" data-ex-sel="' + i + '">' +
          (s.title ? '<b>' + esc(s.title) + '</b><span class="t-aux" style="display:block">' + esc(s.abstract) + '</span>' : '<span class="t-aux">空白条目(手填)</span>') + '</div>';
      }).join('') + '</div>' +
      '<div class="form-row"><label>标题 *</label><input type="text" id="ex-title" value="' + esc(sugg[0].title) + '"></div>' +
      '<div class="form-row"><label>摘要 *</label><textarea id="ex-abs">' + esc(sugg[0].abstract) + '</textarea></div>' +
      '<div class="form-row"><label>关键词(域内细分,逗号分隔)*</label><input type="text" id="ex-kw" value="' + esc(sugg[0].keywords.join(', ')) + '"></div>' +
      '<div class="form-row"><label>域(目录即域,≤3 层)</label><select id="ex-dom">' +
      domains.map(function (d) { return '<option value="' + esc(d) + '"' + (sugg[0].domain === d ? ' selected' : '') + '>' + (d ? esc(d) : '(根)') + '</option>'; }).join('') +
      '</select><span class="form-hint">域由目录路径派生,frontmatter 不重复声明 —— 契约双方(应用/技能)共享 schema</span></div>';
    openDialog({ title: '从会话抽取知识', ok: true, okLabel: '落库(未审核 · 中等置信)', body: body, onOk: function (mask) {
      var srcSel = $('#ex-src', mask);
      var draft = {
        scope: 'project', project: S.projectId,
        sessionId: srcSel ? srcSel.value : (cur ? cur.id : null),
        title: $('#ex-title', mask).value.trim(),
        abstract: $('#ex-abs', mask).value.trim(),
        keywords: $('#ex-kw', mask).value.split(/[,，、\s]+/).filter(Boolean),
        domain: $('#ex-dom', mask).value,
        author: 'user', body: $('#ex-abs', mask).value.trim()
      };
      var res = F.kn.extract(draft);
      if (!res.ok) { toast(res.error); return; }
      S.kb.scope = 'project:' + S.projectId; S.kb.status = 'all'; S.kb.domain = draft.domain || null;
      renderAll();
      toast(res.dup
        ? '已落库(pending · 初始中等置信)—— 疑似与《' + res.dup.kn.title + '》重复,进合并审核队列'
        : '已落库(pending · 初始中等置信)—— 人工审核 / 多次使用 / 采纳反馈可提升置信度');
    } });
    maskDelegate('[data-ex-sel]', function (el, mask) {
      mask.querySelectorAll('.form-suggest').forEach(function (x) { x.classList.remove('active'); });
      el.classList.add('active');
      var s = sugg[parseInt(el.getAttribute('data-ex-sel'), 10)] || { title: '', abstract: '', keywords: [] };
      $('#ex-title', mask).value = s.title;
      $('#ex-abs', mask).value = s.abstract;
      $('#ex-kw', mask).value = s.keywords.join(', ');
    });
  }
  function openMoveDialog(id) {
    var k = F.kn.get(id);
    var domains = [''].concat(F.kn.allDomains(k.scope === 'global' ? 'global' : 'project', k.scope === 'global' ? null : k.project));
    openDialog({ title: '移动知识(换域)', ok: true, okLabel: '移动', body:
      '<div class="dlg-kv"><span class="k">条目</span><span>' + esc(k.title) + ' · <span class="t-code">' + esc(k.id) + '</span></span></div>' +
      '<div class="dlg-kv"><span class="k">当前域</span><span class="t-code">' + esc(F.kn.domainOf(k.path) || '(根)') + '</span></div>' +
      '<div class="form-row"><label>目标域(目录即域)</label><select id="mv-dom">' +
      domains.map(function (d) { return '<option value="' + esc(d) + '"' + (F.kn.domainOf(k.path) === d ? ' selected' : '') + '>' + (d ? esc(d) : '(根)') + '</option>'; }).join('') +
      '</select><span class="form-hint">宿主能力面单一 API:文件操作与索引同步一体;稳定 ID(frontmatter id)不变,引用不断 —— 换域 = 移动文件。</span></div>',
      onOk: function (mask) {
        F.kn.move(id, $('#mv-dom', mask).value);
        renderAll();
        toast('已移动到「' + ($('#mv-dom', mask).value || '根') + '」—— 稳定 ID 不变,域过滤(前缀匹配)随之生效');
      } });
  }
  /* ───────── 添加项目:① 文件浏览器选工作区目录 → ② 表单回填(其余目录按工作区构建预填) ───────── */
  var MOCK_FS = {
    'Z:\\': ['project', 'tools'],
    'Z:\\project': ['dsh', 'ai'],
    'Z:\\project\\dsh': ['dsh-demo', 'dsh-forge-v2', 'dsh-desktop', 'legacy-app'],
    'Z:\\project\\ai': ['forge-plugin', 'openviking'],
    'Z:\\tools': ['bin', 'scripts'],
    'Z:\\project\\dsh\\dsh-demo': ['src', 'docs', 'packages', '.forge', '.knowledge'],
    'Z:\\project\\dsh\\dsh-forge-v2': ['apps', 'docs', 'packages'],
    'Z:\\project\\dsh\\dsh-desktop': ['src', 'docs'],
    'Z:\\project\\dsh\\legacy-app': ['src'],
    'Z:\\project\\ai\\forge-plugin': ['src', 'docs'],
    'Z:\\project\\ai\\openviking': ['src', 'docs']
  };
  function wsNorm(p) { return String(p || '').replace(/\\+$/, ''); }
  function wsLeaf(p) { return wsNorm(p).split('\\').pop() || '新项目'; }
  function fsParent(dir) { var i = wsNorm(dir).lastIndexOf('\\'); return i > 0 ? wsNorm(dir).slice(0, i) : null; }
  function fsKids(dir) { return (MOCK_FS[wsNorm(dir)] || []).slice().sort(); }
  /* 非工作区目录的构建规则:一律挂在工作区下,用户可在表单中改写 */
  function deriveForgeDir(ws) { return wsNorm(ws) + '\\.forge'; }
  function deriveKnDir(ws) { return wsNorm(ws) + '\\.knowledge'; }
  /* 任务清单与记录:统一存 {dsh-forge-home}/{canonical-path}(扁平化:/ 与 \ 替换为 -,盘符冒号去除)+ 原路径 hash8 消歧后缀(正式实现 = sha-256 前 8 hex;本 mock 用 djb2 32bit 代演示,确定性等价),自动派生,无需用户填写 */
  var DSH_FORGE_HOME = 'C:\\Users\\panda\\.dsh-forge';
  function hash8(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; } var v = ''; for (var b = 0; b < 4; b++) { v += ((h >>> (b * 8)) & 0xff).toString(16).padStart(2, '0'); } return v; }
  function deriveTaskStore(ws) { var w = wsNorm(ws); return DSH_FORGE_HOME + '\\' + w.replace(/^([A-Za-z]):/, '$1').replace(/[\\/]/g, '-') + '-' + hash8(w); }
  var FOLDER_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>';

  /* ① 文件浏览器(模拟盘 Z:):选目录的通用件 —— 添加项目首步选工作区;表单内「浏览…」选知识库 / forge 目录 */
  function openDirPicker(popts) {
    var cwd = 'Z:\\project\\dsh';
    var sel = null;
    var mask = openDialog({ title: popts.title, ok: true, okLabel: '选择此文件夹', stacked: !!popts.stacked, body: '<div id="fb"></div>' });
    var okBtn = mask.querySelector('[data-dlg-ok]');
    var box = $('#fb', mask);
    function crumbHtml() {
      var parts = wsNorm(cwd).split('\\'), acc = '';
      return parts.map(function (seg, i) {
        acc = i === 0 ? seg : acc + '\\' + seg;
        var target = i === 0 ? seg + '\\' : acc;
        return (i ? '<span class="fb-sep">›</span>' : '') +
          '<button class="fb-crumb-seg" data-fb-jump="' + esc(target) + '">' + esc(seg) + '</button>';
      }).join('');
    }
    function rowHtml(name) {
      var full = wsNorm(cwd) + '\\' + name;
      var reg = F.db.projects.find(function (p) { return p.canonicalPath === full && !p.archived; });
      return '<div class="fb-item' + (sel === full ? ' sel' : '') + '" data-fb-path="' + esc(full) + '" role="option" aria-selected="' + (sel === full) + '" tabindex="0">' +
        FOLDER_SVG + '<span class="ellipsis" style="flex:1">' + esc(name) + '</span>' +
        (reg ? '<span class="chip" title="workspaceRegistry 已有该 canonical path">已注册</span>' : '') + '</div>';
    }
    function sync() {
      box.querySelectorAll('.fb-item').forEach(function (row) {
        var on = row.getAttribute('data-fb-path') === sel;
        row.classList.toggle('sel', on);
        row.setAttribute('aria-selected', on);
      });
      okBtn.disabled = !sel;
      okBtn.title = sel ? '选择 ' + sel : '先在列表中选中一个文件夹';
    }
    function render() {
      box.innerHTML =
        '<div class="fb-bar">' +
          '<button class="icon-btn" id="fb-up" aria-label="上一级" title="上一级"' + (fsParent(cwd) ? '' : ' disabled') + '><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>' +
          '<div class="fb-crumb" title="' + esc(cwd) + '">' + crumbHtml() + '</div>' +
        '</div>' +
        '<div class="fb-list">' + (fsKids(cwd).map(rowHtml).join('') || '<div class="fb-empty">空文件夹(演示盘)</div>') + '</div>' +
        '<p class="form-hint">' + (popts.hint || '模拟文件浏览器(演示盘 Z:):单击选中,双击进入;选定的即注册到 workspaceRegistry 的工作区目录(canonical path)。') + '</p>';
      $('#fb-up', box).addEventListener('click', function () { var up = fsParent(cwd); if (up) { cwd = up; sel = null; render(); } });
      box.querySelectorAll('[data-fb-jump]').forEach(function (b) {
        b.addEventListener('click', function () { cwd = b.getAttribute('data-fb-jump'); sel = null; render(); });
      });
      box.querySelectorAll('.fb-item').forEach(function (row) {
        var full = row.getAttribute('data-fb-path');
        row.addEventListener('click', function () { sel = full; sync(); });
        row.addEventListener('dblclick', function () { cwd = full; sel = null; render(); });
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { cwd = full; sel = null; render(); }
          else if (e.key === ' ') { e.preventDefault(); sel = full; sync(); }
        });
      });
      sync();
    }
    render();
    okBtn.addEventListener('click', function () { if (sel) { mask.remove(); popts.onPick(sel); } });   /* 只摘本层:叠加浏览不伤下层表单 */
  }

  /* ② 添加项目表单:工作区目录由文件浏览器回填;forge / 知识库目录按工作区构建预填,可输入或再浏览改选 */
  function openAddProjectForm(wsPath, keep) {
    var touched = keep ? { name: keep.touched.name, forge: keep.touched.forge, kn: keep.touched.kn }
                       : { name: false, forge: false, kn: false };
    openDialog({ title: '添加项目', ok: true, okLabel: '确认', body:
      '<div class="form-row"><label>工作区目录 *(文件浏览器选定)</label><div class="fb-input-line">' +
      '<input type="text" id="ap-ws" value="' + esc(wsPath) + '" readonly title="点击重新打开文件浏览器">' +
      '<button class="btn btn-ghost btn-sm" type="button" id="ap-repick">重新选择</button></div></div>' +
      '<div class="form-chips" style="margin-top:-4px" id="ap-detect"></div>' +
      '<div class="form-row"><label>项目名(自动)</label><input type="text" id="ap-name" value="' + esc(keep && keep.touched.name ? keep.name : wsLeaf(wsPath)) + '"></div>' +
      '<div class="form-row"><label>文档位置 · forge 目录(按工作区构建 · 可改)</label><div class="fb-input-line">' +
      '<input type="text" id="ap-forge" value="' + esc(keep && keep.touched.forge ? keep.forge : deriveForgeDir(wsPath)) + '">' +
      '<button class="btn btn-ghost btn-sm" type="button" id="ap-forge-browse" title="经文件浏览器选择目录">浏览…</button></div>' +
      '<span class="form-hint">默认 = &lt;工作区&gt;\\.forge;可直接输入或浏览选择(仓外需授权;应用侧只读引用)</span></div>' +
      '<div class="form-row"><label>知识库目录(按工作区构建 · 可改)</label><div class="fb-input-line">' +
      '<input type="text" id="ap-kn" value="' + esc(keep && keep.touched.kn ? keep.kn : deriveKnDir(wsPath)) + '">' +
      '<button class="btn btn-ghost btn-sm" type="button" id="ap-kn-browse" title="经文件浏览器选择目录">浏览…</button></div>' +
      '<span class="form-hint">默认 = &lt;工作区&gt;\\.knowledge;可直接输入或浏览选择仓外目录(唯一写入例外,经宿主能力面)</span></div>' +
      '<div class="form-row"><label>任务清单与记录(自动 · 无需填写)</label><div class="fb-input-line">' +
      '<input type="text" id="ap-tasks" class="fb-static" value="' + esc(deriveTaskStore(wsPath)) + '" readonly tabindex="-1">' +
      '</div></div>',
      onOk: function (mask) {
        var path = $('#ap-ws', mask).value.trim().replace(/\\+$/, '');
        var name = $('#ap-name', mask).value.trim() || wsLeaf(path) || '新项目';
        var forgeDir = $('#ap-forge', mask).value.trim() || deriveForgeDir(path);
        if (!path) { toast('路径必填'); return; }
        var res = F.projects.add({ canonicalPath: path, name: name,
          forgeDir: forgeDir,
          knowledgeDir: $('#ap-kn', mask).value.trim() || deriveKnDir(path),
          docMode: forgeDir.slice(0, path.length).toLowerCase() === path.toLowerCase() ? 'repo' : 'external' });
        if (!res.ok) { toast(res.error); return; }
        S.projectId = res.project.id;
        S.sessionId = null; S.dock.open = false; S.dock.tabs = []; S.kb.scope = 'project:' + res.project.id; S.kb.domain = null;
        renderAll();
        toast('已注册:workspaceRegistry.create → ' + res.project.workspaceId.slice(0, 14) + '…(幂等)· 应用库已建外键;任务清单落于 ' + deriveTaskStore(path) + ';项目暂无会话 → hero 相位');
      } });
    var m = $('.dialog');
    function renderDetect(ws) {
      var forgeOk = /demo|dsh|forge|viking/i.test(wsLeaf(ws));
      var reg = F.db.projects.some(function (p) { return p.canonicalPath === ws && !p.archived; });
      $('#ap-detect', m).innerHTML =
        '<span class="chip">侦测(模拟):git ✓</span>' +
        '<span class="chip">' + (forgeOk ? 'forge 树 ✓' : 'forge 树 ✗(注册后初始化)') + '</span>' +
        '<span class="chip">' + (reg ? '已注册 ✗(重复将被拒)' : '未注册 ✓') + '</span>';
    }
    function applyWs(ws) {
      $('#ap-ws', m).value = ws;
      renderDetect(ws);
      $('#ap-tasks', m).value = deriveTaskStore(ws);   /* 任务清单与记录:随工作区自动派生 */
      if (!touched.name) $('#ap-name', m).value = wsLeaf(ws);
      if (!touched.forge) $('#ap-forge', m).value = deriveForgeDir(ws);
      if (!touched.kn) $('#ap-kn', m).value = deriveKnDir(ws);
    }
    function snapshot() {
      return { touched: touched, name: $('#ap-name', m).value, forge: $('#ap-forge', m).value, kn: $('#ap-kn', m).value };
    }
    function repick() {
      var keepSnap = snapshot();
      closeLayers();
      openDirPicker({ title: '选择工作区目录', onPick: function (ws) { openAddProjectForm(ws, keepSnap); } });
    }
    function browseDir(fieldKey, title) {
      openDirPicker({ title: title, stacked: true,
        hint: '模拟文件浏览器(演示盘 Z:):单击选中,双击进入;确认后回填「' +
          (fieldKey === 'kn' ? '知识库目录' : '文档位置 · forge 目录') + '」输入框(不再随工作区自动重构)。',
        onPick: function (dir) { touched[fieldKey] = true; $('#ap-' + fieldKey, m).value = dir; } });
    }
    $('#ap-repick', m).addEventListener('click', repick);
    $('#ap-ws', m).addEventListener('click', repick);
    $('#ap-kn-browse', m).addEventListener('click', function () { browseDir('kn', '选择知识库目录'); });
    $('#ap-forge-browse', m).addEventListener('click', function () { browseDir('forge', '选择 forge 目录'); });
    ['name', 'forge', 'kn'].forEach(function (k) {
      $('#ap-' + k, m).addEventListener('input', function () { touched[k] = true; });
    });
    applyWs(wsPath);
  }
  function openAddProjectDialog() {
    openDirPicker({ title: '选择工作区目录', onPick: function (ws) { openAddProjectForm(ws, null); } });
  }
  /* 对话框内委托(建议条目点选) */
  function maskDelegate(sel, handler) {
    setTimeout(function () {
      var m = $('.dialog'); if (!m) return;
      m.addEventListener('click', function (e) {
        var el = e.target.closest(sel);
        if (el) handler(el, m);
      });
    }, 0);
  }

  /* ───────── 发送(模拟往返,含召回链路) ───────── */
  function doSend() {
    var input = $('#composer-input');
    var text = (input.textContent || '').trim();
    if (!text) return;
    input.textContent = '';
    var p = project();
    var s = session();
    if (!s) {
      s = F.newSessionIn(p.workspaceId, text.slice(0, 16));
      s.status = 'running';
      S.sessionId = s.id;
    }
    F.send(s.id, text);
  }

  /* ───────── 渲染入口 ───────── */
  function renderAll() {
    renderSidebar();
    /* 中区视图互换:只渲染激活侧(另一侧 DOM 保持,回来不丢滚动/输入) */
    $('#center-zone').setAttribute('data-view', S.centerView);
    if (S.centerView === 'kn') renderKb();
    else renderConv();
    renderDock();
    renderKnDrawer();
  }

  /* ───────── 知识详情抽屉(右侧滑入;点知识卡片打开,非 dock 页签) ───────── */
  function openKnDrawer(id) { S.knDrawer = id; renderAll(); }
  /* 知识 → 对话:自动 @ 知识文档(isNew = 跳新对话草稿;未发送不持久化) */
  function askInConv(knId, isNew) {
    var k = F.kn.get(knId);
    if (!k) return;
    closeLayers();
    S.knDrawer = null;
    S.centerView = 'conv'; S.view = 'conv';
    if (isNew) S.sessionId = null;   /* hero 草稿(新会话单例) */
    renderAll();
    var input = $('#composer-input');
    if (input) {
      input.appendChild(document.createTextNode((input.textContent ? '\n' : '') + '@' + k.title + ' '));
      input.focus();
      var range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    toast(isNew
      ? '已在新会话中 @《' + k.title + '》—— 发送后创建会话,可让 agent 修改该知识文档(经知识插件写入 tool)'
      : '已在当前会话中 @《' + k.title + '》—— 可让 agent 修改该知识文档(经知识插件写入 tool,契约校验前置)');
  }
  function renderKnDrawer() {
    var drawer = $('#kn-drawer');
    if (!drawer) return;
    if (!S.knDrawer || !F.kn.get(S.knDrawer)) {
      drawer.hidden = true;
      return;
    }
    drawer.hidden = false;
    drawer.innerHTML =
      '<div class="knd-top"><span class="knd-top-title">知识详情</span>' +
      '<button class="icon-btn" data-act="kn-drawer-close" aria-label="关闭抽屉" title="关闭(Esc)">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      renderDetail(S.knDrawer);
  }

  /* ───────── 事件绑定 ───────── */
  function bind() {
    document.addEventListener('click', function (e) {
      /* 菜单自持点击;气泡(.pop)内的动作按钮允许分发(任务气泡的 ⚡/打开会话) */
      if (e.target.closest('[data-menu-id]') || e.target.closest('.menu')) return;
      var actEl = e.target.closest('[data-act]');
      /* 对话框内非动作点击(表单控件/文件浏览器行/建议条目)不关层;确定/✕ 仍走关层(对话框无自持关闭)。
         事件目标可能在冒泡途中被重渲染/关层而脱离文档(closest 失效),按 composedPath 快照判定:
         快照中的 mask 已不在文档 = 本点击已被消费(确定 → 下一对话框),不追杀新层。 */
      if (!actEl) {
        var cp = e.composedPath(), maskEl = null, isDlgBtn = false;
        for (var ci = 0; ci < cp.length; ci++) {
          var cn = cp[ci];
          if (!cn || !cn.getAttribute) continue;
          if (cn.classList && cn.classList.contains('dialog-mask') && !maskEl) maskEl = cn;
          if (cn.getAttribute('data-dlg-ok') !== null || cn.getAttribute('data-dlg-close') !== null) isDlgBtn = true;
        }
        if (maskEl && !maskEl.isConnected) return;
        if (maskEl && !isDlgBtn) return;
        closeLayers(); return;
      }
      var fn = actions[actEl.getAttribute('data-act')];
      if (fn) {
        if (actEl.classList.contains('kn-card') || actEl.classList.contains('sess-row') || actEl.classList.contains('pj-row')) {
          var inner = e.target.closest('[data-act="kn-menu"],[data-act="sess-menu"],[data-act="pj-toggle"]');
          if (inner && inner !== actEl) { var ifn = actions[inner.getAttribute('data-act')]; ifn && ifn(inner.dataset, e); return; }
        }
        fn(actEl.dataset, e);
      }
    });
    /* 输入(不过度重渲染) */
    document.addEventListener('input', function (e) {
      if (e.target.id === 'kb-q') { S.kb.q = e.target.value; renderKb(); }
      else if (e.target.id === 'pj-q') { S.pj.q = e.target.value; renderProjects(); }
      else if (e.target.id === 'rl-q') { S.knRlog.q = e.target.value; renderRlList(); }   /* 只重绘列表,保输入焦点 */
    });
    /* 自由分析 select(维度)与自定义时间日期变更(含跨度收窄) */
    document.addEventListener('change', function (e) {
      var sel = e.target.closest('[data-act-sel]');
      if (!sel) return;
      var key = sel.getAttribute('data-act-sel');
      if (key === 'dim') S.knStat.custom.dim = sel.value;
      if ((key === 'tfrom' || key === 'tto') && S.knStat.range && sel.value) {
        S.knStat.range[key === 'tfrom' ? 'from' : 'to'] = sel.value;
        clampStatRange(key === 'tfrom' ? 'from' : 'to');
      }
      renderAll();
      syncCustomTimePop();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (layerRoot.querySelector('.menu,.pop')) { closeLayers(); return; }
        var dlgMasks = layerRoot.querySelectorAll('.dialog-mask');   /* 逐层退:只关最上层对话框 */
        if (dlgMasks.length) { dlgMasks[dlgMasks.length - 1].remove(); return; }
        if (S.knDrawer) { S.knDrawer = null; renderAll(); return; }
        if (S.centerView === 'kn' && S.kb.q) { actions['kb-clear-search'](); return; }
        if (S.pj.searching) { S.pj.searching = false; renderAll(); return; }
      }
      if (e.key === 'Enter' && e.target.id === 'composer-input' && !e.shiftKey) { e.preventDefault(); doSend(); }
      if (e.key === 'Enter' && (e.target.id === 'kb-q' || e.target.id === 'pj-q')) e.preventDefault();
    });
    /* 关闭浮层:点击空白 */
    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('.menu') && !e.target.closest('.pop') && !e.target.closest('[data-act="conf-pop"]')) {
        var open = layerRoot.querySelector('.menu,.pop');
        if (open) closeLayers();
      }
    });
    /* 品牌行 = 新会话快捷 */
    $('#sb-brand').addEventListener('click', function (e) {
      if (e.target.closest('#sb-collapse')) return;
      actions['new-session']();
    });
    $('#sb-new-btn').addEventListener('click', actions['new-session']);
    /* 侧栏宽度拖拽 */
    dragX($('.sb-resize') || document.body, function (dx) {
      var w = clampN(parseFloat(getComputedStyle($('#app-sidebar')).width) + dx, 264, 420);
      document.documentElement.style.setProperty('--sidebar-w', w + 'px');
    });
    /* 右栏宽度拖拽 */
    dragX($('#rb-resize'), function (dx) {
      var w = clampN(parseFloat(getComputedStyle($('#rb-wrap')).width || '0') - dx, 300, window.innerWidth * 0.7);
      document.documentElement.style.setProperty('--rightbar-w', w + 'px');
    });
    /* 内容列宽拖柄 */
    ['col-l', 'col-r'].forEach(function (id) {
      dragX($('#' + id), function (dx, el) {
        var cur = parseFloat((getComputedStyle(document.documentElement).getPropertyValue('--conv-col-w') || '').replace('px', '')) || 760;
        var next = clampN(cur + (id === 'col-l' ? dx : -dx) * 2, 640, 920);
        document.documentElement.style.setProperty('--conv-col-w', next + 'px');
      });
    });
    function dragX(handle, onMove) {
      if (!handle) return;
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        var lastX = e.clientX;
        function mv(ev) { onMove(ev.clientX - lastX, handle); lastX = ev.clientX; }
        function up() { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); }
        document.addEventListener('pointermove', mv);
        document.addEventListener('pointerup', up);
      });
    }
  }

  /* ───────── 初始化 ───────── */
  function init() {
    F.init();
    layerRoot = $('#layer-root');
    /* 中区视图互换由 CSS data-view 驱动;摘除初始 hidden 防闪显后由其接管 */
    $('#knview').hidden = false;
    $('#knstats').hidden = false;
    if (localStorage.getItem('proto-dfr-theme') === 'dark') document.body.setAttribute('data-ds-dark-theme', '');
    var m = location.search.match(/[?&]p=([^&]+)/);
    if (m) {
      var p = F.db.projects.find(function (x) { return x.id === m[1] || x.name === decodeURIComponent(m[1]); });
      if (p) S.projectId = p.id;
    }
    F.subscribe(renderAll);
    bind();
    renderAll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
